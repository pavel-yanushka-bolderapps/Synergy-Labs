// Seeds each office's own FAQ into the `faqs` field of its `location`
// document, from scripts/data/location-faqs.json -- which is Webflow's
// location-faqs collection resolved against each location's "Location FAQs"
// references, in the order Webflow displays them.
//
//   node scripts/seed-location-faqs.mjs --dry-run
//   node scripts/seed-location-faqs.mjs
//
// Re-runnable: it sets the whole array on each run. Offices missing from the
// JSON are left alone and keep showing the homepage FAQ.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).

import { readFile } from "node:fs/promises";

const API_VERSION = "2025-08-31";
const dryRun = process.argv.includes("--dry-run");

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const faqsBySlug = JSON.parse(await readFile(new URL("./data/location-faqs.json", import.meta.url), "utf8"));

// Look the documents up by slug rather than rebuilding seed-locations.mjs's
// id scheme, so an office created by hand in the Studio is found too.
const query = encodeURIComponent('*[_type == "location" && !(_id in path("drafts.**"))]{ _id, "slug": slug.current }');
const res = await fetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}?query=${query}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) fail(`Query failed: ${res.status} ${await res.text()}`);
const idBySlug = new Map((await res.json()).result.map((doc) => [doc.slug, doc._id]));

const mutations = [];
for (const [slug, faqs] of Object.entries(faqsBySlug)) {
  const id = idBySlug.get(slug);
  if (!id) {
    console.warn(`  skip ${slug}: no location document with that slug`);
    continue;
  }
  const items = faqs.map((faq, i) => ({ _key: `faq-${i}`, _type: "locationFaq", ...faq }));
  mutations.push({ patch: { id, set: { faqs: items } } });
  console.log(`  ${slug}: ${items.length} questions -> ${id}`);
}

if (dryRun) {
  console.log(`\nDry run: ${mutations.length} locations would be updated.`);
  process.exit(0);
}

const write = await fetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ mutations }),
});
if (!write.ok) fail(`Mutation failed: ${write.status} ${await write.text()}`);
console.log(`\nUpdated ${mutations.length} locations.`);

async function readDotEnv() {
  try {
    const raw = await readFile(new URL("../.env", import.meta.url), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
