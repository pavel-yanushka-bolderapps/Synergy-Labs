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
import { ga4ReportForSite, gscQueryForSite, completedWeeks, sourceStatus, type KpiSite } from "./kpi";

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
  /** Search Console: Google search clicks and impressions for the post's URL. */
  clicks?: number;
  impressions?: number;
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
  /** Sums over `traffic`. */
  views?: number;
  clicks?: number;
  impressions?: number;
  /** False once the post is gone from the site (kept for its history). */
  live?: boolean;
  lastSeenAt?: string;
}

const SITE_HOST: Record<BlogSite, string> = { synergy: "https://www.synergylabs.co", bolder: "https://www.bolderapps.com" };
const PREFIX: Record<BlogSite, string> = { synergy: "/blog/", bolder: "/blog-posts/" };
export const blogUrl = (site: BlogSite, path: string) => SITE_HOST[site] + path;
export const blogId = (site: BlogSite, slug: string) => `ops.blog.${site}-${slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}`;

// Location posts ("How much does it cost to build an app in Las Vegas", "Top
// app developers in Dubai") are Vineyard's. New posts whose title or slug names
// a place are tagged Vineyard automatically; a source someone set is never changed.
const PLACES = [
  "New York", "NYC", "Manhattan", "Brooklyn", "Los Angeles", "San Francisco", "Bay Area", "Silicon Valley", "San Jose", "San Diego",
  "Sacramento", "Irvine", "Seattle", "Portland", "Denver", "Phoenix", "Scottsdale", "Las Vegas", "Salt Lake City", "Dallas",
  "Houston", "Austin", "San Antonio", "Fort Worth", "Chicago", "Detroit", "Minneapolis", "Kansas City", "St. Louis", "Nashville",
  "Atlanta", "Charlotte", "Raleigh", "Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "Boca Raton", "Boston",
  "Philadelphia", "Pittsburgh", "Baltimore", "Washington DC", "Washington, D.C.", "Columbus", "Cleveland", "Cincinnati",
  "Indianapolis", "New Jersey", "New Orleans", "Florida", "Texas", "California", "Arizona", "Nevada", "Colorado", "Illinois", "Ohio",
  "Utah", "Massachusetts", "North Carolina", "Tennessee", "Dubai", "Abu Dhabi", "UAE", "Riyadh", "Saudi", "Jeddah", "Qatar", "Doha",
  "London", "Toronto", "Vancouver", "Sydney", "Melbourne", "Singapore", "Berlin", "Amsterdam", "Bangalore",
];
const PLACE_RE = new RegExp(`\\b(${PLACES.map((p) => p.replace(/[.,]/g, "\\$&").replace(/ /g, "[\\s-]+")).join("|")})\\b`, "i");
/** The place a post is about, if its title or slug names one. */
export function locationOf(title = "", slug = ""): string | undefined {
  return PLACE_RE.exec(title)?.[1] ?? PLACE_RE.exec(slug.replace(/-/g, " "))?.[1];
}
export const LOCATION_RULE = "Location rule";

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
export async function syncBlogList(): Promise<{ synergy: number; bolder: number; added: number; gone: number; vineyard: number }> {
  const c = opsClient();
  const now = new Date().toISOString();
  const existing = await c.fetch<Pick<BlogDoc, "_id" | "site" | "slug" | "title" | "publishedAt" | "live" | "source">[]>(
    `*[_type == "opsBlog" && _id in path("ops.**")]{_id, site, slug, title, publishedAt, live, source}`
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

  // Untagged location posts -> Vineyard.
  let vineyard = 0;
  for (const t of tx) {
    const fields = (t.create ?? t.set) as { slug?: string; title?: string };
    const had = byId.get(t.id);
    if (had?.source) continue;
    if (!locationOf(fields.title ?? had?.title, fields.slug ?? had?.slug)) continue;
    Object.assign(fields, { source: "vineyard", sourceBy: LOCATION_RULE });
    vineyard++;
  }

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
  return { synergy: synergy.length, bolder, added, gone, vineyard };
}

/**
 * Per post and week: GA4 views / sessions / users and Search Console clicks /
 * impressions, both sites. Each week's numbers replace that week's entry, so
 * re-running is safe. Weeks before a post's publish date are skipped. GA4 and
 * Search Console are fetched independently: one failing keeps the other.
 */
export async function syncBlogTraffic(weeks: string[]): Promise<{ site: BlogSite; ok: boolean; message: string }[]> {
  const c = opsClient();
  const results: { site: BlogSite; ok: boolean; message: string }[] = [];
  const clean = (path: string) => path.split("?")[0].split("#")[0].replace(/\/$/, "");
  for (const site of ["synergy", "bolder"] as BlogSite[]) {
    const status = sourceStatus(site);
    if (!status.ga4 && !status.gsc) {
      results.push({ site, ok: false, message: `Google not connected for ${site}` });
      continue;
    }
    try {
      const posts = await c.fetch<Pick<BlogDoc, "_id" | "path" | "publishedAt" | "traffic">[]>(
        `*[_type == "opsBlog" && _id in path("ops.**") && site == $site]{_id, path, publishedAt, traffic}`,
        { site }
      );
      const byPath = new Map(posts.map((p) => [clean(p.path), p]));
      const byId = new Map(posts.map((p) => [p._id, p]));
      const updates = new Map<string, Map<string, TrafficWeek>>();
      const problems = new Set<string>();
      for (const week of weeks) {
        const end = addDays(week, 6);
        const range = [{ startDate: week, endDate: end }];
        const filter = { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: PREFIX[site] } } };
        const [all, organic, search] = await Promise.all([
          status.ga4
            ? ga4ReportForSite(site, { dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "activeUsers" }], dimensionFilter: filter, limit: 10000 })
                .catch((e) => (problems.add(`GA4: ${e.message}`), null))
            : null,
          status.ga4
            ? ga4ReportForSite(site, {
                dateRanges: range,
                dimensions: [{ name: "pagePath" }],
                metrics: [{ name: "sessions" }],
                dimensionFilter: { andGroup: { expressions: [filter, { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } }] } },
                limit: 10000,
              }).catch((e) => (problems.add(`GA4: ${e.message}`), null))
            : null,
          status.gsc
            ? gscQueryForSite(site, {
                startDate: week,
                endDate: end,
                dimensions: ["page"],
                dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: PREFIX[site] }] }],
                rowLimit: 25000,
              }).catch((e) => (problems.add(`Search Console: ${e.message}`), null))
            : null,
        ]);
        if (!all && !search) continue;
        const org = new Map((organic ?? []).map((r) => [clean(r.dimensionValues![0].value), Number(r.metricValues[0].value)]));
        const totals = new Map<string, TrafficWeek>();
        const live = (id: string) => {
          const post = byId.get(id)!;
          return !post.publishedAt || end >= post.publishedAt;
        };
        const entry = (id: string) => {
          const prev = (byId.get(id)!.traffic ?? []).find((t) => t.week === week);
          // A source that failed this run keeps what it had for the week.
          const t = totals.get(id) ?? {
            _key: `w${week}`,
            week,
            views: all ? 0 : prev?.views ?? 0,
            sessions: all ? 0 : prev?.sessions ?? 0,
            users: all ? 0 : prev?.users ?? 0,
            organic: all ? 0 : prev?.organic ?? 0,
            clicks: search ? 0 : prev?.clicks,
            impressions: search ? 0 : prev?.impressions,
          };
          totals.set(id, t);
          return t;
        };
        for (const r of all ?? []) {
          const path = clean(r.dimensionValues![0].value);
          const post = byPath.get(path);
          if (!post || !live(post._id)) continue;
          const t = entry(post._id);
          t.views += Number(r.metricValues[0].value);
          t.sessions += Number(r.metricValues[1].value);
          t.users += Number(r.metricValues[2].value);
          t.organic = org.get(path) ?? 0;
        }
        for (const r of search ?? []) {
          let path: string;
          try {
            path = clean(new URL(r.keys![0]).pathname);
          } catch {
            continue;
          }
          const post = byPath.get(path);
          if (!post || !live(post._id)) continue;
          const t = entry(post._id);
          t.clicks = (t.clicks ?? 0) + r.clicks;
          t.impressions = (t.impressions ?? 0) + r.impressions;
        }
        // Posts live that week with no row had 0: record it, so a week with
        // no traffic is not mistaken for a week not synced.
        for (const p of posts) {
          if (!live(p._id)) continue;
          if (!updates.has(p._id)) updates.set(p._id, new Map());
          updates.get(p._id)!.set(week, entry(p._id));
        }
      }
      const tx = [...updates.entries()].map(([id, weekly]) => {
        const post = byId.get(id)!;
        const merged = new Map((post.traffic ?? []).map((t) => [t.week, t]));
        for (const [w, t] of weekly) merged.set(w, t);
        const traffic = [...merged.values()].sort((a, b) => a.week.localeCompare(b.week));
        const sum = (k: "views" | "clicks" | "impressions") => traffic.reduce((s, t) => s + (t[k] ?? 0), 0);
        return { id, traffic, views: sum("views"), clicks: sum("clicks"), impressions: sum("impressions") };
      });
      for (let i = 0; i < tx.length; i += 100) {
        const batch = c.transaction();
        for (const t of tx.slice(i, i + 100)) batch.patch(t.id, (p) => p.set({ traffic: t.traffic, views: t.views, clicks: t.clicks, impressions: t.impressions, trafficSyncedAt: new Date().toISOString() }));
        await batch.commit({ visibility: "async" });
      }
      const missing = [!status.ga4 && "GA4 not connected", ...problems].filter(Boolean);
      results.push({ site, ok: tx.length > 0 && !problems.size, message: `${tx.length} posts, ${weeks.length} week(s)${missing.length ? ` · ${missing.join("; ")}` : ""}` });
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
    summary: `Blog tracker: ${list.synergy} Synergy + ${list.bolder} Bolder posts${list.added ? `, ${list.added} new` : ""}${list.vineyard ? `, ${list.vineyard} location post(s) tagged Vineyard` : ""}${list.gone ? `, ${list.gone} gone` : ""}; traffic ${traffic.filter((t) => t.ok).length ? `synced (${weeks} wk)` : "not synced"}`,
    details: failed.map((f) => `${f.site}: ${f.message}`).join("\n") || undefined,
  });
  return { list, traffic };
}

/** Posts, newest first, without the weekly traffic arrays (sent separately when asked). */
export async function loadBlogs(opts: { withTraffic?: boolean } = {}): Promise<BlogDoc[]> {
  // GROQ projections return null for missing fields; drop them so callers see undefined.
  const strip = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) as unknown as BlogDoc;
  return (await opsClient().fetch<Record<string, unknown>[]>(
    `*[_type == "opsBlog" && _id in path("ops.**")] | order(publishedAt desc){_id, site, slug, path, title, publishedAt, source, sourceBy, refreshedAt, views, clicks, impressions, live${opts.withTraffic ? ", traffic" : ", \"recent\": traffic[-4..-1]{week, views, clicks}"}}`
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

export interface MonthBySource {
  site: BlogSite;
  /** YYYY-MM */
  month: string;
  source: BlogSource | "none";
  views: number;
  clicks: number;
  impressions: number;
  /** Posts with any views or search impressions that month. */
  posts: number;
}

/**
 * Blog traffic per calendar month and source, from the weekly numbers. A week
 * counts in the month its Thursday falls in (the ISO week rule), so a month is
 * 4 or 5 whole weeks and the totals add up to the weekly ones.
 */
export async function monthlyBySource(opts: { site?: BlogSite; from?: string } = {}): Promise<MonthBySource[]> {
  const posts = await opsClient().fetch<{ site: BlogSite; source?: BlogSource; traffic?: TrafficWeek[] }[]>(
    `*[_type == "opsBlog" && _id in path("ops.**") && ($site == "" || site == $site)]{site, source, traffic}`,
    { site: opts.site ?? "" }
  );
  const rows = new Map<string, MonthBySource>();
  for (const p of posts) {
    const source = p.source ?? "none";
    const seen = new Set<string>();
    for (const t of p.traffic ?? []) {
      const month = addDays(t.week, 3).slice(0, 7);
      if (opts.from && month < opts.from) continue;
      const key = `${p.site}|${month}|${source}`;
      const r = rows.get(key) ?? { site: p.site, month, source, views: 0, clicks: 0, impressions: 0, posts: 0 };
      r.views += t.views ?? 0;
      r.clicks += t.clicks ?? 0;
      r.impressions += t.impressions ?? 0;
      if (!seen.has(month) && ((t.views ?? 0) > 0 || (t.impressions ?? 0) > 0)) {
        seen.add(month);
        r.posts++;
      }
      rows.set(key, r);
    }
  }
  return [...rows.values()].sort((a, b) => a.site.localeCompare(b.site) || a.month.localeCompare(b.month) || a.source.localeCompare(b.source));
}

// ---- Per-post analytics -------------------------------------------------------

export interface PeriodTotals { views: number; clicks: number; impressions: number }

/**
 * Each post's stored traffic summed over a period. A week counts when its
 * Monday falls between the Monday of `from` and `to`, so the period snaps to
 * whole weeks (the stored data is weekly).
 */
export async function blogPeriodTotals(site: BlogSite, from: string, to: string): Promise<Record<string, PeriodTotals>> {
  const start = mondayOf(from);
  const posts = await opsClient().fetch<{ _id: string; traffic?: TrafficWeek[] }[]>(
    `*[_type == "opsBlog" && _id in path("ops.**") && site == $site]{_id, "traffic": traffic[week >= $start && week <= $to]{week, views, clicks, impressions}}`,
    { site, start, to }
  );
  const out: Record<string, PeriodTotals> = {};
  for (const p of posts) {
    const t = { views: 0, clicks: 0, impressions: 0 };
    for (const w of p.traffic ?? []) {
      t.views += w.views ?? 0;
      t.clicks += w.clicks ?? 0;
      t.impressions += w.impressions ?? 0;
    }
    out[p._id] = t;
  }
  return out;
}

export interface PostDay { date: string; views?: number; users?: number; clicks?: number; impressions?: number; position?: number }
export interface PostQuery { query: string; clicks: number; impressions: number; position: number }

/**
 * One post, straight from Google for any date range: Search Console clicks,
 * impressions and average position per day, the searches it showed up for,
 * and GA4 views per day. Nothing is stored. URLs on any host of the property
 * count (www or not, http or https), the same matching the weekly sync uses.
 */
export async function blogPostLive(site: BlogSite, path: string, from: string, to: string) {
  const clean = (p: string) => p.split("?")[0].split("#")[0].replace(/\/$/, "");
  const target = clean(path);
  const pathOf = (url: string) => { try { return clean(new URL(url).pathname); } catch { return ""; } };
  const status = sourceStatus(site);
  const errors: string[] = [];
  const pageFilter = [{ filters: [{ dimension: "page", operator: "contains", expression: target }] }];

  const [daily, queries, ga4] = await Promise.all([
    status.gsc
      ? gscQueryForSite(site, { startDate: from, endDate: to, dimensions: ["date", "page"], dimensionFilterGroups: pageFilter, rowLimit: 25000 })
          .catch((e) => (errors.push(`Search Console: ${e.message}`), null))
      : (errors.push("Search Console not connected"), null),
    status.gsc
      ? gscQueryForSite(site, { startDate: from, endDate: to, dimensions: ["query", "page"], dimensionFilterGroups: pageFilter, rowLimit: 25000 })
          .catch(() => null)
      : null,
    status.ga4
      ? ga4ReportForSite(site, {
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: "date" }, { name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
          dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: target } } },
          limit: 25000,
        }).catch((e) => (errors.push(`GA4: ${e.message}`), null))
      : (errors.push("GA4 not connected"), null),
  ]);

  const days = new Map<string, PostDay & { posSum: number }>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) days.set(date, (d = { date, posSum: 0 }));
    return d;
  };
  // Every URL counted as this post (Search Console lists them separately).
  const urls = new Map<string, { url: string; clicks: number; impressions: number }>();
  for (const r of daily ?? []) {
    if (pathOf(r.keys![1]) !== target) continue;
    const u = urls.get(r.keys![1]) ?? { url: r.keys![1], clicks: 0, impressions: 0 };
    u.clicks += r.clicks;
    u.impressions += r.impressions;
    urls.set(u.url, u);
    const d = day(r.keys![0]);
    d.clicks = (d.clicks ?? 0) + r.clicks;
    d.impressions = (d.impressions ?? 0) + r.impressions;
    d.posSum += r.position * r.impressions;
  }
  for (const r of ga4 ?? []) {
    if (clean(r.dimensionValues![1].value) !== target) continue;
    const v = r.dimensionValues![0].value; // YYYYMMDD
    const d = day(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`);
    d.views = (d.views ?? 0) + Number(r.metricValues[0].value);
    d.users = (d.users ?? 0) + Number(r.metricValues[1].value);
  }
  const byQuery = new Map<string, PostQuery & { posSum: number }>();
  for (const r of queries ?? []) {
    if (pathOf(r.keys![1]) !== target) continue;
    const q = byQuery.get(r.keys![0]) ?? { query: r.keys![0], clicks: 0, impressions: 0, position: 0, posSum: 0 };
    q.clicks += r.clicks;
    q.impressions += r.impressions;
    q.posSum += r.position * r.impressions;
    byQuery.set(q.query, q);
  }

  return {
    days: [...days.values()]
      .map(({ posSum, ...d }) => ({ ...d, position: d.impressions ? posSum / d.impressions : undefined }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    queries: [...byQuery.values()]
      .map(({ posSum, ...q }) => ({ ...q, position: q.impressions ? posSum / q.impressions : 0 }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 100),
    urls: [...urls.values()].sort((a, b) => b.impressions - a.impressions),
    sources: { gsc: Boolean(daily), ga4: Boolean(ga4) },
    errors,
  };
}

/** One post's stored weekly numbers (the fallback when Google can't be reached). */
export async function blogPostWeeks(id: string): Promise<TrafficWeek[]> {
  const doc = await opsClient().fetch<{ traffic?: TrafficWeek[] } | null>(`*[_id == $id][0]{traffic}`, { id });
  return doc?.traffic ?? [];
}
