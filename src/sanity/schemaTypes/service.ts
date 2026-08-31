import { defineField, defineType } from "sanity";

// A single card in the homepage "Services" grid (ServicesGrid.astro).
// Mirrors the shape of the items that used to live hardcoded in
// src/content/home.ts under `home.services.items`.
export const service = defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "href",
      title: "Link",
      type: "string",
      description: 'Where this card links to, e.g. "/our-services/web-app-development".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      description: "Optional -- shown bottom-right of the card. Cards without an image just show the text.",
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description: "Lower numbers show first in the grid.",
      validation: (Rule) => Rule.integer(),
    }),
    defineField({
      name: "heroDescription",
      title: "Detail page: hero description",
      type: "text",
      rows: 3,
      description:
        "Short paragraph shown under the heading on this service's own page. Leave blank and that page skips it.",
    }),
    defineField({
      name: "heroImage",
      title: "Detail page: hero image",
      type: "image",
      options: { hotspot: true },
      description: "Large illustration/photo shown next to the heading on this service's own page.",
    }),
    defineField({
      name: "bannerWords",
      title: "Detail page: scrolling banner words",
      type: "array",
      of: [{ type: "string" }],
      description:
        'Short phrases for the scrolling banner strip on this service\'s own page (e.g. "Custom Web Apps", "Progressive Web Apps (PWAs)"). Leave empty to skip the banner.',
    }),
    defineField({
      name: "features",
      title: "Detail page: feature cards",
      type: "array",
      description: 'Cards like "Responsive Front-End" shown in a row on this service\'s own page. Leave empty to skip.',
      of: [
        {
          type: "object",
          name: "feature",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (Rule) => Rule.required() }),
            defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true } }),
          ],
          preview: { select: { title: "title", media: "image" } },
        },
      ],
    }),
    defineField({
      name: "metaDescription",
      title: "Detail page: SEO description",
      type: "text",
      rows: 2,
      description: "Shown in search results and social previews for this service's own page.",
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "href", media: "image" },
  },
});
