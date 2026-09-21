import { defineField, defineType } from "sanity";

// One article. 316 of these came across from the Webflow Blogs collection --
// see scripts/extract-blog-csv.mjs for the import and scripts/seed-blog.mjs
// for the write.
//
// On `articleHtml`: the body is stored as an HTML string rather than Portable
// Text. The archive is Webflow rich-text output including tables, <pre><code>
// blocks, <figure>/<figcaption> and inline spans, none of which survive a
// conversion to blocks intact, and there is no second copy to re-import from
// if a conversion goes wrong. The trade is a plain text area in the Studio
// instead of a rich-text editor. If that becomes the bottleneck, the upgrade
// path is a `body` Portable Text field added alongside this one that takes
// precedence when it is filled, so posts can migrate one at a time.
export const blogPost = defineType({
  name: "blogPost",
  title: "Blog post",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      description: "The URL: /blog/<slug>. Changing it breaks existing links.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      options: { dateFormat: "YYYY-MM-DD" },
      description:
        "The editorial date on the card. This is what the listing sorts by, not when the document was published.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "author",
      title: "Author",
      type: "reference",
      to: [{ type: "blogAuthor" }],
    }),
    defineField({
      name: "previewText",
      title: "Preview text",
      type: "text",
      rows: 3,
      description:
        "The standfirst under the title on the listing card, and the page's meta description. Two or three sentences.",
    }),
    defineField({
      name: "previewImageText",
      title: "Preview image text",
      type: "string",
      description:
        "Optional line drawn over the card artwork. Leave empty to show the title there instead -- which is what most posts do.",
    }),
    defineField({
      name: "template",
      title: "Card artwork",
      type: "string",
      description: "Which of the seven background templates the listing card uses.",
      options: {
        list: Array.from({ length: 7 }, (_, i) => ({
          title: `Template ${i + 1}`,
          value: `template-${i + 1}`,
        })),
      },
      initialValue: "template-1",
    }),
    defineField({
      name: "readingMinutes",
      title: "Time to read (minutes)",
      type: "number",
      description:
        "Leave empty and the site estimates it from the article length at 225 words a minute.",
      validation: (Rule) => Rule.integer().positive(),
    }),
    defineField({
      name: "articleHtml",
      title: "Article (HTML)",
      type: "text",
      rows: 30,
      description:
        "The body, as HTML. Rendered as-is, so anything pasted here runs on the page -- paste from a source you trust.",
      validation: (Rule) => Rule.required(),
    }),
  ],
  orderings: [
    {
      title: "Newest first",
      name: "dateDesc",
      by: [{ field: "date", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", date: "date", author: "author.name", media: "author.image" },
    prepare: ({ title, date, author, media }) => ({
      title,
      subtitle: [date, author].filter(Boolean).join(" — "),
      media,
    }),
  },
});
