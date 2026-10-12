// Which pages a Sanity document appears on, and how to make Vercel re-render
// them. Called by /api/revalidate when Sanity reports a publish.
//
// Pages are cached by Vercel's ISR (see astro.config.mjs). A request for a
// page that carries the bypass token in `x-prerender-revalidate` re-renders
// it and replaces the cached copy, so the next visitor gets the new content.
import { blogPage } from "../content/blogPage";
import { getBlogPosts, getLocationDetails } from "./sanity";
import { getSitemapPaths } from "./sitemap";

/**
 * What the Sanity webhook sends: the document's type, and the slug or href it
 * had before and after the change, so a renamed page refreshes both URLs --
 * the new one into existence and the old one into a 404. Matches the webhook
 * projection documented in src/pages/api/revalidate.ts.
 */
export interface PublishEvent {
  type?: string;
  slugs?: (string | null)[];
  hrefs?: (string | null)[];
}

const SITEMAP = "/sitemap-0.xml";

/** /blog and every pager page, plus one past the end in case a post was removed. */
async function blogListPaths(): Promise<string[]> {
  const posts = await getBlogPosts();
  const pages = Math.ceil(posts.length / blogPage.pageSize) + 1;
  return ["/blog", ...Array.from({ length: pages - 1 }, (_, i) => `/blog/page/${i + 2}`)];
}

export async function pathsFor(event: PublishEvent): Promise<string[]> {
  const slugs = [...new Set((event.slugs ?? []).filter((s): s is string => Boolean(s)))];
  const hrefs = [...new Set((event.hrefs ?? []).filter((h): h is string => Boolean(h)))];

  switch (event.type) {
    // A post shows on its own page, the archive, and the "latest posts" rows
    // on the homepage and /synergy-builder. The "More from the blog" row on
    // its neighbours catches up when their cache expires (an hour at most).
    case "blogPost":
      return [
        ...slugs.map((slug) => `/blog/${slug}`),
        ...(await blogListPaths()),
        "/",
        "/synergy-builder",
        SITEMAP,
      ];

    // An author's name and photo are on every one of their posts.
    case "blogAuthor":
      return [
        ...(await getBlogPosts()).map((post) => `/blog/${post.slug}`),
        ...(await blogListPaths()),
        "/",
        "/synergy-builder",
      ];

    // Services: the detail page (its URL is the `href` field), the services
    // index and the homepage grid.
    case "service":
      return [...hrefs.filter((href) => href.startsWith("/")), "/our-services", "/", SITEMAP];

    case "location":
      return [...slugs.map((slug) => `/locations/${slug}`), "/locations", "/", SITEMAP];

    // The shared catalogues offices pick their service, industry and
    // technology cards from -- any office may show the changed one.
    case "locationService":
    case "locationIndustry":
    case "locationTechnology":
      return [
        ...(await getLocationDetails()).map((location) => `/locations/${location.slug}`),
        "/locations",
      ];

    // A case study has its own page, and decides whether the portfolio grids
    // on /portfolio, /about-us and the homepage link to it.
    case "project":
      return [
        ...slugs.map((slug) => `/projects/casestudy/${slug}`),
        "/portfolio",
        "/about-us",
        "/",
        SITEMAP,
      ];

    case "clutchLanding":
      return [...slugs.map((slug) => `/${slug}`), SITEMAP];

    // A type this map does not know yet -- the webhook filter only sends the
    // ones above, so this means a new type was added there but not here.
    // Refresh everything rather than leave a page silently out of date.
    default:
      return [...(await getSitemapPaths()), SITEMAP];
  }
}

export interface RevalidateResult {
  path: string;
  status: number | "error";
}

/** Re-renders each path on `origin`, a few at a time. */
export async function revalidate(
  origin: string,
  paths: string[],
  token: string,
  concurrency = 8
): Promise<RevalidateResult[]> {
  const queue = [...new Set(paths)];
  const results: RevalidateResult[] = [];

  async function worker() {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      try {
        const res = await fetch(new URL(path, origin), {
          method: "HEAD",
          headers: { "x-prerender-revalidate": token },
          redirect: "manual",
        });
        results.push({ path, status: res.status });
      } catch (err) {
        console.error(`[revalidate] ${path} failed:`, err);
        results.push({ path, status: "error" });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
