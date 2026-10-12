// Every indexable URL on the site, as a path. Feeds the sitemap
// (src/pages/sitemap-0.xml.ts) and the "refresh everything" case of
// /api/revalidate, so both always agree on what the site contains.
//
// This replaced @astrojs/sitemap, which only lists pages built ahead of time
// -- since pages that show Sanity content are rendered on demand (see the ISR
// note in astro.config.mjs), it would have dropped the blog, services,
// locations, case studies and landing pages.
import { blogPage } from "../content/blogPage";
import {
  getBlogPosts,
  getCaseStudySlugs,
  getClutchLandings,
  getLocationDetails,
  getServiceSlugs,
} from "./sanity";

// Pages that render <meta name="robots" content="noindex">, kept out of the
// sitemap: listing a URL asks Google to index it, so a sitemap entry for a
// noindex page is a contradiction Search Console reports as an error. Both
// are the ambassador programme: /1-week-pilot is a duplicate of
// /ambassador-program (see src/pages/1-week-pilot.astro). Keep this in step
// with the `noindex` prop passed in src/pages.
const NOINDEX_PATHS = new Set(["/ambassador-program", "/1-week-pilot"]);

/** The fixed pages: every .astro file in src/pages without a [param]. */
function staticPaths(): string[] {
  return Object.keys(import.meta.glob("/src/pages/**/*.astro"))
    .filter((file) => !file.includes("["))
    .map((file) =>
      file
        .replace(/^\/src\/pages/, "")
        .replace(/\.astro$/, "")
        .replace(/\/index$/, "")
    )
    .map((path) => path || "/")
    .filter((path) => path !== "/404" && !NOINDEX_PATHS.has(path));
}

export async function getSitemapPaths(): Promise<string[]> {
  const [posts, services, locations, caseStudies, landings] = await Promise.all([
    getBlogPosts(),
    getServiceSlugs(),
    getLocationDetails(),
    getCaseStudySlugs(),
    getClutchLandings(),
  ]);

  const totalBlogPages = Math.max(1, Math.ceil(posts.length / blogPage.pageSize));

  return [
    ...staticPaths(),
    ...posts.map((post) => `/blog/${post.slug}`),
    ...Array.from({ length: totalBlogPages - 1 }, (_, i) => `/blog/page/${i + 2}`),
    ...services.map((slug) => `/our-services/${slug}`),
    ...locations.map((location) => `/locations/${location.slug}`),
    ...caseStudies.map((slug) => `/projects/casestudy/${slug}`),
    ...landings.map((page) => `/${page.slug}`),
  ];
}
