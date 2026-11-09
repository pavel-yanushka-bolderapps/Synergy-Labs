// Every form submission on the site, kept for the Ops "Forms" tab (the
// Webflow-style submissions list: filter, search, CSV download).
//
// The form routes (/api/contact, /api/lead, /api/builder) call
// recordSubmission() for every submission that passed spam protection --
// whether or not the notification email then went out, so a lead is never
// lost to a Resend outage. Bots stopped by the honeypot, the fill-time check
// or reCAPTCHA are not stored.
//
// Stored like the rest of Ops: ids start "ops.", so the public dataset never
// returns them (see store.ts). Staging writes to the same dataset, so each
// record carries the Vercel environment it came from.
import { waitUntil } from "@vercel/functions";
import { randomUUID } from "node:crypto";
import { opsClient } from "./store";

export type FormKind = "contact" | "lead" | "builder" | "webflow" | "import";
/** Which website the submission came from. Missing on old records = "synergy". */
export type SiteKey = "synergy" | "bolder";

export interface Submission {
  _id: string;
  _type: "opsSubmission";
  site?: SiteKey;
  form: FormKind;
  /** Human label, e.g. "Contact", "1-week pilot", or the Webflow form name. */
  formName: string;
  submittedAt: string;
  name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  domain?: string;
  /** Any other field (Webflow imports, builder answers). */
  extra?: { _key: string; key: string; value: string }[];
  pageUrl?: string;
  country?: string;
  city?: string;
  referrer?: string;
  userAgent?: string;
  /** "production", "preview" (staging) or "development". */
  env: string;
  emailSent?: boolean;
  emailError?: string;
  /** A person's override of the automatic test detection. */
  test?: boolean;
}

export const SETTINGS_ID = "ops.settings.forms";

export { DEFAULT_TEST_RULES } from "./formtest";
import { DEFAULT_TEST_RULES } from "./formtest";

const cap = (v: unknown, max = 5000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

type Input = Omit<Submission, "_id" | "_type" | "submittedAt" | "env" | "country" | "city" | "referrer" | "userAgent" | "extra"> & {
  extra?: Record<string, unknown>;
};

/**
 * Saves a submission without ever failing or slowing the form: the write runs
 * after the response (waitUntil) and errors are only logged.
 */
export function recordSubmission(input: Input, request: Request) {
  const h = request.headers;
  const city = h.get("x-vercel-ip-city");
  const doc: Record<string, unknown> = {
    _id: `ops.submission.${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    _type: "opsSubmission",
    site: "synergy",
    form: input.form,
    formName: input.formName,
    submittedAt: new Date().toISOString(),
    name: cap(input.name, 200),
    email: cap(input.email, 320),
    phone: cap(input.phone, 50),
    budget: cap(input.budget, 100),
    message: cap(input.message),
    domain: cap(input.domain, 260),
    extra: Object.entries(input.extra ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([key, value], i) => ({ _key: `x${i}`, key, value: String(value).slice(0, 2000) })),
    pageUrl: cap(input.pageUrl, 2000),
    country: cap(h.get("x-vercel-ip-country"), 10),
    city: city ? cap(decodeURIComponent(city), 100) : undefined,
    referrer: cap(h.get("referer"), 2000),
    userAgent: cap(h.get("user-agent"), 400),
    env: process.env.VERCEL_ENV || "development",
    emailSent: input.emailSent,
    emailError: cap(input.emailError, 500),
  };
  for (const k of Object.keys(doc)) if (doc[k] === undefined || (Array.isArray(doc[k]) && !(doc[k] as unknown[]).length)) delete doc[k];

  const write = (async () => {
    try {
      await opsClient().create(doc as unknown as Submission);
    } catch (err) {
      // The notification email still carries the lead.
      console.error("[forms] could not store submission:", err);
    }
  })();
  waitUntil(write);
  return write;
}

export async function loadSubmissions() {
  const c = opsClient();
  const [submissions, settings] = await Promise.all([
    c.fetch<Submission[]>(`*[_type == "opsSubmission" && _id in path("ops.**")] | order(submittedAt desc)[0...10000]`),
    c.getDocument<{ testRules?: string[] }>(SETTINGS_ID),
  ]);
  return { submissions, testRules: settings?.testRules ?? DEFAULT_TEST_RULES };
}
