import type { AmbassadorPageContent } from "../lib/types";

/**
 * The Synergy Labs Ambassador Program page, transcribed from Webflow.
 *
 * Two URLs share this content. /ambassador-program is the real one.
 * /1-week-pilot is a Webflow duplicate of it -- same headline, same body, same
 * sections, only a different hero image and a page title ("1 week Pilot") that
 * matches nothing on the page. It is almost certainly a copy someone made to
 * build a pilot-offer page from and never rewrote. Both were `noindex` in
 * Webflow, and both stay `noindex` here, which is what keeps two pages of
 * identical copy from competing with each other in search. See the note in
 * src/pages/1-week-pilot.astro.
 *
 * Deliberate change from Webflow: both of the page's email forms submitted
 * nowhere -- `method="get"` with no action, so pressing "Get started" put the
 * address in the query string and reloaded the page. Every ambassador
 * application entered on either form was lost. Ours post to /api/lead.
 */
const shared = {
  headingLead: "Earn 10%",
  headingRest: "Commission by Referring New Clients",
  intro:
    "Join the Synergy Labs Ambassador Program to earn 10% commission on client referrals. If you enjoy networking and can identify businesses needing quality app design, this program is for you.",
  formPlaceholder: "Enter your email",
  formSubmitLabel: "Get started",

  offer: {
    heading: "What We Offer",
    body:
      "Synergy Labs specializes in creating custom mobile and web applications that help businesses thrive in the digital space. As an ambassador, you'll represent a team known for delivering cutting-edge design, seamless development, and end-to-end deployment of digital solutions.",
  },

  features: {
    heading: "Overflowing with useful features",
    description:
      "As an ambassador, you'll promote Synergy Labs' services, connect us with potential clients, and provide accurate information to foster successful partnerships.",
    imageSrc: "/images/ambassador/features.webp",
    imageAlt: "The Synergy Labs team reviewing app designs together",
    items: [
      {
        iconSrc: "/images/ambassador/icon-promote.avif",
        title: "Promote Synergy Labs",
        description: "Share our services with potential clients and generate qualified leads.",
      },
      {
        iconSrc: "/images/ambassador/icon-information.avif",
        title: "Provide Accurate Information",
        description:
          "Keep us updated with timely and precise information about leads and prospects.",
      },
      {
        iconSrc: "/images/ambassador/icon-professionalism.avif",
        title: "Maintain Professionalism",
        description:
          "Ensure that all communications align with Synergy Labs' standards and guidelines.",
      },
    ],
  },

  join: {
    heading: "Why Join?",
    description:
      "Join the Synergy Labs Ambassador Program to earn 10% commission on referrals, work independently with flexible hours, and access exclusive resources.",
    items: [
      {
        iconSrc: "/images/ambassador/icon-commission.avif",
        title: "10% Commission",
        description:
          "Earn 10% of revenue from clients you bring to Synergy Labs. Commissions are paid after transactions.",
      },
      {
        iconSrc: "/images/ambassador/icon-flexible.avif",
        title: "Flexible & Independent",
        description:
          "Work as an independent contractor with the freedom to set your schedule and strategies.",
      },
      {
        iconSrc: "/images/ambassador/icon-support.avif",
        title: "Support & Resources",
        description:
          "Gain access to marketing materials and support from the Synergy Labs team to help you succeed.",
      },
    ],
  },

  how: {
    heading: "How It Works",
    steps: [
      {
        numberSrc: "/images/ambassador/number-1.avif",
        title: "Sign Up",
        description: "Apply to join the Ambassador Program through our simple form.",
      },
      {
        numberSrc: "/images/ambassador/number-2.avif",
        title: "Get Approved",
        description: "Once approved, start promoting Synergy Labs' services.",
      },
      {
        numberSrc: "/images/ambassador/number-3.avif",
        title: "Earn",
        description: "Receive 10% commission for every successful referral.",
      },
    ],
  },

  ready: {
    heading: "Ready to Get Started?",
    body:
      "Become a part of the Synergy Labs Ambassador Program and start earning by connecting us with businesses in need of top-notch app development services.",
    // Webflow aimed this at /#contact-us, an anchor that does not exist on
    // this site -- it would have landed at the top of the homepage. The
    // contact page is the same destination the builder page falls back to.
    cta: { label: "Apply Now", href: "/contact" },
    imageSrc: "/images/ambassador/ready.webp",
    imageAlt: "Two Synergy Labs team members working at a laptop",
  },

  questions: {
    heading: "Questions?",
    body: "If you have any questions about the program or need more information, feel free to contact us.",
  },
} satisfies Omit<AmbassadorPageContent, "metaTitle" | "metaDescription" | "heroImage">;

export const ambassadorProgram: AmbassadorPageContent = {
  ...shared,
  metaTitle: "Earn 10% Commission by Referring New Clients | Synergy Labs",
  metaDescription:
    "Join the Synergy Labs Ambassador Program to earn 10% commission on client referrals. If you enjoy networking and can identify businesses needing quality app design, this program is for you.",
  heroImage: {
    src: "/images/ambassador/hero-ambassador.webp",
    src500: "/images/ambassador/hero-ambassador-500.webp",
    src800: "/images/ambassador/hero-ambassador-800.webp",
    alt: "A Synergy Labs ambassador introducing a client to the team",
  },
};

export const weekPilot: AmbassadorPageContent = {
  ...shared,
  metaTitle: "1 Week Pilot | Synergy Labs",
  metaDescription: ambassadorProgram.metaDescription,
  heroImage: {
    src: "/images/ambassador/hero-pilot.webp",
    src500: "/images/ambassador/hero-pilot-500.webp",
    src800: "/images/ambassador/hero-pilot-800.webp",
    alt: "A Synergy Labs ambassador introducing a client to the team",
  },
};
