import { defineField, defineType } from "sanity";
import { backgroundField } from "./shared";

/**
 * A run of small items under one heading. This is the most-used shape on the
 * original site -- seven of the eight case studies have at least one -- and
 * it covers two presentations that looked different but carried identical
 * data: the "Key Features" cards (icon, title, a line of copy) and the
 * tighter "Why Synergy Labs?" tiles (icon and title only). Those are one
 * type with a layout switch rather than two, because an editor moving copy
 * between them shouldn't have to rebuild the section.
 */
export const featureGrid = defineType({
  name: "featureGrid",
  title: "Feature grid",
  type: "object",
  fields: [
    defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "lead",
      title: "Lead",
      type: "text",
      rows: 3,
      description: "One or two lines under the heading. Optional.",
    }),
    defineField({
      name: "layout",
      title: "Layout",
      type: "string",
      initialValue: "cards",
      options: {
        list: [
          { title: "Cards — icon, title and description", value: "cards" },
          { title: "Tiles — compact, title only", value: "tiles" },
        ],
        layout: "radio",
      },
      description: "Tiles ignore the descriptions below, so use cards if the copy matters.",
    }),
    defineField({
      name: "items",
      title: "Items",
      type: "array",
      validation: (Rule) => Rule.min(1),
      of: [
        {
          type: "object",
          name: "featureItem",
          fields: [
            defineField({
              name: "title",
              title: "Title",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
            defineField({
              name: "image",
              title: "Icon or image",
              type: "image",
              options: { hotspot: true },
            }),
          ],
          preview: { select: { title: "title", subtitle: "description", media: "image" } },
        },
      ],
    }),
    backgroundField,
  ],
  preview: {
    select: { title: "heading", items: "items", media: "items.0.image" },
    prepare: ({ title, items, media }) => ({
      title: title || "Feature grid",
      subtitle: `Feature grid — ${(items ?? []).length} item${(items ?? []).length === 1 ? "" : "s"}`,
      media,
    }),
  },
});
