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

  // The service pages have always carried their own short FAQ rather than
  // the homepage's app-focused list -- same five questions on every
  // service, transcribed from the original Webflow pages.
  faq: {
    heading: "FAQs",
    subheading: "Find answers to common questions about our services and processes below.",
    items: [
      {
        question: "What services do you offer?",
        answer:
          "We provide a full range of marketing services, including digital marketing, branding, and content creation. Our team is dedicated to delivering tailored solutions that meet your unique business needs. Whether you're a startup or an established company, we have the expertise to help you succeed.",
      },
      {
        question: "How do you work?",
        answer:
          "Our process begins with understanding your goals and target audience. We then develop a customized strategy that aligns with your vision. Throughout the project, we maintain open communication to ensure that we meet your expectations.",
      },
      {
        question: "What is your pricing?",
        answer:
          "Our pricing varies based on the specific services you require and the scope of your project. We offer competitive rates and flexible packages to accommodate different budgets. For a detailed quote, please reach out to our team.",
      },
      {
        question: "How long does it take?",
        answer:
          "The timeline for each project depends on its complexity and your specific needs. Typically, we provide a detailed timeline during the planning phase. Our goal is to deliver high-quality results in a timely manner.",
      },
      {
        question: "Can you handle revisions?",
        answer:
          "Absolutely! We understand that feedback is essential to achieving the best results. Our team is committed to making necessary revisions to ensure your satisfaction with the final product.",
      },
    ],
  },
};
