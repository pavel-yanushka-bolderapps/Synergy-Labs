// Turns a rendered English page into its translation: the part of
// src/middleware.ts that does the actual work.
//
//   1. split the HTML into segments (segments.ts)
//   2. look each one up in Sanity (store.ts)
//   3. send only the ones never seen before to Claude (claude.ts)
//   4. write the translations into the HTML, point links and the canonical at
//      the same language, and save anything new back to Sanity
//
// Step 3 only happens the first time a page, or a changed paragraph, is
// requested in a language; after that a render is two Sanity reads. And
// Vercel's ISR cache sits in front of all of it, so most visitors never reach
// this code at all.
import { segmentPage } from "./segments";
import { loadTranslations, saveTranslations } from "./store";
import { translateSegments } from "./claude";
import { isTranslatablePath, localizedPath, LANGUAGE_CODES, type Language } from "./languages";

const SITE_HOSTS = new Set(["www.synergylabs.co", "synergylabs.co"]);

/** "/about-us#team" -> "/es/about-us#team", leaving other sites and files alone. */
function localizeHref(href: string, lang: Language): string | null {
  let url: URL;
  try {
    url = new URL(href, "https://www.synergylabs.co");
  } catch {
    return null;
  }
  const relative = href.startsWith("/") && !href.startsWith("//");
  if (!relative && !(/^https?:/.test(href) && SITE_HOSTS.has(url.hostname))) return null;
  const first = url.pathname.split("/")[1];
  if (LANGUAGE_CODES.includes(first) || !isTranslatablePath(url.pathname)) return null;
  const path = localizedPath(url.pathname, lang.code) + url.search + url.hash;
  return relative ? path : `https://www.synergylabs.co${path}`;
}

export interface TranslateResult {
  html: string;
  /** Saves new translations; the caller decides whether to wait for it. */
  save: Promise<void>;
  /** Segments that came back from Claude on this render. */
  translated: number;
  /** Segments left in English (Claude failed or broke the markup). */
  untranslated: number;
}

export async function translatePage(html: string, path: string, lang: Language): Promise<TranslateResult> {
  const { root, units } = segmentPage(html);
  const stored = await loadTranslations(lang.code, path);

  const lookup = (source: string) => stored.page.get(source) ?? stored.shared.get(source);
  const missing = [...new Set(units.filter((u) => lookup(u.source) === undefined).map((u) => u.source))];
  // Without a way to save them, every re-render would pay for the same
  // translations again -- so no Claude at all; untranslated text stays English.
  const canSave = Boolean(process.env.SANITY_API_WRITE_TOKEN);
  const fresh = missing.length && canSave ? await translateSegments(missing, lang) : new Map<string, string>();

  const page = new Map<string, string>();
  const newShared = new Map<string, string>();
  let untranslated = 0;

  for (const unit of units) {
    const existing = lookup(unit.source);
    const text = existing ?? fresh.get(unit.source);
    if (text === undefined || !unit.apply(text)) {
      untranslated++;
      continue;
    }
    if (unit.scope === "shared" && !stored.page.has(unit.source)) {
      if (!stored.shared.has(unit.source)) newShared.set(unit.source, text);
    } else {
      page.set(unit.source, text);
    }
  }

  // Only write when something changed: a new translation, or segments the
  // English page no longer has.
  const changed =
    fresh.size > 0 || page.size !== stored.page.size || [...page.keys()].some((k) => !stored.page.has(k));
  const save = changed ? saveTranslations(lang.code, path, page, newShared) : Promise.resolve();

  // <html lang dir>
  const htmlEl = root.querySelector("html");
  htmlEl?.setAttribute("lang", lang.code);
  htmlEl?.setAttribute("dir", lang.rtl ? "rtl" : "ltr");

  // In right-to-left text the bidi algorithm reorders "(645) 444-1069" into
  // "444-1069 (645)". Phone numbers and emails always read left to right.
  if (lang.rtl) {
    for (const a of root.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')) a.setAttribute("dir", "ltr");
  }

  // Links stay in the visitor's language.
  // Except the language switcher's, which carry hreflang (Footer.astro).
  for (const a of root.querySelectorAll("a[href]:not([hreflang])")) {
    const href = localizeHref(a.getAttribute("href")!, lang);
    if (href) a.setAttribute("href", href);
  }

  // Each translation is its own canonical page; the hreflang alternates the
  // layout wrote already list every language and stay as they are.
  for (const el of root.querySelectorAll('link[rel="canonical"], meta[property="og:url"]')) {
    const attr = el.tagName === "LINK" ? "href" : "content";
    const value = el.getAttribute(attr);
    const href = value && localizeHref(value, lang);
    if (href) el.setAttribute(attr, href);
  }
  root.querySelector('meta[property="og:locale"]')?.setAttribute("content", lang.code);

  return { html: root.toString(), save, translated: fresh.size, untranslated };
}
