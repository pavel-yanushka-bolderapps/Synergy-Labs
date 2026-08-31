import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./src/sanity/schemaTypes";

// Embedded Sanity Studio config -- served at /studio (see the `sanity()`
// integration entry in astro.config.mjs). This is the admin UI for editing
// content; it does not affect how the public site renders.
//
// PUBLIC_SANITY_PROJECT_ID / PUBLIC_SANITY_DATASET come from .env (see
// .env.example) -- until real values are set, the Studio will load but
// won't be able to reach a real dataset.
export default defineConfig({
  name: "synergy-labs",
  title: "Synergy Labs",
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID || "placeholder",
  dataset: import.meta.env.PUBLIC_SANITY_DATASET || "production",
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
