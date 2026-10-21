// The languages the site is translated into. These are the seven Weglot
// served on the Webflow site, under the same /{code}/... prefixes, so the
// URLs Google indexed for them keep working. Weglot never translated slugs,
// and neither does this: /es/blog/foo is the Spanish copy of /blog/foo.
//
// Pages are not written per language. src/middleware.ts renders the English
// page and translates it on the way out -- see src/lib/i18n/translatePage.ts.

export interface Language {
  code: string;
  /** English name, for the translation prompt and the Studio. */
  name: string;
  /** The language's own name, for the switcher. */
  native: string;
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function getLanguage(code: string | undefined): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/** Splits "/es/blog/foo" into the language and the English path "/blog/foo". */
export function splitLangPath(pathname: string): { lang?: Language; path: string } {
  const match = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  const lang = getLanguage(match?.[1]);
  if (!lang) return { path: pathname };
  return { lang, path: match![2] || "/" };
}

/** "/blog/foo" in Spanish is "/es/blog/foo"; the homepage is "/es". */
export function localizedPath(path: string, code: string): string {
  return path === "/" ? `/${code}` : `/${code}${path}`;
}

/**
 * Paths that are never translated: the API, the Studio, generated files and
 * anything with a file extension (images, PDFs, the sitemap).
 */
export function isTranslatablePath(path: string): boolean {
  if (/^\/(api|studio|_astro|_vercel|images|lottie)(\/|$)/.test(path)) return false;
  if (/\.[a-z0-9]+$/i.test(path)) return false;
  return true;
}
