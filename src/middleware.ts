// Serves the translated site: /es/..., /fr/... and the other languages in
// src/lib/i18n/languages.ts.
//
// There are no translated page files. A request for /es/blog/foo fetches the
// English /blog/foo from this same deployment -- usually straight out of
// Vercel's cache -- translates it (src/lib/i18n/translatePage.ts) and returns
// the result. No route matches /es/blog/foo except the root catch-all in
// [...landing].astro, which is rendered on demand with ISR, so this response
// is cached under /es/blog/foo exactly like any other page, and refreshed by
// the same /api/revalidate webhook (src/lib/revalidate.ts adds the
// translated paths).
import { defineMiddleware } from "astro:middleware";
import { waitUntil } from "@vercel/functions";
import { isTranslatablePath, localizedPath, splitLangPath } from "./lib/i18n/languages";
import { translatePage } from "./lib/i18n/translatePage";

export const onRequest = defineMiddleware(async (context, next) => {
  const { lang, path } = splitLangPath(context.url.pathname);
  if (!lang) return next();

  // /es/api/..., /es/images/x.png and the like: nothing to translate.
  if (!isTranslatablePath(path)) return context.redirect(path + context.url.search, 302);

  // A revalidation request (see src/lib/revalidate.ts) refreshes the English
  // page on the way, so the translation is never built from a stale copy.
  const bypass = context.request.headers.get("x-prerender-revalidate");
  const english = await fetch(new URL(path + context.url.search, context.url.origin), {
    headers: bypass ? { "x-prerender-revalidate": bypass } : {},
    redirect: "manual",
  });

  // Redirects (legacy URLs, the -2025 -> -2026 renames) keep the language.
  const location = english.headers.get("location");
  if (english.status >= 300 && english.status < 400 && location) {
    const target = new URL(location, context.url.origin);
    const local = target.origin === context.url.origin && isTranslatablePath(target.pathname);
    return context.redirect(
      local ? localizedPath(target.pathname, lang.code) + target.search : location,
      english.status as 301 | 302 | 307 | 308
    );
  }

  const type = english.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return english;

  const html = await english.text();
  // The one landing page that is already Arabic, and anything else not written
  // in English, has no translations of its own.
  if (!/<html[^>]*\blang="en"/i.test(html)) return context.redirect(path, 302);

  // Every unknown URL renders the same 404 page; translate it once, not once
  // per URL a bot tries.
  const storePath = english.status === 404 ? "/404" : path;
  const result = await translatePage(html, storePath, lang);
  waitUntil(result.save.catch((err) => console.error(`[translate] Saving ${lang.code}${path} failed:`, err)));
  if (result.translated || result.untranslated) {
    console.log(
      `[translate] ${lang.code}${path}: ${result.translated} new from Claude, ${result.untranslated} left in English`
    );
  }

  return new Response(result.html, {
    status: english.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
