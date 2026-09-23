// One-off seed for the service detail pages: the hero headings and the
// client review sections, transcribed from the live synergylabs.co service
// pages.
//
//   node scripts/seed-service-reviews.mjs --dry-run   # print, change nothing
//   node scripts/seed-service-reviews.mjs
//
// Safe to re-run: it sets the same fields to the same values, and the photos
// are content-addressed by Sanity, so re-uploading one returns the same
// asset. Only heroHeading and the testimonials* fields are touched -- but
// edits an editor has made to those fields WILL be overwritten, so check
// with --dry-run first once the site is live.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role). See .env.example.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_VERSION = "2025-08-31";

const PHOTOS = {
  gina: "public/images/Screenshot-2025-06-05-at-22.55.29-p-500.png",
  ashley: "public/images/Screenshot-2025-06-05-at-22.57.34-p-500.png",
  emily: "public/images/66f73e27fce3b2fa65727d01_0_3-1-p-500.avif",
  sarah: "public/images/66f73e271971e98896b8adef_0_1-4-p-500.avif",
};

const GINA_QUOTE = "Synergy Labs delivered exceptional work, meeting all deadlines and exceeding expectations.";
const ASHLEY_QUOTE = "Synergy Labs proactively troubleshoots issues and provides solutions quickly.";

// The shorter credit lines are how the mobile and custom-software pages
// print them; staff augmentation names the companies.
const SHORT_PAIR = [
  { photo: "gina", quote: GINA_QUOTE, name: "Gina C.", role: "Copywriter & Content Strategist" },
  { photo: "ashley", quote: ASHLEY_QUOTE, name: "Ashley S.", role: "Lead Program Manager" },
];

const CONTENT = {
  "web-app-development": {
    heroHeading: "Web Applications, Designed to Perform",
  },
  "app-development-service": {
    heroHeading: "Custom Mobile Apps Built to Perform",
    testimonialsPlacement: "afterWhyUs",
    testimonialsLayout: "stacked",
    testimonials: SHORT_PAIR,
  },
  "staff-augmentation-service": {
    heroHeading: "Scale Smarter with On-Demand Talent",
    testimonialsPlacement: "afterWhyUs",
    testimonialsLayout: "stacked",
    testimonials: [
      { photo: "gina", quote: GINA_QUOTE, name: "Gina C.", role: "Copywriter & Content Strategist, Glo App" },
      { photo: "ashley", quote: ASHLEY_QUOTE, name: "Ashley Schmitt", role: "Lead Program Manager, Zwift" },
    ],
  },
  "ai-infusion-service": {
    heroHeading: "Empower Your Business with\nApplied AI",
    testimonialsPlacement: "afterProcess",
    testimonialsLayout: "stacked",
    testimonials: SHORT_PAIR,
  },
  "marketing-services": {
    heroHeading: "Tailored Marketing Solutions That Drive Real Results",
    testimonialsPlacement: "beforeFaq",
    testimonialsLayout: "showcase",
    testimonials: [
      {
        photo: "emily",
        quote:
          "Synergy Labs transformed our lead generation efforts — we saw a 160% increase in qualified leads within three months.",
        name: "Emily T.",
        // The original prints this twice ("..., FinTechCo, Marketing
        // Director, FinTechCo") -- a copy-paste slip, kept once here.
        role: "Marketing Director, FinTechCo",
      },
      {
        photo: "sarah",
        quote:
          "From SEO to social media, the team at Synergy Labs delivers consistent, high-quality results. We couldn’t ask for a better partner.",
        name: "Sarah P.",
        role: "VP of Marketing, HealthPro",
      },
    ],
  },
};

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET;
const token = env.SANITY_API_WRITE_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!projectId || !dataset) fail("PUBLIC_SANITY_PROJECT_ID and PUBLIC_SANITY_DATASET must be set in .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN must be set in .env (Editor role).");

if (dryRun) {
  for (const [slug, c] of Object.entries(CONTENT)) {
    console.log(`\n${slug}`);
    console.log(`  heading : ${JSON.stringify(c.heroHeading)}`);
    if (!c.testimonials) continue;
    console.log(`  reviews : ${c.testimonialsLayout}, ${c.testimonialsPlacement}`);
    for (const t of c.testimonials) console.log(`    - ${t.name} (${t.role}) [${t.photo}]`);
  }
  console.log("\nDry run; nothing was written.");
  process.exit(0);
}

const photoIds = {};
for (const [key, path] of Object.entries(PHOTOS)) {
  const body = await readFile(path).catch((err) => fail(`Could not read ${path}: ${err.message}`));
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/assets/images/${dataset}`);
  url.searchParams.set("filename", basename(path));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": path.endsWith(".png") ? "image/png" : "image/avif",
    },
    body,
  });
  if (!res.ok) fail(`Photo upload failed for ${path} (${res.status}): ${await res.text()}`);
  photoIds[key] = (await res.json()).document._id;
  console.log(`Photo ${key}: ${photoIds[key]}`);
}

const mutations = [];

for (const [slug, content] of Object.entries(CONTENT)) {
  const href = `/our-services/${slug}`;
  // perspective=raw returns drafts too: an open draft is patched alongside
  // the published document, or publishing it would put the old values back.
  const docs = await query(`*[_type == "service" && href == $href]{_id, title}`, { href });

  if (docs.length === 0) {
    console.warn(`  ! no service with href "${href}" -- skipped`);
    continue;
  }

  const set = { heroHeading: content.heroHeading };
  if (content.testimonials) {
    set.testimonialsPlacement = content.testimonialsPlacement;
    set.testimonialsLayout = content.testimonialsLayout;
    set.testimonials = content.testimonials.map(({ photo, ...item }, i) => ({
      _type: "testimonial",
      _key: `testimonial-${i}`,
      ...item,
      avatar: { _type: "image", asset: { _type: "reference", _ref: photoIds[photo] } },
    }));
  }

  for (const doc of docs) {
    mutations.push({ patch: { id: doc._id, set } });
    const draft = doc._id.startsWith("drafts.") ? " (draft)" : "";
    console.log(`  queued ${doc.title}${draft}`);
  }
}

const res = await fetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});

if (!res.ok) fail(`Seeding failed (${res.status}): ${await res.text()}`);

console.log(`\nWrote ${mutations.length} document patches.`);
console.log("Restart `npm run dev` (getStaticPaths is cached per session) or rebuild to see them.");

async function query(groq, params) {
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", groq);
  url.searchParams.set("perspective", "raw");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(`Sanity query failed (${res.status}): ${await res.text()}`);
  return (await res.json()).result ?? [];
}

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
