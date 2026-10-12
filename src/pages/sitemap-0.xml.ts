// The sitemap itself. Same file name and format @astrojs/sitemap wrote, so
// the sitemap-index.xml already submitted to Search Console keeps working.
// Cached by Vercel like the pages, and refreshed by /api/revalidate whenever
// a publish adds, removes or renames a page.
import type { APIRoute } from "astro";
import { getSitemapPaths } from "../lib/sitemap";

export const GET: APIRoute = async ({ site }) => {
  const paths = await getSitemapPaths();
  const urls = paths
    .map((path) => `<url><loc>${new URL(path, site).href}</loc></url>`)
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
};
