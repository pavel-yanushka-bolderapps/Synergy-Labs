// Rebuilds form submissions from the notification emails the site sent
// before submissions were stored (i.e. before the Ops "Forms" tab shipped on
// 2026-11-06). Input: a JSON array of the emails, as fetched from the team
// inbox (from:forms@notify.synergylabs.co):
//
//   [{ "id": "<gmail message id>", "date": "<ISO>", "subject": "...", "body": "<plain text>" }, ...]
//
//   node --env-file=.env scripts/import-gmail-notifications.mjs <emails.json> [more.json ...] [--dry-run]
//
// Parses the three formats written by src/pages/api/{contact,lead,builder}.ts.
// Idempotent: ids are "ops.submission.gmail-<message id>".
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("Usage: node --env-file=.env scripts/import-gmail-notifications.mjs <emails.json> [...] [--dry-run]");
  process.exit(1);
}

const field = (body, label) => {
  const m = new RegExp(`^${label}:[ \\t]*(.*)$`, "mi").exec(body);
  const v = m?.[1]?.trim();
  return v && v !== "(not provided)" && v !== "(unknown)" ? v : undefined;
};

function parse(e) {
  const body = (e.body ?? "").replace(/\r\n/g, "\n");
  const subject = e.subject ?? "";
  const base = {
    _id: `ops.submission.gmail-${e.id}`,
    _type: "opsSubmission",
    site: "synergy",
    submittedAt: new Date(e.date).toISOString(),
    env: "production",
    emailSent: true,
  };
  if (/^New project inquiry from/i.test(subject)) {
    const msg = body.split(/\nWhat they need help with:\n/i)[1];
    return {
      ...base,
      form: "contact",
      formName: "Contact",
      name: field(body, "Name"),
      email: field(body, "Email"),
      phone: field(body, "Phone"),
      budget: field(body, "Budget range"),
      pageUrl: field(body, "Submitted from"),
      message: msg?.trim() || undefined,
    };
  }
  if (/^Ambassador enquiry:/i.test(subject)) {
    const src = /Submitted from (\/[\w-]+)/i.exec(body)?.[1];
    return {
      ...base,
      form: "lead",
      formName: src === "/1-week-pilot" ? "1-week pilot" : src === "/ambassador-program" ? "Ambassador program" : "Email signup",
      email: field(body, "Email"),
      pageUrl: src ? `https://www.synergylabs.co${src}` : undefined,
    };
  }
  if (/^App builder request:/i.test(subject)) {
    const mf = field(body, "Mobile friendly");
    return {
      ...base,
      form: "builder",
      formName: "App builder",
      email: field(body, "Email"),
      domain: field(body, "Domain"),
      pageUrl: "https://www.synergylabs.co/synergy-builder",
      extra: mf ? [{ _key: "x0", key: "Mobile friendly", value: mf }] : undefined,
    };
  }
  return null;
}

const emails = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
const seen = new Set();
const docs = [];
const skipped = [];
for (const e of emails) {
  if (!e?.id || seen.has(e.id)) continue;
  seen.add(e.id);
  const d = parse(e);
  if (!d) {
    skipped.push(e.subject);
    continue;
  }
  // Sent from staging (dev.synergylabs.co, a *.vercel.app preview) or a
  // local build, e.g. the pre-launch test runs: filed as non-production so
  // the Forms tab counts them as tests.
  const host = (() => { try { return new URL(d.pageUrl).hostname; } catch { return ""; } })();
  if (host && host !== "www.synergylabs.co" && host !== "synergylabs.co") d.env = /localhost|127\.0\.0\.1/.test(host) ? "development" : "preview";
  docs.push(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
}
docs.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

const by = docs.reduce((m, d) => ((m[d.formName] = (m[d.formName] ?? 0) + 1), m), {});
console.log(`${emails.length} emails → ${docs.length} submissions`, by);
console.log(`Range: ${docs[0]?.submittedAt} … ${docs.at(-1)?.submittedAt}`);
const noEmail = docs.filter((d) => !d.email).length;
if (noEmail) console.log(`${noEmail} without an email address (check the parse)`);
if (skipped.length) console.log(`Skipped ${skipped.length} unrecognised subjects:`, [...new Set(skipped)].slice(0, 10));
if (dryRun) {
  console.log("Sample:", docs.slice(-2).map(({ message, ...d }) => ({ ...d, message: message?.slice(0, 80) })));
  process.exit(0);
}

const client = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});
for (let i = 0; i < docs.length; i += 100) {
  const tx = client.transaction();
  for (const d of docs.slice(i, i + 100)) tx.createIfNotExists(d);
  await tx.commit();
}
console.log(`Imported ${docs.length} (already-imported emails left as they were).`);
