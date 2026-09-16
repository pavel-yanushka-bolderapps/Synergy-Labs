import { defineField, defineType } from "sanity";

// An office, as shown on /locations and in the homepage's Locations section.
//
// These used to be a hardcoded array in src/content/home.ts. The list is the
// kind of thing that changes without a deploy -- offices open, addresses move
// -- so each one is now a document. The static array stays as the fallback
// for when Sanity isn't configured or is unreachable at build time; see
// getLocations() in src/lib/sanity.ts.
export const location = defineType({
  name: "location",
  title: "Location",
  type: "document",
  fields: [
    defineField({
      name: "city",
      title: "City",
      type: "string",
      description: 'The name printed on the card, e.g. "Miami" or "New York City".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "address",
      title: "Address",
      type: "string",
      description: 'The street address, e.g. "78 SW 7th St, Miami, FL 33130".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      description:
        "A photo of the city. Cards are wide, and the image is cropped to fill, so set the hotspot on the part of the skyline that matters.",
    }),
    defineField({
      name: "isHeadquarters",
      title: "Headquarters",
      type: "boolean",
      initialValue: false,
      description:
        "Adds the HEADQUARTERS badge. Ordering is what actually decides which offices get the two big cards at the top -- this only controls the badge.",
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description:
        "Lower numbers show first. The first two get the wide cards, the next three the row below, and everything after that goes behind the “Other locations” button -- so this field decides what a visitor sees before expanding.",
      validation: (Rule) => Rule.integer(),
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrder",
      by: [
        { field: "order", direction: "asc" },
        { field: "city", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: { title: "city", subtitle: "address", media: "image", hq: "isHeadquarters" },
    prepare({ title, subtitle, media, hq }) {
      return { title: hq ? `${title} (HQ)` : title, subtitle, media };
    },
  },
});
