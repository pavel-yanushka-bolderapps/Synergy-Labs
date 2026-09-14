import type { ServiceDetailPageContent } from "../lib/types";

// Static chrome for the service detail pages (src/pages/our-services/[slug].astro).
// These pages are otherwise driven entirely by Sanity, but the rating badge
// under the heading is the same social proof on every service, so it lives
// here rather than being duplicated into each CMS document.
export const serviceDetailPage: ServiceDetailPageContent = {
  ratingBadge: {
    avatarSrcs: [
      "/images/66f73e28cb70bd89e83dbe8f_0_3-2-p-500.avif",
      "/images/66f73e28e73488078cd11e74_0_3-p-500.avif",
      "/images/66f73e265c9ed9c1891c3506_0_2.avif",
      "/images/66f73e27be912d78f96549ec_0_1-p-500.avif",
    ],
    starCount: 5,
    label: "5 Star Rated",
  },

  // The same four awards close the features section on every service page,
  // so like the rating badge above they are static rather than duplicated
  // into each Sanity document. Order matches the original Webflow build.
  // (The .avif files are actually WebP despite the extension -- that is how
  // they came out of the Webflow export; browsers sniff the content type,
  // so it works, but do not be surprised by the mismatch.)
  awardBadges: [
    { src: "/images/awards3_1awards3.avif", alt: "Clutch Top Flutter Developers, United States 2025" },
    { src: "/images/awards2_1awards2.avif", alt: "Clutch Champion, Fall 2024" },
    { src: "/images/awards1_1awards1.avif", alt: "Clutch Global, Fall 2024" },
    {
      src: "/images/682639bf043d2098c7d66df5_2025-05-15_21.59.53-removebg-preview.png",
      alt: "Forbes Technology Council, Official Member 2025",
    },
  ],

  // The timeline's button is the same call and the same on-page anchor on
  // every service, so it stays here rather than being retyped into five
  // documents. Move it into the schema if a service ever needs its own.
  processCta: { label: "Book Your Free Consultation", href: "#contact-form" },
};
