import { defineField, defineType } from "sanity";

// One category in a location page's "Technologies we work with" section --
// "Mobile", "Backend", "Databases" and so on, each with the stack under it.
//
// Unlike the services and industries, these really are shared: all seven
// records are identical across every office that shows the section, because
// the stack is the company's, not the city's. An office that needs its own
// wording uses the `techStack` rich-text field on location.ts instead, which
// takes over the whole section.
export const locationTechnology = defineType({
  name: "locationTechnology",
  title: "Location technology",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Category",
      type: "string",
      description: 'The heading for this group, e.g. "Cloud & Infrastructure".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      description: "Used to match this category to the offices that list it. Not a URL.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "technologies",
      title: "Technologies",
      type: "text",
      rows: 3,
      description: 'The list under the heading, e.g. "AWS, Google Cloud Platform, Firebase, Azure".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description: "Lower numbers show first.",
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
    select: { title: "title", subtitle: "technologies" },
  },
});
