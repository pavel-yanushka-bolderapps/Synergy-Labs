// Seeds the 24 /top-* Clutch landing pages into Sanity from
// scripts/data/clutch-landings.json.
//
//   node scripts/seed-clutch-landings.mjs --dry-run
//   node scripts/seed-clutch-landings.mjs
//
// Re-runnable: ids are derived from the slug, so a second run updates rather
// than duplicates.
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

const rows = JSON.parse(
  await readFile(new URL("./data/clutch-landings.json", import.meta.url), "utf8")
);

console.log(`\nclutchLanding (${rows.length})`);

const mutations = rows.map((row) => {
  const canonical = row.canonicalSlug ? `  -> canonical ${row.canonicalSlug}` : "";
  console.log(`  ${row.slug.padEnd(42)} ${row.heading}${canonical}`);

  return {
    createOrReplace: {
      // One slug contains a slash; document ids may not, so flatten it.
      _id: `clutch-landing-${row.slug.replace(/\//g, "--")}`,
      _type: "clutchLanding",
      heading: row.heading,
      slug: { _type: "slug", current: row.slug },
      pitch: row.pitch,
      ...(row.metaTitle ? { metaTitle: row.metaTitle } : {}),
      ...(row.metaDescription ? { metaDescription: row.metaDescription } : {}),
      ...(row.ctaHeading ? { ctaHeading: row.ctaHeading } : {}),
      ...(row.canonicalSlug ? { canonicalSlug: row.canonicalSlug } : {}),
      ...(row.locale ? { locale: row.locale } : {}),
    },
  };
});

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
console.log(`\nWrote ${mutations.length} landing pages to ${projectId}/${dataset}.`);

// --- helpers ---

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
