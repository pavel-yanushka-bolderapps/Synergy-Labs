// Receives Webflow "Form submission" webhooks, so a Webflow site's forms (the
// Bolder Apps site, www.bolderapps.com) show up in the Ops "Forms" tab next
// to this site's own.
//
// Set up in Webflow: Site settings -> Apps & Integrations -> Webhooks ->
// Add webhook -> trigger "Form submission", URL:
//   https://www.synergylabs.co/api/forms/webflow?site=bolder&key=<WEBFLOW_FORMS_WEBHOOK_KEY>
// The key is a random secret kept in Vercel (Production); requests without
// it are refused. Webflow does not send submissions it flagged as spam.
//
// Older submissions: export the CSV in Webflow (Site settings -> Forms) and
// run scripts/import-form-submissions.mjs <file> --site bolder.
import type { APIRoute } from "astro";
import { createHash, timingSafeEqual } from "node:crypto";
import { opsClient } from "../../../lib/ops/store";

export const prerender = false;

const SITES: Record<string, { domain: string }> = { bolder: { domain: "https://www.bolderapps.com" } };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function keyOk(given: string | null): boolean {
  const expected = process.env.WEBFLOW_FORMS_WEBHOOK_KEY || import.meta.env.WEBFLOW_FORMS_WEBHOOK_KEY || "";
  if (expected.length < 16 || !given) return false;
  // Hash both so the comparison is constant-time whatever the lengths.
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

const str = (v: unknown, max = 5000) => (v === undefined || v === null || v === "" ? undefined : String(v).trim().slice(0, max) || undefined);

/** First field whose name matches one of the patterns (case-insensitive). */
function pick(data: Record<string, unknown>, used: Set<string>, ...patterns: RegExp[]) {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(data)) {
      if (!used.has(k) && re.test(k) && str(v)) {
        used.add(k);
        return str(v);
      }
    }
  }
  return undefined;
}

export const POST: APIRoute = async ({ request, url }) => {
  if (!keyOk(url.searchParams.get("key"))) return reply({ error: "Unauthorized" }, 401);
  const site = url.searchParams.get("site") ?? "";
  if (!SITES[site]) return reply({ error: "Unknown site" }, 400);

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  // Webflow v2 webhooks wrap the submission in { triggerType, payload };
  // older (v1) ones send it bare.
  const p = body?.payload ?? body;
  if (!p || typeof p.data !== "object" || !p.data) return reply({ error: "No form data" }, 400);

  const data = p.data as Record<string, unknown>;
  const used = new Set<string>();
  const first = pick(data, used, /^first ?name$/i);
  const last = pick(data, used, /^(last|second|sur) ?name$/i);
  const full = pick(data, used, /^(full ?)?name$/i, /^your ?name$/i);
  const doc = {
    _id: `ops.submission.wf-${str(p.id ?? p._id, 64) ?? createHash("sha1").update(JSON.stringify(p)).digest("hex").slice(0, 20)}`,
    _type: "opsSubmission",
    site,
    form: "webflow",
    formName: str(p.name ?? p.formName, 200) ?? "Webflow form",
    submittedAt: new Date(p.submittedAt ?? p.d ?? Date.now()).toISOString(),
    name: full ?? ([first, last].filter(Boolean).join(" ") || undefined),
    email: pick(data, used, /^e-?mail$/i, /e-?mail/i),
    phone: pick(data, used, /phone|tel/i),
    budget: pick(data, used, /budget/i),
    message: pick(data, used, /message|details|project|description|help/i),
    domain: undefined as string | undefined,
    pageUrl: str(p.pageUrl, 2000) ?? (p.publishedPath ? `${SITES[site].domain}${p.publishedPath}` : undefined),
    env: "production",
    extra: Object.entries(data)
      .filter(([k, v]) => !used.has(k) && str(v))
      .map(([key, value], i) => ({ _key: `x${i}`, key: key.slice(0, 100), value: String(value).slice(0, 2000) })),
  };
  const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));

  try {
    // Webflow retries failed deliveries; the id makes a retry a no-op.
    await opsClient().createIfNotExists(clean as { _id: string; _type: string });
  } catch (err) {
    console.error("[forms] webflow webhook store failed:", err);
    return reply({ error: "Could not store" }, 500);
  }
  return reply({ ok: true });
};
