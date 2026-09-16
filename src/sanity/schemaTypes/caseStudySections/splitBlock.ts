import { defineField, defineType } from "sanity";
import { backgroundField } from "./shared";

/**
 * Prose beside an image -- the workhorse of the original case studies. Every
 * one of Clapper's four "About / Key Features / Why it stands out" panels,
 * all of Joe & The Juice's "Problem Statement / Scope of Work / Magazine
 * Style" panels, Signal's challenge and approach, and the closing "Results
 * and Impact" narratives are this same shape with different copy, so they
 * are one type rather than eight.
 */
export const splitBlock = defineType({
  name: "splitBlock",
  title: "Text & image",
  type: "object",
  fields: [
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      type: "string",
      description: 'Small line above the heading, e.g. "RESULTS". Optional.',
    }),
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
      rows: 6,
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
      description:
        "Alternating counts only the text & image sections, so inserting a different section between two of them doesn't flip the rest of the page.",
    }),
    backgroundField,
  ],
  preview: {
    select: { title: "heading", subtitle: "body", media: "image" },
    prepare: ({ title, subtitle, media }) => ({
      title: title || "Text & image",
      subtitle: subtitle ? `Text & image — ${subtitle}` : "Text & image",
      media,
    }),
  },
});
