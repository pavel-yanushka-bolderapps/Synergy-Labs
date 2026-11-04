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
import type { APIRoute } from "astro";
import { waitUntil } from "@vercel/functions";
import { checkPassword, currentUser, json, PEOPLE, signIn, signOut } from "../../../lib/ops/auth";
import { isOpsId, loadAll, logRun, newId, opsClient, type ContentItem, type OpsType } from "../../../lib/ops/store";
import { completedWeeks, METRICS, eventMetric, ga4Events, sourceStatus, syncWeek } from "../../../lib/ops/kpi";
import { draftContent, loadPost, publishContent, suggestTopics } from "../../../lib/ops/content";
import { runAndSaveHealth, type Health } from "../../../lib/ops/health";
import { buildDigest, emailStatus, sendDigest } from "../../../lib/ops/digest";
import { randomUUID } from "node:crypto";

export const prerender = false;

/** Fields a person may set on each type; everything else is dropped. */
const EDITABLE: Record<Exclude<OpsType, "opsRun" | "opsKpi">, string[]> = {
  opsKeyResult: ["title", "objective", "metric", "baseline", "target", "current", "unit", "dueDate", "owner", "order"],
  opsTask: ["title", "owner", "keyResult", "status", "startWeek", "endWeek", "recurring", "notes"],
  opsContent: ["title", "kind", "keyword", "brief", "week", "status", "keyResult", "targetPath", "publishAt", "notes"],
};

export const GET: APIRoute = async ({ params, cookies, url }) => {
  const user = currentUser(cookies);
  if (!user) return json({ error: "Sign in" }, 401);

  if (params.action === "data") {
    const data = await loadAll();
    const metrics = { ...METRICS };
    for (const e of ga4Events()) metrics[eventMetric(e)] = { label: `GA4 event: ${e}` };
    const health = await opsClient().getDocument<Health>("ops.health.latest");
    return json({ user, ...data, metrics, health, sources: { ...sourceStatus(), email: emailStatus().configured }, digestTo: emailStatus().to });
  }
  if (params.action === "post") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id is required" }, 400);
    return json(await loadPost(id));
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

      case "sync": {
        const weeks = Math.min(Math.max(Number(body.weeks) || 1, 1), 26);
        const list = completedWeeks(weeks);
        // The newest week answers the request; a backfill finishes in the background.
        const first = await syncWeek(list[0]);
        if (list.length > 1) {
          waitUntil(
            (async () => {
              for (const w of list.slice(1)) await syncWeek(w).catch((e) => console.error("[ops] sync", w, e));
            })()
          );
        }
        const failed = Object.keys(first.errors ?? {});
        await logRun({
          job: "kpi-sync",
          ok: failed.length < 3,
          by: user,
          summary: `KPIs synced for ${weeks} week(s)` + (failed.length ? `; not synced: ${failed.join(", ")}` : ""),
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



