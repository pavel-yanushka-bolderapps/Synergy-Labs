// Checks the legacy URL map against a running deployment.
//
//   node scripts/verify-redirects.mjs https://<preview>.vercel.app
//   node scripts/verify-redirects.mjs https://www.synergylabs.co
//
// audit-seo.mjs proves the redirects are in the build; this proves the edge
// actually serves them. Run it against the preview deployment BEFORE pointing
// DNS at it, and again after.
//
// Every source is requested twice, with and without a trailing slash, because
// the two compile to one route and only a live request settles whether the
// slashed form is really covered.

import { setTimeout as sleep } from "node:timers/promises";

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/verify-redirects.mjs <base-url>");
  process.exit(2);
}

const config = (await import("../astro.config.mjs")).default;
const redirects = config.redirects ?? {};

const failures = [];
const chains = [];
let checked = 0;

async function head(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // `manual` so the redirect itself is the result rather than being
      // followed -- the status code is the thing under test.
      return await fetch(url, { redirect: "manual", headers: { "user-agent": "redirect-audit" } });
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

/** Sources carry a `{/}?` optional-slash suffix; strip it to get the path. */
const sourcePath = (source) => source.replace(/\{\/\}\?$/, "").replace(/\/$/, "");

for (const [rawSource, target] of Object.entries(redirects)) {
  const source = sourcePath(rawSource);
  const destination = typeof target === "string" ? target : target.destination;
  const expected = typeof target === "string" ? 301 : target.status;

  for (const variant of [source, `${source}/`]) {
    checked++;
    const url = `${base}${variant}`;
    let res;
    try {
      res = await head(url);
    } catch (err) {
      failures.push(`${variant}  request failed: ${err.message}`);
      continue;
    }

    if (res.status !== expected) {
      failures.push(`${variant}  expected ${expected}, got ${res.status}`);
      continue;
    }

    const location = (res.headers.get("location") || "").replace(base, "");
    if (location.replace(/\/$/, "") !== destination.replace(/\/$/, "")) {
      failures.push(`${variant}  expected -> ${destination}, got -> ${location}`);
      continue;
    }

    // The destination must be a real page, not another hop.
    const final = await head(`${base}${destination}`);
    if (final.status >= 300) {
      chains.push(`${variant} -> ${destination} -> ${final.status}`);
    }
  }
}

console.log(`Checked ${checked} requests against ${base}`);

if (chains.length) {
  console.log(`\nCHAINS / DEAD DESTINATIONS (${chains.length})`);
  for (const c of chains) console.log(`  ${c}`);
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length})`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

console.log(chains.length ? "\nAll redirects resolve, but see the chains above." : "\nAll redirects correct.");
process.exit(chains.length ? 1 : 0);
