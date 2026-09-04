import { sanityClient } from "sanity:client";
import { createImageUrlBuilder } from "@sanity/image-url";
import { loadQuery } from "./loadQuery";
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
    const docs = await loadQuery<SanityServiceDoc[]>({
      query: `*[_type == "service"] | order(order asc, _createdAt asc){ title, href, order, image }`,
    });

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

// --- Individual service detail pages (src/pages/our-services/[slug].astro) ---
//
// Unlike getServices() above, these pages have no static-content fallback --
// they only exist for services that have a matching Sanity document at
// build time. A service with no detail-page fields filled in (or missing
// entirely from Sanity) just doesn't get a page built for it.

export interface ServiceDetail {
  title: string;
  heroDescription?: string;
  heroImageSrc?: string;
  bannerWords: string[];
  features: { title: string; imageSrc?: string }[];
  metaDescription?: string;
}

interface SanityServiceDetailDoc {
  title: string;
  heroDescription?: string | null;
  heroImage?: Record<string, unknown> | null;
  bannerWords?: string[] | null;
  features?: { title: string; image?: Record<string, unknown> | null }[] | null;
  metaDescription?: string | null;
}

/**
 * Returns the URL-safe slug (the part after "/our-services/") for every
 * service document whose `href` looks like a detail-page path, so
 * getStaticPaths() knows which pages to build.
 */
export async function getServiceSlugs(): Promise<string[]> {
  try {
    const hrefs = await loadQuery<string[]>({
      query: `*[_type == "service" && defined(href)].href`,
    });
    return hrefs
      .filter((href) => href.startsWith("/our-services/"))
      .map((href) => href.replace("/our-services/", "").replace(/\/$/, ""))
      .filter(Boolean);
  } catch (err) {
    console.error("[sanity] Failed to fetch service slugs:", err);
    return [];
  }
}

/**
 * Fetches the detail-page content for one service by its slug (matched
 * against the `href` field as "/our-services/<slug>"). Returns null if the
 * document doesn't exist or the request fails -- getStaticPaths() skips
 * building a page in that case.
 */
export async function getServiceBySlug(slug: string): Promise<ServiceDetail | null> {
  try {
    const doc = await loadQuery<SanityServiceDetailDoc | null>({
      query: `*[_type == "service" && href == $href][0]{
        title, heroDescription, heroImage, bannerWords, features[]{ title, image }, metaDescription
      }`,
      params: { href: `/our-services/${slug}` },
    });

    if (!doc) return null;

    return {
      title: doc.title,
      heroDescription: doc.heroDescription ?? undefined,
      heroImageSrc: doc.heroImage ? imageBuilder.image(doc.heroImage).width(800).url() : undefined,
      bannerWords: doc.bannerWords ?? [],
      features: (doc.features ?? []).map((feature) => ({
        title: feature.title,
        imageSrc: feature.image ? imageBuilder.image(feature.image).width(300).url() : undefined,
      })),
      metaDescription: doc.metaDescription ?? undefined,
    };
  } catch (err) {
    console.error(`[sanity] Failed to fetch service detail for "${slug}":`, err);
    return null;
  }
}
