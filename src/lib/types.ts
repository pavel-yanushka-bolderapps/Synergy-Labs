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
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface NavLink {
  label: string;
  href: string;
  children?: NavLink[];
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
  items: LocationItem[];
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

/** One alternating image/text block in the body of a case study. */
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
  /** The colour of the number cards sitting on that background. */
  accentColor: string;
  items: { value: string; label: string }[];
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
  blocks: CaseStudyBlock[];
  /** The achievements band, or undefined when this study doesn't show one. */
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
