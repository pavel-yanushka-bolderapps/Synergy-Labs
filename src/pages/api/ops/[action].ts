// The Ops dashboard's API. Every action needs the signed-in cookie except
// login. Excluded from ISR in astro.config.mjs: responses are per-person.
//
//   GET  data              everything the dashboard shows
//   GET  post?id=          a draft's content, for the review preview
//   POST login / logout
//   POST save              create or update a key result, task or content item
//   POST delete            delete one (ops.* ids only)
//   POST draft             Claude writes the draft for a content item
//   POST approve           schedule a reviewed draft (publishAt)
//   POST publish           publish a reviewed draft now
//   POST sync              pull KPIs now ({ weeks } to backfill)
//   POST health            run the site health checks now
//   GET  digest            preview the weekly digest email (HTML)
//   POST digest            send the weekly digest now
//   POST suggest           Claude proposes { count } topic ideas for the calendar
//   POST comment           add a comment to a task, key result or content item
//   GET  feedback?path=    on-site feedback pins for one page (the site overlay)
//   POST feedback          create a pin (from public/ops-feedback.js)
//   POST screenshot        upload a pin's screenshot (JPEG data URL) -> { url }
//   POST weekly-save       { week, abWinners, notes } the typed-in Weekly columns
//   GET  bolder            the Bolder Apps tab: its weekly GA4 / Search Console snapshots
//   GET  google-access     GA4 properties + Search Console sites the service account can read
//   GET  submissions       every form submission + the test-detection rules
//   POST submission-mark   { ids, test: true | false | null } (null = automatic)
//   POST submission-delete { ids }
//   POST form-rules        { rules: string[] } the words that flag a test submission
import type { APIRoute } from "astro";
import { waitUntil } from "@vercel/functions";
import { checkPassword, currentUser, json, PEOPLE, signIn, signOut } from "../../../lib/ops/auth";
import { isOpsId, loadAll, loadSiteKpis, logRun, newId, opsClient, type ContentItem, type OpsType } from "../../../lib/ops/store";
import { completedWeeks, METRICS, eventMetric, ga4Events, googleAccess, isKpiSite, sourceStatus, syncWeek } from "../../../lib/ops/kpi";
import { draftContent, loadPost, publishContent, suggestTopics } from "../../../lib/ops/content";
import { runAndSaveHealth, type Health } from "../../../lib/ops/health";
import { buildDigest, emailStatus, sendDigest } from "../../../lib/ops/digest";
import { randomUUID } from "node:crypto";
import { loadSubmissions, SETTINGS_ID } from "../../../lib/ops/submissions";
import { buildScorecard, DERIVED_METRICS, loadWeeklyNotes } from "../../../lib/ops/scorecard";

export const prerender = false;

/** Fields a person may set on each type; everything else is dropped. */
const EDITABLE: Record<Exclude<OpsType, "opsRun" | "opsKpi" | "opsSubmission" | "opsWeekly">, string[]> = {
  opsKeyResult: ["title", "objective", "metric", "baseline", "target", "current", "unit", "dueDate", "owner", "order", "code", "stretch", "andrewKr", "kind", "cumulative", "targetDate"],
  opsTask: ["title", "owner", "keyResult", "status", "startWeek", "endWeek", "recurring", "notes", "dueDate", "andrewKr"],
  opsContent: ["title", "kind", "keyword", "brief", "week", "status", "keyResult", "targetPath", "publishAt", "notes"],
  opsFeedback: ["title", "status", "assignee"],
};

export const GET: APIRoute = async ({ params, cookies, url }) => {
  const user = currentUser(cookies);
  if (!user) return json({ error: "Sign in" }, 401);

  if (params.action === "data") {
    const [data, bolderKpis, forms, notes] = await Promise.all([loadAll(), loadSiteKpis("bolder"), loadSubmissions(), loadWeeklyNotes()]);
    const metrics: Record<string, { label: string; format?: string }> = { ...METRICS, ...DERIVED_METRICS };
    for (const e of ga4Events()) metrics[eventMetric(e)] = { label: `GA4 event: ${e}` };
    const health = await opsClient().getDocument<Health>("ops.health.latest");
    const scorecard = buildScorecard(data.kpis, bolderKpis, forms.submissions, forms.testRules, notes);
    return json({ user, ...data, metrics, health, scorecard, sources: { ...sourceStatus(), email: emailStatus().configured }, digestTo: emailStatus().to });
  }
  if (params.action === "post") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id is required" }, 400);
    return json(await loadPost(id));
  }
  if (params.action === "me") return json({ user });
  if (params.action === "submissions") return json(await loadSubmissions());
  if (params.action === "bolder") {
    const metrics = { ...METRICS };
    for (const e of ga4Events()) metrics[eventMetric(e)] = { label: `GA4 event: ${e}` };
    return json({ kpis: await loadSiteKpis("bolder"), sources: sourceStatus("bolder"), metrics });
  }
  if (params.action === "google-access") {
    try {
      return json(await googleAccess());
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
  if (params.action === "feedback") {
    const path = url.searchParams.get("path") ?? "/";
    const host = url.searchParams.get("host") ?? url.host;
    return json(
      await opsClient().fetch(
        `*[_type == "opsFeedback" && _id in path("ops.**") && path == $path && host == $host] | order(number asc)`,
        { path, host }
      )
    );
  }
  if (params.action === "digest") {
    const { subject, html } = await buildDigest();
    return new Response(html.replace("<body", `<body data-subject="${subject.replace(/"/g, "")}"`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  return json({ error: "Not found" }, 404);
};

export const POST: APIRoute = async ({ params, cookies, request, url }) => {
  const body = await request.json().catch(() => ({}));

  if (params.action === "login") {
    if (!PEOPLE.includes(body.name) || !checkPassword(String(body.password ?? ""))) {
      return json({ error: "Wrong name or password" }, 401);
    }
    signIn(cookies, body.name);
    return json({ ok: true });
  }
  if (params.action === "logout") {
    signOut(cookies);
    return json({ ok: true });
  }

  const user = currentUser(cookies);
  if (!user) return json({ error: "Sign in" }, 401);
  const c = opsClient();

  try {
    switch (params.action) {
      case "save": {
        const type = body._type as keyof typeof EDITABLE;
        if (!(type in EDITABLE)) return json({ error: "Unknown type" }, 400);
        const fields: Record<string, unknown> = {};
        for (const k of EDITABLE[type]) if (k in body) fields[k] = body[k] === "" ? null : body[k];
        const unset = Object.keys(fields).filter((k) => fields[k] === null);
        for (const k of unset) delete fields[k];
        if (body._id) {
          if (!isOpsId(body._id)) return json({ error: "Bad id" }, 400);
          let patch = c.patch(body._id).set({ ...fields, updatedBy: user });
          if (unset.length) patch = patch.unset(unset);
          return json(await patch.commit());
        }
        return json(await c.create({ _id: newId(type), _type: type, ...fields, createdBy: user }));
      }

      case "delete": {
        if (!isOpsId(body._id)) return json({ error: "Bad id" }, 400);
        await c.delete(body._id);
        return json({ ok: true });
      }

      case "draft": {
        const item = await c.getDocument<ContentItem>(body._id);
        if (!item || item._type !== "opsContent") return json({ error: "No such item" }, 404);
        if (item.kind !== "new" && item.kind !== "refresh") return json({ error: "Only blog posts and refreshes are drafted by the bot" }, 400);
        if (!process.env.ANTHROPIC_API_KEY && !import.meta.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not set" }, 400);
        return json(await draftContent(item, user));
      }

      case "approve": {
        const item = await c.getDocument<ContentItem>(body._id);
        if (!item?.postId) return json({ error: "Nothing to approve yet" }, 400);
        const publishAt = new Date(body.publishAt || Date.now()).toISOString();
        const updated = await c.patch(item._id).set({ status: "approved", publishAt, approvedBy: user }).commit();
        await logRun({ job: "review", ok: true, by: user, summary: `${user} approved "${item.title}" for ${publishAt.slice(0, 16).replace("T", " ")} UTC` });
        return json(updated);
      }

      case "reject": {
        const item = await c.getDocument<ContentItem>(body._id);
        if (!item) return json({ error: "No such item" }, 404);
        const updated = await c.patch(item._id).set({ status: "planned", notes: body.notes ?? item.notes }).unset(["publishAt"]).commit();
        await logRun({ job: "review", ok: true, by: user, summary: `${user} sent "${item.title}" back for changes` });
        return json(updated);
      }

      case "publish": {
        const item = await c.getDocument<ContentItem>(body._id);
        if (!item) return json({ error: "No such item" }, 404);
        return json(await publishContent(item, url.origin, user));
      }

      case "health": {
        const { health } = await runAndSaveHealth(user);
        return json(health);
      }

      case "digest": {
        return json({ ok: true, subject: await sendDigest() });
      }

      case "suggest": {
        if (!process.env.ANTHROPIC_API_KEY && !import.meta.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not set" }, 400);
        const count = Math.min(Math.max(Number(body.count) || 6, 1), 12);
        return json(await suggestTopics(count, user));
      }

      case "comment": {
        if (!isOpsId(body._id)) return json({ error: "Bad id" }, 400);
        const text = String(body.text ?? "").trim().slice(0, 4000);
        if (!text) return json({ error: "Empty comment" }, 400);
        const updated = await c
          .patch(body._id)
          .setIfMissing({ comments: [] })
          .append("comments", [{ _key: randomUUID().slice(0, 12), by: user, at: new Date().toISOString(), text }])
          .commit();
        return json(updated);
      }

      case "feedback": {
        const str = (v: unknown, max = 500) => String(v ?? "").slice(0, max);
        const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
        const title = str(body.title, 4000).trim();
        if (!title) return json({ error: "Write a comment first" }, 400);
        const last = await c.fetch<number | null>(`*[_type == "opsFeedback" && _id in path("ops.**")] | order(number desc)[0].number`);
        const doc = {
          _id: newId("opsFeedback"),
          _type: "opsFeedback",
          number: (last ?? 0) + 1,
          title,
          status: "open",
          assignee: PEOPLE.includes(body.assignee) ? body.assignee : undefined,
          createdBy: user,
          createdAt: new Date().toISOString(),
          host: str(body.host, 200),
          path: str(body.path, 1000),
          selector: str(body.selector, 2000),
          offsetX: n(body.offsetX),
          offsetY: n(body.offsetY),
          pageX: n(body.pageX),
          pageY: n(body.pageY),
          viewport: str(body.viewport, 40),
          userAgent: str(request.headers.get("user-agent"), 300),
          elementText: str(body.elementText, 200),
          screenshot: typeof body.screenshot === "string" && body.screenshot.startsWith("https://cdn.sanity.io/") ? body.screenshot : undefined,
        };
        const created = await c.create(Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined)) as typeof doc);
        await logRun({ job: "feedback", ok: true, by: user, summary: `${user} left feedback #${doc.number} on ${doc.path}`, details: title.slice(0, 200) });
        return json(created);
      }

      case "screenshot": {
        const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(body.dataUrl ?? ""));
        if (!m) return json({ error: "Expected a JPEG or PNG data URL" }, 400);
        const buffer = Buffer.from(m[2], "base64");
        if (buffer.length > 3_000_000) return json({ error: "Screenshot too large" }, 413);
        // Sanity assets are served from an unguessable CDN URL, not listed anywhere public.
        const asset = await c.assets.upload("image", buffer, { filename: `ops-feedback-${Date.now()}.${m[1] === "png" ? "png" : "jpg"}` });
        return json({ url: asset.url });
      }

      case "submission-mark":
      case "submission-delete": {
        const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).filter((id: unknown) => typeof id === "string" && id.startsWith("ops.submission."));
        if (!ids.length) return json({ error: "No submissions selected" }, 400);
        const tx = c.transaction();
        for (const id of ids) {
          if (params.action === "submission-delete") tx.delete(id);
          else if (body.test === true || body.test === false) tx.patch(id, (p) => p.set({ test: body.test }));
          else tx.patch(id, (p) => p.unset(["test"]));
        }
        await tx.commit();
        if (params.action === "submission-delete") await logRun({ job: "forms", ok: true, by: user, summary: `${user} deleted ${ids.length} form submission(s)` });
        return json({ ok: true, count: ids.length });
      }

      case "form-rules": {
        const rules = [...new Set((Array.isArray(body.rules) ? body.rules : []).map((r: unknown) => String(r).trim().toLowerCase()).filter(Boolean))].slice(0, 200);
        await c.createOrReplace({ _id: SETTINGS_ID, _type: "opsSettings", testRules: rules, updatedBy: user });
        return json({ testRules: rules });
      }

      case "weekly-save": {
        const week = String(body.week ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return json({ error: "Bad week" }, 400);
        const ab = body.abWinners === "" || body.abWinners === null || body.abWinners === undefined ? undefined : Number(body.abWinners);
        const doc = { _id: `ops.weekly.${week}`, _type: "opsWeekly", week, ...(Number.isFinite(ab) ? { abWinners: ab } : {}), ...(String(body.notes ?? "").trim() ? { notes: String(body.notes).trim().slice(0, 2000) } : {}), updatedBy: user };
        return json(await c.createOrReplace(doc));
      }

      case "sync": {
        const weeks = Math.min(Math.max(Number(body.weeks) || 1, 1), 26);
        const site = isKpiSite(body.site) ? body.site : "synergy";
        const list = completedWeeks(weeks);
        // The newest week answers the request; a backfill finishes in the background.
        const first = await syncWeek(list[0], site);
        if (list.length > 1) {
          waitUntil(
            (async () => {
              for (const w of list.slice(1)) await syncWeek(w, site).catch((e) => console.error("[ops] sync", w, e));
            })()
          );
        }
        const failed = Object.keys(first.errors ?? {});
        await logRun({
          job: "kpi-sync",
          ok: failed.length < 3,
          by: user,
          summary: `${site === "bolder" ? "Bolder Apps " : ""}KPIs synced for ${weeks} week(s)` + (failed.length ? `; not synced: ${failed.join(", ")}` : ""),
          details: failed.map((k) => `${k}: ${first.errors![k]}`).join("\n") || undefined,
        });
        return json(first);
      }
    }
  } catch (err) {
    console.error(`[ops] ${params.action} failed:`, err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
  return json({ error: "Not found" }, 404);
};



