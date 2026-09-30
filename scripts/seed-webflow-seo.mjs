// One-off seed: the SEO titles and descriptions the live Webflow site uses
// for the service and case-study pages, so the <title> Google has indexed for
// each one survives the cutover. Values are in scripts/data/webflow-seo.json,
// copied from the live pages' <head>.
//
//   node --env-file=.env scripts/seed-webflow-seo.mjs --dry-run   # print, change nothing
//   node --env-file=.env scripts/seed-webflow-seo.mjs
//
// Only metaTitle and metaDescription are touched, on the published document
// and on its draft where one exists (otherwise publishing the draft would drop
// the new values). Case studies keep their own metaDescription: the Webflow
// pages had none. Edits an editor has made to these fields WILL be
// overwritten, so check --dry-run first once the site is live.
//
// Needs SANITY_API_WRITE_TOKEN (Editor role). See .env.example.

import { readFile } from "node:fs/promises";

const API_VERSION = "2025-08-31";
const dryRun = process.argv.includes("--dry-run");

const { PUBLIC_SANITY_PROJECT_ID: projectId, PUBLIC_SANITY_DATASET: dataset, SANITY_API_WRITE_TOKEN: token } =
  process.env;
if (!projectId || !dataset || !token) {
  console.error("PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET and SANITY_API_WRITE_TOKEN must be set.");
  process.exit(1);
}

const data = JSON.parse(await readFile(new URL("./data/webflow-seo.json", import.meta.url), "utf8"));
const api = (path) => `https://${projectId}.api.sanity.io/v${API_VERSION}/data/${path}/${dataset}`;

async function query(groq) {
  const url = new URL(api("query"));
  url.searchParams.set("query", groq);
  url.searchParams.set("perspective", "raw"); // include drafts
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  return (await res.json()).result;
}

const docs = await query(
  `*[_type in ["service", "project"]]{ _id, _type, href, "slug": slug.current, metaTitle, metaDescription }`
);

const mutations = [];
const seen = new Set();
for (const doc of docs) {
  const values = doc._type === "service" ? data.services[doc.href] : data.caseStudies[doc.slug];
  if (!values) continue;
  seen.add(doc._type === "service" ? doc.href : doc.slug);

  const set = {};
  for (const [field, value] of Object.entries(values)) {
    if (doc[field] !== value) set[field] = value;
  }
  if (Object.keys(set).length === 0) continue;

  console.log(`\n${doc._id} (${doc.href ?? doc.slug})`);
  for (const [field, value] of Object.entries(set)) {
    console.log(`  ${field}:\n    - ${JSON.stringify(doc[field] ?? null)}\n    + ${JSON.stringify(value)}`);
  }
  mutations.push({ patch: { id: doc._id, set } });
}

const missing = [...Object.keys(data.services), ...Object.keys(data.caseStudies)].filter((k) => !seen.has(k));
if (missing.length) console.warn(`\nNo document found for: ${missing.join(", ")}`);

if (mutations.length === 0) {
  console.log("\nNothing to change.");
} else if (dryRun) {
  console.log(`\nDry run: ${mutations.length} document(s) would be patched.`);
} else {
  const res = await fetch(api("mutate"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new Error(`Mutation failed: ${res.status} ${await res.text()}`);
  console.log(`\nPatched ${mutations.length} document(s).`);
}
