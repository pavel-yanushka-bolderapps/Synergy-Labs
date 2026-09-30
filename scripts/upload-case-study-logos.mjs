// Fills in the hero logo for case studies that have none.
//
//   node scripts/upload-case-study-logos.mjs --dry-run
//   node scripts/upload-case-study-logos.mjs
//
// Sources are the logos the original pages used in their own heroes (the
// `cs-hero-image` in webflow-export/projects/casestudy/*.html), already
// sitting in public/images. Studies that already have a logo are left alone
// unless --force is passed.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const API = "2025-08-31";

const LOGOS = {
  fanbase: "/images/image-76.webp",
  "forbes-councils": "/images/forbescouncils-logo-removebg-preview.webp",
  "joe-the-juice": "/images/unnamed-6.webp",
  signal: "/images/Signal_RGB_Brandmark_SignalBlue.avif",
  "urban-massage": "/images/t7Sg1g8SF4knGaV8UlZTCTDvUQ8UVV29dyct7GMy_cr.avif",
};

const TYPES = { ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

const env = await readDotEnv();
const { PUBLIC_SANITY_PROJECT_ID: projectId, SANITY_API_WRITE_TOKEN: token } = env;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const targets = Object.entries(LOGOS).filter(([slug]) => only.length === 0 || only.includes(slug));
const mutations = [];

for (const [slug, path] of targets) {
  const docs = await query(
    `*[_type == "project" && slug.current == "${slug}"]{ _id, "hasLogo": defined(logo) }` +
      ` + *[_id == "drafts.case-study-${slug}"]{ _id, "hasLogo": defined(logo) }`
  );
  if (docs.length === 0) {
    console.warn(`${slug.padEnd(18)} no document -- skipping`);
    continue;
  }
  const needing = force ? docs : docs.filter((d) => !d.hasLogo);
  if (needing.length === 0) {
    console.log(`${slug.padEnd(18)} already has a logo -- skipping (use --force to replace)`);
    continue;
  }

  console.log(`${slug.padEnd(18)} <- public${path}`);
  if (dryRun) continue;

  const assetId = await upload(path);
  if (!assetId) continue;
  for (const d of needing) {
    mutations.push({
      patch: { id: d._id, set: { logo: { _type: "image", asset: { _type: "reference", _ref: assetId } } } },
    });
  }
}

if (dryRun) {
  console.log("\nDry run; nothing was written.");
  process.exit(0);
}
if (mutations.length === 0) fail("Nothing to write.");

const res = await fetch(`https://${projectId}.api.sanity.io/v${API}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});
if (!res.ok) fail(`Mutation failed (${res.status}): ${await res.text()}`);
console.log(`\nSet logos on ${mutations.length} document(s). Rebuild to see them.`);

async function upload(path) {
  const bytes = await readFile(new URL(`../public${path}`, import.meta.url)).catch(() => null);
  if (!bytes) { console.warn(`   ! missing public${path}`); return null; }
  const u = new URL(`https://${projectId}.api.sanity.io/v${API}/assets/images/${dataset}`);
  u.searchParams.set("filename", path.split("/").pop());
  const r = await fetch(u, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream" },
    body: bytes,
  });
  if (!r.ok) { console.warn(`   ! upload failed (${r.status})`); return null; }
  return (await r.json()).document._id;
}

async function query(groq) {
  const u = new URL(`https://${projectId}.api.sanity.io/v${API}/data/query/${dataset}`);
  u.searchParams.set("query", groq);
  u.searchParams.set("perspective", "raw");
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) fail(`Query failed (${r.status}): ${await r.text()}`);
  return (await r.json()).result;
}

async function readDotEnv() {
  const raw = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
  const values = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...values, ...process.env };
}

function fail(message) { console.error(`\n${message}\n`); process.exit(1); }
