import type { SiteFooter } from "../lib/types";

export const footer: SiteFooter = {
  logoSrc: "/images/synergy-labs-logo.webp",
  links: [
    { label: "Services", href: "/our-services" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Blog", href: "/blog" },
    { label: "Locations", href: "/locations" },
    { label: "Builder", href: "/synergy-builder" },
    { label: "Awards", href: "/awards" },
    { label: "Get Financing!", href: "/get-financing", badge: "New" },
  ],
  email: "hello@synergylabs.co",
  phone: "(645) 444-1069",
  address: "78 SW 7th St, Miami, FL 33130",
  copyright: "© 2019 - 2026 SYNERGY LABS. All rights reserved.",
  legalLinks: [{ label: "Privacy Policy", href: "/privacy-policy" }],
  socialLinks: [
    { label: "LinkedIn", href: "https://www.linkedin.com/company/synergy-labs-agency/", iconSrc: "/images/LinkedIn.avif" },
    { label: "Trustpilot", href: "https://www.trustpilot.com/review/synergylab.agency", iconSrc: "/images/TrustPilot.avif" },
    { label: "Clutch", href: "https://clutch.co/profile/synergy-labs#highlights", iconSrc: "/images/Clutch.avif" },
  ],
};
