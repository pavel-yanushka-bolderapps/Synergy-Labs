// API for outside agents (Claude routines). Auth: "Authorization: Bearer <token>"
// with a token from OPS_AGENT_TOKENS (see src/lib/ops/agent.ts). Every write
// shows up in the dashboard's activity feed under the agent's name.
// Full guide for agent authors: docs/ops-agent-api.md
//
//   GET  me                         which agent you are
//   GET  scorecard                  the weekly numbers (both sites) for the KPI tracker
//   GET  kpis?site=&weeks=          raw weekly GA4 / Search Console / HubSpot snapshots
//   GET  blogs?site=&traffic=1      every blog post: date, source, views (+ weekly traffic)
//   GET  refresh-due?days=          posts 11+ months old (or within `days` of it), most viewed first
//   GET  files?kind=&status=        dropped .md files (without their content)
//   GET  file?id=                   one file with its content
//   POST file                       { name, content, kind?, url?, site?, title? } drop a .md file
//   POST file-status                { id, status: new|in-progress|done|skipped, note?, publishedUrl? }
//   POST blog-source                { posts: [{ url | site+slug, source: adaptify|redrover|vineyard|team }] }
//   POST pulse                      { week?, text } the one-line weekly pulse
//   POST submissions                { site, source?, items: [{ id, submittedAt, name, email, ... }] }
import type { APIRoute } from "astro";
import { json } from "../../../../lib/ops/auth";
import { agentFor, dropFile, setFileStatus, setBlogSources, setPulse, importSubmissions, HttpError } from "../../../../lib/ops/agent";
import { loadBlogs, refreshDueDate, blogUrl, SOURCE_LABEL } from "../../../../lib/ops/blogs";
import { opsClient, loadAll, loadSiteKpis, addDays, type InboxFile } from "../../../../lib/ops/store";
import { loadSubmissions } from "../../../../lib/ops/submissions";
import { buildScorecard, loadWeeklyNotes } from "../../../../lib/ops/scorecard";

export const prerender = false;

const fail = (err: unknown) => {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error("[ops agent]", err);
  return json({ error: err instanceof Error ? err.message : String(err) }, 500);
};

export const GET: APIRoute = async ({ params, request, url }) => {
  const agent = agentFor(request);
  if (!agent) return json({ error: "Missing or unknown token (Authorization: Bearer <token>)" }, 401);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  try {
    switch (params.action) {
      case "me":
        return json({ agent });

      case "scorecard": {
        const [data, bolder, forms, notes, blogs] = await Promise.all([loadAll(), loadSiteKpis("bolder"), loadSubmissions(), loadWeeklyNotes(), loadBlogs()]);
        return json(buildScorecard(data.kpis, bolder, forms.submissions, forms.testRules, notes, blogs));
      }

      case "kpis": {
        const weeks = Math.min(Math.max(Number(q("weeks")) || 8, 1), 26);
        const list = q("site") === "bolder" ? await loadSiteKpis("bolder") : (await loadAll()).kpis;
        return json(list.slice(0, weeks));
      }

      case "blogs": {
        const site = q("site");
        const posts = (await loadBlogs({ withTraffic: q("traffic") === "1" }))
          .filter((p) => !site || p.site === site)
          .map((p) => ({ ...p, url: blogUrl(p.site, p.path), sourceLabel: p.source ? SOURCE_LABEL[p.source] : null, refreshDue: refreshDueDate(p) }));
        return json({ count: posts.length, posts });
      }

      case "refresh-due": {
        const days = Math.min(Math.max(Number(q("days")) || 7, 0), 120);
        const horizon = addDays(new Date().toISOString().slice(0, 10), days);
        const open = await opsClient().fetch<{ postPath?: string }[]>(`*[_type == "opsInbox" && _id in path("ops.**") && kind == "blog-refresh" && status in ["new", "in-progress"]]{postPath}`);
        const queued = new Set(open.map((f) => f.postPath));
        const posts = (await loadBlogs())
          .filter((p) => p.live !== false)
          .map((p) => ({ ...p, refreshDue: refreshDueDate(p), url: blogUrl(p.site, p.path), queued: queued.has(p.path) }))
          .filter((p) => p.refreshDue && p.refreshDue <= horizon)
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
        return json({ count: posts.length, posts });
      }

      case "files": {
        const files = await opsClient().fetch<Omit<InboxFile, "content">[]>(
          `*[_type == "opsInbox" && _id in path("ops.**") && ($kind == "" || kind == $kind) && ($status == "" || status == $status)] | order(createdAt desc)[0...200]{..., "content": null}`,
          { kind: q("kind"), status: q("status") }
        );
        return json(files);
      }

      case "file": {
        const id = q("id");
        if (!id.startsWith("ops.inbox.")) return json({ error: "Bad id" }, 400);
        const file = await opsClient().getDocument<InboxFile>(id);
        return file ? json(file) : json({ error: "No such file" }, 404);
      }
    }
  } catch (err) {
    return fail(err);
  }
  return json({ error: "Not found" }, 404);
};

export const POST: APIRoute = async ({ params, request }) => {
  const agent = agentFor(request);
  if (!agent) return json({ error: "Missing or unknown token (Authorization: Bearer <token>)" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Send a JSON body" }, 400);
  try {
    switch (params.action) {
      case "file":
        return json(await dropFile(agent, body));
      case "file-status":
        return json(await setFileStatus(agent, body, true));
      case "blog-source":
        return json(await setBlogSources(agent, body, true));
      case "pulse":
        return json(await setPulse(agent, body, true));
      case "submissions":
        return json(await importSubmissions(agent, body));
    }
  } catch (err) {
    return fail(err);
  }
  return json({ error: "Not found" }, 404);
};
