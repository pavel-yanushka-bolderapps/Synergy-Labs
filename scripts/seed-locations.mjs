// Seeds the offices into Sanity as `location` documents, from the same files
// the static fallback uses (src/content/home.ts -> public/images/Locations).
//
//   node scripts/seed-locations.mjs --dry-run
//   node scripts/seed-locations.mjs
//
// Re-runnable: each document's id is derived from the city, so a second run
// updates rather than duplicates. Images are content-addressed by Sanity, so
// re-uploading the same file returns the existing asset instead of a copy.
//
// It writes only the fields the schema owns (city, address, isHeadquarters,
// order, image) via `createOrReplace`, so anything you add in Studio beyond
// those is not preserved -- run it to populate, not to patch.
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
    console.log(`  ${String(i + 1).padStart(2)}. ${loc.city}${loc.isHeadquarters ? " (HQ)" : ""}`);
    console.log(`      ${loc.address}`);
    console.log(`      ${loc.imageSrc ?? "(no image)"}`);
  }
  process.exit(0);
}

const mutations = [];
for (const [i, loc] of locations.entries()) {
  const assetId = loc.imageSrc ? await uploadImage(loc.imageSrc) : null;

  mutations.push({
    createOrReplace: {
      _id: docId(loc.city),
      _type: "location",
      city: loc.city,
      address: loc.address,
      isHeadquarters: Boolean(loc.isHeadquarters),
      // The array order is the display order -- first two get the wide cards,
      // next three the row below, the rest sit behind "Other locations".
      order: (i + 1) * 10,
      ...(assetId ? { image: { _type: "image", asset: { _type: "reference", _ref: assetId } } } : {}),
    },
  });
  console.log(`  prepared ${loc.city}${assetId ? "" : " (no image)"}`);
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

// home.ts is TypeScript, and this script runs in plain Node. Rather than pull
// in a transpiler for one array, read the literal out of the file: the shape
// is a flat list of single-line object literals, which is stable enough to
// parse and loud enough to fail on if it ever stops being.
async function readLocations() {
  const src = await readFile(new URL("../src/content/home.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("  locations: {"));
  const items = block.slice(block.indexOf("items: ["), block.indexOf("],"));

  const parsed = [...items.matchAll(/\{\s*city:\s*"((?:[^"\\]|\\.)*)"[^}]*\}/g)].map((m) => {
    const entry = m[0];
    const read = (key) => entry.match(new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
    return {
      city: read("city"),
      address: read("address"),
      imageSrc: read("imageSrc"),
      isHeadquarters: /isHeadquarters:\s*true/.test(entry),
    };
  });

  if (parsed.length === 0) fail("Could not read any locations out of src/content/home.ts.");
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
