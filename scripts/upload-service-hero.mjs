// Uploads a hero visual to Sanity and attaches it to one service, which is
// what src/pages/our-services/[slug].astro renders in the hero slot (see
// getServiceBySlug() in src/lib/sanity.ts).
//
//   node scripts/upload-service-hero.mjs <slug> <file>
//   node scripts/upload-service-hero.mjs --list
//
// The file extension picks the field, matching how the page falls back:
// a .json/.lottie animation goes to `heroLottie`, an image to `heroImage`,
// and the page prefers the animation when a service has both.
//
// <slug> is the part after "/our-services/" in the service's `href`, e.g.
// `staff-augmentation-service`. Run with --list to see the slugs Sanity
// currently has and what each one is using.
//
// Needs SANITY_API_WRITE_TOKEN in .env -- an Editor-role token from
// https://sanity.io/manage -> the project -> API -> Tokens. The existing
// SANITY_API_READ_TOKEN is deliberately Viewer-only (it exists for the
// Studio's Preview tab) and cannot upload.

import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const API_VERSION = "2025-08-31";

// Sanity stores images and files through separate endpoints: an image
// asset gets dimensions/palette metadata extracted, a file asset does not.
// Lottie JSON has to go through `files` -- pushed through `images` it would
// be rejected as undecodable.
const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token) {
  fail(
    "SANITY_API_WRITE_TOKEN is missing from .env.\n" +
      "Create one at https://sanity.io/manage -> your project -> API -> Tokens,\n" +
      "with the **Editor** role, then add it to .env as SANITY_API_WRITE_TOKEN=...\n" +
      "(SANITY_API_READ_TOKEN is Viewer-only and cannot upload files.)"
  );
}

const [slugArg, fileArg] = process.argv.slice(2);

if (slugArg === "--list" || !slugArg) {
  await listServices();
  if (!slugArg) {
    console.log("\nUsage: node scripts/upload-service-hero.mjs <slug> <file>");
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

if (!fileArg) fail("Missing file argument.\nUsage: node scripts/upload-service-hero.mjs <slug> <file>");

const slug = slugArg.replace(/^\/?our-services\//, "").replace(/\/$/, "");
const filePath = resolve(fileArg);
const extension = extname(filePath).toLowerCase();

const isAnimation = extension === ".json" || extension === ".lottie";
const isImage = extension in IMAGE_TYPES;

if (!isAnimation && !isImage) {
  fail(
    `Don't know what to do with "${extension || basename(filePath)}".\n` +
      `Animations: .json, .lottie -- images: ${Object.keys(IMAGE_TYPES).join(", ")}`
  );
}

const field = isAnimation ? "heroLottie" : "heroImage";
const bytes = await readFile(filePath).catch((err) => fail(`Could not read ${filePath}: ${err.message}`));

// The service's own page reserves the hero slot using the animation's
// width/height, so a .json that isn't actually Lottie would build a page
// with a collapsed hero rather than fail loudly. Catch it here instead.
if (extension === ".json") {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    fail(`${basename(filePath)} is not valid JSON: ${err.message}`);
  }
  if (typeof parsed.w !== "number" || typeof parsed.h !== "number" || !Array.isArray(parsed.layers)) {
    fail(
      `${basename(filePath)} does not look like a Lottie animation ` +
        "(expected top-level numeric `w`/`h` and a `layers` array)."
    );
  }
  console.log(`${basename(filePath)}: ${parsed.w}x${parsed.h}, ${parsed.layers.length} layers`);
}

// Find every document for this service. A service being edited in the
// Studio has both a published doc and a `drafts.` copy; patching only the
// published one would silently lose the upload the next time an editor
// hits Publish, so both get the same patch.
const href = `/our-services/${slug}`;
const docs = await query(`*[_type == "service" && href == $href]{_id, title}`, { href }, "raw");

if (docs.length === 0) {
  fail(`No service in Sanity has href "${href}". Run with --list to see the available slugs.`);
}

console.log(`Uploading to Sanity (project ${projectId}, dataset ${dataset})...`);

const uploadUrl = new URL(
  `https://${projectId}.api.sanity.io/v${API_VERSION}/assets/${isAnimation ? "files" : "images"}/${dataset}`
);
uploadUrl.searchParams.set("filename", basename(filePath));

const uploadRes = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": isAnimation
      ? extension === ".json"
        ? "application/json"
        : "application/octet-stream"
      : IMAGE_TYPES[extension],
  },
  body: bytes,
});

if (!uploadRes.ok) {
  fail(`Asset upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
}

const asset = (await uploadRes.json()).document;
const dimensions = asset.metadata?.dimensions;
console.log(
  `Uploaded asset ${asset._id}` +
    (dimensions ? ` (${dimensions.width}x${dimensions.height})` : "")
);

const mutations = docs.map((doc) => ({
  patch: {
    id: doc._id,
    set: {
      [field]: {
        _type: isAnimation ? "file" : "image",
        asset: { _type: "reference", _ref: asset._id },
      },
    },
  },
}));

const mutateRes = await fetch(
  `https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  }
);

if (!mutateRes.ok) {
  fail(`Attaching the asset failed (${mutateRes.status}): ${await mutateRes.text()}`);
}

for (const doc of docs) {
  const isDraft = doc._id.startsWith("drafts.");
  console.log(`Set ${field} on "${doc.title}"${isDraft ? " (unpublished draft)" : ""}`);
}

console.log(
  "\nDone. The site is statically built, so run `npm run build` (or redeploy) " +
    "for the hero to appear on the live page."
);

async function listServices() {
  const docs = await query(
    `*[_type == "service" && defined(href)] | order(href asc){
       href, title,
       "lottie": heroLottie.asset->originalFilename,
       "image": heroImage.asset->originalFilename
     }`,
    {},
    "published"
  );

  console.log("Services in Sanity:\n");
  for (const doc of docs) {
    const slug = doc.href.replace(/^\/our-services\//, "");
    // Mirrors the page's own precedence, so this reads as what each service
    // actually shows rather than just what it has stored.
    const hero = doc.lottie
      ? `${doc.lottie} (animation)`
      : doc.image
        ? `${doc.image} (image)`
        : "(nothing)";
    console.log(`  ${slug.padEnd(30)} ${doc.title.padEnd(20)} ${hero}`);
  }
}

async function query(groq, params, perspective) {
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", groq);
  url.searchParams.set("perspective", perspective);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(`Sanity query failed (${res.status}): ${await res.text()}`);
  return (await res.json()).result ?? [];
}

/**
 * .env is read by hand rather than through a dependency: this script runs
 * outside Astro, so `import.meta.env` is empty, and the project has no
 * dotenv dependency to borrow.
 */
async function readDotEnv() {
  const raw = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
  const values = {};

  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  return { ...values, ...process.env };
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
