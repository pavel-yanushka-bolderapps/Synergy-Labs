// The Studio's left-hand menu. Every type keeps its default list, except
// Translation: hundreds of documents (one per page per language) are only
// findable sorted into folders the way the site itself is --
//
//   Translations > Spanish > Header, footer and menu
//                          > Main pages     (the static pages and the hubs)
//                          > SEO pages      > Services / Locations / Landing pages / Case studies
//                          > Blog           (the blog index, its pages and every post)
//
// The folders are queries on the document's English `path`, so a page that is
// translated for the first time shows up in the right one by itself.
import type { StructureBuilder, StructureResolver } from "sanity/structure";
import { LANGUAGES, type Language } from "../lib/i18n/languages";

// The shared document's path and id, as src/lib/i18n/store.ts writes them.
// Not imported from there: it pulls in node:crypto, which the browser Studio
// cannot load.
const SHARED_PATH = "*";
const sharedId = (lang: string) => `translation-${lang}-shared`;

const under = (prefix: string) => `string::startsWith(path, "${prefix}")`;

const SEO_FOLDERS = [
  { id: "services", title: "Services", filter: under("/our-services/") },
  { id: "locations", title: "Locations", filter: under("/locations/") },
  { id: "landing", title: "Landing pages", filter: under("/top-") },
  { id: "case-studies", title: "Case studies", filter: under("/projects/") },
];
const BLOG = `(path == "/blog" || ${under("/blog/")})`;
// Whatever is not shared, blog or an SEO page: the static pages, plus the
// /our-services and /locations hubs and the 404 page.
const MAIN = `path != "${SHARED_PATH}" && !${BLOG} && !(${SEO_FOLDERS.map((f) => f.filter).join(" || ")})`;

function pages(S: StructureBuilder, lang: Language, id: string, title: string, filter: string) {
  return S.listItem()
    .id(id)
    .title(title)
    .child(
      S.documentList()
        .id(`${lang.code}-${id}`)
        .title(`${title} (${lang.name})`)
        .schemaType("translation")
        .filter(`_type == "translation" && lang == $lang && ${filter}`)
        .params({ lang: lang.code })
        .defaultOrdering([{ field: "path", direction: "asc" }])
    );
}

function language(S: StructureBuilder, lang: Language) {
  return S.listItem()
    .id(lang.code)
    .title(`${lang.name} (${lang.code})`)
    .child(
      S.list()
        .id(`translations-${lang.code}`)
        .title(lang.name)
        .items([
          S.listItem()
            .id("shared")
            .title("Header, footer and menu")
            .child(S.document().schemaType("translation").documentId(sharedId(lang.code))),
          pages(S, lang, "main", "Main pages", MAIN),
          S.listItem()
            .id("seo")
            .title("SEO pages")
            .child(
              S.list()
                .id(`${lang.code}-seo`)
                .title(`SEO pages (${lang.name})`)
                .items(SEO_FOLDERS.map((f) => pages(S, lang, f.id, f.title, f.filter)))
            ),
          pages(S, lang, "blog", "Blog", BLOG),
        ])
    );
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      ...S.documentTypeListItems().filter((item) => item.getId() !== "translation"),
      S.divider(),
      S.listItem()
        .id("translations")
        .title("Translations")
        .child(
          S.list()
            .id("translations")
            .title("Translations")
            .items(LANGUAGES.map((lang) => language(S, lang)))
        ),
    ]);
