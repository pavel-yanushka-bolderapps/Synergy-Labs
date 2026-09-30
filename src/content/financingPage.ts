import type { FinancingPageContent } from "../lib/types";

/**
 * /get-financing. The page is a heading and Enhancify's full-page widget --
 * Enhancify runs the application itself, so there is no form of ours here and
 * nothing is posted to our own API.
 *
 * The widget values are the ones the Webflow page shipped: `pageId` identifies
 * the Synergy Labs account, and the colours theme the embed to match the site.
 */
export const financingPage: FinancingPageContent = {
  heading: "Finance your app build",
  description:
    "Spread the cost of your project over monthly payments. Checking your options takes a couple of minutes and won't affect your credit score.",
  points: [
    "Pre-qualify without a hard credit check",
    "Terms and rates from a panel of lenders",
    "Apply once, compare every offer you qualify for",
  ],
  widget: {
    pageId: "9924710",
    color1: "#68BA62",
    color2: "#1C418C",
    cobrandedColor: "#FFFFFF",
  },
};
