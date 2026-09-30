import { defineField, defineType } from "sanity";
import { hexColorRule } from "./shared";

/**
 * The coloured "Achievements and Impact" band of headline numbers. It has
 * its own two colours rather than the shared background switch because the
 * original bands were the one place a case study went fully into the
 * client's palette -- Clearcover's violet with acid-green cards, Spendee's
 * mint -- and the cards need a second colour that reads against the first.
 */
export const statsBand = defineType({
  name: "statsBand",
  title: "Achievements band",
  type: "object",
  fields: [
    defineField({
      name: "icon",
      title: "Icon",
      type: "image",
      description: "Small image above the heading, e.g. a medal. Optional.",
    }),
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      initialValue: "Achievements and Impact",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "subheading", title: "Subheading", type: "string" }),
    defineField({
      name: "bgColor",
      title: "Background colour",
      type: "string",
      placeholder: "#4023D3",
      description: "Hex code. Leave blank to use this case study's brand colour.",
      validation: (Rule) => hexColorRule(Rule, "#4023D3"),
    }),
    defineField({
      name: "accentColor",
      title: "Accent colour",
      type: "string",
      placeholder: "#DAFF81",
      description:
        "Hex code for the number cards. Pick something light: the numbers are printed in near-black.",
      validation: (Rule) => hexColorRule(Rule, "#DAFF81"),
    }),
    defineField({
      name: "items",
      title: "Numbers",
      type: "array",
      validation: (Rule) => Rule.min(1),
      description: "One card each. Three fit the row exactly; more wrap onto a second line.",
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
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "description",
              title: "Description",
              type: "text",
              rows: 3,
              description:
                "A sentence under the number. Optional -- leave blank for a bare number and label.",
            }),
          ],
          preview: { select: { title: "value", subtitle: "label" } },
        },
      ],
    }),
  ],
  preview: {
    select: { title: "heading", items: "items", media: "icon" },
    prepare: ({ title, items, media }) => ({
      title: title || "Achievements band",
      subtitle: `Achievements — ${(items ?? []).length} number${(items ?? []).length === 1 ? "" : "s"}`,
      media,
    }),
  },
});
