// Shared content-contract types.
// Every page's copy lives in a typed data file under src/content/*.ts that
// satisfies one of these interfaces. Components only ever receive content
// via typed props built from these shapes — never hardcoded inline.
// When Sanity is wired up later, only the content file changes to a GROQ
// fetch; component signatures stay identical.

export interface CTAButton {
  label: string;
  href: string;
}

export interface StatItem {
  value: string;
  label: string;
  iconSrc: string;
}

export interface PortfolioHighlight {
  label: string;
  iconSrc?: string;
}

export interface PortfolioItem {
  slug: string;
  clientName: string;
  logoSrc: string;
  logoAlt: string;
  tags: string[];
  description: string;
  highlights: [PortfolioHighlight, PortfolioHighlight];
  imageSrc: string;
  imageAlt: string;
  /**
   * Link to this project's case study, or undefined when it has none --
   * the card then shows no "View case study" button rather than a link to
   * a page that was never built. See withExistingCaseStudies().
   */
  caseStudyHref?: string;
  theme: "light" | "dark";
  backgroundImage: string;
}

export interface ProcessStep {
  number: string;
  title: string;
  description: string;
}

export interface ComparisonRow {
  label: string;
  otherAgencies: string;
  synergyLabs: string;
}

export interface ServiceItem {
  title: string;
  imageSrc?: string;
  href: string;
}

export interface LocationItem {
  city: string;
  address: string;
  isHeadquarters?: boolean;
  imageSrc?: string;
  /** Set once the office has its own page; the card links to it. */
  slug?: string;
}

/**
 * One office's own page (/locations/[slug]).
 *
 * Every field past the card's own four is optional because the source
 * collection is unevenly filled: 21 of the 26 offices have the full
 * services/industries/process/FAQ treatment and five -- the international
 * ones -- carry only a heading and a couple of paragraphs. Sections render
 * only when their content exists, so a thin office gets a short page rather
 * than a page full of empty headings.
 */
export interface LocationDetail extends LocationItem {
  slug: string;
  /** The <h1>. Falls back to the city name. */
  mainHeading?: string;
  /** The paragraph under the <h1>. */
  mainDescription?: string;
  /** A second, longer paragraph further down the page. */
  description?: string;
  /** Google Maps embed parameters (the `pb=` value), not a full URL. */
  mapCode?: string;
  /** LocalBusiness structured data, emitted verbatim into a script tag. */
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
  /** Rich text. */
  serviceAreaDescription?: string;
  faqHeading?: string;
  technologiesHeading?: string;
  contactHeading?: string;
  /** Rich text. */
  contactDescription?: string;

  caseStudiesHeading?: string;
  caseStudies?: LocationCaseStudy[];
  /** The "Our services" cards this office offers. */
  services?: LocationServiceCard[];
  /** The "Industries we serve" rows this office serves. */
  industries?: LocationServiceCard[];
  /** Shared stack categories, used when `techStack` is empty. */
  technologies?: LocationTechnologyGroup[];
  /** This office's own stack, as rich text. Takes over from `technologies`. */
  techStack?: string;
  pricingHeading?: string;
  /** Rich text: one paragraph per pricing tier. */
  pricingTable?: string;
}

/**
 * One card in a location page's "Our services" row or "Industries we serve"
 * list, after the office's overrides have been applied over the catalogue.
 */
export interface LocationServiceCard {
  title: string;
  description: string;
  imageSrc?: string;
}

/** One category in the "Technologies we work with" list. */
export interface LocationTechnologyGroup {
  title: string;
  technologies: string;
}

export interface LocationCaseStudy {
  title: string;
  /** Rich text. */
  body: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface NavLink {
  label: string;
  href: string;
  children?: NavLink[];
  /** Small pill drawn beside the label, e.g. "New" on Get Financing. */
  badge?: string;
}

export interface SiteNavigation {
  logoSrc: string;
  logoAlt: string;
  links: NavLink[];
  phone: string;
  ctaButton: CTAButton;
}

export interface SiteFooter {
  logoSrc: string;
  links: NavLink[];
  email: string;
  phone: string;
  address: string;
  copyright: string;
  legalLinks: NavLink[];
  socialLinks: { label: string; href: string; iconSrc: string }[];
}

export interface HomeHeroContent {
  heading: string;
  ctaButton: CTAButton;
  phoneImageSrc: string;
  bgImageSrc: string;
}

export interface HomeStatsContent {
  items: StatItem[];
}

export interface HomeSelectedWorksContent {
  heading: string;
  items: PortfolioItem[];
  viewAllButton: CTAButton;
}

export interface HomeHowWeWorkContent {
  heading: string;
  steps: ProcessStep[];
}

export interface HomeWhyUsContent {
  heading: string;
  rows: ComparisonRow[];
}

export interface HomeReviewsContent {
  heading: string;
  subheading: string;
  ctaButton: CTAButton;
}

export interface HomeServicesContent {
  heading: string;
  items: ServiceItem[];
}

export interface HomeCTAContent {
  heading: string;
  body: string;
  ctaButton: CTAButton;
}

export interface HomeLocationsContent {
  heading: string;
  moreLocationsLabel: string;
}

export interface HomeBadgesContent {
  heading: string;
  badges: string[];
}

export interface TeamMember {
  name: string;
  title: string;
  bio: string;
  imageSrc: string;
  linkedinHref?: string;
}

export interface HomeTeamContent {
  eyebrow: string;
  headingLines: string[];
  description: string;
  ctaButton: CTAButton;
  members: TeamMember[];
}

export interface HomeFAQContent {
  heading: string;
  /** Optional line under the heading. */
  subheading?: string;
  items: FAQItem[];
}

export interface PortfolioPageContent {
  heading: string;
  subheading: string;
  filterTags: string[];
  items: PortfolioItem[];
}

export interface ServicesPageContent {
  heading: string;
  subheading: string;
  items: ServiceItem[];
}

/**
 * The one section of /about-us that isn't shared with the homepage. Everything
 * below it -- Why us, How we work, Team, Selected Works, the badge marquee --
 * is the same component the homepage renders, reading the same `home` content,
 * so the two pages can't drift apart.
 */
export interface AboutPageContent {
  hero: {
    heading: string;
    body: string;
    ctaButton: CTAButton;
    imageSrc: string;
    imageAlt: string;
    bgImageSrc: string;
  };
}

/** One person credited on a podcast episode. */
export interface PodcastAuthor {
  name: string;
  imageSrc: string;
}

/**
 * One bullet in an episode's "what's covered" list. The source copy writes
 * these as "Topic: what we say about it", so the lead-in is split out rather
 * than stored as markup -- that keeps the content plain data and lets the
 * card style the lead-in itself.
 */
export interface PodcastHighlight {
  label?: string;
  text: string;
}

export interface PodcastEpisode {
  title: string;
  /** YouTube video id -- the embed and the poster frame are both built from it. */
  youtubeId: string;
  posterSrc: string;
  summary: string;
  highlights: PodcastHighlight[];
  authors: PodcastAuthor[];
}

export interface PodcastPageContent {
  heading: string;
  description: string;
  episodes: PodcastEpisode[];
}

export interface AwardItem {
  /** Who gave it -- "Clutch 2025", "The Manifest". */
  organization: string;
  title: string;
  imageSrc: string;
}

/**
 * One badge orbiting the ring in the awards hero. `orbit` picks which of the
 * two rings it rides; `angle` is its starting position in degrees, so the four
 * outer badges can be spread evenly without hardcoding coordinates.
 */
export interface AwardOrbitBadge {
  imageSrc: string;
  orbit: "outer" | "inner";
  angle: number;
  /** Diameter, in rem, matching the original design's per-badge sizes. */
  size: number;
  rounded?: boolean;
}

export interface AwardsPageContent {
  breadcrumbLabel: string;
  heading: string;
  subheading: string;
  ctaButton: CTAButton;
  /** Logo in the middle of the inner ring. */
  orbitCenterSrc: string;
  orbitBadges: AwardOrbitBadge[];
  awards: AwardItem[];
}

export interface BlogPageContent {
  heading: string;
  subheading: string;
}

export interface RatingBadgeContent {
  /**
   * Client photos, drawn overlapping in this order -- each one laps the
   * left edge of the one before it, so array order is left-to-right.
   */
  avatarSrcs: string[];
  starCount: number;
  label: string;
}

/**
 * The "what this service covers" block on a service detail page -- heading
 * and copy beside a slider of feature cards. Built from the `features*`
 * fields of a Sanity service document; the section is skipped entirely when
 * there is no heading.
 */
export interface ServiceFeaturesContent {
  heading: string;
  lead?: string;
  body?: string;
  cards: { title: string; imageSrc?: string }[];
}

/**
 * One card in the "why work with us" row under the features block. The icon
 * is a key into the inline SVG set in ServiceValues.astro rather than an
 * uploaded file, so the marks stay crisp and pick up the section's colour.
 */
export interface ServiceValueCard {
  icon: string;
  title: string;
  description?: string;
}

/**
 * The per-service "How We Work" timeline. Steps alternate left/right of a
 * centre line; `icon` is a key into the icon set in ServiceProcess.astro.
 */
export interface ServiceProcessStep {
  icon: string;
  title: string;
  description?: string;
}

export interface ServiceProcessContent {
  heading: string;
  eyebrow?: string;
  steps: ServiceProcessStep[];
}

/** One client review card on a service detail page. */
export interface ServiceTestimonial {
  quote: string;
  name: string;
  role?: string;
  avatarSrc?: string;
}

export type ServiceTestimonialsPlacement = "afterProcess" | "afterWhyUs" | "beforeFaq";

export interface ServiceTestimonialsContent {
  placement: ServiceTestimonialsPlacement;
  layout: "stacked" | "showcase";
  items: ServiceTestimonial[];
}

// --- The case-study page builder ---
//
// One interface per section type an editor can add to a case study, plus the
// CaseStudySection union the renderer switches on. The `_type` values match
// the Sanity object names in src/sanity/schemaTypes/caseStudySections/ --
// that string is the whole contract between the CMS and the components, so
// the two have to agree exactly.

/** Where a section sits: page ground, a soft tint, or the client's colour. */
export type CaseStudySectionBackground = "default" | "tinted" | "brand";

export interface CaseStudySplitBlock {
  _type: "splitBlock";
  eyebrow?: string;
  heading: string;
  paragraphs: string[];
  bullets: string[];
  imageSrc?: string;
  /** Resolved side -- "auto" is already turned into left/right by the query. */
  imageSide: "left" | "right";
  background: CaseStudySectionBackground;
  /** Inline CSS variables overriding the brand band for this section only. */
  bandStyle?: string;
}

export interface CaseStudyFeatureGrid {
  _type: "featureGrid";
  eyebrow?: string;
  heading: string;
  lead?: string;
  /** "tiles" drops the descriptions and packs the items tighter. */
  layout: "cards" | "tiles";
  items: { title: string; description?: string; imageSrc?: string }[];
  background: CaseStudySectionBackground;
  /** Inline CSS variables overriding the brand band for this section only. */
  bandStyle?: string;
}

export interface CaseStudyShowcase {
  _type: "showcase";
  eyebrow?: string;
  heading: string;
  body?: string;
  imageSrc: string;
  /** How wide the image runs from md up. Below that it always fills the column. */
  imageSize: "small" | "medium" | "full";
  /** Present only when the editor filled in both the label and the address. */
  link?: CTAButton;
  background: CaseStudySectionBackground;
  /** Inline CSS variables overriding the brand band for this section only. */
  bandStyle?: string;
}

export interface CaseStudyStatsBand extends CaseStudyStats {
  _type: "statsBand";
}

export interface CaseStudyTestimonial {
  _type: "testimonial";
  quote: string;
  authorName?: string;
  authorRole?: string;
  avatarSrc?: string;
  background: CaseStudySectionBackground;
  /** Inline CSS variables overriding the brand band for this section only. */
  bandStyle?: string;
}

export type CaseStudySection =
  | CaseStudySplitBlock
  | CaseStudyFeatureGrid
  | CaseStudyShowcase
  | CaseStudyStatsBand
  | CaseStudyTestimonial;

/**
 * One alternating image/text block in the body of a case study.
 *
 * @deprecated Superseded by CaseStudySplitBlock in the page builder above.
 * Still rendered for case studies that haven't been migrated to `sections`.
 */
export interface CaseStudyBlock {
  heading: string;
  paragraphs: string[];
  bullets: string[];
  imageSrc?: string;
  /** Resolved side -- "auto" is already turned into left/right by the query. */
  imageSide: "left" | "right";
}

export interface CaseStudyFact {
  label: string;
  value: string;
}

/**
 * The coloured "Achievements and Impact" band. Both colours are resolved to
 * full 6-digit hex by the query, and the whole object is undefined for a
 * study that has the section switched off or no numbers to put in it -- so
 * the page renders it or doesn't, and never has to check either.
 */
export interface CaseStudyStats {
  heading: string;
  subheading?: string;
  iconSrc?: string;
  /** The band's background. */
  bgColor: string;
  /** Black or white, whichever is readable on bgColor. See readableInk(). */
  bgInk: string;
  /** The colour of the number cards sitting on that background. */
  accentColor: string;
  /** Black or white, whichever is readable on accentColor. */
  accentInk: string;
  items: { value: string; label: string; description?: string }[];
}

export interface CaseStudy {
  slug: string;
  clientName: string;
  headline: string;
  intro?: string;
  logoSrc?: string;
  /**
   * The client's colour, which the hero fades up to at its top right.
   * Always a full 6-digit hex -- the query falls back to Synergy green when
   * the field is blank or malformed, so the page never has to check.
   */
  brandColor: string;
  /**
   * The same colour at zero alpha, as `rgb(r g b / 0)`. Gradients that start
   * at the CSS-wide `transparent` keyword start at transparent *black*, so
   * spelling out the fully-faded brand colour is what keeps the hero from
   * greying off towards its bottom left.
   */
  brandColorFade: string;
  /**
   * Black or white, whichever is readable on brandColor -- a navy band wants
   * white text and a yellow one does not, and the page can't tell which it
   * has without measuring.
   */
  brandInk: string;
  /** Fallback hero visual, used only when there are no screenshots. */
  heroImageSrc?: string;
  /** App screens for the hero carousel. */
  heroImageSrcs: string[];
  /**
   * Store links. The badges are drawn from local artwork rather than being
   * uploaded images, so these are addresses only -- see the hero in
   * src/pages/projects/casestudy/[slug].astro.
   */
  appStoreUrl?: string;
  playStoreUrl?: string;
  facts: CaseStudyFact[];
  overviewHeading?: string;
  overviewParagraphs: string[];
  /**
   * The body of the page. When this is non-empty it is the whole body and
   * `blocks`/`stats` are ignored; a study that hasn't been migrated yet has
   * it empty and falls back to those two.
   */
  sections: CaseStudySection[];
  /** @deprecated Fallback body for studies not yet migrated to `sections`. */
  blocks: CaseStudyBlock[];
  /** @deprecated Fallback achievements band for studies not yet migrated. */
  stats?: CaseStudyStats;
  metaDescription?: string;
}

/**
 * The parts of a service detail page that are the same on every service.
 * Everything service-specific comes from Sanity instead -- see
 * getServiceBySlug() in src/lib/sanity.ts.
 */
export interface ServiceDetailPageContent {
  ratingBadge: RatingBadgeContent;
  /** Award logos shown at the foot of the features section. */
  awardBadges: { src: string; alt: string }[];
  /** Button under the "How We Work" timeline. */
  processCta: CTAButton;
  /** The FAQ block every service page shares -- not the homepage's list. */
  faq: HomeFAQContent;
}

export interface HomePageContent {
  hero: HomeHeroContent;
  stats: HomeStatsContent;
  selectedWorks: HomeSelectedWorksContent;
  howWeWork: HomeHowWeWorkContent;
  whyUs: HomeWhyUsContent;
  reviews: HomeReviewsContent;
  services: HomeServicesContent;
  cta: HomeCTAContent;
  locations: HomeLocationsContent;
  badges: HomeBadgesContent;
  team: HomeTeamContent;
  faq: HomeFAQContent;
}

// --- Blog ----------------------------------------------------------------

export interface BlogAuthor {
  slug: string;
  name: string;
  /** Square headshot, rendered as a circle. */
  imageSrc?: string;
  role?: string;
}

/**
 * A post as the listing cards and the homepage need it -- everything except
 * the article body, which is measured in tens of kilobytes each and is only
 * ever read by the post's own page.
 */
export interface BlogPostSummary {
  slug: string;
  title: string;
  /** ISO `YYYY-MM-DD`. The listing sorts on this, newest first. */
  date: string;
  author?: BlogAuthor;
  previewText?: string;
  /** Drawn over the card artwork. Falls back to the title when absent. */
  previewImageText?: string;
  /** `template-1` .. `template-7`, matching public/images/blog/. */
  template?: string;
  readingMinutes?: number;
}

/** A post with its body, for /blog/[slug]. */
export interface BlogPost extends BlogPostSummary {
  /**
   * The article, as HTML, rendered with `set:html`. See the note on
   * `articleHtml` in src/sanity/schemaTypes/blogPost.ts for why the archive is
   * stored this way rather than as Portable Text.
   */
  articleHtml: string;
}

export interface BlogPageContent {
  heading: string;
  subheading: string;
  /** Posts per page on /blog and /blog/page/[page]. */
  pageSize: number;
}

// --- Builder + financing -------------------------------------------------

export interface BuilderPageContent {
  /** Three lines: the middle one is drawn grey, as on the Webflow page. */
  headingLines: [string, string, string];
  description: string;
  emailPlaceholder: string;
  domainPlaceholder: string;
  submitLabel: string;
  /** The "is your site mobile friendly?" gate shown after a submission. */
  popup: {
    question: string;
    yesLabel: string;
    noLabel: string;
    successHeading: string;
    successCta: CTAButton;
    errorHeading: string;
    errorCta: CTAButton;
  };
  newsHeading: string;
}

export interface FinancingPageContent {
  heading: string;
  description: string;
  /** Bullet points above the widget. */
  points: string[];
  /** Enhancify's full-page widget configuration. */
  widget: {
    pageId: string;
    color1: string;
    color2: string;
    cobrandedColor: string;
  };
}

// --- Clutch landing pages (/top-*) ---------------------------------------

export interface ClutchLanding {
  slug: string;
  heading: string;
  pitch: string;
  metaTitle?: string;
  metaDescription?: string;
  ctaHeading?: string;
  /** Set on a page that duplicates another; points at the one that should rank. */
  canonicalSlug?: string;
  /** "en" or "ar" -- drives <html lang> and text direction. */
  locale?: string;
}

// --- Privacy policy ------------------------------------------------------

export interface PrivacyPolicySection {
  /** "1", "2", ... or undefined for the unnumbered "Contact Us" block. */
  number?: string;
  title: string;
  /**
   * Paragraph HTML. These carry `<strong>` and `<a>` because the emphasis in
   * a privacy notice is part of the notice -- "we do **not** share or sell",
   * "**Message and data rates may apply**" -- and flattening it would change
   * what the document says. Rendered with `set:html`, which is safe here and
   * only here: this is author-written static copy compiled into the build,
   * with no user input anywhere near it.
   */
  paragraphs: string[];
}

export interface PrivacyPolicyContent {
  heading: string;
  description: string;
  /** ISO date shown under the heading, so visitors can see the version. */
  lastUpdated: string;
  sections: PrivacyPolicySection[];
}

// --- Ambassador program (/ambassador-program, /1-week-pilot) -------------

export interface AmbassadorIconCard {
  iconSrc: string;
  title: string;
  description: string;
}

export interface AmbassadorStep {
  numberSrc: string;
  title: string;
  description: string;
}

export interface AmbassadorPageContent {
  /** Meta title + <h1>. `headingLead` is drawn in the accent colour. */
  metaTitle: string;
  metaDescription: string;
  headingLead: string;
  headingRest: string;
  intro: string;
  /** Hero artwork, which is the only visual difference between the two pages. */
  heroImage: { src: string; src500: string; src800: string; alt: string };
  formPlaceholder: string;
  formSubmitLabel: string;
  offer: { heading: string; body: string };
  features: { heading: string; description: string; imageSrc: string; imageAlt: string; items: AmbassadorIconCard[] };
  join: { heading: string; description: string; items: AmbassadorIconCard[] };
  how: { heading: string; steps: AmbassadorStep[] };
  ready: { heading: string; body: string; cta: CTAButton; imageSrc: string; imageAlt: string };
  questions: { heading: string; body: string };
}
