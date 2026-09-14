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
      description:
        'The short label on the Services grid cards, e.g. "Web Apps". The longer headline on this service\'s own page is a separate field below.',
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
      name: "heroHeading",
      title: "Detail page: hero heading",
      type: "text",
      rows: 2,
      description:
        'The <h1> on this service\'s own page, e.g. "Web Applications, Designed to Perform" -- usually longer than the card title above. Press Enter to break the heading onto a second line. Leave blank and the page falls back to the card title.',
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
      description:
        "Large illustration/photo shown next to the heading on this service's own page. Ignored if a hero animation is uploaded below.",
    }),
    defineField({
      name: "heroLottie",
      title: "Detail page: hero animation (Lottie)",
      type: "file",
      options: { accept: ".json,.lottie" },
      description:
        "Animated alternative to the hero image -- a Lottie export (.json) or dotLottie bundle (.lottie). When set, it replaces the hero image. Raw .json is preferred: the build reads its width/height to reserve the right space, while a .lottie bundle falls back to a square slot.",
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
      name: "featuresHeading",
      title: "Detail page: features heading",
      type: "string",
      description:
        'Headline above the feature cards, e.g. "Custom Web Apps That Deliver Results". Leave blank and the whole features section is skipped, cards included.',
    }),
    defineField({
      name: "featuresLead",
      title: "Detail page: features intro",
      type: "text",
      rows: 3,
      description:
        "The larger paragraph under that headline. Sets up what this service is; leave blank to skip just this paragraph.",
    }),
    defineField({
      name: "featuresBody",
      title: "Detail page: features supporting text",
      type: "text",
      rows: 4,
      description:
        "Optional smaller second paragraph under the intro, for detail that would overload it. Most services use it; a couple leave it blank.",
    }),
    defineField({
      name: "features",
      title: "Detail page: feature cards",
      type: "array",
      description:
        'Cards like "Responsive Front-End", shown as a slider beside the heading above. Leave empty to show the heading text on its own.',
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
      name: "valueCards",
      title: "Detail page: why-work-with-us cards",
      type: "array",
      description:
        'The row of white cards on the green band under the features, e.g. "Reliable Timelines". Three reads best; leave empty to skip the whole band.',
      of: [
        {
          type: "object",
          name: "valueCard",
          fields: [
            defineField({
              name: "icon",
              title: "Icon",
              type: "string",
              description: "The mark above the title.",
              initialValue: "tools",
              options: {
                list: [
                  { title: "Tools (craft, build)", value: "tools" },
                  { title: "Clock (speed, timelines)", value: "clock" },
                  { title: "Shield (trust, reliability)", value: "shield" },
                  { title: "Rocket (launch, growth)", value: "rocket" },
                  { title: "People (team, talent)", value: "users" },
                  { title: "Chart (results, analytics)", value: "chart" },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "title",
              title: "Title",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "description",
              title: "Description",
              type: "text",
              rows: 3,
              description: "One or two sentences. Optional, but the cards look bare without it.",
            }),
          ],
          preview: { select: { title: "title", subtitle: "description" } },
        },
      ],
    }),
    defineField({
      name: "processHeading",
      title: 'Detail page: "How We Work" heading',
      type: "string",
      initialValue: "How We Work",
      description: "Headline above the process timeline.",
    }),
    defineField({
      name: "processEyebrow",
      title: 'Detail page: "How We Work" background word',
      type: "string",
      initialValue: "Process",
      description:
        'The oversized faded word behind the heading (e.g. "Process"). Decorative -- leave blank to drop it.',
    }),
    defineField({
      name: "processSteps",
      title: 'Detail page: "How We Work" steps',
      type: "array",
      description:
        "Numbered stages of the engagement, alternating down the timeline. Numbering is automatic. Leave empty to skip the whole section.",
      of: [
        {
          type: "object",
          name: "processStep",
          fields: [
            defineField({
              name: "icon",
              title: "Icon",
              type: "string",
              initialValue: "research",
              options: {
                list: [
                  { title: "Research (discovery, planning)", value: "research" },
                  { title: "Prototype (wireframes, matching)", value: "prototype" },
                  { title: "Design (build, integration)", value: "design" },
                  { title: "Development (launch, support)", value: "development" },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "title",
              title: "Title",
              type: "string",
              description: 'Just the stage name, e.g. "Discover" -- the "Step 1." prefix is added automatically.',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "description",
              title: "Description",
              type: "text",
              rows: 3,
            }),
          ],
          preview: { select: { title: "title", subtitle: "description" } },
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
