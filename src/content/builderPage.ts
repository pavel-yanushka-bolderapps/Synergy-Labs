import type { BuilderPageContent } from "../lib/types";

/**
 * /synergy-builder -- the "convert your website to a mobile app" lead magnet,
 * transcribed from the Webflow page of the same name.
 *
 * The Webflow version's form submitted nowhere; ours posts to /api/builder,
 * which emails the team. The Yes/No gate after submitting is kept as it was.
 */
export const builderPage: BuilderPageContent = {
  headingLines: ["Convert", "your website to a", "mobile app!"],
  description:
    "Enter your website domain name to start building native iOS and Android mobile apps.",
  emailPlaceholder: "Enter your email",
  domainPlaceholder: "Enter your domain name",
  submitLabel: "Generate",
  popup: {
    question: "Does your website have a mobile friendly version?",
    yesLabel: "Yes",
    noLabel: "No",
    successHeading: "Great! We'll send the app links to you in 24 hours.",
    successCta: { label: "Request another app", href: "/synergy-builder" },
    errorHeading:
      "Sorry, unfortunately we can only work with sites that have a mobile adaptive version of their site.",
    // Webflow pointed this at /mobile-app-design-optimization, which does not
    // exist on this site. Sending them to the contact form keeps the lead.
    errorCta: { label: "Request mobile optimization", href: "/contact" },
  },
  newsHeading: "News & Insights",
};
