import type { ProcessStep } from "../lib/types";

/**
 * The six steps in the "Our app development process" band on every location
 * page.
 *
 * Static rather than CMS-driven: the process is how the company works, not
 * something that varies by office, and the original Webflow pages pointed all
 * 26 locations at the same six shared records. The heading and the paragraph
 * above them *are* per-location (processHeading / processDescription), because
 * those name the city.
 */
export const locationProcess: ProcessStep[] = [
  {
    number: "01",
    title: "Discovery",
    description:
      "We start by understanding your business, your users, and what success looks like. This phase produces a clear project scope, technical architecture, and timeline.",
  },
  {
    number: "02",
    title: "UI/UX Design",
    description:
      "Our designers create wireframes and high-fidelity mockups. You review and approve designs before a single line of code is written.",
  },
  {
    number: "03",
    title: "Development",
    description:
      "We build in agile sprints, delivering working features every two weeks. You get access to staging builds so you can test progress in real time.",
  },
  {
    number: "04",
    title: "QA & Testing",
    description:
      "Every feature goes through manual and automated testing across devices and platforms. We catch bugs before your users do.",
  },
  {
    number: "05",
    title: "Launch",
    description:
      "We handle App Store and Google Play submissions, server deployment, and launch-day monitoring. Most projects go from kickoff to launch in six to eight weeks.",
  },
  {
    number: "06",
    title: "Post-launch Support",
    description:
      "Software doesn't end at launch. We provide ongoing post-launch support, maintenance, bug fixes, and feature updates to keep your app running smoothly and your users happy.",
  },
];
