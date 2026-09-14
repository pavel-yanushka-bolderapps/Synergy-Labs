import { sanityClient } from "sanity:client";
import { createImageUrlBuilder } from "@sanity/image-url";
import { stegaClean } from "@sanity/client/stega";
import { loadQuery } from "./loadQuery";
import type {
  ServiceItem,
  ServiceFeaturesContent,
  ServiceValueCard,
  ServiceProcessContent,
} from "./types";

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
  /**
   * The detail page's <h1>, which is a longer headline than the `title`
   * used on the Services grid cards. Newlines are intentional line breaks.
   * Falls back to `title` when the field is empty in Sanity.
   */
  heroHeading: string;
  heroDescription?: string;
  heroImageSrc?: string;
  /** Lottie animation for the hero slot. Takes precedence over heroImageSrc. */
  heroLottieSrc?: string;
  /** CSS `aspect-ratio` value for the hero Lottie -- see getLottieAspectRatio(). */
  heroLottieAspectRatio?: string;
  bannerWords: string[];
  /**
   * The features block, or undefined when this service has no
   * `featuresHeading` -- the page skips the whole section in that case
   * rather than rendering cards under no headline.
   */
  features?: ServiceFeaturesContent;
  /** Cards for the green "why work with us" band; empty means no band. */
  valueCards: ServiceValueCard[];
  /**
   * The "How We Work" timeline, or undefined when this service has no
   * steps -- the section is skipped rather than rendered as a bare heading.
   */
  process?: ServiceProcessContent;
  metaDescription?: string;
}

interface SanityServiceDetailDoc {
  title: string;
  heroHeading?: string | null;
  heroDescription?: string | null;
  heroImage?: Record<string, unknown> | null;
  heroLottie?: { asset?: { url?: string | null; extension?: string | null } | null } | null;
  bannerWords?: string[] | null;
  featuresHeading?: string | null;
  featuresLead?: string | null;
  featuresBody?: string | null;
  features?: { title: string; image?: Record<string, unknown> | null }[] | null;
  valueCards?: { icon?: string | null; title: string; description?: string | null }[] | null;
  processHeading?: string | null;
  processEyebrow?: string | null;
  processSteps?: { icon?: string | null; title: string; description?: string | null }[] | null;
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
        title, heroHeading, heroDescription, heroImage,
        heroLottie{ asset->{ url, extension } },
        bannerWords, featuresHeading, featuresLead, featuresBody,
        features[]{ title, image },
        valueCards[]{ icon, title, description },
        processHeading, processEyebrow,
        processSteps[]{ icon, title, description },
        metaDescription
      }`,
      params: { href: `/our-services/${slug}` },
    });

    if (!doc) return null;

    // stegaClean for the same reason as in getLottieAspectRatio(): this URL
    // is fetched at build time and handed to the player as a canvas `src`,
    // never rendered as text, so the invisible preview-mode characters would
    // only ever corrupt the request.
    const heroLottieSrc = stegaClean(doc.heroLottie?.asset?.url ?? undefined) ?? undefined;

    return {
      title: doc.title,
      heroHeading: doc.heroHeading?.trim() || doc.title,
      heroDescription: doc.heroDescription ?? undefined,
      heroImageSrc: doc.heroImage ? imageBuilder.image(doc.heroImage).width(800).url() : undefined,
      heroLottieSrc,
      heroLottieAspectRatio: heroLottieSrc
        ? await getLottieAspectRatio(heroLottieSrc, doc.heroLottie?.asset?.extension)
        : undefined,
      bannerWords: doc.bannerWords ?? [],
      // The heading is what makes the section exist: cards with no headline
      // above them read as loose fragments, so a service that has only
      // filled in cards gets no section at all until it has a heading too.
      features: doc.featuresHeading?.trim()
        ? {
            heading: doc.featuresHeading.trim(),
            lead: doc.featuresLead?.trim() || undefined,
            body: doc.featuresBody?.trim() || undefined,
            cards: (doc.features ?? []).map((feature) => ({
              title: feature.title,
              imageSrc: feature.image
                ? imageBuilder.image(feature.image).width(300).url()
                : undefined,
            })),
          }
        : undefined,
      valueCards: (doc.valueCards ?? []).map((card) => ({
        // stegaClean: the icon is a lookup key into the inline SVG set in
        // ServiceValues.astro, compared rather than displayed, so preview
        // mode's invisible characters would silently miss every match --
        // same trap as the Lottie extension above.
        icon: stegaClean(card.icon ?? undefined) || "tools",
        title: card.title,
        description: card.description ?? undefined,
      })),
      // Steps are what make the timeline worth showing -- a heading with no
      // stages under it is just a stray title -- so the section hinges on
      // them rather than on the heading.
      process: doc.processSteps?.length
        ? {
            heading: doc.processHeading?.trim() || "How We Work",
            eyebrow: doc.processEyebrow?.trim() || undefined,
            steps: doc.processSteps.map((step) => ({
              // stegaClean for the same reason as the valueCards icon above.
              icon: stegaClean(step.icon ?? undefined) || "research",
              title: step.title,
              description: step.description ?? undefined,
            })),
          }
        : undefined,
      metaDescription: doc.metaDescription ?? undefined,
    };
  } catch (err) {
    console.error(`[sanity] Failed to fetch service detail for "${slug}":`, err);
    return null;
  }
}

/**
 * A hero <img> gets its height for free from the file's intrinsic aspect
 * ratio; a Lottie on a <canvas> does not -- the canvas has no intrinsic
 * size, so without a ratio the slot would collapse to nothing (or need an
 * arbitrary hardcoded height that letterboxes every animation differently).
 *
 * Lottie JSON carries the composition's `w`/`h` at the top level, so read
 * them once at build time and hand the page a CSS `aspect-ratio` value. That
 * reproduces the <img> behaviour: the slot is exactly as tall as the
 * animation wants to be, and it's reserved before the player boots, so there
 * is no layout shift.
 *
 * Returns undefined -- and the page falls back to a square -- for a `.lottie`
 * bundle (a zip we'd have to unpack for the same two numbers) or if the fetch
 * fails. A missing ratio is a cosmetic fallback, never a build failure.
 */
const lottieAspectRatios = new Map<string, string | undefined>();

async function getLottieAspectRatio(
  url: string,
  extension?: string | null
): Promise<string | undefined> {
  // In preview mode loadQuery() stega-encodes strings, hiding the source
  // document/field inside them as invisible Unicode. That is what makes
  // click-to-edit work on rendered copy, but `extension` is control data
  // that gets compared rather than displayed, and the encoded "json" no
  // longer equals "json" -- which silently sent every animation down the
  // square-fallback path below. Compare the cleaned value.
  if (extension && stegaClean(extension) !== "json") return undefined;
  // Several services can share one animation, and getStaticPaths() builds
  // every page in one process, so don't refetch a file already read.
  if (lottieAspectRatios.has(url)) return lottieAspectRatios.get(url);

  let ratio: string | undefined;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const { w, h } = (await res.json()) as { w?: unknown; h?: unknown };
      if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
        ratio = `${w} / ${h}`;
      }
    } else {
      console.warn(`[sanity] Hero Lottie ${url} returned ${res.status}; using a square hero slot.`);
    }
  } catch (err) {
    console.warn(`[sanity] Could not read dimensions from hero Lottie ${url}:`, err);
  }

  lottieAspectRatios.set(url, ratio);
  return ratio;
}
