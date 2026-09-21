/**
 * URL helpers shared by the two layouts, so canonicals, og:url and the
 * sitemap cannot drift apart.
 */

/**
 * An absolute URL with a trailing slash, which is the shape @astrojs/sitemap
 * emits and the shape Astro's own `Astro.url.pathname` has for a directory
 * build. Mixing the two forms is the classic way to end up with a canonical
 * that does not match the URL in the sitemap, so every one goes through here.
 *
 * `site` comes from astro.config.mjs. It is required: without it these would
 * silently resolve to relative URLs, which neither canonicals nor the social
 * scrapers accept.
 */
export function canonicalUrl(path: string, site: URL | undefined): string {
  if (!site) {
    throw new Error(
      "`site` is not set in astro.config.mjs, so canonical and Open Graph URLs cannot be absolute."
    );
  }

  const url = new URL(path, site);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/** Absolute URL for an asset, left exactly as given -- no trailing slash. */
export function assetUrl(path: string, site: URL | undefined): string {
  return new URL(path, site).href;
}
