import type { PrivacyPolicyContent } from "../lib/types";

/**
 * /privacy-policy -- transcribed verbatim from the Webflow page. This is the
 * notice the footer links to from every page on the site, and the one the
 * contact, builder and ambassador forms all point at above their submit
 * button, so the wording is the client's to change, not ours: the copy below
 * is the Webflow text with nothing added, removed or reworded.
 *
 * The one structural change: Webflow shipped the whole notice as a single
 * <p> with <br> between sections, which gives a screen reader no way to skip
 * a section and gives search engines no outline. Each numbered section is a
 * real heading here. Section numbers are kept because the text refers to
 * itself by them.
 */
export const privacyPolicy: PrivacyPolicyContent = {
  heading: "Privacy Policy",
  description:
    "How Synergy Labs collects, uses and protects the personal information you share with us, and how to opt out of our communications.",
  // The Webflow page carried no date at all. This is the date the notice was
  // migrated; update it whenever the wording below changes.
  lastUpdated: "2026-09-22",

  sections: [
    {
      number: "1",
      title: "Data Collection and Use",
      paragraphs: [
        "We collect personal information—such as your name, email address, phone number, and other contact details—when you submit a form on our website or when you message us directly. This information is used solely to provide the services you request, to communicate with you, and to improve our offerings.",
      ],
    },
    {
      number: "2",
      title: "No Third-Party Sharing",
      paragraphs: [
        "We do <strong>not</strong> share or sell consumer personal information (including mobile information) with third parties or affiliates for marketing or promotional purposes. All other categories exclude text messaging originator opt-in data and consent; this information will <strong>not</strong> be shared with any third parties.",
      ],
    },
    {
      number: "3",
      title: "Consent to Communicate",
      paragraphs: [
        "By submitting your contact information through any form on our website or by writing to our SMS number, you consent to receive communications from us, including text messages (SMS/MMS), phone calls, and emails related to your inquiry, our services, and other relevant information.",
        "<strong>Message and data rates may apply</strong>, and message frequency will vary based on your engagement and inquiries. We may use automated systems to contact you, but always in compliance with applicable laws.",
      ],
    },
    {
      number: "4",
      title: "Data Protection",
      paragraphs: [
        "We are committed to safeguarding your information. We implement appropriate technical and organizational measures to protect your data from unauthorized access, disclosure, alteration, or destruction.",
      ],
    },
    {
      number: "5",
      title: "Opting Out",
      paragraphs: [
        "If you wish to opt out of receiving communications from us at any time, please contact us using the details provided below or use the “unsubscribe” link in our emails. You may also reply “STOP” to <strong>(645) 444-1069</strong> to discontinue further text communications. Additional terms or instructions may apply based on the automated service used.",
      ],
    },
    {
      title: "Contact Us",
      paragraphs: [
        "If you have any questions about this Privacy Policy or wish to exercise any of your rights regarding your information, please contact us at:",
        // Webflow rendered this as `<a href="#">`, so the address on the page
        // most likely to be used to exercise a data right was not clickable.
        '<a href="mailto:hello@synergylabs.co" class="font-semibold text-secondary-green underline">hello@synergylabs.co</a>',
      ],
    },
  ],
};
