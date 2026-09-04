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
      // Tells stega-encoded strings which Studio to deep-link into when an
      // editor clicks an element in the Preview tab. Must match
      // studioBasePath above, with no `#` suffix -- @sanity/astro handles
      // the Studio's hash routing itself.
      stega: {
        studioUrl: '/studio',
      },
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
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
