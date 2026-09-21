import { sanityClient } from "sanity:client";
import { createImageUrlBuilder } from "@sanity/image-url";
import { stegaClean } from "@sanity/client/stega";
import { loadQuery } from "./loadQuery";
import locationsData from "../../scripts/data/locations.json";
import locationServicesData from "../../scripts/data/location-services.json";
import locationIndustriesData from "../../scripts/data/location-industries.json";
import locationTechnologiesData from "../../scripts/data/location-technologies.json";
import blogPostsData from "../../scripts/data/blog-posts.json";
import blogAuthorsData from "../../scripts/data/blog-authors.json";
import clutchLandingsData from "../../scripts/data/clutch-landings.json";
import type {
  LocationDetail,
  LocationServiceCard,
  LocationTechnologyGroup,
  LocationItem,
  ServiceItem,
  ServiceFeaturesContent,
  ServiceValueCard,
  ServiceProcessContent,
  CaseStudy,
  CaseStudyFact,
  CaseStudySection,
  CaseStudySectionBackground,
  BlogAuthor,
  BlogPost,
  BlogPostSummary,
  ClutchLanding,
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

interface SanityLocationDoc {
  city: string;
  address: string;
  isHeadquarters?: boolean;
  image?: Record<string, unknown> | null;
}

/**
 * Fetches the offices shown on /locations and in the homepage's Locations
 * section (see src/sanity/schemaTypes/location.ts).
 *
 * Same contract as getServices() above: `null` rather than a throw when
 * Sanity isn't configured, has no `location` documents, or the request
 * fails, so callers fall back to the static list in src/content/home.ts and
 * an unreachable CMS never breaks the build.
 *
 * The order matters more than it looks: the first two documents get the wide
 * cards, the next three the row below, and the rest go behind the "Other
 * locations" button -- so `order` is really "what a visitor sees before
 * expanding". Ties fall back to creation date for a stable build.
 */
export async function getLocations(): Promise<LocationItem[] | null> {
  try {
    const docs = await loadQuery<SanityLocationDoc[]>({
      query: `*[_type == "location"] | order(order asc, _createdAt asc){ city, address, isHeadquarters, image }`,
    });

    if (!docs || docs.length === 0) return null;

    return docs.map((doc) => ({
      city: doc.city,
      address: doc.address,
      isHeadquarters: doc.isHeadquarters ?? false,
      // 1600 wide: the two top cards run half the 1280 container on desktop
      // and the full viewport width on a phone, so the smaller default this
      // used at 400 would have been visibly soft on both.
      imageSrc: doc.image ? imageBuilder.image(doc.image).width(1600).url() : undefined,
    }));
  } catch (err) {
    console.error("[sanity] Failed to fetch locations, falling back to static content:", err);
    return null;
  }
}

// --- Individual office pages (src/pages/locations/[slug].astro) ---
//
// Unlike the sections above, these read through a repo-side copy of the
// content as well as Sanity. scripts/data/locations.json is the transcription
// of the Webflow Locations collection; it is the seeder's input *and* the
// build-time fallback, so the pages exist before anyone runs the seeder and
// switch over to Studio once they have. A `location` document always wins
// where one exists, matched on slug.

interface SanityLocationPageDoc extends SanityLocationDoc {
  slug?: { current?: string };
  mainHeading?: string;
  mainDescription?: string;
  description?: string;
  mapCode?: string;
  jsonLd?: string;
  servicesHeading?: string;
  servicesDescription?: string;
  industriesHeading?: string;
  industriesDescription?: string;
  processHeading?: string;
  processDescription?: string;
  whyChooseUsHeading?: string;
  whyChooseUsDescription?: string;
  serviceAreaHeading?: string;
  serviceAreaDescription?: string;
  faqHeading?: string;
  technologiesHeading?: string;
  contactHeading?: string;
  contactDescription?: string;
  caseStudiesHeading?: string;
  caseStudies?: { title?: string; body?: string }[];
  services?: LocationPickDoc<"service">[];
  industries?: LocationPickDoc<"industry">[];
  technologies?: { title?: string; technologies?: string }[];
  techStack?: string;
  pricingHeading?: string;
  pricingTable?: string;
}

/** An office's pick from a shared catalogue, plus its optional overrides. */
type LocationPickDoc<K extends string> = {
  titleOverride?: string;
  descriptionOverride?: string;
} & {
  [P in K]?: { title?: string; description?: string; image?: Record<string, unknown> | null };
};

/** Collapses one such pick to a card, or null when the catalogue entry is gone. */
function resolvePick(
  pick: { titleOverride?: string; descriptionOverride?: string },
  entry: { title?: string; description?: string; image?: Record<string, unknown> | null } | undefined
): LocationServiceCard | null {
  const title = pick.titleOverride?.trim() || entry?.title;
  const description = pick.descriptionOverride?.trim() || entry?.description;
  if (!title || !description) return null;
  return {
    title,
    description,
    imageSrc: entry?.image ? imageBuilder.image(entry.image).width(1200).url() : undefined,
  };
}

const LOCATION_PAGE_FIELDS = `
  city, address, isHeadquarters, image, "slug": slug.current,
  mainHeading, mainDescription, description, mapCode, jsonLd,
  servicesHeading, servicesDescription,
  industriesHeading, industriesDescription,
  processHeading, processDescription,
  whyChooseUsHeading, whyChooseUsDescription,
  serviceAreaHeading, serviceAreaDescription,
  faqHeading, technologiesHeading,
  contactHeading, contactDescription,
  caseStudiesHeading, caseStudies[]{ title, body },
  services[]{ titleOverride, descriptionOverride, service->{ title, description, image } },
  industries[]{ titleOverride, descriptionOverride, industry->{ title, description, image } },
  technologies[]->{ title, technologies },
  techStack, pricingHeading, pricingTable
`;

/** Every office that should get a page, Sanity's merged over the repo copy. */
export async function getLocationDetails(): Promise<LocationDetail[]> {
  // The repo copy stores picks as the slugs the Webflow export used, which the
  // catalogue files are keyed by exactly -- resolve them to the same shape the
  // Sanity path returns.
  type CatalogueEntry = { slug: string; title: string; description: string; image?: string };
  const byslug = (rows: CatalogueEntry[]) =>
    new Map(rows.map((row) => [row.slug, { title: row.title, description: row.description, imageSrc: row.image }]));

  const serviceCatalogue = byslug(locationServicesData as CatalogueEntry[]);
  const industryCatalogue = byslug(locationIndustriesData as CatalogueEntry[]);
  const technologyCatalogue = new Map(
    (locationTechnologiesData as { slug: string; title: string; technologies: string }[]).map((row) => [
      row.slug,
      { title: row.title, technologies: row.technologies },
    ])
  );
  const pick = (slugs: string[] | undefined, catalogue: Map<string, LocationServiceCard>) =>
    (slugs ?? [])
      .map((slug) => catalogue.get(slug))
      .filter((card): card is LocationServiceCard => card !== undefined);

  const fallback = (
    locationsData as (LocationDetail & {
      serviceRefs?: string[];
      industryRefs?: string[];
      technologyRefs?: string[];
    })[]
  ).map((loc) => ({
    ...loc,
    services: pick(loc.serviceRefs, serviceCatalogue),
    industries: pick(loc.industryRefs, industryCatalogue),
    technologies: (loc.technologyRefs ?? [])
      .map((slug) => technologyCatalogue.get(slug))
      .filter((group): group is LocationTechnologyGroup => group !== undefined),
  }));

  let docs: SanityLocationPageDoc[] | null = null;
  try {
    docs = await loadQuery<SanityLocationPageDoc[]>({
      query: `*[_type == "location" && defined(slug.current)] | order(order asc, city asc){${LOCATION_PAGE_FIELDS}}`,
    });
  } catch (err) {
    console.error("[sanity] Failed to fetch location pages, using the repo copy:", err);
  }

  if (!docs || docs.length === 0) return fallback;

  const bySlug = new Map(fallback.map((loc) => [loc.slug, loc]));

  for (const doc of docs) {
    const slug = doc.slug;
    if (!slug) continue;

    const existing = bySlug.get(slug);
    // Drop the keys Sanity left empty so they don't blank out a populated
    // fallback -- a half-filled document should add to the repo copy, not
    // replace it with holes.
    const fromSanity = Object.fromEntries(
      Object.entries({
        ...doc,
        imageSrc: doc.image ? imageBuilder.image(doc.image).width(1600).url() : undefined,
        // Visual editing encodes an invisible provenance marker into every
        // string it returns. Harmless in prose, fatal here: the markers land
        // inside the JSON and JSON.parse rejects it, so the page drops the
        // structured data entirely. This field is machine-read, never edited
        // in place, so strip them.
        jsonLd: doc.jsonLd ? stegaClean(doc.jsonLd) : undefined,
        caseStudies: doc.caseStudies
          ?.filter((cs): cs is { title: string; body: string } => Boolean(cs?.title && cs?.body))
          .map((cs) => ({ title: cs.title, body: cs.body })),
        // An office picks from the shared catalogues and may override the title
        // or body where the copy has to name the city.
        services: doc.services
          ?.map((pick) => resolvePick(pick, pick.service))
          .filter((card): card is LocationServiceCard => card !== null),
        industries: doc.industries
          ?.map((pick) => resolvePick(pick, pick.industry))
          .filter((card): card is LocationServiceCard => card !== null),
        technologies: doc.technologies
          ?.filter((t): t is LocationTechnologyGroup => Boolean(t?.title && t?.technologies)),
        image: undefined,
      }).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );

    bySlug.set(slug, { ...(existing ?? { slug }), ...fromSanity } as LocationDetail);
  }

  return [...bySlug.values()];
}

export async function getLocationSlugs(): Promise<string[]> {
  return (await getLocationDetails()).map((loc) => loc.slug);
}

export async function getLocationDetailBySlug(slug: string): Promise<LocationDetail | null> {
  return (await getLocationDetails()).find((loc) => loc.slug === slug) ?? null;
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
  sections?: SanitySection[] | null;
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
 * Black or white, whichever is actually readable on `hex`.
 *
 * Every brand band printed white text regardless, which is fine for a navy
 * or a violet and fails outright on a yellow. The threshold is the point
 * where white and black give equal contrast against the same background --
 * solve (1.05)/(L+0.05) = (L+0.05)/0.05 and you get L = 0.179 -- so each
 * colour gets whichever side of that it falls on. Luminance is the WCAG
 * relative-luminance formula, not a plain average: the eye reads green as
 * far brighter than blue at the same number, and averaging gets yellow badly
 * wrong for exactly that reason.
 */
function readableInk(hex: string): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.179 ? "#1b1b1b" : "#ffffff";
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

// Every section type's fields in one projection. GROQ returns only the keys a
// given object actually has, so asking for all of them across a
// mixed-type array is fine -- each item comes back with its own `_type` and
// whichever of these it defines.
const SECTIONS_PROJECTION = `sections[]{
  _type, _key, background,
  eyebrow, heading, lead, body, bullets, image, imageSide, layout,
  items[]{ title, description, image, value, label },
  linkLabel, linkHref, imageSize,
  quote, authorName, authorRole, avatar,
  icon, subheading, bgColor, accentColor
}`;

const CASE_STUDY_PROJECTION = `{
  slug, clientName, headline, intro, logo, brandColor, heroImage, heroImages,
  ${SECTIONS_PROJECTION},
  appStoreUrl, playStoreUrl,
  metaClient, metaYear, metaTechStack, metaCategory,
  overviewHeading, overviewBody,
  contentBlocks[]{ heading, body, bullets, image, imageSide },
  statsEnabled, statsIcon, statsHeading, statsSubheading,
  statsBgColor, statsAccentColor,
  statsItems[]{ value, label },
  metaDescription
}`;

/**
 * Raw page-builder sections as they come back from GROQ. Every field of
 * every section type is optional here because one array holds several
 * shapes; `_type` is what says which fields are actually meaningful.
 */
interface SanitySection {
  _type: string;
  _key: string;
  background?: string | null;
  eyebrow?: string | null;
  heading?: string | null;
  lead?: string | null;
  body?: string | null;
  bullets?: string[] | null;
  image?: Record<string, unknown> | null;
  imageSide?: string | null;
  layout?: string | null;
  items?:
    | {
        title?: string | null;
        description?: string | null;
        image?: Record<string, unknown> | null;
        value?: string | null;
        label?: string | null;
      }[]
    | null;
  imageSize?: string | null;
  linkLabel?: string | null;
  linkHref?: string | null;
  quote?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  avatar?: Record<string, unknown> | null;
  icon?: Record<string, unknown> | null;
  subheading?: string | null;
  bgColor?: string | null;
  accentColor?: string | null;
}

// stegaClean because these are compared, not displayed -- preview mode's
// invisible characters would make every one of them miss its match and fall
// through to the default. Same trap as the service-page icon keys.
function toBackground(value?: string | null): CaseStudySectionBackground {
  const v = stegaClean(value ?? undefined);
  return v === "tinted" || v === "brand" ? v : "default";
}

/**
 * Turns the raw array into the discriminated union the components switch on.
 *
 * Anything that can't be rendered is dropped rather than passed through
 * half-built: a section whose required field is empty would otherwise reach
 * the page as a heading over nothing. Dropping it here means the page never
 * has to guard, and an editor sees the section simply not appear -- which is
 * the same signal the Studio's own validation is already giving them.
 */
function toSections(raw: SanitySection[] | null | undefined, brandColor: string): CaseStudySection[] {
  const sections: CaseStudySection[] = [];
  // Alternating counts only the text & image blocks, so dropping a feature
  // grid between two of them doesn't flip the side of every block below.
  let splitIndex = 0;

  for (const s of raw ?? []) {
    const type = stegaClean(s._type);
    const background = toBackground(s.background);
    const heading = s.heading?.trim();

    if (type === "splitBlock") {
      if (!heading) continue;
      const side = stegaClean(s.imageSide ?? undefined);
      sections.push({
        _type: "splitBlock",
        eyebrow: s.eyebrow?.trim() || undefined,
        heading,
        paragraphs: toParagraphs(s.body),
        bullets: (s.bullets ?? []).map((b) => b.trim()).filter(Boolean),
        imageSrc: s.image ? imageBuilder.image(s.image).width(900).url() : undefined,
        imageSide:
          side === "left" || side === "right"
            ? side
            : splitIndex++ % 2 === 0
              ? "left"
              : "right",
        background,
      });
      continue;
    }

    if (type === "featureGrid") {
      const items = (s.items ?? [])
        .filter((item) => item.title?.trim())
        .map((item) => ({
          title: item.title!.trim(),
          description: item.description?.trim() || undefined,
          imageSrc: item.image ? imageBuilder.image(item.image).width(300).url() : undefined,
        }));
      if (!heading || items.length === 0) continue;
      sections.push({
        _type: "featureGrid",
        eyebrow: s.eyebrow?.trim() || undefined,
        heading,
        lead: s.lead?.trim() || undefined,
        layout: stegaClean(s.layout ?? undefined) === "tiles" ? "tiles" : "cards",
        items,
        background,
      });
      continue;
    }

    if (type === "showcase") {
      if (!heading || !s.image) continue;
      const linkLabel = s.linkLabel?.trim();
      const linkHref = stegaClean(s.linkHref ?? undefined);
      sections.push({
        _type: "showcase",
        eyebrow: s.eyebrow?.trim() || undefined,
        heading,
        body: s.body?.trim() || undefined,
        imageSrc: imageBuilder.image(s.image).width(1600).url(),
        imageSize: ((v) => (v === "small" || v === "full" ? v : "medium"))(
          stegaClean(s.imageSize ?? undefined)
        ),
        // A label with no address is a dead button and an address with no
        // label is an invisible one, so the link needs both or neither.
        link: linkLabel && linkHref ? { label: linkLabel, href: linkHref } : undefined,
        background,
      });
      continue;
    }

    if (type === "statsBand") {
      const items = (s.items ?? [])
        .filter((item) => item.value?.trim() && item.label?.trim())
        .map((item) => ({
          value: item.value!.trim(),
          label: item.label!.trim(),
          description: item.description?.trim() || undefined,
        }));
      if (items.length === 0) continue;
      sections.push({
        _type: "statsBand",
        heading: heading || "Achievements and Impact",
        subheading: s.subheading?.trim() || undefined,
        iconSrc: s.icon ? imageBuilder.image(s.icon).width(128).url() : undefined,
        ...((bg, accent) => ({
          bgColor: bg,
          bgInk: readableInk(bg),
          accentColor: accent,
          accentInk: readableInk(accent),
        }))(toHexColor(s.bgColor, brandColor), toHexColor(s.accentColor, "#DAFF81")),
        items,
      });
      continue;
    }

    if (type === "testimonial") {
      const quote = s.quote?.trim();
      if (!quote) continue;
      sections.push({
        _type: "testimonial",
        quote,
        authorName: s.authorName?.trim() || undefined,
        authorRole: s.authorRole?.trim() || undefined,
        avatarSrc: s.avatar ? imageBuilder.image(s.avatar).width(200).url() : undefined,
        background,
      });
      continue;
    }

    console.warn(`[sanity] Unknown case study section type "${type}" -- skipping it.`);
  }

  return sections;
}

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
          ...((bg, accent) => ({
            bgColor: bg,
            bgInk: readableInk(bg),
            accentColor: accent,
            accentInk: readableInk(accent),
          }))(toHexColor(doc.statsBgColor, brandColor), toHexColor(doc.statsAccentColor, "#DAFF81")),
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
    brandInk: readableInk(brandColor),
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
    sections: toSections(doc.sections, brandColor),
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

// --- Blog (src/pages/blog/, src/pages/blog/[slug].astro) ------------------
//
// Same arrangement as the location pages above: scripts/data/blog-posts.json
// is the transcription of the Webflow Blogs collection, and is both the
// seeder's input and the build-time fallback, so /blog works before anyone
// runs scripts/seed-blog.mjs and switches over to Studio once they have. A
// `blogPost` document always wins where one exists, matched on slug.
//
// The article bodies live in a separate file (scripts/data/blog-articles.json,
// ~6 MB) that is imported lazily, below, so the listing pages and the homepage
// never pull the whole archive into their module graph to render a card.

// Both projections below flatten `slug` to `slug.current`, so these are plain
// strings here -- unlike the location docs above, which project the object.
interface SanityBlogAuthorDoc {
  name?: string;
  slug?: string;
  role?: string;
  image?: Record<string, unknown> | null;
}

interface SanityBlogPostDoc {
  title?: string;
  slug?: string;
  date?: string;
  previewText?: string;
  previewImageText?: string;
  template?: string;
  readingMinutes?: number;
  articleHtml?: string;
  author?: SanityBlogAuthorDoc | null;
}

const BLOG_POST_FIELDS = `
  title,
  "slug": slug.current,
  date,
  previewText,
  previewImageText,
  template,
  readingMinutes,
  author->{ name, "slug": slug.current, role, image }
`;

/** 225 words a minute, matching scripts/extract-blog-csv.mjs. */
function estimateReadingMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

function toAuthor(doc: SanityBlogAuthorDoc | null | undefined): BlogAuthor | undefined {
  if (!doc?.name) return undefined;
  return {
    // stegaClean: the slug is compared, not displayed, so preview mode's
    // invisible characters would make every lookup miss. Same trap as the
    // service-page icon keys above.
    slug: stegaClean(doc.slug ?? "") as string,
    name: doc.name,
    role: doc.role,
    imageSrc: doc.image ? imageBuilder.image(doc.image).width(160).url() : undefined,
  };
}

/** The repo copy, with author slugs resolved against blog-authors.json. */
function fallbackPosts(): BlogPostSummary[] {
  const authors = new Map(
    (blogAuthorsData as { slug: string; name: string; image?: string }[]).map((a) => [
      a.slug,
      { slug: a.slug, name: a.name, imageSrc: a.image },
    ])
  );

  return (blogPostsData as (Omit<BlogPostSummary, "author"> & { author?: string | null })[]).map(
    (post) => ({
      ...post,
      author: post.author ? authors.get(post.author) : undefined,
      previewText: post.previewText || undefined,
      previewImageText: post.previewImageText || undefined,
      template: post.template || undefined,
    })
  );
}

/**
 * Every published post, newest first -- what /blog paginates over, and what
 * the homepage and /synergy-builder take the top three of.
 *
 * Bodies are deliberately not included; see getBlogPostBySlug() for those.
 */
let blogPostsPromise: Promise<BlogPostSummary[]> | null = null;

export function getBlogPosts(): Promise<BlogPostSummary[]> {
  // Every one of the 316 post pages needs the full list (for its slug, and
  // again for the "More from the blog" row), as do /blog and its 26 pager
  // pages. Without this the build makes the same query some 700 times.
  // Cached as the promise rather than the result so concurrent page builds
  // share one request instead of racing to start their own.
  blogPostsPromise ??= fetchBlogPosts();
  return blogPostsPromise;
}

async function fetchBlogPosts(): Promise<BlogPostSummary[]> {
  const fallback = fallbackPosts();

  let docs: SanityBlogPostDoc[] | null = null;
  try {
    docs = await loadQuery<SanityBlogPostDoc[]>({
      query: `*[_type == "blogPost" && defined(slug.current)] | order(date desc){${BLOG_POST_FIELDS}}`,
    });
  } catch (err) {
    console.error("[sanity] Failed to fetch blog posts, using the repo copy:", err);
  }

  if (!docs || docs.length === 0) return fallback;

  const bySlug = new Map(fallback.map((post) => [post.slug, post]));

  for (const doc of docs) {
    const slug = stegaClean(doc.slug ?? "") as string;
    if (!slug || !doc.title) continue;

    // Drop the keys Sanity left empty so a half-filled document adds to the
    // repo copy rather than replacing it with holes -- as on the office pages.
    const fromSanity = Object.fromEntries(
      Object.entries({
        slug,
        title: doc.title,
        date: doc.date,
        previewText: doc.previewText,
        previewImageText: doc.previewImageText,
        template: doc.template ? (stegaClean(doc.template) as string) : undefined,
        readingMinutes: doc.readingMinutes,
        author: toAuthor(doc.author),
      }).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );

    bySlug.set(slug, { ...(bySlug.get(slug) ?? { slug }), ...fromSanity } as BlogPostSummary);
  }

  return [...bySlug.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function getBlogPostSlugs(): Promise<string[]> {
  return (await getBlogPosts()).map((post) => post.slug);
}

/**
 * One post with its body. The 6 MB archive is behind a dynamic import so it
 * only lands in the bundle for the route that actually renders an article --
 * a static `import` here would put it in every page that touches this module.
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const summary = (await getBlogPosts()).find((post) => post.slug === slug);
  if (!summary) return null;

  let articleHtml: string | undefined;

  try {
    const doc = await loadQuery<SanityBlogPostDoc | null>({
      query: `*[_type == "blogPost" && slug.current == $slug][0]{ articleHtml }`,
      params: { slug },
    });
    // stegaClean: the body goes through `set:html`, where the invisible
    // markers would be injected into attribute values and tag names rather
    // than into text -- that is malformed HTML, not a click-to-edit overlay.
    if (doc?.articleHtml) articleHtml = stegaClean(doc.articleHtml) as string;
  } catch (err) {
    console.error(`[sanity] Failed to fetch the body for /blog/${slug}, using the repo copy:`, err);
  }

  if (!articleHtml) {
    const { default: articles } = await import("../../scripts/data/blog-articles.json");
    articleHtml = (articles as Record<string, string>)[slug];
  }

  if (!articleHtml) return null;

  return {
    ...summary,
    articleHtml,
    readingMinutes: summary.readingMinutes || estimateReadingMinutes(articleHtml),
  };
}


// --- Clutch landing pages (src/pages/[...landing].astro) ------------------
//
// Same arrangement as the offices and the blog: scripts/data/clutch-landings.json
// is the transcription of the 24 /top-* pages from the Webflow site, and is
// both the seeder's input and the build-time fallback. A `clutchLanding`
// document wins where one exists, matched on slug.

interface SanityClutchLandingDoc {
  slug?: string;
  heading?: string;
  pitch?: string;
  metaTitle?: string;
  metaDescription?: string;
  ctaHeading?: string;
  canonicalSlug?: string;
  locale?: string;
}

export async function getClutchLandings(): Promise<ClutchLanding[]> {
  const fallback = clutchLandingsData as ClutchLanding[];

  let docs: SanityClutchLandingDoc[] | null = null;
  try {
    docs = await loadQuery<SanityClutchLandingDoc[]>({
      query: `*[_type == "clutchLanding" && defined(slug.current)]{
        "slug": slug.current, heading, pitch, metaTitle, metaDescription,
        ctaHeading, canonicalSlug, locale
      }`,
    });
  } catch (err) {
    console.error("[sanity] Failed to fetch Clutch landing pages, using the repo copy:", err);
  }

  if (!docs || docs.length === 0) return fallback;

  const bySlug = new Map(fallback.map((page) => [page.slug, page]));

  for (const doc of docs) {
    // stegaClean on every value that is compared or written into an
    // attribute rather than rendered as prose -- the slug is matched against
    // the URL, and locale lands in <html lang>, where the invisible markers
    // would make both miss.
    const slug = stegaClean(doc.slug ?? "") as string;
    if (!slug || !doc.heading) continue;

    const fromSanity = Object.fromEntries(
      Object.entries({
        slug,
        heading: doc.heading,
        pitch: doc.pitch,
        metaTitle: doc.metaTitle,
        metaDescription: doc.metaDescription,
        ctaHeading: doc.ctaHeading,
        canonicalSlug: doc.canonicalSlug ? (stegaClean(doc.canonicalSlug) as string) : undefined,
        locale: doc.locale ? (stegaClean(doc.locale) as string) : undefined,
      }).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );

    bySlug.set(slug, { ...(bySlug.get(slug) ?? { slug }), ...fromSanity } as ClutchLanding);
  }

  return [...bySlug.values()];
}

export async function getClutchLandingBySlug(slug: string): Promise<ClutchLanding | null> {
  return (await getClutchLandings()).find((page) => page.slug === slug) ?? null;
}
