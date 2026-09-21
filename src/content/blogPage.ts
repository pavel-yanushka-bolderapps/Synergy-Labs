import type { BlogPageContent } from "../lib/types";

/**
 * The static furniture around /blog. The posts themselves come from Sanity
 * (falling back to scripts/data/blog-posts.json) -- see getBlogPosts() in
 * src/lib/sanity.ts.
 */
export const blogPage: BlogPageContent = {
  heading: "Synergy Labs Blog",
  subheading:
    "Notes on building mobile and web products — what we're shipping, what we're learning, and what's changing in the industry.",
  // 12 fills four rows of the three-column grid exactly.
  pageSize: 12,
};
