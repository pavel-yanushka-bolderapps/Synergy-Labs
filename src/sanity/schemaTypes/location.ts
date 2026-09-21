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
      group: "card",
    }),
    defineField({
      name: "address",
      title: "Address",
      type: "string",
      description: 'The street address, e.g. "78 SW 7th St, Miami, FL 33130".',
      validation: (Rule) => Rule.required(),
      group: "card",
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      description:
        "A photo of the city. Cards are wide, and the image is cropped to fill, so set the hotspot on the part of the skyline that matters.",
      group: "card",
    }),
    defineField({
      name: "isHeadquarters",
      title: "Headquarters",
      type: "boolean",
      initialValue: false,
      description:
        "Adds the HEADQUARTERS badge. Ordering is what actually decides which offices get the two big cards at the top -- this only controls the badge.",
      group: "card",
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "city", maxLength: 96 },
      description: 'The URL for this office\'s own page, e.g. "miami" gives /locations/miami.',
      validation: (Rule) => Rule.required(),
      group: "card",
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description:
        "Lower numbers show first. The first two get the wide cards, the next three the row below, and everything after that goes behind the “Other locations” button -- so this field decides what a visitor sees before expanding.",
      validation: (Rule) => Rule.integer(),
      group: "card",
    }),

    // --- The office's own page (/locations/[slug]) -------------------------
    //
    // All optional. The source collection is unevenly filled -- 21 offices
    // have the full treatment, the five international ones carry only a
    // heading and a couple of paragraphs -- and the page renders a section
    // only when its content exists, so an office with nothing here still gets
    // a valid short page rather than a run of empty headings.

    defineField({
      name: "mainHeading",
      title: "Page: heading",
      type: "string",
      description:
        'The <h1> on this office\'s page, e.g. "Miami\'s Trusted Partner for Mobile App and Web Development". Leave blank and it falls back to the city name.',
      group: "page",
    }),
    defineField({
      name: "mainDescription",
      title: "Page: intro",
      type: "text",
      rows: 5,
      description: "The paragraph under the heading.",
      group: "page",
    }),
    defineField({
      name: "description",
      title: "Page: overview",
      type: "text",
      rows: 5,
      description: "A second, longer paragraph further down the page.",
      group: "page",
    }),
    defineField({
      name: "mapCode",
      title: "Page: map embed parameters",
      type: "text",
      rows: 3,
      description:
        'Just the `pb=` value from a Google Maps embed URL -- the part starting "!1m18!1m12". The page builds the iframe around it. Leave blank to skip the map.',
      group: "page",
    }),
    defineField({
      name: "jsonLd",
      title: "Page: LocalBusiness structured data",
      type: "text",
      rows: 6,
      description:
        "Schema.org JSON-LD, emitted verbatim into the page head for search engines. Must be valid JSON -- a broken value is dropped rather than printed.",
      group: "page",
    }),

    defineField({ name: "servicesHeading", title: "Services: heading", type: "string", group: "page" }),
    defineField({ name: "servicesDescription", title: "Services: description", type: "text", rows: 4, group: "page" }),
    defineField({
      name: "services",
      title: "Services: cards",
      type: "array",
      group: "page",
      description:
        "Which services this office offers. Pick from the shared catalogue; the card takes its title, image and copy from there. Fill in an override only where this city needs different wording -- naming the city inside the paragraph, say.",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "service",
              title: "Service",
              type: "reference",
              to: [{ type: "locationService" }],
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "titleOverride",
              title: "Title (override)",
              type: "string",
              description: "Leave blank to use the catalogue title.",
            }),
            defineField({
              name: "descriptionOverride",
              title: "Description (override)",
              type: "text",
              rows: 8,
              description: "Leave blank to use the catalogue copy.",
            }),
          ],
          preview: {
            select: { title: "service.title", override: "titleOverride", media: "service.image" },
            prepare({ title, override, media }) {
              return {
                title: override || title,
                subtitle: override ? "Title overridden for this office" : undefined,
                media,
              };
            },
          },
        },
      ],
    }),
    defineField({ name: "industriesHeading", title: "Industries: heading", type: "string", group: "page" }),
    defineField({ name: "industriesDescription", title: "Industries: description", type: "text", rows: 4, group: "page" }),
    defineField({
      name: "industries",
      title: "Industries: rows",
      type: "array",
      group: "page",
      description:
        "Which industries this office serves. Pick from the shared catalogue; fill in an override only where this city needs different wording.",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "industry",
              title: "Industry",
              type: "reference",
              to: [{ type: "locationIndustry" }],
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "titleOverride",
              title: "Title (override)",
              type: "string",
              description: "Leave blank to use the catalogue title.",
            }),
            defineField({
              name: "descriptionOverride",
              title: "Description (override)",
              type: "text",
              rows: 6,
              description: "Leave blank to use the catalogue copy.",
            }),
          ],
          preview: {
            select: { title: "industry.title", override: "titleOverride", media: "industry.image" },
            prepare({ title, override, media }) {
              return {
                title: override || title,
                subtitle: override ? "Title overridden for this office" : undefined,
                media,
              };
            },
          },
        },
      ],
    }),
    defineField({ name: "processHeading", title: "Process: heading", type: "string", group: "page" }),
    defineField({ name: "processDescription", title: "Process: description", type: "text", rows: 4, group: "page" }),
    defineField({ name: "whyChooseUsHeading", title: "Why choose us: heading", type: "string", group: "page" }),
    defineField({ name: "whyChooseUsDescription", title: "Why choose us: description", type: "text", rows: 5, group: "page" }),
    defineField({ name: "serviceAreaHeading", title: "Service area: heading", type: "string", group: "page" }),
    defineField({
      name: "serviceAreaDescription",
      title: "Service area: description",
      type: "text",
      rows: 5,
      description: "Accepts basic HTML -- the original entries are paragraphs and lists.",
      group: "page",
    }),
    defineField({ name: "faqHeading", title: "FAQ: heading", type: "string", group: "page" }),

    // --- Technologies ------------------------------------------------------
    // The section shows whichever of these two is filled in, `techStack`
    // winning: a few offices were written their own stack rather than the
    // shared categories. Leave both blank and the section is skipped.
    defineField({
      name: "technologiesHeading",
      title: "Technologies: heading",
      type: "string",
      description: 'Leave blank to skip the section entirely, e.g. "Technologies We Work With".',
      group: "page",
    }),
    defineField({
      name: "technologies",
      title: "Technologies: categories",
      type: "array",
      group: "page",
      description:
        "The shared stack categories to list. Ignored when a bespoke stack is written below.",
      of: [{ type: "reference", to: [{ type: "locationTechnology" }] }],
    }),
    defineField({
      name: "techStack",
      title: "Technologies: bespoke stack",
      type: "text",
      rows: 10,
      description:
        "Accepts basic HTML -- h4 headings with a paragraph under each. Fill this in only when this office needs its own wording; it replaces the categories above.",
      group: "page",
    }),

    // --- Pricing -----------------------------------------------------------
    defineField({
      name: "pricingHeading",
      title: "Pricing: heading",
      type: "string",
      description:
        'Leave blank to skip the section, e.g. "Mobile App Development Cost in Dallas". Only a few offices publish pricing.',
      group: "page",
    }),
    defineField({
      name: "pricingTable",
      title: "Pricing: tiers",
      type: "text",
      rows: 8,
      description: "Accepts basic HTML -- one paragraph per tier, the tier name in bold.",
      group: "page",
    }),
    defineField({ name: "contactHeading", title: "Contact: heading", type: "string", group: "page" }),
    defineField({
      name: "contactDescription",
      title: "Contact: description",
      type: "text",
      rows: 4,
      description: "Accepts basic HTML.",
      group: "page",
    }),

    defineField({ name: "caseStudiesHeading", title: "Case studies: heading", type: "string", group: "page" }),
    defineField({
      name: "caseStudies",
      title: "Case studies",
      type: "array",
      group: "page",
      description:
        "Short write-ups of work done for clients near this office. Two is what the original pages carried, but any number renders.",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (Rule) => Rule.required() }),
            defineField({
              name: "body",
              title: "Body",
              type: "text",
              rows: 6,
              description: "Accepts basic HTML.",
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: { select: { title: "title", subtitle: "body" } },
        },
      ],
    }),
  ],
  groups: [
    { name: "card", title: "Card", default: true },
    { name: "page", title: "Own page" },
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
