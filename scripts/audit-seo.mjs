// Pre-launch SEO audit. Reads dist/client after `npm run build` and checks the
// things that cost traffic when a site changes platform.
//
//   npm run build && node scripts/audit-seo.mjs
//   node scripts/audit-seo.mjs --legacy   # also check old-URL coverage
//
// Exits 1 if any ERROR-level check fails, so it can gate a deploy.
//
// Deliberately dependency-free and regex-based: it reads the shipped HTML, not
// the source, so it catches anything that goes wrong between the two -- which
// is exactly the class of bug that makes a migration lose rankings.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = "dist/client";
const SITE = "https://www.synergylabs.co";
const checkLegacy = process.argv.includes("--legacy");

const errors = [];
const warnings = [];
const err = (page, msg) => errors.push({ page, msg });
const warn = (page, msg) => warnings.push({ page, msg });

// --- Collect every built page ---------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "index.html" || entry === "404.html") out.push(full);
  }
  return out;
}

const files = walk(DIST);
const pages = new Map();

const pick = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const rel = relative(DIST, file);
  const route =
    rel === "404.html" ? "/404" : "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
  const head = html.slice(0, html.indexOf("</head>"));
  const body = html.slice(html.indexOf("<body"));

  pages.set(route, {
    file,
    html,
    title: pick(head, /<title>([\s\S]*?)<\/title>/),
    description: pick(head, /<meta name="description" content="([^"]*)"/),
    canonical: pick(head, /<link rel="canonical" href="([^"]*)"/),
    robots: pick(head, /<meta name="robots" content="([^"]*)"/),
    ogTitle: pick(head, /<meta property="og:title" content="([^"]*)"/),
    ogImage: pick(head, /<meta property="og:image" content="([^"]*)"/),
    ogUrl: pick(head, /<meta property="og:url" content="([^"]*)"/),
    h1s: [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    ),
    links: [...body.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]),
    imgsNoAlt: [...body.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)].length,
  });
}

const routes = new Set(pages.keys());
const isIndexable = (p) => !p.robots || !p.robots.includes("noindex");
/** Compare URLs without letting a trailing slash decide the answer. */
const trim = (url) => url.replace(/\/+$/, "");

// --- Per-page checks -------------------------------------------------------
for (const [route, p] of pages) {
  if (route === "/404") continue;

  if (!p.title) err(route, "no <title>");
  else if (p.title.length > 60) warn(route, `title is ${p.title.length} chars (>60, will truncate)`);

  if (!p.description) err(route, "no meta description");
  else if (p.description.length > 160)
    warn(route, `description is ${p.description.length} chars (>160, will truncate)`);
  else if (p.description.length < 50)
    warn(route, `description is only ${p.description.length} chars`);

  if (!p.canonical) err(route, "no canonical");
  else if (!p.canonical.startsWith("http")) err(route, `canonical is not absolute: ${p.canonical}`);

  if (!p.ogTitle) err(route, "no og:title");
  if (!p.ogImage) err(route, "no og:image");
  if (p.ogUrl && p.canonical && p.ogUrl !== p.canonical)
    warn(route, "og:url and canonical disagree");

  if (p.h1s.length === 0) err(route, "no <h1>");
  else if (p.h1s.length > 1) warn(route, `${p.h1s.length} <h1> elements`);

  if (p.imgsNoAlt > 0) warn(route, `${p.imgsNoAlt} <img> without alt`);

  // Invisible click-to-edit markers must never reach <head>.
  const head = p.html.slice(0, p.html.indexOf("</head>"));
  if (/[​‌‍﻿⁠]|[\uDB40][\uDC00-\uDFFF]/.test(head))
    err(route, "stega/invisible characters in <head>");

  for (const href of new Set(p.links)) {
    if (href.startsWith("/_astro") || href.startsWith("/api/") || href.startsWith("/studio")) continue;
    if (/\.[a-z0-9]{2,5}$/i.test(href)) continue; // asset, not a page
    const normalized = href.replace(/\/$/, "") || "/";
    if (!routes.has(normalized)) err(route, `links to a page that does not exist: ${href}`);
  }
}

// --- Duplicates ------------------------------------------------------------
for (const field of ["title", "description", "canonical"]) {
  const seen = new Map();
  for (const [route, p] of pages) {
    if (route === "/404" || !isIndexable(p) || !p[field]) continue;
    // A page whose canonical points at a *different* URL has already declared
    // itself a duplicate -- that is the fix, not the fault. Skip it, or every
    // deliberately canonicalised variant (e.g. /top-ai-developers-us) reports
    // as an error forever.
    //
    // Both sides are normalised before comparing. Canonicals are emitted with
    // a trailing slash and routes are collected without one, so comparing
    // them raw makes every page look canonicalised elsewhere -- which silently
    // skipped every duplicate check and made this audit report a clean bill of
    // health while checking nothing.
    if (p.canonical && trim(p.canonical) !== trim(`${SITE}${route}`)) continue;
    if (!seen.has(p[field])) seen.set(p[field], []);
    seen.get(p[field]).push(route);
  }
  for (const [value, list] of seen) {
    if (list.length > 1)
      err(list[0], `duplicate ${field} on ${list.length} indexable pages: ${list.join(", ")}`);
  }
}

// --- Sitemap ---------------------------------------------------------------
const sitemapFiles = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
const sitemapUrls = new Set();
for (const f of sitemapFiles)
  for (const m of readFileSync(join(DIST, f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g))
    sitemapUrls.add(m[1].replace(SITE, "").replace(/\/$/, "") || "/");

if (sitemapUrls.size === 0) errors.push({ page: "sitemap", msg: "no sitemap entries found" });

for (const [route, p] of pages) {
  if (route === "/404") continue;
  const inSitemap = sitemapUrls.has(route);
  if (isIndexable(p) && !inSitemap) err(route, "indexable but missing from the sitemap");
  if (!isIndexable(p) && inSitemap) err(route, "noindex but listed in the sitemap");
}

// --- Legacy URL coverage ---------------------------------------------------
if (checkLegacy) {
  // Read the real config rather than grepping it, so this cannot drift from
  // what actually ships.
  const config = (await import("../astro.config.mjs")).default;
  const redirectMap = config.redirects ?? {};
/** Sources carry a `{/}?` optional-slash suffix; strip it to get the path. */
const sourcePath = (source) => source.replace(/\{\/\}\?$/, "").replace(/\/$/, "");
  const redirectSources = new Set(Object.keys(redirectMap).map(sourcePath));

  // The Vercel adapter emits redirects ahead of `handle: filesystem`, so a
  // redirect whose source is also a real route takes precedence and the page
  // becomes unreachable. This is the single way this map can break the site,
  // and it fails silently -- the build succeeds and the page just stops
  // existing. Most likely when a /top-* landing is finally seeded and its
  // stopgap redirect is left behind.
  for (const source of redirectSources) {
    if (routes.has(source))
      errors.push({
        page: source,
        msg: "redirect source is also a real page — the redirect wins and the page is unreachable",
      });
  }

  // A redirect that lands on a 404, or on another redirect, wastes the link
  // equity it was added to preserve.
  for (const [source, target] of Object.entries(redirectMap)) {
    const dest = (typeof target === "string" ? target : target.destination).replace(/\/$/, "");
    if (redirectSources.has(dest))
      errors.push({ page: sourcePath(source), msg: `redirects to another redirect: ${dest}` });
    else if (!routes.has(dest))
      errors.push({ page: sourcePath(source), msg: `redirects to a page that does not exist: ${dest}` });
  }

  const skip = new Set([
    "30", "401", "404", "draft", "slider", "styles", "saved-parts",
    "home-pagespeed-test", "index", "web-app-development-copy",
  ]);

  const legacy = readdirSync("webflow-export")
    .filter((f) => f.endsWith(".html") && !f.startsWith("detail_"))
    .map((f) => f.replace(/\.html$/, ""))
    .filter((f) => !skip.has(f));

  for (const dir of ["our-services", "projects/casestudy"]) {
    const p = join("webflow-export", dir);
    if (existsSync(p))
      for (const f of readdirSync(p))
        if (f.endsWith(".html")) legacy.push(`${dir}/${f.replace(/\.html$/, "")}`);
  }

  for (const slug of legacy.sort()) {
    const url = "/" + slug;
    if (routes.has(url) || redirectSources.has(url)) continue;
    errors.push({ page: url, msg: "live Webflow URL with no page and no redirect — will 404" });
  }
}

// --- Report ----------------------------------------------------------------
const group = (list) => {
  const byMsg = new Map();
  for (const { page, msg } of list) {
    const key = msg.replace(/: .*/, "").replace(/\d+/g, "N");
    if (!byMsg.has(key)) byMsg.set(key, []);
    byMsg.get(key).push({ page, msg });
  }
  return byMsg;
};

const print = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length})`);
  for (const [key, items] of group(list)) {
    console.log(`\n  ${key} — ${items.length}`);
    for (const { page, msg } of items.slice(0, 8)) console.log(`    ${page}  ${msg}`);
    if (items.length > 8) console.log(`    ... and ${items.length - 8} more`);
  }
};

console.log(`Audited ${pages.size} pages in ${DIST}`);
console.log(`  indexable: ${[...pages.values()].filter(isIndexable).length - 1}`);
console.log(`  noindex:   ${[...pages.values()].filter((p) => !isIndexable(p)).length}`);
console.log(`  sitemap:   ${sitemapUrls.size}`);

print("WARNINGS", warnings);
print("ERRORS", errors);

if (!errors.length && !warnings.length) console.log("\nAll checks passed.");
else console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);

process.exit(errors.length ? 1 : 0);
