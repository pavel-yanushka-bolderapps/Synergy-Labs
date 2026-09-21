import { defineField, defineType } from "sanity";

// One of the /top-* landing pages that Clutch and paid traffic arrive on.
//
// All 24 are the same template -- awards strip, contact form, Clutch reviews,
// success stories -- differing only in the fields below, which is why they are
// documents against one route rather than 24 hand-written pages. The URLs are
// kept byte-identical to the Webflow ones: Clutch links at them and they carry
// their own rankings, so changing a slug throws both away.
//
// These pages deliberately have no site nav (see LandingLayout.astro) -- they
// are conversion pages, and the only ways out are the form and the phone
// number.
export const clutchLanding = defineType({
  name: "clutchLanding",
  title: "Clutch landing page",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      description: 'The h1, e.g. "Top App Developers in Dallas". Rendered uppercase.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "heading", maxLength: 96 },
      description:
        "The URL, off the site root: /top-app-developers-in-dallas. One slug contains a slash (top-app-developers/the-united-states) -- that is intentional, it matches the live URL.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "pitch",
      title: "Pitch",
      type: "text",
      rows: 4,
      description: "The paragraph under the heading.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "metaTitle",
      title: "Meta title",
      type: "string",
      description: "The <title> and the search result headline. Keep it under 60 characters.",
      validation: (Rule) => Rule.max(60).warning("Search results cut off around 60 characters."),
    }),
    defineField({
      name: "metaDescription",
      title: "Meta description",
      type: "text",
      rows: 3,
      description:
        "Write a different one for every page. All 24 shared a single description on the old site, which made them compete with each other for the same query.",
      validation: (Rule) =>
        Rule.max(165).warning("Search results cut off around 160 characters."),
    }),
    defineField({
      name: "ctaHeading",
      title: "CTA heading",
      type: "string",
      description: 'The heading above the closing call to action, e.g. "Hire a top-tier agency".',
    }),
    defineField({
      name: "canonicalSlug",
      title: "Canonical slug",
      type: "string",
      description:
        "Only for a page that duplicates another one: the slug of the page that should rank. Two of these URLs serve identical content, and pointing the spare here stops them splitting the same ranking.",
    }),
    defineField({
      name: "locale",
      title: "Language",
      type: "string",
      description: "Sets <html lang> and the text direction. One page is Arabic.",
      options: {
        list: [
          { title: "English", value: "en" },
          { title: "Arabic (right-to-left)", value: "ar" },
        ],
      },
      initialValue: "en",
    }),
  ],
  preview: {
    select: { title: "heading", subtitle: "slug.current" },
  },
});
