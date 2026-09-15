// Seeds the portfolio case studies into Sanity from content transcribed off
// the original Webflow site (synergylabs.co/projects/casestudy/*), including
// re-hosting every image on Sanity's CDN so the new site does not hotlink
// the old one.
//
//   node scripts/seed-case-studies.mjs --dry-run
//   node scripts/seed-case-studies.mjs
//
// Re-runnable: documents are addressed by a deterministic id derived from
// the slug, so a second run updates rather than duplicates. Images are
// content-addressed by Sanity, so re-uploading the same file is a no-op
// that returns the existing asset.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role). See .env.example.

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const API_VERSION = "2025-08-31";
const DATA = new URL("./data/case-studies.json", import.meta.url);

const dryRun = process.argv.includes("--dry-run");

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const studies = JSON.parse(await readFile(DATA, "utf8"));

if (dryRun) {
  for (const [slug, s] of Object.entries(studies)) {
    console.log(`\n--- ${slug} ---`);
    console.log(`  client   : ${s.clientName}`);
    console.log(`  headline : ${s.headline}`);
    console.log(`  colour   : ${s.brandColor ?? "(none -- falls back to Synergy green)"}`);
    console.log(`  facts    : ${["metaClient", "metaYear", "metaTechStack", "metaCategory"].filter((k) => s[k]).length}/4`);
    console.log(`  overview : ${s.overviewHeading} (${(s.overviewBody ?? []).length} paras)`);
    console.log(`  hero img : ${s.heroImage ?? "(none)"}`);
    console.log(`  hero imgs: ${s.heroImages.length}`);
    console.log(`  stores   : ios ${s.appStoreUrl ? "yes" : "no"}, android ${s.playStoreUrl ? "yes" : "no"}`);
    console.log(
      `  stats    : ${s.stats?.enabled ? `on, ${s.stats.items.length} numbers, ${s.stats.bgColor} / ${s.stats.accentColor}` : "off"}`
    );
    console.log(`  blocks   : ${s.contentBlocks.length}`);
    for (const b of s.contentBlocks) {
      console.log(`     - ${b.heading} (${b.body.length} paras, ${b.bullets.length} bullets, image: ${b.image ? "yes" : "no"})`);
    }
  }
  console.log("\nDry run; nothing was written.");
  process.exit(0);
}

// Uploading the same URL twice across studies is common (shared UI shots),
// so remember what has already been pushed for this run.
const uploaded = new Map();

// Root-relative sources ("/images/...") are files the client dropped into
// public/; anything else is a URL off the old Webflow site.
const LOCAL_TYPES = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function readSource(source) {
  if (!source.startsWith("/")) {
    const res = await fetch(source);
    if (!res.ok) return { error: `${res.status} fetching` };
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      filename: decodeURIComponent(source.split("/").pop() ?? "image"),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  const file = new URL(`../public${source}`, import.meta.url);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return { error: "not found under public/" };

  return {
    bytes,
    filename: source.split("/").pop(),
    contentType: LOCAL_TYPES[extname(source).toLowerCase()] ?? "application/octet-stream",
  };
}

async function uploadImage(url) {
  if (!url) return null;
  if (uploaded.has(url)) return uploaded.get(url);

  const { bytes, filename, contentType, error } = await readSource(url);
  if (error) {
    console.warn(`  ! ${error} ${url.slice(0, 80)} -- skipping this image`);
    uploaded.set(url, null);
    return null;
  }

  const target = new URL(
    `https://${projectId}.api.sanity.io/v${API_VERSION}/assets/images/${dataset}`
  );
  target.searchParams.set("filename", filename);

  const up = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!up.ok) {
    console.warn(`  ! upload failed (${up.status}) for ${filename} -- skipping this image`);
    uploaded.set(url, null);
    return null;
  }

  const id = (await up.json()).document._id;
  uploaded.set(url, id);
  return id;
}

const imageRef = (assetId) =>
  assetId ? { _type: "image", asset: { _type: "reference", _ref: assetId } } : undefined;

const mutations = [];
let order = 0;

for (const [slug, s] of Object.entries(studies)) {
  console.log(`\n${slug}`);

  const logoId = await uploadImage(s.logo);
  const heroImageId = await uploadImage(s.heroImage);
  const statsIconId = await uploadImage(s.stats?.icon);
  const heroIds = [];
  for (const url of s.heroImages) heroIds.push(await uploadImage(url));

  const blocks = [];
  for (const [i, b] of s.contentBlocks.entries()) {
    const imgId = await uploadImage(b.image);
    blocks.push({
      _type: "contentBlock",
      _key: `block-${i}`,
      heading: b.heading,
      // Paragraphs round-trip through one textarea separated by blank
      // lines -- see toParagraphs() in src/lib/sanity.ts.
      ...(b.body.length ? { body: b.body.join("\n\n") } : {}),
      ...(b.bullets.length
        ? { bullets: b.bullets }
        : {}),
      ...(imgId ? { image: imageRef(imgId) } : {}),
      imageSide: "auto",
    });
  }
  console.log(`  ${heroIds.filter(Boolean).length} hero images, ${blocks.length} blocks`);

  const doc = {
    _id: `case-study-${slug}`,
    _type: "project",
    clientName: s.clientName,
    slug: { _type: "slug", current: slug },
    order: (order += 10),
    ...(logoId ? { logo: imageRef(logoId) } : {}),
    ...(s.brandColor ? { brandColor: s.brandColor } : {}),
    headline: s.headline,
    ...(s.intro ? { intro: s.intro } : {}),
    ...(heroImageId ? { heroImage: imageRef(heroImageId) } : {}),
    ...(s.appStoreUrl ? { appStoreUrl: s.appStoreUrl } : {}),
    ...(s.playStoreUrl ? { playStoreUrl: s.playStoreUrl } : {}),
    heroImages: heroIds
      .filter(Boolean)
      .map((id, i) => ({ ...imageRef(id), _key: `hero-${i}` })),
    ...(s.metaClient ? { metaClient: s.metaClient } : {}),
    ...(s.metaYear ? { metaYear: s.metaYear } : {}),
    ...(s.metaTechStack ? { metaTechStack: s.metaTechStack } : {}),
    ...(s.metaCategory ? { metaCategory: s.metaCategory } : {}),
    ...(s.overviewHeading ? { overviewHeading: s.overviewHeading } : {}),
    ...((s.overviewBody ?? []).length ? { overviewBody: s.overviewBody.join("\n\n") } : {}),
    contentBlocks: blocks,
    // The achievements band. Only Clearcover has one transcribed so far, so
    // every other study gets the toggle explicitly off rather than left
    // unset -- createOrReplace drops the field either way, but saying so
    // keeps the intent readable next to the data.
    statsEnabled: Boolean(s.stats?.enabled),
    ...(s.stats
      ? {
          ...(statsIconId ? { statsIcon: imageRef(statsIconId) } : {}),
          statsHeading: s.stats.heading,
          ...(s.stats.subheading ? { statsSubheading: s.stats.subheading } : {}),
          ...(s.stats.bgColor ? { statsBgColor: s.stats.bgColor } : {}),
          ...(s.stats.accentColor ? { statsAccentColor: s.stats.accentColor } : {}),
          statsItems: s.stats.items.map((item, i) => ({
            _type: "statItem",
            _key: `stat-${i}`,
            value: item.value,
            label: item.label,
          })),
        }
      : {}),
    metaDescription: s.intro ?? `${s.clientName} case study by Synergy Labs.`,
  };

  // createOrReplace rather than patch: these documents are generated wholly
  // from the transcription, so a re-run should reset them to it rather than
  // merge into whatever shape a previous run left behind.
  mutations.push({ createOrReplace: doc });
}

const res = await fetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});

if (!res.ok) fail(`Seeding failed (${res.status}): ${await res.text()}`);

console.log(`\nWrote ${mutations.length} case studies, ${[...uploaded.values()].filter(Boolean).length} images.`);
console.log("Restart `npm run dev` or rebuild to see them.");

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
