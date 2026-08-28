import type { SiteFooter } from "../lib/types";

export const footer: SiteFooter = {
  logoSrc: "/images/synergy-labs-logo.webp",
  links: [
    { label: "Services", href: "/our-services" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Blog", href: "/blog" },
    { label: "Locations", href: "/locations" },
    { label: "Awards", href: "/awards" },
  ],
  email: "hello@synergylabs.co",
  phone: "(645) 444-1069",
  address: "78 SW 7th St, Miami, FL 33130",
  copyright: "© 2019 - 2026 SYNERGY LABS. All rights reserved.",
  legalLinks: [{ label: "Privacy Policy", href: "/privacy-policy" }],
};
