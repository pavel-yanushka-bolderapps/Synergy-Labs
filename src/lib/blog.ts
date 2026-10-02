import { stegaClean } from "@sanity/client/stega";
import { redirects } from "./redirects.mjs";

/**
 * Small helpers shared by the blog pages and cards. Kept out of sanity.ts so
 * components can import them without pulling in the Sanity client.
 */

/** "2026-09-18" -> "September 18, 2026", matching the Webflow cards. */
export function formatPostDate(date: string): string {
  if (!date) return "";

  // Parsed as UTC deliberately: `new Date("2026-09-18")` is midnight UTC, and
  // formatting that in a timezone behind UTC would print the 17th.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Pulls the leading sentences out of an article body, for posts whose
 * `previewText` was left empty in the export -- a card with a title and
 * nothing under it reads like a broken row.
 */
export function excerptFromHtml(html: string, maxLength = 180): string {
  const text = html
    .replace(/<(script|style)[^>]*>.*?<\/\1>/gis, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  // Cut on a word boundary rather than mid-word.
  return text.slice(0, text.lastIndexOf(" ", maxLength)).trimEnd() + "…";
}

/**
 * A post's <title>, in the pattern the Webflow blog template used for every
 * one of the 316 posts. Kept verbatim so the titles Google has indexed do not
 * change at the cutover.
 *
 * stegaClean: in the Studio's Preview tab every string from Sanity carries
 * invisible click-to-edit markers, which are pure noise in a <meta> tag.
 */
export function metaTitle(title: string): string {
  return `Synergy Labs Blog | ${(stegaClean(title) as string).trim()}`;
}

/** A post's meta description, in the Webflow blog template's pattern. */
export function metaDescription(title: string): string {
  return `Check out this blog by Synergy Labs discussing ${(stegaClean(title) as string).trim()} | Synergy Labs Blog is packed with insights into mobile and web app development`;
}

const OWN_HOST = /^(?:https?:\/\/)?(?:www\.)?synergylabs\.co(?=[/?#]|$)/i;

/** Legacy path -> final path, from the site's redirect map. */
const REDIRECT_TARGETS = new Map(
  Object.entries(redirects).map(([source, target]) => [source.replace("{/}?", ""), target.destination])
);

/** Follow the redirect map to its end (guarding against a loop). */
function finalPath(path: string): string {
  for (let hops = 0; hops < 5 && REDIRECT_TARGETS.has(path); hops++) path = REDIRECT_TARGETS.get(path)!;
  return path;
}

/**
 * Repair the links inside a post body, which came across from Webflow as-is.
 *
 * - Links to our own domain become relative. Some were written without a
 *   scheme (`href="synergylabs.co/blog/x"`), which a browser resolves against
 *   the current page -- /blog/synergylabs.co/blog/x, a 404. Absolute ones
 *   work, but a hard-coded host (often the bare apex) costs a redirect hop.
 * - Trailing slashes are dropped: the site's URLs have none.
 * - A link to a post that does not exist is retargeted to its re-dated
 *   successor when there is one (Webflow re-slugged many "-2025" posts to
 *   "-2026" without updating the links pointing at them), and otherwise
 *   unwrapped to plain text rather than left as a link to a 404.
 *
 * - A link to an old URL covered by src/lib/redirects.mjs goes straight to
 *   where that redirect lands, instead of through the hop.
 */
export function normalizeArticleLinks(html: string, slugs: ReadonlySet<string>): string {
  return html.replace(/<a\b([^>]*?)\shref="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi, (whole, before, href, after, text) => {
    let url = href.trim();
    if (OWN_HOST.test(url)) url = url.replace(OWN_HOST, "").replace(/^(?=[?#]|$)/, "/");
    if (!url.startsWith("/") || url.startsWith("//")) return whole;

    const [, path, suffix = ""] = url.match(/^([^?#]*)(.*)$/)!;
    let clean = finalPath(path.length > 1 ? path.replace(/\/+$/, "") : path);

    const post = clean.match(/^\/blog\/([^/]+)$/);
    if (post && !slugs.has(post[1])) {
      const successor = post[1].replace(/20(24|25)/g, "2026");
      if (successor !== post[1] && slugs.has(successor)) clean = `/blog/${successor}`;
      else return text;
    }

    const next = clean + suffix;
    return next === href ? whole : `<a${before} href="${next}"${after}>${text}</a>`;
  });
}

/** A Sanity image URL: the file name carries the original size, `<hash>-<w>x<h>.<ext>`. */
const SANITY_IMAGE = /^https:\/\/cdn\.sanity\.io\/images\/[^?#]+-(\d+)x(\d+)\.[a-z]+/i;
/** srcset steps. The article column is about 800px wide, so 1600 covers it on a 2x screen. */
const ARTICLE_IMAGE_WIDTHS = [480, 800, 1200, 1600];

/**
 * Serve the images in a post body resized and compressed by Sanity's image
 * CDN instead of as the original uploads.
 *
 * The bodies came from Webflow as raw HTML, and their images were moved into
 * Sanity as-is (scripts/migrate-webflow-assets.mjs) -- many are multi-megabyte
 * camera-size JPEGs shown in an 800px column. The CDN resizes and re-encodes on
 * request from URL parameters, so nothing is re-uploaded and the originals stay
 * untouched: removing this call puts every post back exactly as stored.
 *
 * - `auto=format` hands each browser AVIF or WebP when it accepts one.
 * - A srcset lets phones fetch the 480px version rather than the 1600px one.
 * - The real width and height go on the tag (Webflow wrote `auto`), so the
 *   browser reserves the space and the text does not jump as images load.
 * - Every image but the first is lazy-loaded; the first is often the largest
 *   thing on screen, and deferring it would slow the page's first paint.
 *
 * Images hosted anywhere else are left exactly as they are.
 */
export function optimizeArticleImages(html: string): string {
  let index = 0;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\ssrc="([^"]+)"/i)?.[1];
    const size = src?.match(SANITY_IMAGE);
    if (!src || !size) return tag;

    const [, w, h] = size;
    const width = Number(w);
    const base = src.split("?")[0];
    const url = (step: number) => `${base}?w=${step}&auto=format&q=75`;
    const steps = ARTICLE_IMAGE_WIDTHS.filter((step) => step < width);
    const srcset = [...steps.map((step) => `${url(step)} ${step}w`), `${url(Math.min(width, 2000))} ${Math.min(width, 2000)}w`];

    const attrs = tag
      .replace(/^<img\b|\/?>$/gi, "")
      .replace(/\s(src|srcset|sizes|width|height|loading|decoding)="[^"]*"/gi, "");
    const loading = index++ === 0 ? "eager" : "lazy";

    return (
      `<img${attrs} src="${url(Math.min(width, 1200))}" srcset="${srcset.join(", ")}"` +
      ` sizes="(min-width: 1024px) 800px, 100vw" width="${w}" height="${h}" loading="${loading}" decoding="async">`
    );
  });
}
