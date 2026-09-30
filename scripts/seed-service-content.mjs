// One-off seed for the service detail pages: the scrolling banner words and
// the features block (heading, copy, cards), transcribed from the original
// Webflow site at synergylabs.co so editors start from real content instead
// of empty fields.
//
//   node scripts/seed-service-content.mjs --dry-run   # print, change nothing
//   node scripts/seed-service-content.mjs
//
// Safe to re-run: it sets the same fields to the same values. It only
// touches the fields listed in CONTENT below -- hero fields, SEO and
// anything an editor has since changed elsewhere on the document are left
// alone. Fields an editor has edited *within* this set WILL be overwritten,
// so check with --dry-run first once the site is live.
//
// Needs SANITY_API_WRITE_TOKEN in .env (Editor role). See .env.example.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_VERSION = "2025-08-31";

// The card illustration is one shared SVG on the original site -- every card
// on every service page uses it -- so it is uploaded once and referenced
// from each card rather than per service.
const CARD_ILLUSTRATION = "webflow-export/images/coding-a-website.svg";

const CONTENT = {
  "web-app-development": {
    bannerWords: [
      "Custom Web Apps",
      "Progressive Web Apps (PWAs)",
      "Admin Dashboards & Portals",
      "User Experience Design",
      "API Architecture & Integration",
    ],
    featuresHeading: "Custom Web Apps That Deliver Results",
    featuresLead:
      "We design and develop high-performing web applications tailored to your goals. Scalable, secure, and built to power growth across any device.",
    featuresBody:
      "Synergy Labs combines creative thinking, technical expertise, and a laser focus on real-world outcomes. Whether you're launching a new platform or rebuilding from the ground up, we partner with you to build digital tools that deliver.",
    features: [
      "Responsive Front-End",
      "Custom Back-End",
      "Full-Stack Dev",
      "CMS Integration",
      "E-Commerce Solutions",
    ],
    valueCards: [
      ["tools", "Reliable Timelines", "We stick to what we promise. Transparent planning, weekly updates, and smooth handoffs."],
      ["clock", "Design-Led Thinking", "Intuitive, attractive interfaces that improve user experience and reduce friction."],
      // The original reads "No hidden fees, just hTech stacks and
      // architectures that scale as your business grows.onest rates." --
      // the Transparent Pricing line from the marketing page spliced
      // through the middle of this one. De-spliced to the half that
      // actually matches the title.
      ["tools", "Future-Ready Builds", "Tech stacks and architectures that scale as your business grows."],
    ],
    processSteps: [
      ["research", "Define & Discover", "We map out your needs, goals, and user journeys to build a clear development strategy."],
      ["prototype", "Design & Validate", "Wireframes, flows, and visual design come together\u2014tested and refined with feedback loops."],
      ["design", "Develop & Test", "Scalable, secure, high-quality code built in agile sprints, with continuous testing and iteration."],
      ["development", "Launch & Support", "Smooth deployment, real-time monitoring, and ongoing enhancements to help your product grow."],
    ],
  },

  "app-development-service": {
    bannerWords: [
      "iOS Development",
      "Android Development",
      "UI/UX Design",
      "MVP Development",
      "App Store Launch Support",
    ],
    featuresHeading: "Mobile-First, Results-Driven",
    featuresLead:
      "At Synergy Labs, we specialize in mobile. From consumer apps to enterprise tools, our developers, designers, and strategists collaborate to build experiences that perform flawlessly across devices. Every app we launch is backed by smart strategy and a focus on user satisfaction.",
    // The original leaves the supporting paragraph empty on this page.
    featuresBody: null,
    features: [
      "Apps That Perform",
      "Cross-Platform Apps",
      "Mobile UI/UX Design",
      "Backend & API Integration",
      "Maintenance & Feature Updates",
    ],
    valueCards: [
      ["tools", "On-Time, On-Point", "We deliver on schedule\u2014every time. Our disciplined workflows and project management ensure your app goes live when promised, without compromising quality."],
      ["clock", "Design That Delivers", "Beautiful isn\u2019t enough. We focus on UI/UX that drives engagement, simplifies navigation, and keeps users coming back."],
      ["tools", "More Than Code", "We don\u2019t just build apps\u2014we build solutions. From strategy to launch, we bring creative insights and business thinking to every line of code."],
    ],
    processSteps: [
      ["research", "Discovery & Planning", "We dive into your mobile app goals, audience, and core features to build a development roadmap tailored to your success."],
      ["prototype", "Design & Prototyping", "Wireframes and prototypes help you see and refine user flows, screens, and interactions before development begins."],
      ["design", "Development & Testing", "Using agile workflows, we build your mobile app in sprints, with ongoing testing to ensure performance, security, and usability."],
      ["development", "Launch & Support", "From app store submission to post-launch updates, we guide your launch and stay by your side for long-term app success."],
    ],
  },

  "marketing-services": {
    bannerWords: [
      "Marketing Solutions",
      "Digital Strategy",
      "Brand Development",
      "Content Creation",
      "SEO",
    ],
    featuresHeading: "Your Expert Marketing Partner",
    featuresLead:
      "At Synergy Labs, we deliver high-touch, data-driven marketing strategies designed to help your brand grow, engage, and stand out in a crowded market.",
    featuresBody:
      "We combine sharp strategy, creativity, and data-backed insights to craft solutions that make a real impact. Our dedicated team works closely with you to understand your goals and deliver marketing that moves the needle.",
    features: [
      "Solutions That Fit",
      "SEO Optimization",
      "Content Marketing",
      "B2B Services",
      "Email Marketing",
      "PPC Advertising",
      "Marketing Automation",
      "Analytics & Reporting",
    ],
    valueCards: [
      ["tools", "Expert Marketers", "Get things done right the first time."],
      ["clock", "Responsive Support", "Support whenever you need it."],
      ["tools", "Transparent Pricing", "No hidden fees, just honest rates."],
    ],
    processSteps: [
      ["research", "Research", "We begin by immersing ourselves in your brand, industry, audience, and competitors. Our goal is to understand your challenges, identify trends, and uncover key opportunities that shape a smart foundation for your marketing."],
      ["prototype", "Strategy Development", "Based on our insights, we craft a strategic marketing blueprint tailored to your business objectives. This includes clear messaging, campaign structure, and creative direction. Prototypes and mockups help you visualize the end product before execution."],
      ["design", "Design & Execution", "Our creative team translates strategy into action \u2014 designing impactful visuals, writing persuasive copy, and building assets that resonate. Everything is aligned to your brand identity and optimized for engagement across channels."],
      // The original ends this one "growing returns.y." -- stray trailing
      // characters, dropped here.
      ["development", "Launch & Optimization", "We launch your campaigns across selected platforms, closely track performance metrics, and use real-time data to refine, test, and scale. Our process ensures your investment continues to deliver growing returns."],
    ],
  },

  "staff-augmentation-service": {
    bannerWords: [
      "Developers On Demand",
      "UI/UX Designers",
      "Project Managers",
      "QA Engineers",
      "Team Extensions",
    ],
    featuresHeading: "Flexible Talent. Lasting Impact.",
    featuresLead:
      "Synergy Labs connects you with pre-vetted developers, designers, and project experts ready to plug into your team and deliver from day one.",
    featuresBody:
      "We provide more than resources—we deliver reliable, high-performing professionals who hit the ground running. Whether you need one specialist or a full squad, we scale with you.",
    features: [
      "Talent That Fits, Fast",
      "Dedicated Team Extension",
      "Project-Based Sprint Squads",
      "Contract-to-Hire Pathways",
      "Rapid Talent Sourcing & Onboarding",
    ],
    valueCards: [
      ["tools", "Top 3% Talent", "Every expert is rigorously screened and technically vetted."],
      ["clock", "Fast Onboarding", "Get your new team members up and running within days, not weeks."],
      ["tools", "Flexible Contracts", "Scale up or down based on your project or business needs."],
    ],
    processSteps: [
      ["research", "Discover", "Tell us what you need\u2014roles, skills, and timelines. We\u2019ll assess and recommend the right fit."],
      ["prototype", "Matching", "Within days, we present vetted candidates who meet your requirements and culture."],
      ["design", "Integration", "Chosen team members join your workflows, tools, and stand-ups immediately."],
      ["development", "Support & Scale", "We stay involved to ensure continued alignment and can scale your team as needed."],
    ],
  },

  "ai-infusion-service": {
    bannerWords: [
      "AI Strategy Consulting",
      "LLM & Chatbot Integration",
      "Custom Model Development",
      "AI Process Automation",
      "AI Talent & Training",
    ],
    featuresHeading: "Applied AI You Can Trust",
    // Deliberately not transcribed: on the original site this paragraph
    // reads "Their expertise transformed our marketing strategy
    // completely." -- a client review pasted into the intro slot by
    // mistake. Copying it would carry the bug over, so the field is left
    // empty for an editor to write the real intro.
    featuresLead: null,
    featuresBody: null,
    features: [
      "From Idea to Intelligence",
      "Custom Chatbots",
      "NLP Analytics",
      "Computer Vision",
      "Predictive Analytics",
      "Generative AI",
      "Document Automation",
      "Automated Testing",
    ],
    valueCards: [
      ["tools", "Real AI Experts", "Our team includes ML engineers, prompt engineers, and AI product strategists."],
      ["clock", "Fast Delivery", "Launch proof-of-concepts in weeks, not months."],
      ["tools", "Responsible AI", "We build with privacy, transparency, and fairness in mind."],
    ],
    processSteps: [
      ["research", "Discovery", "We begin with in-depth workshops to align your business goals with AI opportunities. Our team audits your data sources, tools, and technical readiness while prioritizing use cases with high impact potential."],
      ["prototype", "Design & Prototype", "We rapidly conceptualize and prototype AI solutions. This includes drafting model flows, designing UI/UX mockups, and running early pilots using sandbox environments for validation."],
      ["design", "Build & Integrate", "We train or fine-tune models, develop backend services, and integrate AI features directly into your existing systems. This stage includes security, latency, and compliance testing."],
      ["development", "Monitor & Evolve", "Post-launch, we provide analytics dashboards and feedback mechanisms to track performance, identify drift, and guide model retraining. Enhancements are released iteratively based on results."],
    ],
  },
};

const dryRun = process.argv.includes("--dry-run");

const env = await readDotEnv();
const projectId = env.PUBLIC_SANITY_PROJECT_ID;
const dataset = env.PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId) fail("PUBLIC_SANITY_PROJECT_ID is missing from .env.");
if (!token && !dryRun) {
  fail("SANITY_API_WRITE_TOKEN is missing from .env (Editor role). See .env.example.");
}

if (dryRun) {
  for (const [slug, c] of Object.entries(CONTENT)) {
    console.log(`\n--- ${slug} ---`);
    console.log(`  banner  : ${c.bannerWords.join(" / ")}`);
    console.log(`  heading : ${c.featuresHeading}`);
    console.log(`  lead    : ${c.featuresLead ?? "(left empty)"}`);
    console.log(`  body    : ${c.featuresBody ?? "(left empty)"}`);
    console.log(`  cards   : ${c.features.length} — ${c.features.join(", ")}`);
    for (const [icon, title, text] of c.valueCards) {
      console.log(`  value   : [${icon}] ${title} — ${text ?? "(left empty)"}`);
    }
    if (c.processSteps.length === 0) {
      console.log("  process : (none on the original)");
    }
    for (const [icon, title, text] of c.processSteps) {
      console.log(`  process : [${icon}] ${title} — ${text}`);
    }
  }
  console.log("\nDry run; nothing was written.");
  process.exit(0);
}

// Upload the shared card illustration once, then point every card at it.
const svg = await readFile(CARD_ILLUSTRATION).catch((err) =>
  fail(`Could not read ${CARD_ILLUSTRATION}: ${err.message}`)
);
const uploadUrl = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/assets/images/${dataset}`);
uploadUrl.searchParams.set("filename", basename(CARD_ILLUSTRATION));

const uploadRes = await fetch(uploadUrl, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/svg+xml" },
  body: svg,
});
if (!uploadRes.ok) fail(`Card illustration upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
const illustrationId = (await uploadRes.json()).document._id;
console.log(`Card illustration: ${illustrationId}`);

const mutations = [];

for (const [slug, content] of Object.entries(CONTENT)) {
  const href = `/our-services/${slug}`;
  const docs = await query(`*[_type == "service" && href == $href]{_id, title}`, { href });

  if (docs.length === 0) {
    console.warn(`  ! no service with href "${href}" -- skipped`);
    continue;
  }

  for (const doc of docs) {
    const set = {
      bannerWords: content.bannerWords,
      featuresHeading: content.featuresHeading,
      features: content.features.map((title, i) => ({
        _type: "feature",
        // Sanity needs a stable `_key` on every array item; without one the
        // Studio cannot tell the cards apart and reordering breaks.
        _key: `feature-${i}`,
        title,
        image: { _type: "image", asset: { _type: "reference", _ref: illustrationId } },
      })),
      valueCards: content.valueCards.map(([icon, title, description], i) => ({
        _type: "valueCard",
        _key: `value-${i}`,
        icon,
        // A null description means the original leaves it blank; omit the
        // key entirely rather than writing "" so the Studio field reads as
        // empty rather than as deliberately-blank text.
        title,
        ...(description === null ? {} : { description }),
      })),
      processSteps: content.processSteps.map(([icon, title, description], i) => ({
        _type: "processStep",
        _key: `step-${i}`,
        icon,
        title,
        description,
      })),
    };

    // Null in CONTENT means "the original leaves this blank": unset the
    // field rather than writing an empty string an editor would then have
    // to find and clear. A field is only ever in one of set/unset.
    const unset = [];
    for (const key of ["featuresLead", "featuresBody"]) {
      if (content[key] === null) unset.push(key);
      else set[key] = content[key];
    }

    mutations.push({ patch: { id: doc._id, set, ...(unset.length ? { unset } : {}) } });

    const draft = doc._id.startsWith("drafts.") ? " (draft)" : "";
    console.log(`  queued ${doc.title}${draft}`);
  }
}

const res = await fetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations }),
});

if (!res.ok) fail(`Seeding failed (${res.status}): ${await res.text()}`);

console.log(`\nWrote ${mutations.length} document patches.`);
console.log("Restart `npm run dev` (getStaticPaths is cached per session) or rebuild to see them.");

async function query(groq, params) {
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", groq);
  url.searchParams.set("perspective", "raw");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(`Sanity query failed (${res.status}): ${await res.text()}`);
  return (await res.json()).result ?? [];
}

async function readDotEnv() {
  const raw = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
  const values = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...values, ...process.env };
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
