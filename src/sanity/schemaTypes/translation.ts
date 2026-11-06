import { defineArrayMember, defineField, defineType } from "sanity";

// Machine translations of one page into one language, written by the site
// itself (src/lib/i18n/store.ts) the first time the page is requested in that
// language. Editors only ever need to fix a `text` -- publishing re-renders the
// translated page (src/lib/revalidate.ts). Changing a `source` does nothing
// useful: it is the English it matches against, and the next render puts the
// real one back.
//
// Numbered tags in the text (<1>...</1>, <2/>) are the page's links and
// formatting. Keep each one, around the words it should wrap; a text that
// loses one is ignored and the English shows instead.
export const translation = defineType({
  name: "translation",
  title: "Translation",
  type: "document",
  fields: [
    defineField({ name: "lang", title: "Language", type: "string", readOnly: true }),
    defineField({
      name: "path",
      title: "English page",
      type: "string",
      readOnly: true,
      description: '"*" is the header, footer and menu text shared by every page.',
    }),
    defineField({
      name: "segments",
      title: "Segments",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "segment",
          fields: [
            defineField({ name: "source", title: "English", type: "text", rows: 2, readOnly: true }),
            defineField({ name: "text", title: "Translation", type: "text", rows: 3 }),
          ],
          preview: { select: { title: "text", subtitle: "source" } },
        }),
      ],
    }),
  ],
  preview: {
    select: { lang: "lang", path: "path" },
    prepare: ({ lang, path }) => ({
      title: path === "*" ? "Header, footer and menu" : path,
      subtitle: String(lang ?? "").toUpperCase(),
    }),
  },
  orderings: [
    { title: "Page", name: "path", by: [{ field: "path", direction: "asc" }, { field: "lang", direction: "asc" }] },
  ],
});
