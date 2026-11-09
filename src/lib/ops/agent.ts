// Outside agents (Andrew's Claude routines, Pavel's Claude) reading and
// writing the dashboard through /api/ops/agent/*. Each agent has its own
// token, so the activity feed can say who did what:
//
//   OPS_AGENT_TOKENS = "Andrew's Claude=<token>,Pavel's Claude=<token>"
//
// Tokens are 32+ random characters (openssl rand -hex 24). Removing an entry
// revokes that agent. The same write functions back the dashboard's buttons,
// so a person and an agent change things the same way.
import { createHash, timingSafeEqual } from "node:crypto";
import { opsClient, logRun, mondayOf, type InboxFile, type InboxStatus } from "./store";
import { blogId, isBlogSource, SOURCE_LABEL, type BlogSite } from "./blogs";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";
const digest = (s: string) => createHash("sha256").update(s).digest();

function agents(): { name: string; token: Buffer }[] {
  return env("OPS_AGENT_TOKENS")
    .split(",")
    .map((pair) => {
      const i = pair.lastIndexOf("=");
      return { name: pair.slice(0, i).trim(), token: pair.slice(i + 1).trim() };
    })
    .filter((a) => a.name && a.token.length >= 32)
    .map((a) => ({ name: a.name, token: digest(a.token) }));
}

/** The agent's name for a request's "Authorization: Bearer <token>", or null. */
export function agentFor(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const given = digest(m[1].trim());
  let found: string | null = null;
  // Compare against every token (no early exit) so timing does not reveal which matched.
  for (const a of agents()) if (timingSafeEqual(given, a.token)) found = a.name;
  return found;
}

export const agentCount = () => agents().length;

const SITES = ["synergy", "bolder"] as const;
const isSite = (s: unknown): s is BlogSite => (SITES as readonly unknown[]).includes(s);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Front matter at the top of a .md file ("---\nkey: value\n---"), if any. */
function frontMatter(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x![1].toLowerCase(), x![2].replace(/^["']|["']$/g, "").trim()])
  );
}

/** Path of a post from a URL or path ("https://www.bolderapps.com/blog-posts/x" -> "/blog-posts/x"). */
function toPath(v: string): string {
  if (!v) return "";
  try {
    return new URL(v).pathname.replace(/\/$/, "");
  } catch {
    return ("/" + v.replace(/^\/+/, "")).replace(/\/$/, "");
  }
}
const siteOfUrl = (v: string): BlogSite | undefined => (/bolderapps\.com/i.test(v) || v.startsWith("/blog-posts/") ? "bolder" : /synergylabs\.co/i.test(v) || v.startsWith("/blog/") ? "synergy" : undefined);

/**
 * Stores a dropped .md file. `kind` comes from the body or the file name
 * ("blog-refresh-wk45.md" -> "blog-refresh"). A blog refresh brief names its
 * post in front matter (url: / path:, site:, title:) or in the body.
 * Same name dropped again = the file is replaced (and set back to "new").
 */
export async function dropFile(by: string, body: Record<string, unknown>) {
  const name = str(body.name, 120).replace(/[^\w.\- ]/g, "-");
  const content = typeof body.content === "string" ? body.content.slice(0, 200_000) : "";
  if (!name || !content.trim()) throw new HttpError(400, "name and content are required");
  const fm = frontMatter(content);
  const kind = str(body.kind, 40) || fm.kind || (/^blog-refresh/i.test(name) ? "blog-refresh" : /pulse/i.test(name) ? "kpi-pulse" : "note");
  const url = str(body.url, 1000) || str(body.path, 1000) || fm.url || fm.path || "";
  const site = isSite(body.site) ? body.site : isSite(fm.site) ? (fm.site as BlogSite) : siteOfUrl(url);
  const id = `ops.inbox.${name.toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9_-]/g, "-").slice(0, 100)}`;
  const doc: InboxFile = {
    _id: id,
    _type: "opsInbox",
    name,
    kind,
    content,
    by,
    createdAt: new Date().toISOString(),
    status: "new",
    ...(site ? { site } : {}),
    ...(url ? { postPath: toPath(url) } : {}),
    ...(str(body.title, 300) || fm.title ? { title: str(body.title, 300) || fm.title } : {}),
  };
  const c = opsClient();
  const existed = await c.getDocument(id);
  await c.createOrReplace(doc);
  await logRun({ job: "agent", ok: true, by, agent: true, summary: `${by} ${existed ? "replaced" : "dropped"} ${name}`, details: doc.title || doc.postPath || kind });
  return doc;
}

export async function setFileStatus(by: string, body: Record<string, unknown>, agent: boolean) {
  const id = str(body.id, 200);
  const status = body.status as InboxStatus;
  if (!id.startsWith("ops.inbox.")) throw new HttpError(400, "Bad id");
  if (!["new", "in-progress", "done", "skipped"].includes(status)) throw new HttpError(400, "status must be new, in-progress, done or skipped");
  const c = opsClient();
  const file = await c.getDocument<InboxFile>(id);
  if (!file) throw new HttpError(404, "No such file");
  const note = str(body.note, 2000);
  const publishedUrl = str(body.publishedUrl, 1000);
  const updated = await c
    .patch(id)
    .set({ status, handledBy: by, handledAt: new Date().toISOString(), ...(note ? { note } : {}), ...(publishedUrl ? { publishedUrl } : {}) })
    .commit();
  // A published refresh resets that post's 11-month clock.
  if (status === "done" && file.kind === "blog-refresh" && file.postPath) {
    const site = file.site ?? siteOfUrl(file.postPath);
    const slug = file.postPath.split("/").filter(Boolean).pop();
    if (site && slug) await c.patch(blogId(site, slug)).set({ refreshedAt: new Date().toISOString().slice(0, 10) }).commit().catch(() => undefined);
  }
  const verb = { new: "reopened", "in-progress": "started on", done: status === "done" && file.kind === "blog-refresh" ? "published" : "finished", skipped: "skipped" }[status];
  await logRun({ job: agent ? "agent" : "inbox", ok: true, by, agent, summary: `${by} ${verb} ${file.name}`, details: note || publishedUrl || undefined });
  return updated;
}

/** Source tags for one or many posts: { posts: [{ site, slug | url, source }] }. */
export async function setBlogSources(by: string, body: Record<string, unknown>, agent: boolean) {
  const list = (Array.isArray(body.posts) ? body.posts : [body]).slice(0, 1000) as Record<string, unknown>[];
  const c = opsClient();
  const skipped: string[] = [];
  const wanted: { id: string; label: string; source: unknown }[] = [];
  for (const p of list) {
    const url = str(p.url, 1000) || str(p.path, 1000);
    const site = isSite(p.site) ? p.site : siteOfUrl(url);
    const slug = str(p.slug, 200) || toPath(url).split("/").filter(Boolean).pop() || "";
    if (!site || !slug) skipped.push(`${url || slug || "?"}: say which site (site: synergy | bolder, or a full URL)`);
    else if (p.source !== null && p.source !== "" && !isBlogSource(p.source)) skipped.push(`${slug}: source must be one of ${Object.keys(SOURCE_LABEL).join(", ")}`);
    else wanted.push({ id: blogId(site, slug), label: slug, source: p.source });
  }
  const known = new Set(await c.fetch<string[]>(`*[_id in $ids]._id`, { ids: wanted.map((w) => w.id) }));
  const tx = c.transaction();
  let n = 0;
  for (const w of wanted) {
    if (!known.has(w.id)) {
      skipped.push(`${w.label}: not in the tracker (not on the site's blog, or the weekly blog sync has not seen it yet)`);
      continue;
    }
    if (w.source === null || w.source === "") tx.patch(w.id, (x) => x.unset(["source", "sourceBy"]));
    else tx.patch(w.id, (x) => x.set({ source: w.source, sourceBy: by }));
    n++;
  }
  if (n) {
    await tx.commit();
    await logRun({ job: agent ? "agent" : "blogs", ok: true, by, agent, summary: `${by} tagged the source of ${n} blog post(s)` });
  }
  return { updated: n, skipped };
}

/** The one-line weekly pulse ("organic clicks down 12% WoW, check X"). */
export async function setPulse(by: string, body: Record<string, unknown>, agent: boolean) {
  const week = mondayOf(str(body.week, 10) || new Date());
  const text = str(body.text, 500);
  if (!text) throw new HttpError(400, "text is required");
  const c = opsClient();
  await c.createIfNotExists({ _id: `ops.weekly.${week}`, _type: "opsWeekly", week });
  const updated = await c.patch(`ops.weekly.${week}`).set({ pulse: text, pulseBy: by, pulseAt: new Date().toISOString() }).commit();
  await logRun({ job: agent ? "agent" : "weekly", ok: true, by, agent, summary: `${by} wrote the weekly pulse for ${week}`, details: text });
  return updated;
}

const subStr = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * Historical form submissions (e.g. pulled from HubSpot) for the Forms tab.
 * Each item needs an id (the source's id, for safe re-runs) and submittedAt.
 * Skipped: same id already imported, or same site + email within 10 minutes
 * of a submission we already have (the site's own record or a Gmail import).
 */
export async function importSubmissions(by: string, body: Record<string, unknown>) {
  const site = isSite(body.site) ? body.site : null;
  const source = str(body.source, 30).replace(/[^a-z0-9]/gi, "").toLowerCase() || "hubspot";
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 2000) as Record<string, unknown>[];
  if (!site) throw new HttpError(400, "site must be synergy or bolder");
  if (!items.length) throw new HttpError(400, "items is empty");
  const c = opsClient();
  const existing = await c.fetch<{ _id: string; email?: string; submittedAt: string }[]>(
    `*[_type == "opsSubmission" && _id in path("ops.**") && coalesce(site, "synergy") == $site]{_id, email, submittedAt}`,
    { site }
  );
  const ids = new Set(existing.map((e) => e._id));
  const byEmail = new Map<string, number[]>();
  for (const e of existing) if (e.email) byEmail.set(e.email.toLowerCase(), [...(byEmail.get(e.email.toLowerCase()) ?? []), Date.parse(e.submittedAt)]);

  const tx = c.transaction();
  let created = 0;
  const skipped: string[] = [];
  for (const it of items) {
    const ext = str(it.id, 100).replace(/[^a-zA-Z0-9_-]/g, "-");
    const at = Date.parse(String(it.submittedAt ?? ""));
    if (!ext || !Number.isFinite(at)) {
      skipped.push(`${ext || "?"}: needs id and submittedAt`);
      continue;
    }
    const id = `ops.submission.${source}-${ext}`;
    const email = subStr(it.email, 320);
    const near = email && (byEmail.get(email.toLowerCase()) ?? []).some((t) => Math.abs(t - at) < 10 * 60_000);
    if (ids.has(id) || near) {
      skipped.push(`${ext}: already have it`);
      continue;
    }
    const extra = it.extra && typeof it.extra === "object" ? Object.entries(it.extra as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "").slice(0, 40).map(([key, value], i) => ({ _key: `x${i}`, key: key.slice(0, 100), value: String(value).slice(0, 2000) })) : [];
    const doc = Object.fromEntries(
      Object.entries({
        _id: id,
        _type: "opsSubmission",
        site,
        form: "import",
        formName: subStr(it.formName, 200) ?? `Imported (${source})`,
        submittedAt: new Date(at).toISOString(),
        name: subStr(it.name, 200),
        email,
        phone: subStr(it.phone, 50),
        budget: subStr(it.budget, 100),
        message: subStr(it.message, 5000),
        domain: subStr(it.domain, 260),
        pageUrl: subStr(it.pageUrl, 2000),
        country: subStr(it.country, 10),
        city: subStr(it.city, 100),
        env: "import",
        importedBy: by,
        importSource: source,
        ...(extra.length ? { extra } : {}),
      }).filter(([, v]) => v !== undefined)
    );
    tx.createIfNotExists(doc as { _id: string; _type: string });
    ids.add(id);
    if (email) byEmail.set(email.toLowerCase(), [...(byEmail.get(email.toLowerCase()) ?? []), at]);
    created++;
  }
  if (created) await tx.commit();
  if (created) await logRun({ job: "agent", ok: true, by, agent: true, summary: `${by} imported ${created} ${site === "bolder" ? "Bolder Apps" : "Synergy"} form submission(s) from ${source}`, details: skipped.length ? `${skipped.length} skipped` : undefined });
  return { created, skipped };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
