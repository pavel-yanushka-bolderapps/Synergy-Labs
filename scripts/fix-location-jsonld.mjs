// Retires the LocalBusiness JSON-LD that came across from Webflow in each
// location's `jsonLd` field, keeping the one useful value in it.
//
// Why: every block (25 of the 26 offices) has an empty address, an image that
// 404s (/assets/logo.png) and a Google Maps short link as the business `url`.
// The page already emits a correct ProfessionalService for the office, with
// the real address (src/lib/structuredData.ts `locationPage`), so the old
// block only adds a second, worse copy of the same business. Its Google link
// is the part worth keeping: it moves to the new `googleMapsUrl` field, which
// the page emits as `hasMap` on that ProfessionalService.
//
//   node scripts/fix-location-jsonld.mjs --dry-run   # list changes, write nothing
//   node scripts/fix-location-jsonld.mjs             # back up, then patch
//
// Reversible: before patching it writes every location it will change to
// ../synergy-sanity-backups/locations-before-jsonld-fix-<timestamp>.ndjson.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).

import { readFile, writeFile, mkdir } from "node:fs/promises";

const API_VERSION = "2025-08-31";
const dryRun = process.argv.includes("--dry-run");
const BACKUP_DIR = new URL("../../synergy-sanity-backups/", import.meta.url);

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;
if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const api = `https://${projectId}.api.sanity.io/v${API_VERSION}`;
const auth = { Authorization: `Bearer ${token}` };

// Drafts included: an unpublished edit still carrying the old block would
// bring it back the moment it is published.
const query = encodeURIComponent('*[_type == "location" && defined(jsonLd)]');
const res = await fetch(`${api}/data/query/${dataset}?query=${query}`, { headers: auth });
if (!res.ok) fail(`Query failed: ${res.status} ${await res.text()}`);
const docs = (await res.json()).result;

const GOOGLE_LINK = /^https:\/\/(g\.page|g\.co|maps\.app\.goo\.gl|(www\.)?google\.[a-z.]+\/maps)\//i;

const changes = docs.map((doc) => {
  let mapUrl;
  try {
    const url = JSON.parse(doc.jsonLd)?.url;
    if (typeof url === "string" && GOOGLE_LINK.test(url)) mapUrl = url;
  } catch {
    // Not valid JSON: the page already drops it, so there is nothing to keep.
  }
  const set = mapUrl && !doc.googleMapsUrl ? { googleMapsUrl: mapUrl } : undefined;
  return { doc, set };
});

for (const { doc, set } of changes) {
  console.log(`${doc._id.padEnd(48)} clear jsonLd${set ? `, googleMapsUrl = ${set.googleMapsUrl}` : ""}`);
}
console.log(`\n${changes.length} locations to change.`);
if (dryRun || changes.length === 0) process.exit(0);

await mkdir(BACKUP_DIR, { recursive: true });
const backup = new URL(`locations-before-jsonld-fix-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`, BACKUP_DIR);
await writeFile(backup, changes.map(({ doc }) => JSON.stringify(doc)).join("\n") + "\n");
console.log(`Backed up ${changes.length} locations to ${backup.pathname}`);

// ifRevisionID: a location edited in the Studio since it was read is skipped
// rather than overwritten; re-run the script to pick it up.
const mutations = changes.map(({ doc, set }) => ({
  patch: { id: doc._id, ifRevisionID: doc._rev, unset: ["jsonLd"], ...(set ? { set } : {}) },
}));
const write = await fetch(`${api}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});
if (!write.ok) fail(`Mutation failed: ${write.status} ${await write.text()}`);
console.log(`Patched ${changes.length} locations in Sanity.`);

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
