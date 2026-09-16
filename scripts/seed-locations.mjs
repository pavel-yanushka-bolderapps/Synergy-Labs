// Seeds the offices into Sanity as `location` documents from
// scripts/data/locations.json -- the transcription of the Webflow Locations
// collection, which is also what the site falls back to before this is run.
//
//   node scripts/seed-locations.mjs --dry-run
//   node scripts/seed-locations.mjs
//
// Re-runnable: each document's id is derived from the city, so a second run
// updates rather than duplicates. Images are content-addressed by Sanity, so
// re-uploading the same file returns the existing asset instead of a copy.
//
// It writes every field the schema owns via `createOrReplace`, so anything you
// add in Studio beyond them is not preserved -- run it to populate, not to
// patch.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role). See .env.example.

import { readFile } from "node:fs/promises";

const API_VERSION = "2025-08-31";
const dryRun = process.argv.includes("--dry-run");

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const locations = await readLocations();

if (dryRun) {
  console.log(`${locations.length} locations (dry run -- nothing written)\n`);
  for (const [i, loc] of locations.entries()) {
    const page = [
      loc.mainHeading && "heading",
      loc.servicesHeading && "services",
      loc.industriesHeading && "industries",
      loc.processHeading && "process",
      loc.whyChooseUsHeading && "why-us",
      loc.serviceAreaHeading && "service-area",
      loc.caseStudyOneTitle && "case-studies",
      loc.mapCode && "map",
      loc.jsonLd && "json-ld",
    ].filter(Boolean);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${loc.city.padEnd(16)} /${loc.slug.padEnd(16)} ${page.join(", ")}`
    );
  }
  process.exit(0);
}

const mutations = [];
for (const loc of locations) {
  const assetId = loc.imageSrc ? await uploadImage(loc.imageSrc) : null;

  const page = {};
  for (const key of PAGE_FIELDS) {
    if (loc[key]) page[key] = loc[key];
  }

  const caseStudies = [
    { title: loc.caseStudyOneTitle, body: loc.caseStudyOneBody },
    { title: loc.caseStudyTwoTitle, body: loc.caseStudyTwoBody },
  ]
    .filter((cs) => cs.title && cs.body)
    .map((cs, i) => ({ _key: `case-${i}`, _type: "object", ...cs }));

  mutations.push({
    createOrReplace: {
      _id: docId(loc.city),
      _type: "location",
      city: loc.city,
      address: loc.address,
      slug: { _type: "slug", current: loc.slug },
      isHeadquarters: Boolean(loc.isHeadquarters),
      // The JSON is already in display order -- first two get the wide cards,
      // next three the row below, the rest sit behind "Other locations".
      order: loc.order,
      ...page,
      ...(caseStudies.length > 0 ? { caseStudies } : {}),
      ...(assetId ? { image: { _type: "image", asset: { _type: "reference", _ref: assetId } } } : {}),
    },
  });

  const filled = Object.keys(page).length + caseStudies.length;
  console.log(`  prepared ${loc.city.padEnd(16)} ${filled} page field(s)${assetId ? "" : ", no image"}`);
}

const res = await fetch(
  `https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations }),
  }
);

if (!res.ok) fail(`Mutation failed: ${res.status} ${await res.text()}`);
console.log(`\nWrote ${mutations.length} location documents to ${projectId}/${dataset}.`);

// --- helpers ---

async function readLocations() {
  const raw = await readFile(new URL("./data/locations.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) fail("scripts/data/locations.json is empty.");
  return parsed;
}

async function uploadImage(publicPath) {
  const file = new URL(`../public${publicPath}`, import.meta.url);
  const body = await readFile(file);
  const name = publicPath.split("/").pop();

  const res = await fetch(
    `https://${projectId}.api.sanity.io/v${API_VERSION}/assets/images/${dataset}?filename=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "image/webp", Authorization: `Bearer ${token}` },
      body,
    }
  );

  if (!res.ok) fail(`Image upload failed for ${publicPath}: ${res.status} ${await res.text()}`);
  return (await res.json()).document._id;
}

function docId(city) {
  return `location-${city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

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
