import { defineField, defineType } from "sanity";
import { backgroundField } from "./shared";

/**
 * One large visual with a short piece of copy over it -- the "UI Showcase" /
 * "App Interface" / "Magazine Style" moments. Distinct from a text & image
 * block because the image is the point here: it runs full width with the
 * copy centred above it, rather than sharing a row with the prose.
 */
export const showcase = defineType({
  name: "showcase",
  title: "Showcase",
  type: "object",
  fields: [
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      type: "string",
      description: 'Small line above the heading, e.g. "UI Showcase".',
    }),
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "body", title: "Text", type: "text", rows: 4 }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "imageSize",
      title: "Image size",
      type: "string",
      initialValue: "medium",
      options: {
        list: [
          { title: "Small \u2014 a figure the heading leads", value: "small" },
          { title: "Medium", value: "medium" },
          { title: "Full width", value: "full" },
        ],
        layout: "radio",
      },
      // The right size depends on how much empty space a given shot carries
      // around its subject, which no rule can guess -- a tight three-phone
      // render and an airy panoramic mockup want very different widths at
      // the same heading. So it is a choice rather than one fixed value.
      description: "How wide the image runs on desktop. On phones it always takes the full column.",
    }),
    defineField({ name: "linkLabel", title: "Link label", type: "string" }),
    defineField({
      name: "linkHref",
      title: "Link address",
      type: "url",
      description: "Both the label and the address are needed for the link to show.",
      validation: (Rule) => Rule.uri({ scheme: ["http", "https"] }),
    }),
    backgroundField,
  ],
  preview: {
    select: { title: "heading", subtitle: "eyebrow", media: "image" },
    prepare: ({ title, subtitle, media }) => ({
      title: title || "Showcase",
      subtitle: subtitle ? `Showcase — ${subtitle}` : "Showcase",
      media,
    }),
  },
});
