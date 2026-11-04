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
//   GA4_EVENTS                   optional, comma-separated event names to count;
//                                default below.
import { createSign } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { opsClient, newId, mondayOf, addDays, toStoredKpi, type KpiSnapshot } from "./store";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";

const DEFAULT_EVENTS = ["FormStart", "ContactFormStart", "FormStep1", "FormStep2", "form_submit", "generate_lead"];

/** Every metric the dashboard knows, with a label. Key results link to these keys. */
export const METRICS: Record<string, { label: string; unit?: string; better?: "up" | "down"; format?: "pct" | "dec" }> = {
  "ga4.organicUsers": { label: "Organic users (week)" },
  "ga4.organicUsers30d": { label: "Organic users (last 30 days)" },
  "ga4.users": { label: "All users (week)" },
  "ga4.sessions": { label: "Sessions (week)" },
  "ga4.organicSessions": { label: "Organic sessions (week)" },
  "gsc.clicks": { label: "Search clicks" },
  "gsc.impressions": { label: "Search impressions" },
  "gsc.ctr": { label: "Search CTR", format: "pct" },
  "gsc.position": { label: "Avg. position", better: "down", format: "dec" },
  "hubspot.newContacts": { label: "New contacts" },
  "hubspot.newContactsOrganic": { label: "New contacts from organic" },
  "hubspot.mql": { label: "New MQLs" },
  "hubspot.sql": { label: "New SQLs" },
};
export const eventMetric = (name: string) => `ga4.event.${name}`;
export const ga4Events = () => (env("GA4_EVENTS") ? env("GA4_EVENTS").split(",").map((s) => s.trim()) : DEFAULT_EVENTS);

const googleConfigured = () =>
  Boolean(env("GOOGLE_SERVICE_ACCOUNT_JSON") || (env("GCP_WORKLOAD_IDENTITY_PROVIDER") && env("GCP_SERVICE_ACCOUNT_EMAIL")));

export function sourceStatus() {
  return {
    google: googleConfigured(),
    ga4: googleConfigured() && Boolean(env("GA4_PROPERTY_ID")),
    gsc: googleConfigured(),
    hubspot: Boolean(env("HUBSPOT_TOKEN")),
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

// --- GA4 ---------------------------------------------------------------------

type Ga4Row = { dimensionValues?: { value: string }[]; metricValues: { value: string }[] };

async function ga4Report(body: object): Promise<Ga4Row[]> {
  const property = env("GA4_PROPERTY_ID");
  if (!property) throw new Error("GA4_PROPERTY_ID is not set");
  const data = await google(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, body);
  return data.rows ?? [];
}

const organicFilter = {
  filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } },
};

async function syncGa4(start: string, end: string, metrics: Record<string, number>, lists: KpiSnapshot["lists"]) {
  const range = [{ startDate: start, endDate: end }];
  const [all, organic, organic30, events, pages] = await Promise.all([
    ga4Report({ dateRanges: range, metrics: [{ name: "activeUsers" }, { name: "sessions" }] }),
    ga4Report({
      dateRanges: range,
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      dimensionFilter: organicFilter,
    }),
    ga4Report({
      dateRanges: [{ startDate: addDays(end, -29), endDate: end }],
      metrics: [{ name: "activeUsers" }],
      dimensionFilter: organicFilter,
    }),
    ga4Report({
      dateRanges: range,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ga4Events() } } },
    }),
    ga4Report({
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
  metrics["ga4.organicUsers"] = n(organic);
  metrics["ga4.organicSessions"] = n(organic, 1);
  metrics["ga4.organicUsers30d"] = n(organic30);
  for (const name of ga4Events()) metrics[eventMetric(name)] = 0;
  for (const row of events) metrics[eventMetric(row.dimensionValues![0].value)] = Number(row.metricValues[0].value);
  lists!["ga4.topOrganicPages"] = pages.map((r) => ({
    label: r.dimensionValues![0].value,
    value: Number(r.metricValues[0].value),
  }));
}

// --- Search Console ------------------------------------------------------------

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(body: object): Promise<GscRow[]> {
  const site = encodeURIComponent(env("GSC_SITE") || "sc-domain:synergylabs.co");
  const data = await google(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, body);
  return data.rows ?? [];
}

async function syncGsc(start: string, end: string, metrics: Record<string, number>, lists: KpiSnapshot["lists"]) {
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(end, -7);
  const [totals, pages, prevPages, queries] = await Promise.all([
    gscQuery({ startDate: start, endDate: end }),
    gscQuery({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 500 }),
    gscQuery({ startDate: prevStart, endDate: prevEnd, dimensions: ["page"], rowLimit: 500 }),
    gscQuery({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 500 }),
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
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data.total ?? 0;
}

async function syncHubspot(start: string, end: string, metrics: Record<string, number>) {
  if (!env("HUBSPOT_TOKEN")) throw new Error("HUBSPOT_TOKEN is not set");
  const from = String(Date.parse(`${start}T00:00:00Z`));
  const to = String(Date.parse(`${addDays(end, 1)}T00:00:00Z`) - 1);
  const between = (propertyName: string) => ({ propertyName, operator: "BETWEEN", value: from, highValue: to });
  const [contacts, organic, mql, sql] = await Promise.all([
    hubspotCount([between("createdate")]),
    hubspotCount([between("createdate"), { propertyName: "hs_analytics_source", operator: "EQ", value: "ORGANIC_SEARCH" }]),
    hubspotCount([between("hs_lifecyclestage_marketingqualifiedlead_date")]),
    hubspotCount([between("hs_lifecyclestage_salesqualifiedlead_date")]),
  ]);
  metrics["hubspot.newContacts"] = contacts;
  metrics["hubspot.newContactsOrganic"] = organic;
  metrics["hubspot.mql"] = mql;
  metrics["hubspot.sql"] = sql;
}

// --- The snapshot -------------------------------------------------------------------

/** Syncs one week (Monday `weekStart`) and saves it, if any source returned data. */
export async function syncWeek(weekStart: string): Promise<KpiSnapshot> {
  const weekEnd = addDays(weekStart, 6);
  const metrics: Record<string, number> = {};
  const lists: NonNullable<KpiSnapshot["lists"]> = {};
  const errors: Record<string, string> = {};
  const status = sourceStatus();

  const run = async (name: string, enabled: boolean, missing: string, fn: () => Promise<void>) => {
    if (!enabled) return void (errors[name] = `Not connected: ${missing}`);
    try {
      await fn();
    } catch (err) {
      errors[name] = err instanceof Error ? err.message : String(err);
    }
  };
  await Promise.all([
    run("ga4", status.ga4, "Google access (GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL), GA4_PROPERTY_ID", () => syncGa4(weekStart, weekEnd, metrics, lists)),
    run("gsc", status.gsc, "Google access (GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL)", () => syncGsc(weekStart, weekEnd, metrics, lists)),
    run("hubspot", status.hubspot, "HUBSPOT_TOKEN", () => syncHubspot(weekStart, weekEnd, metrics)),
  ]);

  const snapshot: KpiSnapshot = {
    _id: newId("opsKpi", weekStart),
    _type: "opsKpi",
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
