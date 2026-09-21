// Turns the Webflow Blogs CSV export into the three JSON files the blog runs
// on. Run it whenever a fresh export lands in public/csv/:
//
//   node scripts/extract-blog-csv.mjs
//
// Writes, into scripts/data/:
//
//   blog-authors.json   the six bylines, deduped out of the Author column
//   blog-posts.json     one entry per post, everything except the article body
//   blog-articles.json  slug -> article HTML, kept apart because it is ~6 MB
//
// The split matters at build time, not just on disk: /blog and the homepage
// only ever need the metadata, and src/lib/sanity.ts imports the articles file
// lazily so the listing pages never pull 6 MB of HTML into their module graph.
//
// Like the other seed inputs in this directory, these files are both the
// seeder's input *and* the build-time fallback -- see the comment above
// getBlogPosts() in src/lib/sanity.ts.

import { readFile, writeFile } from "node:fs/promises";

const CSV = new URL(
  "../public/csv/Synergy Labs - Blogs - 66b25e37cb4087accb88e158.csv",
  import.meta.url
);

// The Author column holds Webflow's author-collection slug. Names and avatars
// aren't in the Blogs export -- they live in a separate collection -- so they
// are transcribed here from /author/<slug> on the live site. The avatars are
// downloaded into public/images/blog/authors/.
const AUTHORS = {
  "andrew-abbey": "Andrew Abbey",
  "lily-kelce": "Lily Kelce",
  "jhaymes-clark-n-caracuel": "Jhaymes Clark N. Caracuel",
  "jon-knight": "Jon Knight",
  "sardor-akhmedov": "Sardor Akhmedov",
  "brian-a": "Brian A",
};

const raw = await readFile(CSV, "utf8");
const rows = parseCsv(raw);
const header = rows[0];
const col = Object.fromEntries(header.map((name, i) => [name, i]));

const posts = [];
const articles = {};
const usedAuthors = new Set();
const skipped = [];

for (const row of rows.slice(1)) {
  const get = (name) => (row[col[name]] ?? "").trim();

  const slug = get("Slug");
  const title = get("Name");
  if (!slug || !title) continue;

  // Webflow keeps archived and unpublished items in the same export. Drafts
  // are dropped rather than seeded as Sanity drafts: a Sanity draft is a
  // document someone is mid-edit on, which is not what a Webflow draft means.
  if (get("Archived") === "true" || get("Draft") === "true") {
    skipped.push(slug);
    continue;
  }

  const html = cleanArticle(row[col["Article"]] ?? "");
  const authorSlug = get("Author");
  if (authorSlug) usedAuthors.add(authorSlug);

  posts.push({
    slug,
    title,
    // The Date column is the editorial date shown on the card; Published On is
    // when it actually went live. Webflow leaves Date empty on a few, so fall
    // back rather than ship a post with no date on it.
    date: toIsoDate(get("Date") || get("Published On") || get("Created On")),
    author: authorSlug || null,
    // Webflow overlays this on the card artwork. It repeats the title on most
    // posts, so drop it there and let the card render the title once.
    previewImageText: get("Preview Image Text") === title ? null : get("Preview Image Text") || null,
    previewText: stripQuotes(get("Preview Text")),
    readingMinutes: Number(get("Time To Read (minutes)")) || estimateReadingMinutes(html),
    // template-1 .. template-7, matching public/images/blog/template-*.avif.
    template: get("Preview BG Image") || null,
  });

  articles[slug] = html;
}

// Newest first -- the order /blog, the homepage and the builder page all want.
posts.sort((a, b) => b.date.localeCompare(a.date));

const authors = [...usedAuthors].sort().map((slug) => ({
  slug,
  name: AUTHORS[slug] ?? titleCase(slug),
  image: `/images/blog/authors/${slug}.webp`,
}));

const dir = new URL("./data/", import.meta.url);
await writeFile(new URL("blog-authors.json", dir), JSON.stringify(authors, null, 2) + "\n");
await writeFile(new URL("blog-posts.json", dir), JSON.stringify(posts, null, 2) + "\n");
await writeFile(new URL("blog-articles.json", dir), JSON.stringify(articles) + "\n");

const missingName = authors.filter((a) => !AUTHORS[a.slug]);
console.log(`authors   ${authors.length}`);
if (missingName.length) {
  console.log(`  no name transcribed for: ${missingName.map((a) => a.slug).join(", ")}`);
}
console.log(`posts     ${posts.length} (skipped ${skipped.length} draft/archived)`);
console.log(`articles  ${(JSON.stringify(articles).length / 1e6).toFixed(1)} MB`);

const noTemplate = posts.filter((p) => !p.template).length;
if (noTemplate) console.log(`  ${noTemplate} with no Preview BG Image`);

// --- helpers ---

/**
 * Webflow's rich-text output, tidied enough to render inside our own `prose`
 * styles. Deliberately conservative -- anything not listed here is left alone,
 * because the article body is the one thing in this import we cannot
 * regenerate if we mangle it.
 */
function cleanArticle(html) {
  return (
    html
      // Every element in a Webflow rich text carries `id=""`. They are not
      // anchors (the real ones have a value), they are just noise, and a
      // duplicated empty id on 40 elements is invalid HTML.
      .replace(/\s+id=""/g, "")
      // A handful of articles were pasted in as whole documents and still
      // carry their <html>/<head>/<body> wrapper, which cannot go inside a
      // <div>. Keep the body's contents and drop the shell.
      .replace(/<\/?(?:html|head|body)[^>]*>/gi, "")
      .replace(/<meta[^>]*>/gi, "")
      .replace(/<title[^>]*>.*?<\/title>/gis, "")
      .trim()
  );
}

/** "Fri Apr 25 2025 00:00:00 GMT+0000 (...)" -> "2025-04-25". */
function toIsoDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

/**
 * Several Preview Text values are wrapped in the quotation marks that the
 * Webflow card drew around them as decoration. Our card draws its own, so a
 * kept pair would render doubled.
 */
function stripQuotes(text) {
  return text.replace(/^["“](.*)["”]$/s, "$1").trim();
}

/** 225 words a minute, the rate Webflow's own field was filled in at. */
function estimateReadingMinutes(html) {
  const words = html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

function titleCase(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * RFC 4180 CSV, which the export needs: article bodies are quoted fields
 * containing commas, newlines and doubled `""` quotes throughout.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
