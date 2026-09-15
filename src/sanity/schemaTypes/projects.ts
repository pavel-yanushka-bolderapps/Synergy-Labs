import { defineField, defineType } from "sanity";

// A portfolio case study -- one client project, rendered at
// /projects/casestudy/<slug> by src/pages/projects/casestudy/[slug].astro.
//
// The original Webflow case studies were each hand-built with their own
// bespoke layout, so this schema is deliberately a *common shape* they all
// reduce to rather than a copy of any one of them: a hero, an overview with
// project facts, and a repeatable run of content blocks that alternate
// image-left / image-right down the page. Anything a particular study had
// beyond that (a results strip, a testimonial) is just another block.
export const projects = defineType({
  name: "project",
  title: "Case Study",
  type: "document",
  groups: [
    { name: "hero", title: "Hero", default: true },
    { name: "overview", title: "Overview" },
    { name: "content", title: "Content" },
    { name: "stats", title: "Achievements" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({
      name: "clientName",
      title: "Client name",
      type: "string",
      group: "hero",
      description: 'The client, e.g. "Clapper". Used as the page title and in listings.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "URL slug",
      type: "slug",
      group: "hero",
      options: { source: "clientName", maxLength: 96 },
      description:
        'The last part of the address, e.g. "clapper" gives /projects/casestudy/clapper. Changing it breaks any existing links to this page.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      group: "hero",
      description: "Lower numbers show first wherever case studies are listed.",
      validation: (Rule) => Rule.integer(),
    }),
    defineField({
      name: "logo",
      title: "Client logo",
      type: "image",
      group: "hero",
      options: { hotspot: true },
      description: "Shown above the headline. Use a transparent PNG or SVG.",
    }),
    defineField({
      name: "brandColor",
      title: "Brand colour",
      type: "string",
      group: "hero",
      // Sanity ships no colour type, and the @sanity/color-input plugin is a
      // dependency this project doesn't otherwise need -- so this is a plain
      // hex string, validated here so a typo is caught in the Studio rather
      // than silently producing a grey hero. The page re-validates it too
      // before putting it in a style attribute; see toBrandColor() in
      // src/lib/sanity.ts.
      description:
        'The client’s colour, as a hex code — e.g. "#FF6500" for Clapper. The hero fades from clear at the bottom left to this colour at the top right. Leave blank for Synergy green.',
      placeholder: "#FF6500",
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
          name: "hex colour",
          invert: false,
        }).error('Use a hex colour such as "#FF6500" or "#F60".'),
    }),
    defineField({
      name: "headline",
      title: "Headline",
      type: "text",
      rows: 2,
      group: "hero",
      description:
        'The big line at the top, e.g. "Video, Live, Chat." Falls back to the client name if blank.',
    }),
    defineField({
      name: "intro",
      title: "Intro",
      type: "text",
      rows: 3,
      group: "hero",
      description: "Short paragraph under the headline setting up what the product is.",
    }),
    defineField({
      name: "heroImage",
      title: "Hero fallback image",
      type: "image",
      group: "hero",
      options: { hotspot: true },
      description:
        "Only used when there are no hero screenshots below -- it then rides the carousel on its own. Fill in the screenshots instead wherever you can.",
    }),
    defineField({
      name: "heroImages",
      title: "Hero screenshots",
      type: "array",
      group: "hero",
      of: [{ type: "image", options: { hotspot: true } }],
      description:
        "The app screens that ride the carousel beside the headline. Three to six works best, all the same shape -- they run as one continuous strip, so mismatched heights show. Do not put App Store / Google Play badges here -- fill in the two store links below instead and the badges are drawn for you.",
      options: { layout: "grid" },
    }),
    defineField({
      name: "appStoreUrl",
      title: "App Store link",
      type: "url",
      group: "hero",
      description:
        "Where the \u201cDownload on the App Store\u201d badge points. Leave blank to hide that badge.",
      validation: (Rule) => Rule.uri({ scheme: ["http", "https"] }),
    }),
    defineField({
      name: "playStoreUrl",
      title: "Google Play link",
      type: "url",
      group: "hero",
      description:
        "Where the \u201cGet it on Google Play\u201d badge points. Leave blank to hide that badge.",
      validation: (Rule) => Rule.uri({ scheme: ["http", "https"] }),
    }),

    defineField({
      name: "metaClient",
      title: "Client",
      type: "string",
      group: "overview",
      description: 'The legal/company name for the facts list, e.g. "Clapper, Inc".',
    }),
    defineField({ name: "metaYear", title: "Year", type: "string", group: "overview" }),
    defineField({
      name: "metaTechStack",
      title: "Tech stack",
      type: "string",
      group: "overview",
      description: 'Comma-separated, e.g. "Flutter, Firebase".',
    }),
    defineField({
      name: "metaCategory",
      title: "Category",
      type: "string",
      group: "overview",
      description: 'e.g. "Social Networking".',
    }),
    defineField({
      name: "overviewHeading",
      title: "Overview heading",
      type: "string",
      group: "overview",
      initialValue: "The Challenge",
      description: 'Usually "The Challenge" or "Project Overview".',
    }),
    defineField({
      name: "overviewBody",
      title: "Overview text",
      type: "text",
      rows: 8,
      group: "overview",
      description: "Leave a blank line between paragraphs -- each becomes its own paragraph.",
    }),

    defineField({
      name: "contentBlocks",
      title: "Content blocks",
      type: "array",
      group: "content",
      description:
        "The body of the case study. Each block is a heading, some text and/or bullets, and an image; they alternate down the page automatically unless you override the image side.",
      of: [
        {
          type: "object",
          name: "contentBlock",
          fields: [
            defineField({
              name: "heading",
              title: "Heading",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "body",
              title: "Text",
              type: "text",
              rows: 5,
              description: "Leave a blank line between paragraphs.",
            }),
            defineField({
              name: "bullets",
              title: "Bullets",
              type: "array",
              of: [{ type: "text", rows: 3 }],
              description: "Ticked points. Use these or the text above, or both.",
            }),
            defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true } }),
            defineField({
              name: "imageSide",
              title: "Image side",
              type: "string",
              initialValue: "auto",
              options: {
                list: [
                  { title: "Alternate automatically", value: "auto" },
                  { title: "Left", value: "left" },
                  { title: "Right", value: "right" },
                ],
              },
            }),
          ],
          preview: { select: { title: "heading", subtitle: "body", media: "image" } },
        },
      ],
    }),

    // The coloured "Achievements and Impact" band. It is off by default and
    // every study decides for itself whether to show one, because a study
    // with no hard numbers to point at is better off without the section than
    // with three empty cards in it.
    defineField({
      name: "statsEnabled",
      title: "Show the achievements section",
      type: "boolean",
      group: "stats",
      initialValue: false,
      description:
        "Turn on to show a coloured band of headline numbers between the case study and the footer. Everything below only takes effect while this is on.",
    }),
    defineField({
      name: "statsIcon",
      title: "Icon",
      type: "image",
      group: "stats",
      description: "Small image above the heading, e.g. a medal. Leave blank to show no icon.",
      hidden: ({ document }) => !document?.statsEnabled,
    }),
    defineField({
      name: "statsHeading",
      title: "Heading",
      type: "string",
      group: "stats",
      initialValue: "Achievements and Impact",
      hidden: ({ document }) => !document?.statsEnabled,
    }),
    defineField({
      name: "statsSubheading",
      title: "Subheading",
      type: "string",
      group: "stats",
      description: 'One line under the heading, e.g. "Celebrating our milestones and user success."',
      hidden: ({ document }) => !document?.statsEnabled,
    }),
    defineField({
      name: "statsBgColor",
      title: "Background colour",
      type: "string",
      group: "stats",
      // Same plain-hex approach as brandColor above -- see the note there.
      description:
        'The band’s background, as a hex code — e.g. "#4023D3" for Clearcover. Leave blank for the client’s brand colour.',
      placeholder: "#4023D3",
      hidden: ({ document }) => !document?.statsEnabled,
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { name: "hex colour" }).error(
          'Use a hex colour such as "#4023D3" or "#40D".'
        ),
    }),
    defineField({
      name: "statsAccentColor",
      title: "Accent colour",
      type: "string",
      group: "stats",
      description:
        'The colour of the number cards, as a hex code — e.g. "#DAFF81" for Clearcover. Pick something light: the numbers on the cards are printed in near-black.',
      placeholder: "#DAFF81",
      hidden: ({ document }) => !document?.statsEnabled,
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { name: "hex colour" }).error(
          'Use a hex colour such as "#DAFF81" or "#DF8".'
        ),
    }),
    defineField({
      name: "statsItems",
      title: "Numbers",
      type: "array",
      group: "stats",
      description: "One card each. Three fit the row exactly; more wrap onto a second line.",
      hidden: ({ document }) => !document?.statsEnabled,
      of: [
        {
          type: "object",
          name: "statItem",
          fields: [
            defineField({
              name: "value",
              title: "Number",
              type: "string",
              description: 'The big line, e.g. "№ 9", "25,000" or "10x".',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              description: 'What it counts, e.g. "Global downloads".',
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: { select: { title: "value", subtitle: "label" } },
        },
      ],
    }),

    defineField({
      name: "metaDescription",
      title: "SEO description",
      type: "text",
      rows: 2,
      group: "seo",
      description: "Shown in search results and social previews.",
    }),
  ],
  orderings: [
    { title: "Display order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
  ],
  preview: {
    select: { title: "clientName", subtitle: "headline", media: "logo" },
  },
});
