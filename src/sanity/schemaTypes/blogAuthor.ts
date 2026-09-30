import { defineField, defineType } from "sanity";

// A byline. Its own document rather than a string on the post so that
// renaming someone, or swapping a headshot, is one edit instead of 200 --
// andrew-abbey alone is on most of the archive.
//
// Mirrors the Webflow Authors collection the posts referenced by slug. There
// are no /author/<slug> pages on this site yet; if they get built, this
// document already carries what they need.
export const blogAuthor = defineType({
  name: "blogAuthor",
  title: "Blog author",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      description: "Shown under the post title and on the listing cards.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      description:
        "Matches the Author column of the Webflow export, which is how the seeder attaches posts to bylines.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Headshot",
      type: "image",
      options: { hotspot: true },
      description: "Square -- it renders as a small circle.",
    }),
    defineField({
      name: "role",
      title: "Role",
      type: "string",
      description: 'Optional, e.g. "Chief Marketing Officer". Not shown on cards, only on the post page.',
    }),
  ],
  preview: {
    select: { title: "name", subtitle: "role", media: "image" },
  },
});
