// Writes page-builder sections onto existing case study documents, from the
// transcription in scripts/data/case-study-sections.json.
//
//   node scripts/migrate-case-study-sections.mjs --dry-run
//   node scripts/migrate-case-study-sections.mjs                 # all studies
//   node scripts/migrate-case-study-sections.mjs clearcover signal
//
// Unlike seed-case-studies.mjs this is a `patch`, not a createOrReplace: it
// sets `sections` (and `brandColor` where the transcription gives one) and
// leaves every other field alone, so it can be re-run against documents
// editors have since changed without discarding their work.
//
// Images are uploaded to Sanity and replaced with asset references -- both
// files under public/ and anything still pointing at the old Webflow CDN, so
// the new site stops hotlinking the site it replaces. Sanity
// content-addresses uploads, so re-running does not duplicate them.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const API = "2025-08-31";
const DATA = new URL("./data/case-study-sections.json", import.meta.url);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;
if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const all = JSON.parse(await readFile(DATA, "utf8"));
const studies = Object.entries(all).filter(([slug]) => only.length === 0 || only.includes(slug));
if (studies.length === 0) fail(`No transcription for: ${only.join(", ")}`);

const MEDIA = {
  ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
};

const uploaded = new Map();

/**
 * Reads a source that is either a file the client dropped into public/ or a
 * URL on the old Webflow CDN. Pulling the remote ones through here is the
 * point of the exercise: the new site should serve its own images, not
 * hotlink a site that is going to be switched off.
 */
async function readSource(source) {
  if (/^https?:/.test(source)) {
    const res = await fetch(source);
    if (!res.ok) return { error: `${res.status} fetching` };
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      filename: decodeURIComponent(source.split("/").pop() ?? "image"),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  const bytes = await readFile(new URL(`../public${source}`, import.meta.url)).catch(() => null);
  if (!bytes) return { error: "not found under public/" };
  return {
    bytes,
    filename: source.split("/").pop(),
    contentType: MEDIA[extname(source).toLowerCase()] ?? "application/octet-stream",
  };
}

async function upload(path) {
  if (uploaded.has(path)) return uploaded.get(path);
  const { bytes, filename, contentType, error } = await readSource(path);
  if (error) {
    console.warn(`  ! ${error}: ${path.slice(0, 80)} -- leaving that image out`);
    uploaded.set(path, null);
    return null;
  }
  const u = new URL(`https://${projectId}.api.sanity.io/v${API}/assets/images/${dataset}`);
  u.searchParams.set("filename", filename);
  const res = await fetch(u, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!res.ok) {
    console.warn(`  ! upload failed (${res.status}) for ${path} -- leaving that image out`);
    uploaded.set(path, null);
    return null;
  }
  const id = (await res.json()).document._id;
  uploaded.set(path, id);
  return id;
}

/**
 * Walks a section and swaps every "/images/..." string for an asset
 * reference. Done generically rather than field by field so a new section
 * type with an image field needs no change here.
 */
async function resolveImages(node) {
  if (Array.isArray(node)) {
    for (const item of node) await resolveImages(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && (value.startsWith("/images/") || /^https?:\/\/cdn\./.test(value))) {
      const id = await upload(value);
      if (id) node[key] = { _type: "image", asset: { _type: "reference", _ref: id } };
      else delete node[key];
    } else if (value && typeof value === "object") {
      await resolveImages(value);
    }
  }
}

async function query(groq) {
  const u = new URL(`https://${projectId}.api.sanity.io/v${API}/data/query/${dataset}`);
  u.searchParams.set("query", groq);
  u.searchParams.set("perspective", "raw");
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(`Query failed (${res.status}): ${await res.text()}`);
  return (await res.json()).result;
}

const mutations = [];

for (const [slug, study] of studies) {
  const sections = study.sections;
  console.log(`\n${slug} — ${sections.length} sections`);
  for (const s of sections) {
    const count = s.items ? ` (${s.items.length} items)` : "";
    console.log(`   ${String(s._type).padEnd(12)} ${s.heading ?? s.quote?.slice(0, 40) ?? ""}${count}`);
  }
  if (dryRun) continue;

  await resolveImages(sections);

  // A draft only exists while someone has unpublished edits open, so it
  // comes and goes; patch whichever of the two are actually there, or the
  // whole transaction fails on the missing one.
  const ids = await query(
    `*[_type == "project" && slug.current == "${slug}"]._id + *[_id == "drafts.case-study-${slug}"]._id`
  );
  const targets = [...new Set(ids)];
  if (targets.length === 0) {
    console.warn(`  ! no document for "${slug}" -- skipping`);
    continue;
  }
  console.log(`   -> ${targets.join(", ")}`);

  const set = { sections };
  if (study.brandColor) set.brandColor = study.brandColor;
  for (const id of targets) mutations.push({ patch: { id, set } });
}

if (dryRun) {
  console.log("\nDry run; nothing was written.");
  process.exit(0);
}

const res = await fetch(`https://${projectId}.api.sanity.io/v${API}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});
if (!res.ok) fail(`Mutation failed (${res.status}): ${await res.text()}`);

console.log(
  `\nWrote sections for ${studies.length} case ${studies.length === 1 ? "study" : "studies"}, ` +
    `${[...uploaded.values()].filter(Boolean).length} images.`
);
console.log("Rebuild to see them.");

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
