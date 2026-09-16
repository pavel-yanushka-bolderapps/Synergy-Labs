import { defineField } from "sanity";

/**
 * Every case-study section can sit on one of three grounds. Offering a
 * choice rather than an arbitrary colour per section is deliberate: the
 * original pages only ever alternated between the page ground, a soft tint
 * and the client's own colour, and a free colour picker here would let a
 * page drift out of its own palette one section at a time.
 */
export const backgroundField = defineField({
  name: "background",
  title: "Background",
  type: "string",
  initialValue: "default",
  options: {
    list: [
      { title: "Page (light, with the grid pattern)", value: "default" },
      { title: "Tinted band", value: "tinted" },
      { title: "Brand colour (white text)", value: "brand" },
    ],
    layout: "radio",
  },
  description: "Brand colour uses this case study's colour from the Hero tab.",
});

/** Hex validation shared by every colour field. See toHexColor() in src/lib/sanity.ts. */
export const hexColorRule = (Rule: any, example: string) =>
  Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { name: "hex colour" }).error(
    `Use a hex colour such as "${example}".`
  );
