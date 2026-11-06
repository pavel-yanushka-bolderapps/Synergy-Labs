// Where translations live: `translation` documents in Sanity, one per page per
// language plus one per language for the shared header/footer/nav text. Each
// holds the English segments and their translations, so an editor can correct
// any of them in the Studio (see src/sanity/schemaTypes/translation.ts), and a
// segment is only ever sent to Claude once.
import { createClient, type SanityClient } from "@sanity/client";
import { createHash } from "node:crypto";

export interface Segment {
  _key: string;
  source: string;
  text: string;
}

export interface TranslationDoc {
  _id: string;
  _type: "translation";
  lang: string;
  /** The English path, or "*" for the shared document. */
  path: string;
  segments: Segment[];
}

export const SHARED_PATH = "*";

const hash = (s: string, length: number) => createHash("sha1").update(s).digest("hex").slice(0, length);

export const segmentKey = (source: string) => hash(source, 16);

/** No dots: Sanity treats ids containing one as private, unreadable without a token. */
export const docId = (lang: string, path: string) =>
  path === SHARED_PATH ? `translation-${lang}-shared` : `translation-${lang}-${hash(path, 20)}`;

let client: SanityClient | undefined;

function sanity(): SanityClient {
  client ??= createClient({
    projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
    dataset: process.env.PUBLIC_SANITY_DATASET || "production",
    apiVersion: "2025-08-31",
    useCdn: false,
    perspective: "published",
    // Needs the Editor role: pages write the segments they translate.
    token: process.env.SANITY_API_WRITE_TOKEN,
  });
  return client;
}

/** The page's own translations and the shared ones, as English -> translation. */
export async function loadTranslations(lang: string, path: string) {
  const docs = await sanity().fetch<TranslationDoc[]>(`*[_id in $ids]{_id, path, segments}`, {
    ids: [docId(lang, path), docId(lang, SHARED_PATH)],
  });
  const toMap = (doc?: TranslationDoc) => new Map((doc?.segments ?? []).map((s) => [s.source, s.text]));
  return {
    page: toMap(docs.find((d) => d.path !== SHARED_PATH)),
    shared: toMap(docs.find((d) => d.path === SHARED_PATH)),
  };
}

const toSegments = (map: Map<string, string>): Segment[] =>
  [...map].map(([source, text]) => ({ _key: segmentKey(source), source, text }));

/**
 * Saves a page's translations. `page` is the complete set for the page as it
 * is now, so segments the English no longer has drop out. Shared segments
 * are only ever added: other pages may still use them.
 */
export async function saveTranslations(
  lang: string,
  path: string,
  page: Map<string, string>,
  newShared: Map<string, string>
) {
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    console.warn("[translate] SANITY_API_WRITE_TOKEN is not set; translations are not saved.");
    return;
  }
  const sharedId = docId(lang, SHARED_PATH);
  // Another page may have added some of these since this one read the shared
  // document; appending them again would duplicate their _keys.
  if (newShared.size) {
    const have = await sanity().fetch<string[]>(`*[_id == $id][0].segments[]._key`, { id: sharedId });
    for (const key of have ?? []) {
      for (const source of newShared.keys()) if (segmentKey(source) === key) newShared.delete(source);
    }
  }
  const tx = sanity().transaction();
  tx.createOrReplace({ _id: docId(lang, path), _type: "translation", lang, path, segments: toSegments(page) });
  if (newShared.size) {
    tx.createIfNotExists({ _id: sharedId, _type: "translation", lang, path: SHARED_PATH, segments: [] });
    tx.patch(sharedId, (p) => p.setIfMissing({ segments: [] }).append("segments", toSegments(newShared)));
  }
  await tx.commit({ visibility: "async" });
}
