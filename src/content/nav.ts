import type { SiteNavigation } from "../lib/types";

export const nav: SiteNavigation = {
  logoSrc: "/images/synergy-labs-logo.webp",
  logoAlt: "Synergy Labs",
  links: [
    { label: "Our Services", href: "/our-services" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Locations", href: "/locations" },
    { label: "Blog", href: "/blog" },
    { label: "Insights", href: "/insights", children: [
      {label: "Podcast", href:"/podcast"},
    ] },
    { label: "About Us", href: "/about-us" },
    // Builder and Get Financing live in the footer only -- the header already runs to the
    // width where it collapses to the compact layout, and an eighth link tips
    // it over on common laptop widths.
  ],
  phone: "(645) 444-1069",
  ctaButton: { label: "Free Quote", href: "/contact" },
};
