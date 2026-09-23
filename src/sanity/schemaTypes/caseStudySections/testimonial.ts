import { defineField, defineType } from "sanity";
import { backgroundField, brandBandFields } from "./shared";

/**
 * A client quote. Only the quote itself is required -- several of the
 * original ones ran without a photo, and one without a named role.
 *
 * Note that Clearcover's "About Clearcover" panel, which sits in the same
 * slot on that page, is *not* this: it is a heading over prose with a logo
 * beside it, which is a text & image block. Keeping this type to actual
 * quotes is what lets it be styled as one.
 */
export const testimonial = defineType({
  name: "testimonial",
  title: "Quote",
  type: "object",
  fields: [
    defineField({
      name: "quote",
      title: "Quote",
      type: "text",
      rows: 5,
      description: "Without the surrounding quotation marks -- those are drawn for you.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "authorName", title: "Name", type: "string" }),
    defineField({
      name: "authorRole",
      title: "Role",
      type: "string",
      description: 'e.g. "Founder of Forbes Councils".',
    }),
    defineField({
      name: "avatar",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
    }),
    backgroundField,
    ...brandBandFields,
  ],
  preview: {
    select: { title: "quote", subtitle: "authorName", media: "avatar" },
    prepare: ({ title, subtitle, media }) => ({
      title: title || "Quote",
      subtitle: subtitle ? `Quote — ${subtitle}` : "Quote",
      media,
    }),
  },
});
