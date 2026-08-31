import { sanityClient } from "sanity:client";
import { createImageUrlBuilder } from "@sanity/image-url";
import type { ServiceItem } from "./types";

const imageBuilder = createImageUrlBuilder(sanityClient);

interface SanityServiceDoc {
  title: string;
  href: string;
  order?: number;
  image?: Record<string, unknown> | null;
}

/**
 * Fetches the Services grid content from Sanity (see
 * src/sanity/schemaTypes/service.ts for the schema, and /studio to edit
 * entries once PUBLIC_SANITY_PROJECT_ID/PUBLIC_SANITY_DATASET are set in
 * .env).
 *
 * Returns `null` -- rather than throwing -- when Sanity isn't configured
 * yet, has no `service` documents, or the request fails for any reason.
 * Callers should fall back to the static content in src/content/home.ts in
 * that case, so an unconfigured/unreachable CMS never breaks the build.
 */
export async function getServices(): Promise<ServiceItem[] | null> {
  try {
    const docs = await sanityClient.fetch<SanityServiceDoc[]>(
      `*[_type == "service"] | order(order asc, _createdAt asc){ title, href, order, image }`
    );

    if (!docs || docs.length === 0) return null;

    return docs.map((doc) => ({
      title: doc.title,
      href: doc.href,
      imageSrc: doc.image ? imageBuilder.image(doc.image).width(400).url() : undefined,
    }));
  } catch (err) {
    console.error("[sanity] Failed to fetch services, falling back to static content:", err);
    return null;
  }
}
