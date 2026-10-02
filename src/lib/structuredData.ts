/**
 * JSON-LD for the pages that carry structured data. Layout.astro renders
 * whatever a page passes as `jsonLd`, one <script type="application/ld+json">
 * per object.
 *
 * The home Organization and the about-page AboutPage are the Webflow site's
 * own blocks, ported with three fixes: URLs are absolute (Webflow had
 * `"url": "/"`, which Google reports as invalid), images point at this site
 * rather than Webflow's CDN (which goes when the Webflow plan does), and the
 * people listed are the team the page actually shows. Everything else --
 * BlogPosting, Service, BreadcrumbList, the location WebPage -- is built from
 * the same content the page renders, so the markup can never describe
 * something a visitor cannot see.
 */
import { footer } from "../content/footer";
import { home } from "../content/home";

export type JsonLd = Record<string, unknown>;

export const SITE_URL = "https://www.synergylabs.co";
const ORG_ID = `${SITE_URL}/#organization`;
const LOGO_URL = `${SITE_URL}/images/Logo-Transp-BG.webp`;
const PHONE = "+16454441069";

/** Absolute URL in the same no-trailing-slash form as the canonicals. */
const abs = (path: string) => {
  if (/^https?:\/\//.test(path)) return path;
  const url = new URL(path, SITE_URL);
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
};

const miamiAddress = {
  "@type": "PostalAddress",
  streetAddress: "78 SW 7th St",
  addressLocality: "Miami",
  addressRegion: "FL",
  postalCode: "33130",
  addressCountry: "US",
};

/** The offices the Webflow Organization block listed, in its order. */
const offices: { name: string; address: Record<string, string> }[] = [
  { name: "Miami Headquarters", address: miamiAddress },
  { name: "Dubai", address: { streetAddress: "One Central 9th Floor - Trade Centre 2", addressLocality: "Dubai", addressCountry: "AE" } },
  { name: "Hartford", address: { streetAddress: "200 Constitution Pl", addressLocality: "Hartford", addressRegion: "CT", postalCode: "06103", addressCountry: "US" } },
  { name: "San Francisco", address: { streetAddress: "44 Montgomery St", addressLocality: "San Francisco", addressRegion: "CA", postalCode: "94104", addressCountry: "US" } },
  { name: "Qatar", address: { streetAddress: "1st and 2nd floor, Iconoview, C Ring Rd", addressLocality: "Doha", addressCountry: "QA" } },
  { name: "New York City", address: { streetAddress: "445 Park Ave", addressLocality: "Manhattan", addressRegion: "NY", postalCode: "10022", addressCountry: "US" } },
  { name: "Austin", address: { streetAddress: "600 Congress Ave", addressLocality: "Austin", addressRegion: "TX", postalCode: "78701", addressCountry: "US" } },
  { name: "Riyadh", address: { streetAddress: "Building No. 44, Ibn Katheer St, King Abdul Aziz", addressLocality: "Riyadh", postalCode: "13334", addressCountry: "SA" } },
  { name: "London", address: { streetAddress: "18 Finsbury Square", addressLocality: "London", postalCode: "EC2A 1AH", addressCountry: "GB" } },
  { name: "Chicago", address: { streetAddress: "515 N State St", addressLocality: "Chicago", addressRegion: "IL", postalCode: "60654", addressCountry: "US" } },
];

/** The social profiles the footer links to. */
const sameAs = footer.socialLinks.map((s) => s.href.split("#")[0]);

const people = () =>
  home.team.members.map((m) => ({
    "@type": "Person",
    name: m.name,
    jobTitle: m.title,
    image: abs(m.imageSrc),
    ...(m.linkedinHref ? { sameAs: [m.linkedinHref] } : {}),
  }));

/** A reference to the Organization, for other blocks to point at. */
const orgRef = { "@id": ORG_ID };

export function organization(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Synergy Labs",
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: LOGO_URL },
    description:
      "Boutique AI and mobile app development agency offering tailor-made solutions for web apps, mobile apps, staff augmentation, custom software, and marketing services.",
    telephone: PHONE,
    email: footer.email,
    address: miamiAddress,
    sameAs,
    location: offices.map((o) => ({
      "@type": "Place",
      name: o.name,
      address: { "@type": "PostalAddress", ...o.address },
    })),
    founder: { "@type": "Person", name: "Sardor Akhmedov", jobTitle: "Founder and CEO" },
    employee: people(),
  };
}

export function website(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Synergy Labs",
    url: `${SITE_URL}/`,
    publisher: orgRef,
    inLanguage: "en",
  };
}

export function aboutPage(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About Us",
    url: abs("/about-us"),
    inLanguage: "en",
    about: {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Synergy Labs",
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: LOGO_URL },
      description:
        "Top-tier app development agency delivering mobile and web applications with a boutique approach, US-based team, and scope-based budgets.",
      address: miamiAddress,
      telephone: PHONE,
      email: footer.email,
      sameAs,
      member: people(),
    },
  };
}

/** Home > ... > this page. Pass every crumb after Home. */
export function breadcrumbs(trail: { name: string; path: string }[]): JsonLd {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

export function blogPosting(post: {
  slug: string;
  title: string;
  description: string;
  date?: string;
  image?: string;
  authorName?: string;
}): JsonLd {
  const url = abs(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(post.image ? { image: abs(post.image) } : {}),
    ...(post.date ? { datePublished: post.date, dateModified: post.date } : {}),
    author: post.authorName
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: "Synergy Labs", url: `${SITE_URL}/` },
    publisher: { "@type": "Organization", "@id": ORG_ID, name: "Synergy Labs", logo: { "@type": "ImageObject", url: LOGO_URL } },
    inLanguage: "en",
  };
}

export function service(s: { name: string; description?: string; path: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    ...(s.description ? { description: s.description } : {}),
    url: abs(s.path),
    provider: { "@type": "Organization", "@id": ORG_ID, name: "Synergy Labs" },
    areaServed: "Worldwide",
  };
}

/**
 * A listing page -- portfolio, services, locations, the blog archive -- as a
 * CollectionPage whose main entity is the list of things it links to, in the
 * order the page shows them.
 */
export function collectionPage(page: {
  name: string;
  description?: string;
  path: string;
  /** Blog for the archive, CollectionPage everywhere else. */
  type?: "CollectionPage" | "Blog";
  items: { name: string; path?: string; description?: string; image?: string; type?: string }[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": page.type ?? "CollectionPage",
    name: page.name,
    ...(page.description ? { description: page.description } : {}),
    url: abs(page.path),
    inLanguage: "en",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: orgRef,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.items.length,
      itemListElement: page.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        ...(item.path ? { url: abs(item.path) } : {}),
        item: {
          "@type": item.type ?? "Thing",
          name: item.name,
          ...(item.path ? { url: abs(item.path) } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.image ? { image: abs(item.image) } : {}),
        },
      })),
    },
  };
}

export function faqPage(items: { question: string; answer: string }[]): JsonLd | null {
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * The per-office WebPage the Webflow location template emitted, built from
 * the same fields: page heading and intro, the long description, the office
 * image and address. The FAQ is the one this page renders, not the Webflow
 * one -- Google requires FAQ markup to match questions visible on the page.
 */
export function locationPage(loc: {
  slug: string;
  city: string;
  heading: string;
  intro?: string;
  description?: string;
  image?: string;
  address?: string;
  /** The office's Google Business Profile link. */
  mapUrl?: string;
  faq: { question: string; answer: string }[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: loc.heading,
    ...(loc.intro ? { description: loc.intro } : {}),
    url: abs(`/locations/${loc.slug}`),
    inLanguage: "en",
    about: {
      "@type": "ProfessionalService",
      name: `Synergy Labs - ${loc.city}`,
      ...(loc.description ? { description: loc.description } : {}),
      ...(loc.image ? { image: abs(loc.image) } : {}),
      address: {
        "@type": "PostalAddress",
        addressLocality: loc.city,
        ...(loc.address ? { streetAddress: loc.address } : {}),
      },
      telephone: PHONE,
      ...(loc.mapUrl ? { hasMap: loc.mapUrl } : {}),
      areaServed: { "@type": "City", name: loc.city },
      priceRange: "$15,000 - $250,000+",
      parentOrganization: orgRef,
    },
    ...(loc.faq.length ? { mainEntity: faqPage(loc.faq) } : {}),
  };
}

/**
 * Serialises for a <script> body. `<` is escaped so a string containing
 * "</script>" cannot end the tag early.
 */
export function serialize(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
