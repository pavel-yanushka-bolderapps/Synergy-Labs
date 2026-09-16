// Replaces a case study's "Hero screenshots" (the carousel beside the
// headline) with the images in its folder under public/images/Portfolio/.
//
//   node scripts/upload-hero-screenshots.mjs --dry-run
//   node scripts/upload-hero-screenshots.mjs                    # every folder below
//   node scripts/upload-hero-screenshots.mjs signal fanbase     # just these
//
// Folder names don't match slugs ("Joe And Juice" vs "joe-the-juice"), so
// the mapping is spelled out rather than guessed. Add a line here when a new
// folder arrives.
//
// This REPLACES heroImages rather than adding to it: the point is to swap the
// hotlinked Webflow shots for the client's own files, so appending would
// leave the carousel running both. Every other field is untouched.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).
import { readFile, readdir } from "node:fs/promises";
import { extname } from "node:path";

const API = "2025-08-31";

// Deliberately NOT listed: clapper, clearcover and spendee already have their
// carousels, and peanut has no case study page to put one on.
const FOLDERS = {
  fanbase: "Fanbase",
  "forbes-councils": "Forbes",
  "joe-the-juice": "Joe And Juice",
  signal: "Signal",
  "urban-massage": "Urban",
};

const IMAGE_TYPES = {
  ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;
if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const targets = Object.entries(FOLDERS).filter(([slug]) => only.length === 0 || only.includes(slug));
if (targets.length === 0) fail(`No folder mapped for: ${only.join(", ")}. Known: ${Object.keys(FOLDERS).join(", ")}`);

const mutations = [];

for (const [slug, folder] of targets) {
  const dir = new URL(`../public/images/Portfolio/${folder}/`, import.meta.url);
  const names = (await readdir(dir).catch(() => null))?.filter((n) => IMAGE_TYPES[extname(n).toLowerCase()]);

  if (!names?.length) {
    console.warn(`\n${slug}: no images in public/images/Portfolio/${folder}/ -- skipping`);
    continue;
  }

  // Sorted so the carousel order is predictable and matches the filenames
  // the client numbered, rather than whatever order the filesystem returns.
  names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  console.log(`\n${slug}  <-  ${folder}/  (${names.length} images)`);
  for (const n of names) console.log(`   ${n}`);
  if (dryRun) continue;

  const refs = [];
  for (const [i, name] of names.entries()) {
    const assetId = await upload(new URL(name, dir), name);
    if (assetId) {
      refs.push({ _type: "image", _key: `hero-${i}`, asset: { _type: "reference", _ref: assetId } });
    }
  }
  if (refs.length === 0) continue;

  // A draft only exists while someone has unpublished edits open, so patch
  // whichever of the two are actually there -- naming a missing one fails
  // the whole transaction.
  const ids = await query(
    `*[_type == "project" && slug.current == "${slug}"]._id + *[_id == "drafts.case-study-${slug}"]._id`
  );
  const docIds = [...new Set(ids)];
  if (docIds.length === 0) {
    console.warn(`   ! no document for "${slug}" -- skipping`);
    continue;
  }
  console.log(`   -> ${docIds.join(", ")}`);
  for (const id of docIds) mutations.push({ patch: { id, set: { heroImages: refs } } });
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

console.log(`\nUpdated hero screenshots on ${mutations.length} document(s). Rebuild to see them.`);

async function upload(fileUrl, name) {
  const bytes = await readFile(fileUrl);
  const u = new URL(`https://${projectId}.api.sanity.io/v${API}/assets/images/${dataset}`);
  u.searchParams.set("filename", name);
  const r = await fetch(u, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": IMAGE_TYPES[extname(name).toLowerCase()] },
    body: bytes,
  });
  if (!r.ok) {
    console.warn(`   ! upload failed (${r.status}) for ${name}`);
    return null;
  }
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

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
