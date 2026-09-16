import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import sanity from '@sanity/astro';
import { loadEnv } from 'vite';

// astro.config.mjs runs in plain Node, not through Vite's `import.meta.env`,
// so .env has to be read explicitly here for the values the Sanity
// integration needs at config time.
const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
  process.env.NODE_ENV ?? 'development',
  process.cwd(),
  ''
);

export default defineConfig({
  // Site stays static by default (every page prerenders) except routes that
  // opt out with `export const prerender = false` -- that's the
  // contact-form API route and the embedded Sanity Studio, so it needs a
  // server adapter but the rest of the site is unaffected.
  adapter: vercel(),
  integrations: [
    sanity({
      projectId: PUBLIC_SANITY_PROJECT_ID || 'placeholder',
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
