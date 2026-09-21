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

/** Google truncates the title around here; the brand suffix is what usually pushes past it. */
const TITLE_LIMIT = 60;
/** And the description around here. */
const DESCRIPTION_MAX = 160;
const DESCRIPTION_MIN = 70;

const BRAND = "Synergy Labs";

/**
 * A page title with the brand appended only when it still fits. Blanket
 * `${title} | Synergy Labs` pushed 114 of the 316 imported posts past the
 * limit on their own -- and a truncated title loses the brand anyway, so
 * appending it there costs the headline words and buys nothing.
 *
 * Titles longer than the limit before the suffix are left alone: they are
 * editorial copy, and silently cutting one would misrepresent the post.
 */
export function metaTitle(title: string): string {
  const withBrand = `${title} | ${BRAND}`;
  return withBrand.length <= TITLE_LIMIT ? withBrand : title;
}

/**
 * A description inside the length search results actually show. Long ones are
 * cut on a word boundary rather than mid-word; short or empty ones are topped
 * up from the article, since a 40-character description gives a searcher
 * nothing to act on.
 */
export function metaDescription(previewText: string | undefined, articleHtml?: string): string {
  let text = (previewText ?? "").trim();

  if (text.length < DESCRIPTION_MIN && articleHtml) {
    const excerpt = excerptFromHtml(articleHtml, DESCRIPTION_MAX);
    // Only swap in the excerpt if it is actually more informative -- for a few
    // posts the article opens with a heading shorter than the standfirst.
    if (excerpt.length > text.length) text = excerpt;
  }

  if (text.length <= DESCRIPTION_MAX) return text;

  const cut = text.lastIndexOf(" ", DESCRIPTION_MAX - 1);
  return text.slice(0, cut > 0 ? cut : DESCRIPTION_MAX - 1).trimEnd() + "…";
}
