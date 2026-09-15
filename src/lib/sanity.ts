import { sanityClient } from "sanity:client";
import { createImageUrlBuilder } from "@sanity/image-url";
import { stegaClean } from "@sanity/client/stega";
import { loadQuery } from "./loadQuery";
import type {
  ServiceItem,
  ServiceFeaturesContent,
  ServiceValueCard,
  ServiceProcessContent,
  CaseStudy,
  CaseStudyFact,
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

// --- Portfolio case studies (src/pages/projects/casestudy/[slug].astro) ---

interface SanityCaseStudyDoc {
  slug?: { current?: string } | null;
  clientName: string;
  headline?: string | null;
  intro?: string | null;
  logo?: Record<string, unknown> | null;
  brandColor?: string | null;
  heroImage?: Record<string, unknown> | null;
  heroImages?: Record<string, unknown>[] | null;
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
  metaClient?: string | null;
  metaYear?: string | null;
  metaTechStack?: string | null;
  metaCategory?: string | null;
  overviewHeading?: string | null;
  overviewBody?: string | null;
  contentBlocks?:
    | {
        heading: string;
        body?: string | null;
        bullets?: string[] | null;
        image?: Record<string, unknown> | null;
        imageSide?: string | null;
      }[]
    | null;
  statsEnabled?: boolean | null;
  statsIcon?: Record<string, unknown> | null;
  statsHeading?: string | null;
  statsSubheading?: string | null;
  statsBgColor?: string | null;
  statsAccentColor?: string | null;
  statsItems?: { value: string; label: string }[] | null;
  metaDescription?: string | null;
}

/**
 * Editors type paragraphs into a single textarea separated by blank lines
 * (the same convention the service hero headings use for line breaks), so
 * split on blank lines rather than asking them to manage an array of
 * strings or learn a rich-text editor for what is plain prose.
 */
function toParagraphs(value?: string | null): string[] {
  return (value ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Every colour an editor picks ends up in an inline `style` attribute, which
 * makes validating them here a correctness *and* an injection concern rather
 * than just a tidiness one. Anything that isn't a plain hex code is dropped
 * for the fallback, and #abc is expanded to #aabbcc so callers only ever see
 * one shape.
 */
const DEFAULT_BRAND_COLOR = "#007244";

function toHexColor(value: string | null | undefined, fallback: string): string {
  // stegaClean for the usual reason: in preview mode this string carries
  // invisible characters that make click-to-edit work on rendered copy, and
  // they would turn a valid hex code into an invalid CSS colour.
  const raw = (stegaClean(value ?? undefined) ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : fallback;
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
}

/**
 * The same colour at zero alpha. A gradient written `transparent -> #ff6500`
 * fades through transparent *black*, which dirties the middle of the ramp;
 * naming the faded colour explicitly keeps the whole gradient on one hue.
 */
function withZeroAlpha(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / 0)`;
}

const CASE_STUDY_PROJECTION = `{
  slug, clientName, headline, intro, logo, brandColor, heroImage, heroImages,
  appStoreUrl, playStoreUrl,
  metaClient, metaYear, metaTechStack, metaCategory,
  overviewHeading, overviewBody,
  contentBlocks[]{ heading, body, bullets, image, imageSide },
  statsEnabled, statsIcon, statsHeading, statsSubheading,
  statsBgColor, statsAccentColor,
  statsItems[]{ value, label },
  metaDescription
}`;

function toCaseStudy(doc: SanityCaseStudyDoc): CaseStudy {
  const facts: CaseStudyFact[] = [
    { label: "Client", value: doc.metaClient ?? "" },
    { label: "Year", value: doc.metaYear ?? "" },
    { label: "Tech Stack", value: doc.metaTechStack ?? "" },
    { label: "Category", value: doc.metaCategory ?? "" },
  ].filter((f) => f.value.trim().length > 0);

  const brandColor = toHexColor(doc.brandColor, DEFAULT_BRAND_COLOR);

  // Two gates, not one. The toggle is the editor saying they want the band;
  // the numbers are what there is to put in it. Rendering a heading over an
  // empty row because the toggle got flipped before the content was written
  // is worse than waiting for the numbers, so both have to be true.
  const statsItems = (doc.statsItems ?? []).filter((item) => item.value && item.label);
  const stats =
    doc.statsEnabled && statsItems.length > 0
      ? {
          heading: doc.statsHeading?.trim() || "Achievements and Impact",
          subheading: doc.statsSubheading?.trim() || undefined,
          iconSrc: doc.statsIcon
            ? imageBuilder.image(doc.statsIcon).width(128).url()
            : undefined,
          // The band defaults to the client's own colour rather than to a
          // second hardcoded green, so a study that fills in nothing here
          // still comes out looking like the rest of its page.
          bgColor: toHexColor(doc.statsBgColor, brandColor),
          accentColor: toHexColor(doc.statsAccentColor, "#DAFF81"),
          items: statsItems,
        }
      : undefined;

  return {
    slug: doc.slug?.current ?? "",
    clientName: doc.clientName,
    headline: doc.headline?.trim() || doc.clientName,
    intro: doc.intro?.trim() || undefined,
    logoSrc: doc.logo ? imageBuilder.image(doc.logo).width(400).url() : undefined,
    brandColor,
    brandColorFade: withZeroAlpha(brandColor),
    heroImageSrc: doc.heroImage ? imageBuilder.image(doc.heroImage).width(900).url() : undefined,
    heroImageSrcs: (doc.heroImages ?? []).map((img) =>
      imageBuilder.image(img).width(600).url()
    ),
    // stegaClean: these end up in href attributes, where the invisible
    // visual-editing characters would corrupt the address.
    appStoreUrl: stegaClean(doc.appStoreUrl ?? undefined) || undefined,
    playStoreUrl: stegaClean(doc.playStoreUrl ?? undefined) || undefined,
    facts,
    overviewHeading: doc.overviewHeading?.trim() || undefined,
    overviewParagraphs: toParagraphs(doc.overviewBody),
    blocks: (doc.contentBlocks ?? []).map((block, i) => {
      // "auto" means alternate: first block image left, then right, and so
      // on -- which is what every one of the original case studies did.
      const side = stegaClean(block.imageSide ?? undefined);
      return {
        heading: block.heading,
        paragraphs: toParagraphs(block.body),
        bullets: (block.bullets ?? []).map((b) => b.trim()).filter(Boolean),
        imageSrc: block.image ? imageBuilder.image(block.image).width(800).url() : undefined,
        imageSide:
          side === "left" || side === "right" ? side : i % 2 === 0 ? "left" : "right",
      };
    }),
    stats,
    metaDescription: doc.metaDescription ?? undefined,
  };
}

/** Slugs for every case study that can be built, for getStaticPaths(). */
export async function getCaseStudySlugs(): Promise<string[]> {
  try {
    const slugs = await loadQuery<string[]>({
      query: `*[_type == "project" && defined(slug.current)].slug.current`,
    });
    return slugs.map((s) => stegaClean(s)).filter(Boolean);
  } catch (err) {
    console.error("[sanity] Failed to fetch case study slugs:", err);
    return [];
  }
}

export async function getCaseStudyBySlug(slug: string): Promise<CaseStudy | null> {
  try {
    const doc = await loadQuery<SanityCaseStudyDoc | null>({
      query: `*[_type == "project" && slug.current == $slug][0]${CASE_STUDY_PROJECTION}`,
      params: { slug },
    });
    return doc ? toCaseStudy(doc) : null;
  } catch (err) {
    console.error(`[sanity] Failed to fetch case study "${slug}":`, err);
    return null;
  }
}

/**
 * Strips `caseStudyHref` from any portfolio item whose case study does not
 * exist in Sanity.
 *
 * The portfolio lists in src/content/*.ts were written when the old Webflow
 * site was the reference, and they point at nine case studies that were
 * never built -- every one of those was a 404. Rather than hand-maintaining
 * two lists that have to agree, the grids ask Sanity what actually exists
 * and hide the button for the rest.
 */
export async function withExistingCaseStudies<T extends { caseStudyHref?: string }>(
  items: T[]
): Promise<T[]> {
  const slugs = new Set(await getCaseStudySlugs());

  return items.map((item) => {
    const slug = item.caseStudyHref?.replace(/^\/projects\/casestudy\//, "").replace(/\/$/, "");
    return slug && slugs.has(slug) ? item : { ...item, caseStudyHref: undefined };
  });
}
