// Clears saved translations for some languages, so scripts/translate-site.ts
// can redo them from scratch.
//
// Why it exists: the first site-wide batch run (Oct 25, 2026) matched its
// results to the wrong segments (see the note at the top of translate-site.ts).
// About half of the es / fr / ru / ar segments, shared header and footer
// included, hold the translation of some other sentence. Those with markup or
// numbers are caught at render time; plain sentences are not, so the only safe
// fix is to drop the lot and translate again.
//
//   node --env-file=.env scripts/reset-translations.mjs --lang es,fr,ru,ar          # report only
//   node --env-file=.env scripts/reset-translations.mjs --lang es,fr,ru,ar --yes    # back up, then delete
//
// The backup (every deleted document, one per line) goes to
// ../synergy-sanity-backups/, next to the other Sanity backups. Restore with
//   npx sanity dataset import <file> production --replace
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@sanity/client";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const langs = (arg("lang") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!langs.length) {
  console.error("Pass --lang, e.g. --lang es,fr,ru,ar");
  process.exit(1);
}

const client = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2025-08-31",
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN,
});

const docs = await client.fetch(`*[_type == "translation" && lang in $langs]`, { langs });
for (const lang of langs) {
  const mine = docs.filter((d) => d.lang === lang);
  const segments = mine.reduce((n, d) => n + (d.segments?.length ?? 0), 0);
  console.log(`  ${lang}: ${mine.length} documents, ${segments.toLocaleString()} segments`);
}
if (!process.argv.includes("--yes")) {
  console.log("Report only. Re-run with --yes to back them up and delete them.");
  process.exit(0);
}
if (!process.env.SANITY_API_WRITE_TOKEN) {
  console.error("SANITY_API_WRITE_TOKEN is not set.");
  process.exit(1);
}

const dir = new URL("../../synergy-sanity-backups/", import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`translations-${langs.join("-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`, dir);
writeFileSync(file, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
console.log(`Backed up ${docs.length} documents to ${file.pathname}`);

for (let i = 0; i < docs.length; i += 100) {
  const tx = client.transaction();
  for (const d of docs.slice(i, i + 100)) tx.delete(d._id);
  await tx.commit({ visibility: "async" });
}
console.log(`Deleted ${docs.length} documents. Next: npx tsx --env-file=.env scripts/translate-site.ts --lang ${langs.join(",")}`);
