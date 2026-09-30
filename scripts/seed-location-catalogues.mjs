// Seeds the two shared catalogues the location pages pick from:
// `locationService` (the "Our services" cards) and `locationIndustry` (the
// "Industries we serve" rows), from scripts/data/location-services.json and
// scripts/data/location-industries.json.
//
//   node scripts/seed-location-catalogues.mjs --dry-run
//   node scripts/seed-location-catalogues.mjs
//
// Run this before seed-locations.mjs: the offices reference these documents by
// id, and a reference to a document that does not exist yet resolves to null.
//
// Re-runnable: ids are derived from the slug, so a second run updates rather
// than duplicates. Images are content-addressed by Sanity, so re-uploading the
// same file is a no-op that returns the existing asset.
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
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const CATALOGUES = [
  { type: "locationService", idPrefix: "location-service", file: "./data/location-services.json" },
  { type: "locationIndustry", idPrefix: "location-industry", file: "./data/location-industries.json" },
  {
    type: "locationTechnology",
    idPrefix: "location-technology",
    file: "./data/location-technologies.json",
    // Stack categories carry a list of technologies rather than a prose
    // description, and have no artwork.
    fields: (row) => ({ technologies: row.technologies }),
  },
];

const mutations = [];

for (const catalogue of CATALOGUES) {
  const rows = JSON.parse(await readFile(new URL(catalogue.file, import.meta.url), "utf8"));
  console.log(`\n${catalogue.type} (${rows.length})`);

  for (const row of rows) {
    if (dryRun) {
      console.log(`  ${row.slug.padEnd(32)} ${row.title}`);
      continue;
    }

    const assetId = row.image ? await uploadImage(row.image) : null;

    mutations.push({
      createOrReplace: {
        _id: `${catalogue.idPrefix}-${row.slug}`,
        _type: catalogue.type,
        title: row.title,
        slug: { _type: "slug", current: row.slug },
        order: row.order,
        ...(row.description ? { description: row.description } : {}),
        ...(catalogue.fields ? catalogue.fields(row) : {}),
        ...(assetId
          ? { image: { _type: "image", asset: { _type: "reference", _ref: assetId } } }
          : {}),
      },
    });
    console.log(`  prepared ${row.slug.padEnd(32)}${assetId ? "" : " (no image)"}`);
  }
}

if (dryRun) {
  console.log("\n(dry run -- nothing written)");
  process.exit(0);
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
console.log(`\nWrote ${mutations.length} catalogue documents to ${projectId}/${dataset}.`);

// --- helpers ---

async function uploadImage(publicPath) {
  const body = await readFile(new URL(`../public${publicPath}`, import.meta.url));
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
