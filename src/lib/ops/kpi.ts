// Weekly KPI snapshot: GA4 + Search Console + HubSpot -> one "opsKpi"
// document per week (Monday..Sunday). Run by /api/cron/kpi-sync every Monday
// and from the "Sync now" button; `weeks` > 1 backfills earlier weeks.
//
// Each source is optional. A missing credential is recorded in the snapshot's
// `errors` and the others still sync, so the dashboard fills in as access is
// granted. Setup (once):
//
//   Google, either way (the service account's email must be a Viewer in GA4
//   -- Admin -> Property access management -- and a user in Search Console):
//
//   a) Keyless, via Vercel OIDC + Google Workload Identity Federation (the
//      Bolder Apps organisation blocks service-account keys):
//        GCP_WORKLOAD_IDENTITY_PROVIDER  projects/<number>/locations/global/
//                                        workloadIdentityPools/<pool>/providers/<provider>
//        GCP_SERVICE_ACCOUNT_EMAIL       the service account to act as
//      The pool's provider trusts issuer https://oidc.vercel.com/synergy-labs,
//      audience https://vercel.com/synergy-labs; the service account grants
//      the pool "Workload Identity User". Needs the IAM Service Account
//      Credentials and Security Token Service APIs enabled.
//   b) GOOGLE_SERVICE_ACCOUNT_JSON  a service account JSON key (raw or base64).
//
//   GA4_PROPERTY_ID              numeric, GA4 Admin -> Property details.
//   GSC_SITE                     default "sc-domain:synergylabs.co"; use
//                                "https://www.synergylabs.co/" for a URL-prefix
//                                property.
//   HUBSPOT_TOKEN                private app token with crm.objects.contacts.read.
//   HUBSPOT_BRAND_PROPERTY       optional; the contact property that tells which
//                                website a contact came from (default
//                                hs_analytics_first_url). MQLs/SQLs are split by
//                                whether it contains "bolderapps" or "synergylabs".
//
//   Bolder Apps (www.bolderapps.com, the "Bolder Apps" tab) uses the same
//   Google login with its own property and site; HubSpot is Synergy-only:
//   BOLDER_GA4_PROPERTY_ID       numeric
//   BOLDER_GSC_SITE              default "sc-domain:bolderapps.com"
//   GA4_EVENTS                   optional, comma-separated event names to count;
//                                default below.
//   GA4_CTA_EVENT                optional, default "cta_click"; the GA4 event a CTA click sends (for
//                                the "CTA clicks per week" key result).
//   Form start rate = GA4 "form_start" events / sessions (form_start is sent
//   by GA4 enhanced measurement, "Form interactions").
import { createSign } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { opsClient, newId, mondayOf, addDays, toStoredKpi, type KpiSnapshot } from "./store";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";

const DEFAULT_EVENTS = ["form_start", "FormStart", "ContactFormStart", "FormStep1", "FormStep2", "form_submit", "generate_lead"];

/** Every metric the dashboard knows, with a label. Key results link to these keys. */
export const METRICS: Record<string, { label: string; unit?: string; better?: "up" | "down"; format?: "pct" | "dec" }> = {
  "ga4.organicUsers": { label: "Organic users (week)" },
  "ga4.organicUsers30d": { label: "Organic users (last 30 days)" },
  "ga4.users": { label: "All users (week)" },
  "ga4.newUsers": { label: "New users (week)" },
  "ga4.formStartRate": { label: "Form start rate (form_start ÷ sessions)", format: "pct" },
  "ga4.ctaClicks": { label: "CTA clicks (week)" },
  "ga4.sessions": { label: "Sessions (week)" },
  "ga4.organicSessions": { label: "Organic sessions (week)" },
  "gsc.clicks": { label: "Search clicks" },
  "gsc.impressions": { label: "Search impressions" },
  "gsc.ctr": { label: "Search CTR", format: "pct" },
  "gsc.position": { label: "Avg. position", better: "down", format: "dec" },
  "hubspot.newContacts": { label: "New contacts" },
  "hubspot.newContactsOrganic": { label: "New contacts from organic" },
  "hubspot.mql": { label: "MQLs" },
  "hubspot.sql": { label: "SQLs" },
  "hubspot.mql.bolder": { label: "MQLs · Bolder Apps" },
  "hubspot.mql.synergy": { label: "MQLs · Synergy Labs" },
  "hubspot.sql.bolder": { label: "SQLs · Bolder Apps" },
  "hubspot.sql.synergy": { label: "SQLs · Synergy Labs" },
};
export const eventMetric = (name: string) => `ga4.event.${name}`;
/** The GA4 event a CTA click sends; synergylabs.co sends "cta_click" (Analytics.astro). */
export const ctaEvent = () => env("GA4_CTA_EVENT") || "cta_click";
export const ga4Events = () => {
  const list = env("GA4_EVENTS") ? env("GA4_EVENTS").split(",").map((s) => s.trim()) : DEFAULT_EVENTS;
  const cta = ctaEvent();
  return cta && !list.includes(cta) ? [...list, cta] : list;
};

export type KpiSite = "synergy" | "bolder";

/** "properties/123 " -> "123": the id is pasted from GA4 in more than one form. */
const propertyId = (v: string) => v.trim().replace(/^properties\//, "");

/** Where each website's numbers come from. */
const SOURCES: Record<KpiSite, { ga4Property: () => string; ga4Var: string; gscSite: () => string; hubspot: boolean }> = {
  synergy: { ga4Property: () => propertyId(env("GA4_PROPERTY_ID")), ga4Var: "GA4_PROPERTY_ID", gscSite: () => env("GSC_SITE") || "sc-domain:synergylabs.co", hubspot: true },
  bolder: { ga4Property: () => propertyId(env("BOLDER_GA4_PROPERTY_ID")), ga4Var: "BOLDER_GA4_PROPERTY_ID", gscSite: () => env("BOLDER_GSC_SITE") || "sc-domain:bolderapps.com", hubspot: false },
};
export const isKpiSite = (s: unknown): s is KpiSite => s === "synergy" || s === "bolder";

const googleConfigured = () =>
  Boolean(env("GOOGLE_SERVICE_ACCOUNT_JSON") || (env("GCP_WORKLOAD_IDENTITY_PROVIDER") && env("GCP_SERVICE_ACCOUNT_EMAIL")));

export function sourceStatus(site: KpiSite = "synergy") {
  return {
    google: googleConfigured(),
    ga4: googleConfigured() && Boolean(SOURCES[site].ga4Property()),
    gsc: googleConfigured(),
    hubspot: SOURCES[site].hubspot && Boolean(env("HUBSPOT_TOKEN")),
    claude: Boolean(env("ANTHROPIC_API_KEY")),
  };
}

// --- Google auth ------------------------------------------------------------------

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly"];
let googleToken: { token: string; expires: number } | undefined;

async function googleAccessToken(): Promise<string> {
  if (googleToken && googleToken.expires > Date.now() + 60_000) return googleToken.token;
  googleToken = env("GCP_WORKLOAD_IDENTITY_PROVIDER") ? await federatedToken() : await keyToken();
  return googleToken.token;
}

/**
 * Keyless: this deployment's Vercel OIDC token -> Google STS (a federated
 * token for the workload identity pool) -> a short-lived access token for the
 * service account. Nothing long-lived is stored anywhere.
 */
async function federatedToken() {
  const provider = env("GCP_WORKLOAD_IDENTITY_PROVIDER");
  const serviceAccount = env("GCP_SERVICE_ACCOUNT_EMAIL");
  if (!serviceAccount) throw new Error("GCP_SERVICE_ACCOUNT_EMAIL is not set");
  const oidc = await getVercelOidcToken();

  const sts = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: `//iam.googleapis.com/${provider.replace(/^\/+/, "")}`,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      subjectToken: oidc,
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
    }),
  });
  const federated = await sts.json();
  if (!sts.ok) throw new Error(`Google STS: ${federated.error_description || federated.error || sts.status}`);

  const res = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${federated.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: SCOPES, lifetime: "3600s" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google impersonation: ${body.error?.message || res.status}`);
  return { token: body.accessToken as string, expires: Date.parse(body.expireTime) };
}

/** With a downloaded key: a service-account JWT exchanged for an access token. */
async function keyToken() {
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const key = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${body.error_description || body.error || res.status}`);
  return { token: body.access_token as string, expires: Date.now() + body.expires_in * 1000 };
}

async function google(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Google answers a malformed URL (usually a bad property id) with an HTML page.
    throw new Error(`Google API ${res.status} for ${new URL(url).pathname} (not JSON; check the GA4 property id is the numeric Property ID, not a G-… Measurement ID)`);
  }
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

/**
 * What the service account can read: every GA4 property and Search Console
 * site it has been granted. Used by the KPIs tab's "Check Google access" to
 * confirm access before setting GA4_PROPERTY_ID / GSC_SITE for a website.
 */
export async function googleAccess() {
  const token = await googleAccessToken();
  const get = async (url: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data } : { error: data.error?.message || `HTTP ${res.status}` };
  };
  const [ga, sc] = await Promise.all([
    get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200"),
    get("https://www.googleapis.com/webmasters/v3/sites"),
  ]);
  return {
    serviceAccount: env("GCP_SERVICE_ACCOUNT_EMAIL") || "(from GOOGLE_SERVICE_ACCOUNT_JSON)",
    configured: Object.fromEntries(
      (Object.keys(SOURCES) as KpiSite[]).map((s) => [s, { ga4Property: SOURCES[s].ga4Property() || null, gscSite: SOURCES[s].gscSite() }])
    ),
    ga4: ga.error
      ? { error: ga.error }
      : {
          properties: ((ga.data as any).accountSummaries ?? []).flatMap((a: any) =>
            (a.propertySummaries ?? []).map((p: any) => ({ id: String(p.property).replace("properties/", ""), name: p.displayName, account: a.displayName }))
          ),
        },
    gsc: sc.error ? { error: sc.error } : { sites: ((sc.data as any).siteEntry ?? []).map((s: any) => ({ url: s.siteUrl, permission: s.permissionLevel })) },
  };
}

// --- GA4 ---------------------------------------------------------------------

type Ga4Row = { dimensionValues?: { value: string }[]; metricValues: { value: string }[] };

async function ga4Report(property: string, body: object): Promise<Ga4Row[]> {
  if (!property) throw new Error("No GA4 property id is set");
  const data = await google(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, body);
  return data.rows ?? [];
}

/** A GA4 report for one website's property (used by the blog tracker). */
export function ga4ReportForSite(site: KpiSite, body: object): Promise<Ga4Row[]> {
  return ga4Report(SOURCES[site].ga4Property(), body);
}

const organicFilter = {
  filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } },
};

async function syncGa4(property: string, start: string, end: string, metrics: Record<string, number>, lists: KpiSnapshot["lists"]) {
  const range = [{ startDate: start, endDate: end }];
  const ga4Report_ = (body: object) => ga4Report(property, body);
  const [all, organic, organic30, events, pages] = await Promise.all([
    ga4Report_({ dateRanges: range, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "newUsers" }] }),
    ga4Report_({
      dateRanges: range,
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      dimensionFilter: organicFilter,
    }),
    ga4Report_({
      dateRanges: [{ startDate: addDays(end, -29), endDate: end }],
      metrics: [{ name: "activeUsers" }],
      dimensionFilter: organicFilter,
    }),
    ga4Report_({
      dateRanges: range,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ga4Events() } } },
    }),
    ga4Report_({
      dateRanges: range,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "activeUsers" }],
      dimensionFilter: organicFilter,
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 15,
    }),
  ]);
  const n = (rows: Ga4Row[], i = 0) => Number(rows[0]?.metricValues[i]?.value ?? 0);
  metrics["ga4.users"] = n(all);
  metrics["ga4.sessions"] = n(all, 1);
  metrics["ga4.newUsers"] = n(all, 2);
  metrics["ga4.organicUsers"] = n(organic);
  metrics["ga4.organicSessions"] = n(organic, 1);
  metrics["ga4.organicUsers30d"] = n(organic30);
  for (const name of ga4Events()) metrics[eventMetric(name)] = 0;
  for (const row of events) metrics[eventMetric(row.dimensionValues![0].value)] = Number(row.metricValues[0].value);
  if (metrics["ga4.sessions"]) metrics["ga4.formStartRate"] = (metrics[eventMetric("form_start")] ?? 0) / metrics["ga4.sessions"];
  // Only weeks the event exists in: a site that never sends it (bolderapps.com,
  // or synergylabs.co before Nov 2026) shows "–", not 0.
  if (metrics[eventMetric(ctaEvent())] !== undefined) metrics["ga4.ctaClicks"] = metrics[eventMetric(ctaEvent())];
  lists!["ga4.topOrganicPages"] = pages.map((r) => ({
    label: r.dimensionValues![0].value,
    value: Number(r.metricValues[0].value),
  }));
}

// --- Search Console ------------------------------------------------------------

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(siteUrl: string, body: object): Promise<GscRow[]> {
  const site = encodeURIComponent(siteUrl);
  const data = await google(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, body);
  return data.rows ?? [];
}

async function syncGsc(siteUrl: string, start: string, end: string, metrics: Record<string, number>, lists: KpiSnapshot["lists"]) {
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(end, -7);
  const [totals, pages, prevPages, queries] = await Promise.all([
    gscQuery(siteUrl, { startDate: start, endDate: end }),
    gscQuery(siteUrl, { startDate: start, endDate: end, dimensions: ["page"], rowLimit: 500 }),
    gscQuery(siteUrl, { startDate: prevStart, endDate: prevEnd, dimensions: ["page"], rowLimit: 500 }),
    gscQuery(siteUrl, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 500 }),
  ]);
  const t = totals[0];
  metrics["gsc.clicks"] = t?.clicks ?? 0;
  metrics["gsc.impressions"] = t?.impressions ?? 0;
  metrics["gsc.ctr"] = t?.ctr ?? 0;
  metrics["gsc.position"] = t?.position ?? 0;

  const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "") || "/";
  const before = new Map(prevPages.map((r) => [r.keys![0], r.clicks]));
  const changes = pages.map((r) => ({ label: path(r.keys![0]), value: r.clicks, change: r.clicks - (before.get(r.keys![0]) ?? 0) }));
  for (const [url, clicks] of before) {
    if (!pages.some((r) => r.keys![0] === url)) changes.push({ label: path(url), value: 0, change: -clicks });
  }
  lists!["gsc.topPages"] = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 15).map((r) => ({ label: path(r.keys![0]), value: r.clicks }));
  lists!["gsc.gainers"] = changes.filter((c) => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 10);
  lists!["gsc.losers"] = changes.filter((c) => c.change < 0).sort((a, b) => a.change - b.change).slice(0, 10);
  // "Striking distance": queries on page 1-2 with real demand -- the cheapest
  // wins, and the content bot's source of topic ideas.
  lists!["gsc.opportunities"] = queries
    .filter((r) => r.position >= 7 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map((r) => ({ label: r.keys![0], value: Math.round(r.impressions), change: Math.round(r.position * 10) / 10 }));
}

// --- HubSpot ---------------------------------------------------------------------

async function hubspotCount(filters: object[]): Promise<number> {
  // The search API allows a few requests a second per account: space them out
  // and retry once on 429.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("HUBSPOT_TOKEN").trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }
    if (!res.ok) {
      // "There was a problem with the request." alone says nothing; keep the
      // status, category and first detail (e.g. MISSING_SCOPES, a bad property).
      const detail = data.errors?.[0]?.message || data.context ? JSON.stringify(data.errors?.[0]?.message ?? data.context) : "";
      const hint = res.status === 401 ? " (token not accepted: use a HubSpot private app access token, pat-…)" : res.status === 403 ? " (the private app needs the crm.objects.contacts.read scope)" : "";
      throw new Error(`HubSpot ${res.status}${data.category ? ` ${data.category}` : ""}: ${data.message || "request failed"}${detail ? ` ${detail}` : ""}${hint}`);
    }
    return data.total ?? 0;
  }
}

/** HubSpot counts one after another, a little apart (see hubspotCount). */
async function inTurn<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = [];
  for (const job of jobs) {
    out.push(await job());
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

async function syncHubspot(start: string, end: string, metrics: Record<string, number>) {
  if (!env("HUBSPOT_TOKEN")) throw new Error("HUBSPOT_TOKEN is not set");
  const from = String(Date.parse(`${start}T00:00:00Z`));
  const to = String(Date.parse(`${addDays(end, 1)}T00:00:00Z`) - 1);
  const between = (propertyName: string) => ({ propertyName, operator: "BETWEEN", value: from, highValue: to });
  const [contacts, organic, mql, sql] = await inTurn([
    () => hubspotCount([between("createdate")]),
    () => hubspotCount([between("createdate"), { propertyName: "hs_analytics_source", operator: "EQ", value: "ORGANIC_SEARCH" }]),
    () => hubspotCount([between("hs_lifecyclestage_marketingqualifiedlead_date")]),
    () => hubspotCount([between("hs_lifecyclestage_salesqualifiedlead_date")]),
  ]);
  metrics["hubspot.newContacts"] = contacts;
  metrics["hubspot.newContactsOrganic"] = organic;
  metrics["hubspot.mql"] = mql;
  metrics["hubspot.sql"] = sql;

  // MQLs / SQLs by brand. One HubSpot portal serves both websites, so the
  // brand comes from the URL the contact first arrived on. Best effort: a
  // failure here must not lose the totals above.
  const prop = env("HUBSPOT_BRAND_PROPERTY") || "hs_analytics_first_url";
  const brand = (token: string) => ({ propertyName: prop, operator: "CONTAINS_TOKEN", value: `*${token}*` });
  try {
    const [mb, ms, sb, ss] = await inTurn([
      () => hubspotCount([between("hs_lifecyclestage_marketingqualifiedlead_date"), brand("bolderapps")]),
      () => hubspotCount([between("hs_lifecyclestage_marketingqualifiedlead_date"), brand("synergylabs")]),
      () => hubspotCount([between("hs_lifecyclestage_salesqualifiedlead_date"), brand("bolderapps")]),
      () => hubspotCount([between("hs_lifecyclestage_salesqualifiedlead_date"), brand("synergylabs")]),
    ]);
    metrics["hubspot.mql.bolder"] = mb;
    metrics["hubspot.mql.synergy"] = ms;
    metrics["hubspot.sql.bolder"] = sb;
    metrics["hubspot.sql.synergy"] = ss;
  } catch (err) {
    console.error("[ops] HubSpot brand split failed:", err);
  }
}

// --- The snapshot -------------------------------------------------------------------

/**
 * Syncs one week (Monday `weekStart`) for one website and saves it, if any
 * source returned data. Synergy keeps its original ids ("ops.kpi.<week>");
 * Bolder's are "ops.kpi.bolder-<week>".
 */
export async function syncWeek(weekStart: string, site: KpiSite = "synergy"): Promise<KpiSnapshot> {
  const weekEnd = addDays(weekStart, 6);
  const metrics: Record<string, number> = {};
  const lists: NonNullable<KpiSnapshot["lists"]> = {};
  const errors: Record<string, string> = {};
  const status = sourceStatus(site);
  const src = SOURCES[site];

  const run = async (name: string, enabled: boolean, missing: string, fn: () => Promise<void>) => {
    if (!enabled) return void (errors[name] = `Not connected: ${missing}`);
    try {
      await fn();
    } catch (err) {
      errors[name] = err instanceof Error ? err.message : String(err);
    }
  };
  await Promise.all([
    run("ga4", status.ga4, `Google access (GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL), ${src.ga4Var}`, () => syncGa4(src.ga4Property(), weekStart, weekEnd, metrics, lists)),
    run("gsc", status.gsc, "Google access (GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL)", () => syncGsc(src.gscSite(), weekStart, weekEnd, metrics, lists)),
    ...(src.hubspot ? [run("hubspot", status.hubspot, "HUBSPOT_TOKEN", () => syncHubspot(weekStart, weekEnd, metrics))] : []),
  ]);

  const snapshot: KpiSnapshot = {
    _id: newId("opsKpi", site === "synergy" ? weekStart : `${site}-${weekStart}`),
    _type: "opsKpi",
    ...(site === "synergy" ? {} : { site }),
    weekStart,
    weekEnd,
    metrics,
    lists,
    errors,
    syncedAt: new Date().toISOString(),
  };
  // A week where nothing synced would show as an empty column and hide the
  // previous real values from the key results, so only real data is saved.
  if (Object.keys(metrics).length) await opsClient().createOrReplace(toStoredKpi(snapshot));
  return snapshot;
}

/** The last `weeks` complete weeks, newest first. */
export function completedWeeks(weeks: number, today = new Date()): string[] {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(thisMonday, -7 * (i + 1)));
}
