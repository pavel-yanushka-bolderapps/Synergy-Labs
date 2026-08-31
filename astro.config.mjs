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
      useCdn: true,
      apiVersion: '2025-08-31',
      studioBasePath: '/studio',
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
