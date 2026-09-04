import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { presentationTool, defineLocations, defineDocuments } from "sanity/presentation";
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
  plugins: [
    structureTool(),
    // The "Preview" tab in the Studio navbar: the live site in an iframe
    // next to the document editor, with click-to-edit overlays on any text
    // that came from Sanity. Requires the <VisualEditing /> overlay in
    // src/components/layout/Layout.astro and drafts/stega queries from
    // src/lib/loadQuery.ts -- see that file for the env vars it needs.
    presentationTool({
      title: "Preview",
      previewUrl: {
        // The Studio is embedded in the site itself, so the site to preview
        // is whatever origin the Studio is being served from -- localhost
        // in dev, the deployed domain in production. `initial` defaults to
        // location.origin; the '/' just picks the homepage as the first
        // thing an editor sees.
        initial: "/",
      },
      resolve: {
        // Given an open document, where on the site does it appear? These
        // become the "Locations" list in the Preview tab so an editor can
        // jump straight to the page their edit affects.
        locations: {
          service: defineLocations({
            select: { title: "title", href: "href" },
            resolve: (doc) => ({
              locations: [
                // A service's own detail page, if it has one.
                ...(doc?.href
                  ? [{ title: doc.title || "Service page", href: doc.href }]
                  : []),
                // Every service also renders as a card in the homepage
                // Services grid, so that's always a valid location.
                { title: "Homepage (Services grid)", href: "/" },
                { title: "Our Services", href: "/our-services" },
              ],
            }),
          }),
        },
        // The inverse: when an editor navigates the preview iframe to a
        // URL, which document should the editor pane open? Without this,
        // browsing to a service page leaves the pane on whatever was last
        // selected.
        mainDocuments: defineDocuments([
          {
            route: "/our-services/:slug",
            filter: `_type == "service" && href == "/our-services/" + $slug`,
          },
        ]),
      },
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
