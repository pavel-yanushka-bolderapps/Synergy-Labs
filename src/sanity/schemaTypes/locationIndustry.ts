import { defineField, defineType } from "sanity";

// One row in a location page's "Industries we serve" section.
//
// Same arrangement as locationService: one document per record, most written
// for a single city, picked by the office through the `industries` field on
// location.ts. Which industries an office serves genuinely varies -- New York
// has On-Demand & Logistics, Boston has Biotech -- so this is not one list
// repeated 26 times.
export const locationIndustry = defineType({
  name: "locationIndustry",
  title: "Location industry",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: 'The row heading, e.g. "FinTech".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      description:
        "Used to match this industry to the offices that serve it. Not a URL -- these have no page of their own.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      description: "The illustration beside the copy.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 6,
      description:
        "Write it city-neutral where you can -- an office that needs to name its own city can override it.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description: "Lower numbers show first, when an office has not set its own order.",
      validation: (Rule) => Rule.integer(),
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrder",
      by: [
        { field: "order", direction: "asc" },
        { field: "title", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "description", media: "image" },
  },
});
