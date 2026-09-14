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
  caseStudyHref: string;
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
