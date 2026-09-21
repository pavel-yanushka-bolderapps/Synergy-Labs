import type { AboutPageContent } from "../lib/types";

/**
 * /about-us is almost entirely the homepage's sections in a different order --
 * only the hero is its own. So only the hero lives here; the page imports
 * `home` for the rest (see src/pages/about-us.astro).
 */
export const aboutPage: AboutPageContent = {
  hero: {
    heading: "About Us",
    body:
      "We are a boutique mobile app development agency. We build iOS, Android, and web products for startups and enterprises — senior engineers, fixed pricing, software that ships.",
    ctaButton: { label: "Free quote", href: "#contact-form" },
    imageSrc: "/images/about-hero.webp",
    imageAlt: "Synergy Labs product work in progress",
    bgImageSrc: "/images/Hero-Bg.svg",
  },
};
