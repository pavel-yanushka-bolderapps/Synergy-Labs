// Moves every file the blog bodies still load from Webflow's CDN
// (cdn.prod.website-files.com and friends) into Sanity's asset store, and
// rewrites the posts to point at the copies.
//
// Why: those URLs belong to the Webflow site. They keep working while it
// exists, and break when it is cancelled or its hosting lapses -- ~1,000
// images across ~240 posts would go blank at once.
//
//   node scripts/migrate-webflow-assets.mjs --dry-run   # count, change nothing
//   node scripts/migrate-webflow-assets.mjs             # upload + rewrite
//
// Resumable. Each uploaded file is recorded in
// scripts/data/webflow/asset-map.json as soon as it lands, so a run that is
// interrupted picks up where it stopped, and a second full run uploads
// nothing (Sanity also dedupes identical files by content hash).
//
// Safe to re-run, and reversible: before touching any post it writes the
// current version of every post it will change to
// ../synergy-sanity-backups/blog-before-asset-migration-<timestamp>.ndjson.
// It also rewrites scripts/data/blog-articles.json -- the repo copy the site
// falls back to when Sanity is unreachable -- with the same map.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const API_VERSION = "2025-08-31";
const CONCURRENCY = 4;
const dryRun = process.argv.includes("--dry-run");

const WEBFLOW_URL =
  /https?:\/\/(?:cdn\.prod\.website-files\.com|assets-global\.website-files\.com|uploads-ssl\.webflow\.com|[a-z0-9-]+\.website-files\.com)\/[^\s"'<>)\\]+/g;

const MAP_FILE = new URL("./data/webflow/asset-map.json", import.meta.url);
const ARTICLES_FILE = new URL("./data/blog-articles.json", import.meta.url);
const BACKUP_DIR = new URL("../../synergy-sanity-backups/", import.meta.url);

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;
if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token) fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role).");

const api = `https://${projectId}.api.sanity.io/v${API_VERSION}`;
const auth = { Authorization: `Bearer ${token}` };

// --- 1. Which posts, which files ------------------------------------------
const query = encodeURIComponent(
  '*[_type == "blogPost" && !(_id in path("drafts.**"))]{ _id, _rev, "slug": slug.current, articleHtml }'
);
const res = await fetch(`${api}/data/query/${dataset}?query=${query}`, { headers: auth });
if (!res.ok) fail(`Query failed: ${res.status} ${await res.text()}`);
// Filtered here rather than in GROQ: `match` tokenises, and missed posts.
const posts = (await res.json()).result.filter((post) => new RegExp(WEBFLOW_URL.source).test(post.articleHtml ?? ""));

const urls = new Set(posts.flatMap((post) => post.articleHtml.match(WEBFLOW_URL) ?? []));
const assetMap = existsSync(MAP_FILE) ? JSON.parse(await readFile(MAP_FILE, "utf8")) : {};
const todo = [...urls].filter((url) => !assetMap[url]);

console.log(`${posts.length} posts reference ${urls.size} Webflow files; ${todo.length} not uploaded yet.`);
if (dryRun) process.exit(0);

// --- 2. Upload ---------------------------------------------------------------
const failed = [];
let done = 0;

async function upload(url) {
  const source = await fetch(url);
  if (!source.ok) throw new Error(`download ${source.status}`);
  const type = source.headers.get("content-type") || "application/octet-stream";
  // Webflow names files "<24-hex id>_<original name>"; keep the original name.
  const filename = decodeURIComponent(new URL(url).pathname.split("/").pop()).replace(/^[0-9a-f]{24}_/, "");
  const kind = type.startsWith("image/") ? "images" : "files";
  const up = await fetch(`${api}/assets/${kind}/${dataset}?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": type },
    body: Buffer.from(await source.arrayBuffer()),
  });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
  return (await up.json()).document.url;
}

let saving = Promise.resolve();
const saveMap = () => (saving = saving.then(() => writeFile(MAP_FILE, JSON.stringify(assetMap, null, 2) + "\n")));

const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        assetMap[url] = await upload(url);
        await saveMap();
      } catch (err) {
        failed.push(`${url}  ${err.message}`);
      }
      if (++done % 50 === 0) console.log(`  ${done}/${todo.length} uploaded`);
    }
  })
);
await saving;

if (failed.length) {
  console.log(`\n${failed.length} files could not be moved (their posts keep the Webflow URL for now):`);
  for (const line of failed) console.log(`  ${line}`);
}

// --- 3. Rewrite ----------------------------------------------------------------
const rewrite = (html) => html.replace(WEBFLOW_URL, (url) => assetMap[url] ?? url);

const changed = posts.filter((post) => rewrite(post.articleHtml) !== post.articleHtml);

await mkdir(BACKUP_DIR, { recursive: true });
const backup = new URL(`blog-before-asset-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`, BACKUP_DIR);
await writeFile(backup, changed.map((post) => JSON.stringify(post)).join("\n") + "\n");
console.log(`\nBacked up ${changed.length} posts to ${backup.pathname}`);

// ifRevisionID: a post edited in the Studio since it was read is skipped
// rather than overwritten; re-run the script to pick it up.
for (let i = 0; i < changed.length; i += 50) {
  const mutations = changed.slice(i, i + 50).map((post) => ({
    patch: { id: post._id, ifRevisionID: post._rev, set: { articleHtml: rewrite(post.articleHtml) } },
  }));
  const write = await fetch(`${api}/data/mutate/${dataset}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  if (!write.ok) fail(`Mutation failed: ${write.status} ${await write.text()}`);
}
console.log(`Rewrote ${changed.length} posts in Sanity.`);

const articles = JSON.parse(await readFile(ARTICLES_FILE, "utf8"));
for (const slug of Object.keys(articles)) articles[slug] = rewrite(articles[slug]);
await writeFile(ARTICLES_FILE, JSON.stringify(articles)); // kept minified, as it ships
console.log("Rewrote scripts/data/blog-articles.json to match.");

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
