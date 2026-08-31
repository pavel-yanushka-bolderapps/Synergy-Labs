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
