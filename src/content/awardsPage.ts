import type { AwardsPageContent } from "../lib/types";

export const awardsPage: AwardsPageContent = {
  breadcrumbLabel: "Awards",
  heading: "Some of the kudos we've gotten",
  subheading: "Just saying, these organizations noticed our hard work and results.",
  ctaButton: { label: "Book a call", href: "#contact-form" },

  orbitCenterSrc: "/images/Icon-1.avif",
  // Four badges spread evenly around the outer ring, one on the inner ring --
  // the same five the original hero animates. Angles are start positions; the
  // ring itself rotates (see AwardsHero.astro).
  orbitBadges: [
    { imageSrc: "/images/awards1_1.avif", orbit: "outer", angle: 0, size: 8 },
    { imageSrc: "/images/award-orbit-planet-02.jpg", orbit: "outer", angle: 90, size: 6.5, rounded: true },
    { imageSrc: "/images/Google-Certification.webp", orbit: "outer", angle: 180, size: 7 },
    { imageSrc: "/images/awards3_1.avif", orbit: "outer", angle: 270, size: 7.3 },
    { imageSrc: "/images/awards2_1.avif", orbit: "inner", angle: 200, size: 5.5 },
  ],

  awards: [
    {
      organization: "Clutch 2025",
      title: "Top App Development Company in Southeast Asia 2025",
      imageSrc: "/images/awards/image12.webp",
    },
    {
      organization: "Clutch",
      title: "Top App Development Company — Legal Sector, United States",
      imageSrc: "/images/awards/image11.webp",
    },
    {
      organization: "Clutch 2025",
      title: "Top App Development Company in the United Kingdom 2025",
      imageSrc: "/images/awards/image10.webp",
    },
    {
      organization: "Clutch 2025",
      title: "Top App Development Company — Legal Sector 2025",
      imageSrc: "/images/awards/image9.webp",
    },
    {
      organization: "Clutch 2025",
      title: "Top Flutter Developers in the United States 2025",
      imageSrc: "/images/awards/image8.webp",
    },
    {
      organization: "The Manifest",
      title: "Most Reviewed Design Company in Miami",
      imageSrc: "/images/awards/image7.webp",
    },
    {
      organization: "Clutch 2025",
      title: "Top AI Video Generation Company in the United States 2025",
      imageSrc: "/images/awards/image6.webp",
    },
    {
      organization: "Clutch 2024",
      title: "Top 1000 Companies 2024",
      imageSrc: "/images/awards/image5.webp",
    },
    {
      organization: "The Manifest",
      title: "Most Reviewed App Development Company in New York City",
      imageSrc: "/images/awards/image4.webp",
    },
    {
      organization: "Clutch 2024",
      title: "Global Award Fall 2024",
      imageSrc: "/images/awards/image3.webp",
    },
    {
      organization: "Clutch 2024",
      title: "Top Flutter Developers in 2024",
      imageSrc: "/images/awards/image8.webp",
    },
    {
      organization: "Clutch 2024",
      title: "Champion Spring in 2024",
      imageSrc: "/images/awards/image2.webp",
    },
  ],
};
