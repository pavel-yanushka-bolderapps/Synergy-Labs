import type { SiteNavigation } from "../lib/types";

export const nav: SiteNavigation = {
  logoSrc: "/images/logo_primary_color_onLight.svg",
  logoAlt: "Synergy Labs",
  links: [
    { label: "Our Services", href: "/our-services" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Locations", href: "/locations" },
    { label: "Blog", href: "/blog" },
    { label: "About Us", href: "/about-us" },
  ],
  phone: "(645) 444-1069",
  ctaButton: { label: "Free Quote", href: "/contact" },
};
