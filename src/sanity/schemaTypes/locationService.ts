import { defineField, defineType } from "sanity";

// One card in a location page's "Our services" row.
//
// Separate documents rather than a field on the office, mirroring the Webflow
// collection they came from: most are written for one city ("Our NYC iOS team
// builds...") and a handful are shared across all of them. An office picks the
// ones it offers via the `services` field on location.ts.
//
// The override fields on that pick exist for the shared records -- the
// per-city ones already say what they need to.
export const locationService = defineType({
  name: "locationService",
  title: "Location service",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: 'The card heading, e.g. "Custom iOS App Development".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      description:
        "Used to match this service to the offices that offer it. Not a URL -- these have no page of their own.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      description: "Shown beside the copy, cropped to fill a wide box.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 8,
      description:
        "The paragraph beside the image. Write it city-neutral where you can -- an office that needs different wording can override it on its own document.",
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
