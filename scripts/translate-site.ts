// Translates the whole site ahead of time through the Batch API -- half the
// price of the live path, and no visitor waits on Claude for a first render.
//
//   npx tsx --env-file=.env scripts/translate-site.ts            # estimate only
//   npx tsx --env-file=.env scripts/translate-site.ts --yes      # submit and save
//   ... --lang es,fr   --only /blog/foo,/about-us   --origin http://localhost:4321
//
// Needs ANTHROPIC_API_KEY and SANITY_API_WRITE_TOKEN (Editor). Safe to re-run:
// segments already in Sanity are skipped, so a second run only pays for what
// changed. Segments are deduplicated across the whole site first, so the
// header, footer and repeated blocks are translated once per language, not
// once per page.
//
// Batches usually finish within an hour (24h at most); the script polls until
// then. If it is interrupted, re-run with --batch <id> to collect the results.
import Anthropic from "@anthropic-ai/sdk";
import { LANGUAGES, isTranslatablePath, type Language } from "../src/lib/i18n/languages";
import { segmentPage } from "../src/lib/i18n/segments";
import { loadTranslations, saveTranslations } from "../src/lib/i18n/store";
import { CHUNK_SIZE, translationRequest, parseTranslations } from "../src/lib/i18n/claude";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const origin = arg("origin") ?? "https://www.synergylabs.co";
const langs = arg("lang") ? LANGUAGES.filter((l) => arg("lang")!.split(",").includes(l.code)) : LANGUAGES;
const only = arg("only")?.split(",");
const submit = process.argv.includes("--yes");

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

// 1. Every page's segments.
const sitemap = await (await fetch(`${origin}/sitemap-0.xml`)).text();
const paths =
  only ??
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter(isTranslatablePath);

const pages = new Map<string, { source: string; scope: "shared" | "page" }[]>();
await pool(paths, 8, async (path) => {
  const res = await fetch(origin + path);
  const html = await res.text();
  if (!res.ok || !/<html[^>]*\blang="en"/i.test(html)) return;
  pages.set(path, segmentPage(html).units.map(({ source, scope }) => ({ source, scope })));
});
console.log(`${pages.size} English pages read.`);

// 2. What each language is missing, deduplicated site-wide.
const existing = new Map<string, Map<string, { page: Map<string, string>; shared: Map<string, string> }>>();
const missing = new Map<string, Set<string>>();
for (const lang of langs) {
  const byPath = new Map<string, { page: Map<string, string>; shared: Map<string, string> }>();
  const need = new Set<string>();
  await pool([...pages.keys()], 8, async (path) => {
    const stored = await loadTranslations(lang.code, path);
    byPath.set(path, stored);
    for (const { source } of pages.get(path)!) {
      if (!stored.page.has(source) && !stored.shared.has(source)) need.add(source);
    }
  });
  existing.set(lang.code, byPath);
  missing.set(lang.code, need);
}

const totalChars = [...missing.values()].reduce((n, set) => n + [...set].join("").length, 0);
// ~4 characters a token in English; translations run 1.2-2x longer in tokens
// (Hindi, Arabic and Russian at the top). Batch is half the list price.
const inTok = totalChars / 4;
const outTok = inTok * 1.7;
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const model = translationRequest([], langs[0]).model;
const [pin, pout] = PRICES[model] ?? [4, 20];
for (const lang of langs) console.log(`  ${lang.code}: ${missing.get(lang.code)!.size} segments to translate`);
console.log(
  `~${(inTok / 1e6).toFixed(2)}M input / ~${(outTok / 1e6).toFixed(2)}M output tokens on ${model}: ` +
    `about $${(((inTok * pin + outTok * pout) / 1e6) * 0.5).toFixed(2)} at batch prices (rough).`
);

const client = new Anthropic();
let batchId = arg("batch");

if (!batchId) {
  if (!submit) {
    console.log("Estimate only. Re-run with --yes to submit the batch.");
    process.exit(0);
  }
  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
  const chunks = new Map<string, { lang: Language; segments: string[] }>();
  for (const lang of langs) {
    const list = [...missing.get(lang.code)!];
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const id = `${lang.code}-${i / CHUNK_SIZE}`;
      const segments = list.slice(i, i + CHUNK_SIZE);
      chunks.set(id, { lang, segments });
      requests.push({ custom_id: id, params: translationRequest(segments, lang) });
    }
  }
  if (!requests.length) {
    console.log("Nothing to translate.");
    process.exit(0);
  }
  const batch = await client.messages.batches.create({ requests });
  batchId = batch.id;
  console.log(`Submitted ${requests.length} requests as batch ${batchId}.`);
}

// 3. Wait, then collect.
for (;;) {
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status === "ended") break;
  console.log(`  ${batch.processing_status}: ${batch.request_counts.processing} processing, ${batch.request_counts.succeeded} done`);
  await new Promise((r) => setTimeout(r, 60_000));
}

// The segments each request carried are rebuilt from the custom_id, so
// --batch <id> works from a fresh run (as long as the site has not changed).
const results = new Map<string, Map<string, string>>(langs.map((l) => [l.code, new Map()]));
let failed = 0;
for await (const result of await client.messages.batches.results(batchId)) {
  const [code, index] = result.custom_id.split("-");
  const list = [...missing.get(code)!].slice(Number(index) * CHUNK_SIZE, (Number(index) + 1) * CHUNK_SIZE);
  if (result.result.type !== "succeeded") {
    failed++;
    continue;
  }
  try {
    for (const [s, t] of parseTranslations(result.result.message, list)) results.get(code)!.set(s, t);
  } catch (err) {
    failed++;
    console.error(`  ${result.custom_id}: unreadable response`, err);
  }
}
if (failed) console.log(`${failed} requests failed; their pages translate live on first visit, or re-run this script.`);

// 4. Save, page by page. Placeholder mismatches are caught at render time
//    (segments.ts) and fall back to English, so nothing is validated here.
for (const lang of langs) {
  const fresh = results.get(lang.code)!;
  const savedShared = new Set<string>();
  await pool([...pages.keys()], 4, async (path) => {
    const stored = existing.get(lang.code)!.get(path)!;
    const page = new Map<string, string>();
    const newShared = new Map<string, string>();
    for (const { source, scope } of pages.get(path)!) {
      const text = stored.page.get(source) ?? stored.shared.get(source) ?? fresh.get(source);
      if (text === undefined) continue;
      if (scope === "shared" && !stored.page.has(source)) {
        if (!stored.shared.has(source) && !savedShared.has(source)) {
          newShared.set(source, text);
          savedShared.add(source);
        }
      } else page.set(source, text);
    }
    if (page.size || newShared.size) await saveTranslations(lang.code, path, page, newShared);
  });
  console.log(`  ${lang.code}: saved ${fresh.size} new segments across ${pages.size} pages`);
}
console.log("Done. Cached translated pages refresh within the hour, or on the next publish.");
