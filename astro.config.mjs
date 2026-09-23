import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import sanity from '@sanity/astro';
import { loadEnv } from 'vite';

// astro.config.mjs runs in plain Node, not through Vite's `import.meta.env`,
// so .env has to be read explicitly here for the values the Sanity
// integration needs at config time.
const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET, PUBLIC_SANITY_VISUAL_EDITING_ENABLED } = loadEnv(
  process.env.NODE_ENV ?? 'development',
  process.cwd(),
  ''
);

/** The Sanity project behind the site. See the note at the sanity() call. */
const SANITY_PROJECT_ID = 'toot3mhg';

// Pages that render <meta name="robots" content="noindex">, so they are kept
// out of the sitemap below. Both are the ambassador programme: /1-week-pilot
// is a duplicate of /ambassador-program (see src/pages/1-week-pilot.astro).
const NOINDEX_PATHS = ['/ambassador-program', '/1-week-pilot'];

// --- Legacy URL map ------------------------------------------------------
//
// Every URL the Webflow site served that this site does not. Without these
// they 404 on cutover and their rankings go with them.
//
// SHIPPED AS 302 ON PURPOSE. A 301 is cached by browsers more or less
// permanently and cannot be recalled, so these stay temporary until the
// redirects have been checked against a preview deployment and the site is
// live and settled. Then flip REDIRECT_STATUS to 301 -- that is the only
// change needed.
//
// DANGER: the Vercel adapter emits these *before* `handle: filesystem`, so a
// source that is also a real route hides that route. Never add a source for a
// page that exists. `npm run audit:launch` fails if one ever does.
const REDIRECT_STATUS = 302;

const to = (destination) => ({ status: REDIRECT_STATUS, destination });

/**
 * The old flat location URLs. Webflow gave every office a top-level page with
 * the whole company name in the slug; they are /locations/<city> here.
 * Note "phonix" -- Webflow's typo, which is a live indexed URL, so it is
 * mapped as spelled.
 */
const LEGACY_LOCATIONS = {
  'mobile-and-web-developers-agency-in-chicago': 'chicago',
  'mobile-and-web-developers-agency-in-dubai': 'dubai',
  'mobile-and-web-developers-agency-in-london': 'london',
  'mobile-and-web-developers-agency-in-los-angeles': 'los-angeles',
  'mobile-and-web-developers-agency-in-orlando': 'orlando',
  'mobile-and-web-developers-agency-in-riyadh': 'riyadh',
  'mobile-and-web-developers-agency-in-singapore': 'singapore',
  'mobile-and-web-developers-agency-in-tampa': 'tampa',
  'mobile-and-web-development-agency-in-qatar': 'qatar',
  'mobile-app-and-web-developers-agency-in-austin': 'austin',
  'mobile-app-and-web-developers-agency-in-hartford': 'hartford',
  'mobile-app-and-web-development-agency-in-atlanta': 'atlanta',
  'mobile-app-and-web-development-agency-in-houston': 'houston',
  'mobile-app-and-web-development-agency-in-jackson': 'jackson',
  'mobile-app-and-web-development-agency-in-jacksonville': 'jacksonville',
  'mobile-app-and-web-development-agency-in-miami': 'miami',
  'mobile-app-and-web-development-agency-in-new-york-city': 'new-york-city',
  'mobile-app-and-web-development-agency-in-philadelphia': 'philadelphia',
  'mobile-app-and-web-development-agency-in-phonix': 'phoenix',
  'mobile-app-and-web-development-agency-in-san-diego': 'san-diego',
  'mobile-app-and-web-development-agency-in-san-francisco': 'san-francisco',
};

/**
 * The ten /top-* Clutch landings that were never seeded into Sanity, pointed
 * at the city page for the same place.
 *
 * This is a stopgap, not the end state: these are paid/referral landing pages
 * and the landing template converts better than a location page. The right
 * fix is ten more rows in scripts/data/clutch-landings.json, at which point
 * each entry here MUST be deleted -- a redirect left behind would shadow the
 * page it was standing in for. Connecticut has no city page of its own;
 * Hartford is the office there.
 */
const UNSEEDED_LANDINGS = {
  'top-app-developers-in-austin': 'austin',
  'top-app-developers-in-chicago': 'chicago',
  'top-app-developers-in-connecticut': 'hartford',
  'top-app-developers-in-dubai': 'dubai',
  'top-app-developers-in-london': 'london',
  'top-app-developers-in-miami': 'miami',
  'top-app-developers-in-nyc': 'new-york-city',
  'top-app-developers-in-qatar': 'qatar',
  'top-app-developers-in-riyadh': 'riyadh',
  'top-app-developers-in-singapore': 'singapore',
};

/**
 * Every source is registered as `<path>{/}?` so it matches with or without a
 * trailing slash.
 *
 * A bare source compiles to an exact `^/articles$`, and `/articles/` then
 * matches nothing, falls past the filesystem handle and 404s. Real pages are
 * unaffected -- Vercel resolves /contact and /contact/ to the same file -- so
 * this is specific to redirects, and it does not show up in the build output:
 * both forms have to be requested against a running deployment to see it.
 * `npm run verify:redirects <url>` does exactly that.
 *
 * Registering the slashed source as a second key does not work: the route
 * normaliser strips the slash and both keys collapse to the same pattern.
 * `/articles/?` is rejected outright as an invalid source pattern. `{/}?` is
 * path-to-regexp's optional-group syntax and compiles to `^/articles(?:/)?$`,
 * which is the one form that covers both.
 *
 * The suffix is added here rather than written into each key so the map above
 * stays readable and no entry can be forgotten.
 */
const optionalTrailingSlash = (map) =>
  Object.fromEntries(Object.entries(map).map(([source, target]) => [`${source}{/}?`, target]));

const redirects = optionalTrailingSlash({
  ...Object.fromEntries(
    Object.entries(LEGACY_LOCATIONS).map(([slug, city]) => [
      `/synergy-labs---${slug}`,
      to(`/locations/${city}`),
    ])
  ),
  ...Object.fromEntries(
    Object.entries(UNSEEDED_LANDINGS).map(([slug, city]) => [`/${slug}`, to(`/locations/${city}`)])
  ),

  // Two offices also had a short-form URL.
  '/locations-dallas': to('/locations/dallas'),
  '/locations-san-antonio': to('/locations/san-antonio'),

  // The service slug lost its "-service" suffix in the rebuild, and two older
  // root-level copies of the same page predate /our-services entirely.
  '/our-services/web-app-development-service': to('/our-services/web-app-development'),
  '/web-app-development': to('/our-services/web-app-development'),
  '/web-app-development-copy': to('/our-services/web-app-development'),

  // A Webflow stub whose body copy was still lorem ipsum. The service page is
  // what it was meant to become.
  '/mobile-apps': to('/our-services/app-development-service'),

  // The news-articles collection has not been migrated. Until it is, the blog
  // is the closest thing this site has to it.
  '/articles': to('/blog'),

  // Titled "Calculator" but contains no calculator -- it is the contact form
  // and its thank-you state, nothing else.
  '/calculator': to('/contact'),

  // TODO: decide before flipping to 301. This was a real, indexable paid
  // landing page ("Top Mobile App Design Optimization Agency") built on the
  // same template as /top-*, with a founder video and a PDF checklist behind
  // the form. If Search Console shows it earning impressions, delete this
  // entry and seed it as a clutchLanding instead. 302 keeps that door open.
  '/mobile-app-design-optimization': to('/our-services/app-development-service'),
});

export default defineConfig({
  // The canonical origin. Everything absolute is derived from it -- the
  // <link rel="canonical"> and Open Graph URLs in Layout.astro, and every
  // entry @astrojs/sitemap writes. Without it Astro.site is undefined and
  // those fall back to relative URLs, which neither canonicals nor the
  // social scrapers accept.
  site: 'https://www.synergylabs.co',
  // Site stays static by default (every page prerenders) except routes that
  // opt out with `export const prerender = false` -- that's the
  // contact-form API route and the embedded Sanity Studio, so it needs a
  // server adapter but the rest of the site is unaffected.
  adapter: vercel(),
  // See the legacy URL map above. The Vercel adapter turns these into real
  // route-table entries, not meta-refresh pages.
  redirects,
  integrations: [
    sitemap({
      // The Studio is an application, not content, and the API routes are not
      // pages at all. The rest are pages that render `noindex` -- listing a
      // URL in a sitemap asks Google to index it, so a sitemap entry for a
      // noindex page is a contradiction Search Console reports as an error.
      // Keep this in step with the `noindex` prop passed in src/pages.
      filter: (page) =>
        !page.includes('/studio') &&
        !NOINDEX_PATHS.some((path) => page.endsWith(path) || page.endsWith(`${path}/`)),
    }),
    sanity({
      // Falls back to the real project rather than a placeholder. The ID is
      // not a secret -- it is in every image URL the site serves -- and a
      // placeholder fails quietly: a deployment built without the env var
      // (Vercel preview builds were) gets no Sanity content at all, every
      // page with a static fallback looks fine, and the service and case
      // study pages, which have none, are never generated and 404.
      projectId: PUBLIC_SANITY_PROJECT_ID || SANITY_PROJECT_ID,
      dataset: PUBLIC_SANITY_DATASET || 'production',
      // Static build -- fetch through Sanity's CDN rather than the live API.
      // (src/lib/loadQuery.ts overrides this per-request when the Studio's
      // Preview tab is showing drafts, which must skip the CDN.)
      useCdn: true,
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
      ],
    },
  },
});
