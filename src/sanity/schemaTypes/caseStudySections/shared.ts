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

/**
 * Optional tuning for a section on the brand background. A client's brand
 * colour is right for the hero and most bands, but occasionally one band
 * wants a softer shade of it (Urban's results, for one) -- these change that
 * one section without touching the brand colour the rest of the page uses.
 * Both only apply when Background is "Brand colour".
 */
export const brandBandFields = [
  defineField({
    name: "bandColor",
    title: "Brand band: colour override",
    type: "string",
    description:
      'Optional hex colour used instead of the brand colour for this section only, e.g. "#fff8e1". Text switches to dark or white automatically.',
    hidden: ({ parent }: any) => parent?.background !== "brand",
    validation: (Rule: any) => hexColorRule(Rule, "#fff8e1"),
  }),
  defineField({
    name: "gridOpacity",
    title: "Brand band: grid pattern opacity",
    type: "number",
    description: "0 hides the grid, 1 is full strength. Leave blank for the default.",
    hidden: ({ parent }: any) => parent?.background !== "brand",
    validation: (Rule: any) => Rule.min(0).max(1),
  }),
];

/** Hex validation shared by every colour field. See toHexColor() in src/lib/sanity.ts. */
export const hexColorRule = (Rule: any, example: string) =>
  Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { name: "hex colour" }).error(
    `Use a hex colour such as "${example}".`
  );
