// The sitemap index robots.txt and Search Console point at. One child
// sitemap, as @astrojs/sitemap wrote it -- the site is far below the
// 50,000-URL limit that would call for more.
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${new URL("/sitemap-0.xml", site).href}</loc></sitemap></sitemapindex>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
