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
}

export interface PortfolioHighlight {
  label: string;
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

export interface HomeFAQContent {
  heading: string;
  items: FAQItem[];
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
  faq: HomeFAQContent;
}
