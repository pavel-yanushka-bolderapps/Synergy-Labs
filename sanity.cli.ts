import { defineCliConfig } from "sanity/cli";

// For the `sanity` command line only (dataset export/import, backups) -- the
// Studio itself is served by the site, from sanity.config.ts.
export default defineCliConfig({
  api: {
    projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
    dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  },
});
