// Seeds the blog into Sanity: the six `blogAuthor` documents (with their
// headshots) and the 316 `blogPost` documents, from the JSON that
// scripts/extract-blog-csv.mjs writes.
//
//   node scripts/extract-blog-csv.mjs      # first, if the CSV changed
//   node scripts/seed-blog.mjs --dry-run
//   node scripts/seed-blog.mjs
//
// Authors are written before posts, because each post references its author by
// id and a reference to a document that does not exist yet resolves to null.
//
// Re-runnable: ids are derived from the slug, so a second run updates rather
// than duplicates. Images are content-addressed by Sanity, so re-uploading the
// same headshot is a no-op that returns the existing asset.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const API_VERSION = "2025-08-31";
// The article bodies average ~19 KB and run to 57 KB, so the whole archive is
// about 6 MB -- well past what Sanity accepts in one mutation request. 25 at a
// time keeps each batch comfortably under a megabyte.
const BATCH_SIZE = 25;

const dryRun = process.argv.includes("--dry-run");

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const authors = JSON.parse(await readFile(new URL("./data/blog-authors.json", import.meta.url), "utf8"));
const posts = JSON.parse(await readFile(new URL("./data/blog-posts.json", import.meta.url), "utf8"));
const articles = JSON.parse(await readFile(new URL("./data/blog-articles.json", import.meta.url), "utf8"));

// Document ids are derived from the slug so that a re-run updates the same
// documents instead of creating a second copy of the archive.
const authorId = (slug) => boundedId(`blog-author-${slug}`);
const postId = (slug) => boundedId(`blog-post-${slug}`);

/**
 * Sanity rejects a document id longer than 128 characters, and three of the
 * imported slugs are keyword-stuffed enough to pass it (the worst is 162).
 *
 * Truncating alone could collide -- those three all start with a city name and
 * share long prefixes -- so the trimmed id carries a hash of the full one.
 * Derived from the slug, so it is stable across runs and a re-seed still
 * updates the same document rather than creating a second copy.
 */
const MAX_ID_LENGTH = 128;

function boundedId(id) {
  if (id.length <= MAX_ID_LENGTH) return id;
  const hash = createHash("sha1").update(id).digest("hex").slice(0, 8);
  return `${id.slice(0, MAX_ID_LENGTH - hash.length - 1)}-${hash}`;
}

// --- Authors -------------------------------------------------------------

console.log(`\nblogAuthor (${authors.length})`);
const authorMutations = [];

for (const author of authors) {
  if (dryRun) {
    console.log(`  ${author.slug.padEnd(28)} ${author.name}`);
    continue;
  }

  const assetId = author.image ? await uploadImage(author.image) : null;

  authorMutations.push({
    createOrReplace: {
      _id: authorId(author.slug),
      _type: "blogAuthor",
      name: author.name,
      slug: { _type: "slug", current: author.slug },
      ...(assetId
        ? { image: { _type: "image", asset: { _type: "reference", _ref: assetId } } }
        : {}),
    },
  });
  console.log(`  prepared ${author.slug.padEnd(28)}${assetId ? "" : " (no headshot)"}`);
}

// --- Posts ---------------------------------------------------------------

console.log(`\nblogPost (${posts.length})`);
const postMutations = [];
const missingArticle = [];

for (const post of posts) {
  const articleHtml = articles[post.slug];

  // A post with no body would build a page that is a title and nothing else,
  // which is worse than not having the page. Skip and report at the end.
  if (!articleHtml) {
    missingArticle.push(post.slug);
    continue;
  }

  postMutations.push({
    createOrReplace: {
      _id: postId(post.slug),
      _type: "blogPost",
      title: post.title,
      slug: { _type: "slug", current: post.slug },
      date: post.date,
      articleHtml,
      ...(post.previewText ? { previewText: post.previewText } : {}),
      ...(post.previewImageText ? { previewImageText: post.previewImageText } : {}),
      ...(post.template ? { template: post.template } : {}),
      ...(post.readingMinutes ? { readingMinutes: post.readingMinutes } : {}),
      ...(post.author
        ? { author: { _type: "reference", _ref: authorId(post.author) } }
        : {}),
    },
  });
}

if (dryRun) {
  console.log(`  ${postMutations.length} posts ready`);
  if (missingArticle.length) console.log(`  no article body: ${missingArticle.join(", ")}`);
  console.log("\n(dry run -- nothing written)");
  process.exit(0);
}

await mutate(authorMutations, "authors");

for (let i = 0; i < postMutations.length; i += BATCH_SIZE) {
  const batch = postMutations.slice(i, i + BATCH_SIZE);
  await mutate(batch, `posts ${i + 1}-${i + batch.length} of ${postMutations.length}`);
}

console.log(`\nWrote ${authorMutations.length} authors and ${postMutations.length} posts to ${projectId}/${dataset}.`);
if (missingArticle.length) {
  console.log(`Skipped ${missingArticle.length} with no article body: ${missingArticle.join(", ")}`);
}

// --- helpers ---

async function mutate(mutations, label) {
  if (mutations.length === 0) return;

  const res = await fetch(
    `https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mutations }),
    }
  );

  if (!res.ok) fail(`Mutation failed (${label}): ${res.status} ${await res.text()}`);
  console.log(`  wrote ${label}`);
}

async function uploadImage(publicPath) {
  const body = await readFile(new URL(`../public${publicPath}`, import.meta.url));
  const name = publicPath.split("/").pop();
  const contentType = name.endsWith(".avif") ? "image/avif" : "image/webp";

  const res = await fetch(
    `https://${projectId}.api.sanity.io/v${API_VERSION}/assets/images/${dataset}?filename=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
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
