// Imports old form submissions (e.g. Webflow's Forms → "Export CSV") into the
// Ops "Forms" tab, so history from before the site moved to Vercel sits next
// to new submissions.
//
//   node --env-file=.env scripts/import-form-submissions.mjs <file.csv> [--form "Contact"] [--site bolder] [--dry-run]
//
// --site bolder files the rows under the Bolder Apps site (default: synergy).
//
// Columns are matched by name (case-insensitive): date/submitted, name or
// first + last name, email, phone, budget, message/project/details,
// page/url/source, form name. Every other column is kept as an extra field.
// Idempotent: each row's id is a hash of its content, so re-running the same
// file creates nothing new.
import { createClient } from "@sanity/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !["--form", "--site"].includes(args[i - 1]));
const site = args.includes("--site") ? args[args.indexOf("--site") + 1] : "synergy";
if (!["synergy", "bolder"].includes(site)) {
  console.error(`Unknown --site "${site}" (synergy or bolder)`);
  process.exit(1);
}
const formArg = args.includes("--form") ? args[args.indexOf("--form") + 1] : undefined;
const dryRun = args.includes("--dry-run");
if (!file) {
  console.error('Usage: node --env-file=.env scripts/import-form-submissions.mjs <file.csv> [--form "Contact"] [--dry-run]');
  process.exit(1);
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");
const find = (...names) => header.findIndex((h) => names.some((n) => norm(h) === n || norm(h).includes(n)));
const col = {
  date: find("date", "submittedat", "submitted", "created"),
  form: find("formname"),
  first: find("firstname"),
  last: find("lastname", "secondname", "surname"),
  name: header.findIndex((h) => ["name", "fullname", "yourname"].includes(norm(h))),
  email: find("email"),
  phone: find("phone", "tel"),
  budget: find("budget"),
  message: find("message", "projectdetails", "details", "project", "whatdoyouneed", "description"),
  page: find("pageurl", "page", "url", "source"),
};
const used = new Set(Object.values(col).filter((i) => i >= 0));

const docs = rows.map((r) => {
  const get = (i) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const name = get(col.name) || [get(col.first), get(col.last)].filter(Boolean).join(" ");
  // A bare "2026-09-01 10:00" is read as UTC (as Webflow exports it), not local time.
  const rawDate = get(col.date);
  // Webflow's own export writes "11/06/2026 12:32:36 pm", also in UTC.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?([ap]m)?$/i.exec(rawDate);
  const parsed = !rawDate
    ? null
    : us
      ? new Date(Date.UTC(+us[3], +us[1] - 1, +us[2], us[7] ? (+us[4] % 12) + (/pm/i.test(us[7]) ? 12 : 0) : +us[4], +us[5], +(us[6] ?? 0)))
      : new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(rawDate) ? `${rawDate.replace(" ", "T")}Z` : rawDate);
  const submittedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
  const extra = header
    .map((h, i) => ({ key: h, value: get(i) }))
    .filter((x, i) => !used.has(i) && x.value)
    .map((x, i) => ({ _key: `x${i}`, ...x }));
  const hash = createHash("sha1").update(r.join("\u0001")).digest("hex").slice(0, 16);
  const doc = {
    _id: `ops.submission.import-${site === "synergy" ? "" : `${site}-`}${hash}`,
    _type: "opsSubmission",
    site,
    form: "import",
    formName: formArg || get(col.form) || "Webflow form",
    submittedAt,
    name: name || undefined,
    email: get(col.email) || undefined,
    phone: get(col.phone) || undefined,
    budget: get(col.budget) || undefined,
    message: get(col.message) || undefined,
    pageUrl: get(col.page) || undefined,
    extra: extra.length ? extra : undefined,
    env: "import",
  };
  return Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
});

// Skip rows that already arrived another way (e.g. by the live webhook):
// same email within two minutes of an existing submission for this site.
const existingClient = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});
const existing = await existingClient.fetch(
  `*[_type == "opsSubmission" && coalesce(site, "synergy") == $site && !(_id match "ops.submission.import-*")]{ email, submittedAt }`,
  { site }
);
const dupes = new Set();
for (const d of docs) {
  const t = Date.parse(d.submittedAt);
  if (existing.some((e) => e.email && d.email && e.email.toLowerCase() === d.email.toLowerCase() && Math.abs(Date.parse(e.submittedAt) - t) < 120_000)) dupes.add(d._id);
}
if (dupes.size) console.log(`Skipping ${dupes.size} row(s) already stored (e.g. via the webhook).`);
docs.splice(0, docs.length, ...docs.filter((d) => !dupes.has(d._id)));

console.log(`Columns: ${Object.entries(col).map(([k, i]) => `${k}=${i >= 0 ? `"${header[i]}"` : "—"}`).join(", ")}`);
console.log(`Extra columns kept: ${header.filter((_, i) => !used.has(i)).join(", ") || "none"}`);
console.log(`${docs.length} rows. First:`, docs[0]);
if (dryRun) process.exit(0);

const client = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});
for (let i = 0; i < docs.length; i += 200) {
  const tx = client.transaction();
  for (const d of docs.slice(i, i + 200)) tx.createIfNotExists(d);
  await tx.commit();
}
console.log(`Imported ${docs.length} submissions (rows already imported were left as they were).`);
