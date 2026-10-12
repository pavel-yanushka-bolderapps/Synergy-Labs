import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import sanity from '@sanity/astro';
import { loadEnv } from 'vite';
import { redirects } from './src/lib/redirects.mjs';

// astro.config.mjs runs in plain Node, not through Vite's `import.meta.env`,
// so .env has to be read explicitly here for the values the Sanity
// integration needs at config time.
const {
  PUBLIC_SANITY_PROJECT_ID,
  PUBLIC_SANITY_DATASET,
  PUBLIC_SANITY_VISUAL_EDITING_ENABLED,
  ISR_BYPASS_TOKEN,
} = loadEnv(
  process.env.NODE_ENV ?? 'development',
  process.cwd(),
  ''
);

/** The Sanity project behind the site. See the note at the sanity() call. */
const SANITY_PROJECT_ID = 'toot3mhg';

// Legacy URL map: see src/lib/redirects.mjs.


export default defineConfig({
  // The canonical origin. Everything absolute is derived from it -- the
  // <link rel="canonical"> and Open Graph URLs in Layout.astro, and every
  // entry in src/pages/sitemap-0.xml.ts. Without it Astro.site is undefined and
  // those fall back to relative URLs, which neither canonicals nor the
  // social scrapers accept.
  site: 'https://www.synergylabs.co',
  // No trailing slash, because that is the form of every URL the Webflow site
  // served and Google indexed (/portfolio, not /portfolio/). Canonicals, the
  // sitemap and Weglot's hreflang tags all have to name that same form, or
  // Google treats each page as having moved -- and ignores hreflang that
  // points at a non-canonical URL. On Vercel this also 308s /x/ to /x.
  trailingSlash: 'never',
  // Every page that shows Sanity content renders on demand and is cached by
  // Vercel's ISR, so a publish in the Studio reaches the live site in seconds
  // instead of waiting for a full rebuild:
  //
  //   Studio publish -> Sanity webhook -> /api/revalidate -> Vercel re-renders
  //   just the pages that document appears on (src/lib/revalidate.ts).
  //
  // Between publishes every page is served from Vercel's cache, the same as
  // the static files it replaced. Pages with no CMS content opt back into
  // build-time rendering with `export const prerender = true`.
  output: 'server',
  adapter: vercel({
    isr: {
      // Shared secret: a request carrying it in `x-prerender-revalidate`
      // re-renders the page and replaces the cached copy. Unset (local
      // builds), pages are still cached, just never refreshed on demand.
      bypassToken: ISR_BYPASS_TOKEN || undefined,
      // Safety net if a webhook delivery is ever lost: a cached page is
      // re-rendered in the background at most an hour after it went stale.
      expiration: 60 * 60,
      // POST endpoints and the revalidation hook itself must never be cached.
      // Plain strings only -- the adapter turns a RegExp exclusion into a
      // literal route pattern, which never matches a real URL.
      exclude: ['/api/contact', '/api/lead', '/api/builder', '/api/revalidate'],
    },
  }),
  // See src/lib/redirects.mjs. The Vercel adapter turns these into real
  // route-table entries, not meta-refresh pages.
  redirects,
  integrations: [
    sanity({
      // Falls back to the real project rather than a placeholder. The ID is
      // not a secret -- it is in every image URL the site serves -- and a
      // placeholder fails quietly: a deployment built without the env var
      // (Vercel preview builds were) gets no Sanity content at all, every
      // page with a static fallback looks fine, and the service and case
      // study pages, which have none, are never generated and 404.
      projectId: PUBLIC_SANITY_PROJECT_ID || SANITY_PROJECT_ID,
      dataset: PUBLIC_SANITY_DATASET || 'production',
      // The live API, not Sanity's CDN. A page is only rendered when a publish
      // asks for it, a moment after the change -- the CDN can still be serving
      // the previous version then, and that stale copy would be what Vercel
      // caches. Vercel's cache already absorbs the traffic the CDN was for.
      useCdn: false,
      apiVersion: '2025-08-31',
      studioBasePath: '/studio',
      // Must be set explicitly. @sanity/astro only falls back to reading
      // `output` when this is absent, and `output` defaults to 'static' --
      // which it maps to *hash* routing, injecting a single exact `/studio`
      // route. Every deeper URL then 404s, including the
      // `/studio/intent/edit/...` deep links stega writes into the page: the
      // "Open in Studio" button on the Preview tab led straight to Astro's
      // 404. 'browser' injects `/studio/[...params]` as an on-demand route
      // instead, which is what the adapter note at the top of this file is
      // describing. Path routing is also what stega.studioUrl below assumes.
      studioRouterHistory: 'browser',
      // Tells stega-encoded strings which Studio to deep-link into when an
      // editor clicks an element in the Preview tab. Must match
      // studioBasePath above, and must stay `#`-free to match the browser
      // history set above.
      stega: {
        studioUrl: '/studio',
      },
    }),
    react(),
  ],
  vite: {
    // Must be a real literal, not a read of `import.meta.env`.
    //
    // The layouts fold away their `import("@sanity/astro/visual-editing")` when
    // visual editing is off, which is what keeps 170KB of unlayered Sanity
    // Studio CSS off the public site. Vite only substitutes env vars it knows
    // about: when PUBLIC_SANITY_VISUAL_EDITING_ENABLED is set to "false" the
    // comparison inlines and Rollup drops the import, but when the variable is
    // simply ABSENT -- which is the normal state of a deployment -- the
    // expression survives as a runtime property lookup, nothing folds, and the
    // Studio stylesheet ships on all 419 pages and overrides every Tailwind
    // utility.
    //
    // That is exactly what happened on Vercel: every local test set the
    // variable explicitly, so it always folded here and never there.
    // Normalising it to a boolean literal at config time removes the
    // difference between "false" and unset.
    define: {
      __VISUAL_EDITING_ENABLED__: JSON.stringify(
        PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
      ),
    },
    plugins: [tailwindcss()],
    server: {
      watch: {
        // `npm run build` writes into dist/ and .vercel/output/, and the dev
        // server was watching both -- so a build kicked off next to a running
        // `npm run dev` fired a burst of HMR reloads. That is worse than
        // noise in the Studio: a reload mid-upload aborts the in-flight
        // request, which surfaces as a bare "Upload failed" toast. Neither
        // directory is a source input, so the dev server has no reason to
        // watch either.
        ignored: ["**/dist/**", "**/.vercel/**"],
      },
    },
    optimizeDeps: {
      // @sanity/mutate -- reached via @sanity/visual-editing, which powers
      // the Studio's Preview tab -- imports these CommonJS lodash modules as
      // ESM defaults (`import isObject from 'lodash/isObject.js'`). Vite only
      // synthesizes a `default` export for a CJS module if it pre-bundles it,
      // so without this the Preview overlay fails to hydrate with
      // "does not provide an export named 'default'". @sanity/astro
      // pre-bundles lodash/startCase.js for the Studio itself, but its list
      // predates these.
      include: [
        'lodash/deburr.js',
        'lodash/groupBy.js',
        'lodash/isObject.js',
        'lodash/keyBy.js',
        'lodash/partition.js',
        'lodash/sortedIndex.js',
        // @sanity/visual-editing is built with the React Compiler, so its
        // output does `import {c} from 'react/compiler-runtime'`. React ships
        // that subpath as CommonJS (`module.exports = require(...)`), and a
        // *named* import from CJS only works once Vite pre-bundles it.
        // @sanity/astro pre-bundles the standalone `react-compiler-runtime`
        // package, which is a different thing from React's own subpath.
        'react/compiler-runtime',
        // Only the service pages import it, from a client <script> in
        // Lottie.astro, so Vite discovers it late -- on the first visit to one
        // of those pages -- re-optimises mid-session, and the browser's
        // request for the old bundle fails with "504 (Outdated Optimize Dep)",
        // leaving every Lottie blank until a hard reload. Listing it here
        // bundles it at startup instead.
        '@lottiefiles/dotlottie-web',
      ],
    },
  },
});
