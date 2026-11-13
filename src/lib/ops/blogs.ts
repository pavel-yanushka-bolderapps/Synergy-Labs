// The blog tracker: every post on both websites, where it came from (source
// tag), its GA4 traffic week by week from publish date forward, and the
// refresh queue (posts reaching 11 months old, plus the refresh briefs that
// agents drop in as .md files).
//
//   synergylabs.co   posts come from Sanity (blogPost), path /blog/<slug>
//   bolderapps.com   posts come from the Webflow sitemap (/blog-posts/<slug>);
//                    title and date are read from the page the first time a
//                    post is seen (Webflow's JSON-LD has no datePublished)
//
// One "opsBlog" document per post, id ops.blog.<site>-<slug>. Read-only for
// the marketing site: nothing here writes to blogPost documents.
import { opsClient, mondayOf, addDays, logRun } from "./store";
import { ga4ReportForSite, completedWeeks, sourceStatus, type KpiSite } from "./kpi";

export type BlogSite = KpiSite;
export const BLOG_SOURCES = ["adaptify", "redrover", "vineyard", "team"] as const;
export type BlogSource = (typeof BLOG_SOURCES)[number];
export const SOURCE_LABEL: Record<BlogSource, string> = { adaptify: "Adaptify", redrover: "Red Rover", vineyard: "Vineyard", team: "Team-sourced" };
export const isBlogSource = (s: unknown): s is BlogSource => (BLOG_SOURCES as readonly unknown[]).includes(s);

export interface TrafficWeek {
  _key: string;
  week: string;
  views: number;
  sessions: number;
  users: number;
  organic: number;
}

export interface BlogDoc {
  _id: string;
  _type: "opsBlog";
  site: BlogSite;
  slug: string;
  path: string;
  title: string;
  /** YYYY-MM-DD */
  publishedAt?: string;
  source?: BlogSource;
  sourceBy?: string;
  /** Set when the post was last refreshed (resets the 11-month clock). */
  refreshedAt?: string;
  traffic?: TrafficWeek[];
  /** Sum of views over `traffic`. */
  views?: number;
  /** False once the post is gone from the site (kept for its history). */
  live?: boolean;
  lastSeenAt?: string;
}

const SITE_HOST: Record<BlogSite, string> = { synergy: "https://www.synergylabs.co", bolder: "https://www.bolderapps.com" };
const PREFIX: Record<BlogSite, string> = { synergy: "/blog/", bolder: "/blog-posts/" };
export const blogUrl = (site: BlogSite, path: string) => SITE_HOST[site] + path;
export const blogId = (site: BlogSite, slug: string) => `ops.blog.${site}-${slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}`;

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

/** Title and publish date of a bolderapps.com post, read from its page. */
async function readBolderPost(url: string): Promise<{ title?: string; date?: string; redirected?: boolean }> {
  const res = await fetch(url, { headers: { "User-Agent": "WebsiteOps/1.0 (+blog tracker)" } });
  // Listed in the sitemap but redirected away (e.g. to /blog): not a live post.
  if (res.redirected) return { redirected: true };
  if (!res.ok) return {};
  const html = await res.text();
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/\s*\|\s*Bolder Apps.*$/i, "").trim();
  const m = new RegExp(`blog-date-title[^>]*>\\s*((?:${MONTHS}) \\d{1,2}, \\d{4})`).exec(html);
  const date = m ? new Date(`${m[1]} UTC`).toISOString().slice(0, 10) : undefined;
  return { title: title?.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"'), date };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

/**
 * Refreshes the list of posts on both sites: adds new ones, updates titles
 * and dates, and marks ones that disappeared. Never removes a source tag,
 * traffic history or refresh date.
 */
export async function syncBlogList(): Promise<{ synergy: number; bolder: number; added: number; gone: number }> {
  const c = opsClient();
  const now = new Date().toISOString();
  const existing = await c.fetch<Pick<BlogDoc, "_id" | "site" | "slug" | "title" | "publishedAt" | "live">[]>(
    `*[_type == "opsBlog" && _id in path("ops.**")]{_id, site, slug, title, publishedAt, live}`
  );
  const byId = new Map(existing.map((d) => [d._id, d]));
  const seen = new Set<string>();
  const tx: { id: string; create?: object; set?: object }[] = [];

  // synergylabs.co: published posts in Sanity.
  const synergy = await c.fetch<{ slug: string; title: string; date?: string }[]>(
    `*[_type == "blogPost" && !(_id in path("drafts.**")) && defined(slug.current)]{"slug": slug.current, title, date}`
  );
  for (const p of synergy) {
    const id = blogId("synergy", p.slug);
    seen.add(id);
    const fields = { site: "synergy", slug: p.slug, path: PREFIX.synergy + p.slug, title: p.title, publishedAt: p.date?.slice(0, 10), live: true, lastSeenAt: now };
    tx.push(byId.has(id) ? { id, set: fields } : { id, create: fields });
  }

  // bolderapps.com: the sitemap, plus the page itself for posts not seen before.
  const xml = await fetch(`${SITE_HOST.bolder}/sitemap.xml`).then((r) => r.text());
  const urls = [...xml.matchAll(/<loc>([^<]*\/blog-posts\/[^<]+)<\/loc>/g)].map((m) => m[1].trim());
  let bolder = 0;
  await pool(urls, 8, async (url) => {
    const slug = new URL(url).pathname.replace(PREFIX.bolder, "").replace(/\/$/, "");
    if (!slug) return;
    bolder++;
    const id = blogId("bolder", slug);
    seen.add(id);
    const had = byId.get(id);
    const base = { site: "bolder", slug, path: PREFIX.bolder + slug, live: true, lastSeenAt: now };
    if (had?.title && had.publishedAt) return void tx.push({ id, set: base });
    const page = await readBolderPost(url).catch(() => ({}) as { title?: string; date?: string; redirected?: boolean });
    const fields = { ...base, ...(page.redirected ? { live: false } : {}), title: (!page.redirected && page.title) || had?.title || slug.replace(/-/g, " "), ...(page.date ? { publishedAt: page.date } : {}) };
    tx.push(had ? { id, set: fields } : { id, create: fields });
  });

  let gone = 0;
  for (const d of existing) if (!seen.has(d._id) && d.live !== false) {
    gone++;
    tx.push({ id: d._id, set: { live: false } });
  }

  const added = tx.filter((t) => t.create).length;
  for (let i = 0; i < tx.length; i += 150) {
    const batch = c.transaction();
    for (const t of tx.slice(i, i + 150)) {
      if (t.create) batch.createIfNotExists({ _id: t.id, _type: "opsBlog", ...t.create });
      else batch.patch(t.id, (p) => p.set(t.set!));
    }
    await batch.commit({ visibility: "async" });
  }
  return { synergy: synergy.length, bolder, added, gone };
}

/**
 * GA4 views / sessions / users per post for the given weeks (Mondays), both
 * sites. Each week's numbers replace that week's entry, so re-running is safe.
 * Weeks before a post's publish date are skipped.
 */
export async function syncBlogTraffic(weeks: string[]): Promise<{ site: BlogSite; ok: boolean; message: string }[]> {
  const c = opsClient();
  const results: { site: BlogSite; ok: boolean; message: string }[] = [];
  for (const site of ["synergy", "bolder"] as BlogSite[]) {
    if (!sourceStatus(site).ga4) {
      results.push({ site, ok: false, message: `GA4 not connected for ${site}` });
      continue;
    }
    try {
      const posts = await c.fetch<Pick<BlogDoc, "_id" | "path" | "publishedAt" | "traffic">[]>(
        `*[_type == "opsBlog" && _id in path("ops.**") && site == $site]{_id, path, publishedAt, traffic}`,
        { site }
      );
      const byPath = new Map(posts.map((p) => [p.path.replace(/\/$/, ""), p]));
      const updates = new Map<string, Map<string, TrafficWeek>>();
      for (const week of weeks) {
        const range = [{ startDate: week, endDate: addDays(week, 6) }];
        const filter = { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: PREFIX[site] } } };
        const [all, organic] = await Promise.all([
          ga4ReportForSite(site, { dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "activeUsers" }], dimensionFilter: filter, limit: 10000 }),
          ga4ReportForSite(site, {
            dateRanges: range,
            dimensions: [{ name: "pagePath" }],
            metrics: [{ name: "sessions" }],
            dimensionFilter: { andGroup: { expressions: [filter, { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } }] } },
            limit: 10000,
          }),
        ]);
        const org = new Map(organic.map((r) => [r.dimensionValues![0].value.split("?")[0].replace(/\/$/, ""), Number(r.metricValues[0].value)]));
        const totals = new Map<string, TrafficWeek>();
        for (const r of all) {
          const path = r.dimensionValues![0].value.split("?")[0].replace(/\/$/, "");
          const post = byPath.get(path);
          if (!post || (post.publishedAt && addDays(week, 6) < post.publishedAt)) continue;
          const t = totals.get(post._id) ?? { _key: `w${week}`, week, views: 0, sessions: 0, users: 0, organic: org.get(path) ?? 0 };
          t.views += Number(r.metricValues[0].value);
          t.sessions += Number(r.metricValues[1].value);
          t.users += Number(r.metricValues[2].value);
          totals.set(post._id, t);
        }
        // Posts live that week with no GA4 row had 0 views: record it, so a
        // week with no traffic is not mistaken for a week not synced.
        for (const p of posts) {
          if (p.publishedAt && addDays(week, 6) < p.publishedAt) continue;
          const t = totals.get(p._id) ?? { _key: `w${week}`, week, views: 0, sessions: 0, users: 0, organic: 0 };
          if (!updates.has(p._id)) updates.set(p._id, new Map());
          updates.get(p._id)!.set(week, t);
        }
      }
      const tx = [...updates.entries()].map(([id, weekly]) => {
        const post = posts.find((p) => p._id === id)!;
        const merged = new Map((post.traffic ?? []).map((t) => [t.week, t]));
        for (const [w, t] of weekly) merged.set(w, t);
        const traffic = [...merged.values()].sort((a, b) => a.week.localeCompare(b.week));
        return { id, traffic, views: traffic.reduce((s, t) => s + t.views, 0) };
      });
      for (let i = 0; i < tx.length; i += 100) {
        const batch = c.transaction();
        for (const t of tx.slice(i, i + 100)) batch.patch(t.id, (p) => p.set({ traffic: t.traffic, views: t.views, trafficSyncedAt: new Date().toISOString() }));
        await batch.commit({ visibility: "async" });
      }
      results.push({ site, ok: true, message: `${tx.length} posts, ${weeks.length} week(s)` });
    } catch (err) {
      results.push({ site, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** The weekly job: refresh the post list, then last week's traffic. */
export async function runBlogSync(by: string, weeks = 1) {
  const startedAt = new Date().toISOString();
  const list = await syncBlogList();
  const traffic = await syncBlogTraffic(completedWeeks(weeks));
  const failed = traffic.filter((t) => !t.ok);
  await logRun({
    job: "blog-sync",
    startedAt,
    ok: true,
    by,
    summary: `Blog tracker: ${list.synergy} Synergy + ${list.bolder} Bolder posts${list.added ? `, ${list.added} new` : ""}${list.gone ? `, ${list.gone} gone` : ""}; traffic ${traffic.filter((t) => t.ok).length ? `synced (${weeks} wk)` : "not synced"}`,
    details: failed.map((f) => `${f.site}: ${f.message}`).join("\n") || undefined,
  });
  return { list, traffic };
}

/** Posts, newest first, without the weekly traffic arrays (sent separately when asked). */
export async function loadBlogs(opts: { withTraffic?: boolean } = {}): Promise<BlogDoc[]> {
  // GROQ projections return null for missing fields; drop them so callers see undefined.
  const strip = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) as unknown as BlogDoc;
  return (await opsClient().fetch<Record<string, unknown>[]>(
    `*[_type == "opsBlog" && _id in path("ops.**")] | order(publishedAt desc){_id, site, slug, path, title, publishedAt, source, sourceBy, refreshedAt, views, live${opts.withTraffic ? ", traffic" : ", \"recent\": traffic[-4..-1]{week, views}"}}`
  )).map(strip);
}

/** 11 months after publishing (or after the last refresh), the post is due. */
export function refreshDueDate(p: Pick<BlogDoc, "publishedAt" | "refreshedAt">): string | undefined {
  const from = p.refreshedAt ?? p.publishedAt;
  if (!from) return undefined;
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 11);
  return d.toISOString().slice(0, 10);
}

/** Weeks to backfill from Jan 1 of this year to last week. */
export function weeksSinceYearStart(today = new Date()): number {
  const start = mondayOf(`${today.getUTCFullYear()}-01-01`);
  return Math.max(1, Math.floor((Date.parse(mondayOf(today)) - Date.parse(start)) / (7 * 86_400_000)));
}
