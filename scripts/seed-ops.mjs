// Seeds the Ops dashboard (/ops) with the starting plan from the
// Pavel & Andrew sync of 2026-11-02: the lead-gen objective, its key results,
// the action items, and the weekly bot jobs through year-end.
//
//   node --env-file=.env scripts/seed-ops.mjs
//
// Idempotent: fixed ids, createIfNotExists -- re-running never overwrites
// anything edited in the dashboard. Ids start "ops." so they stay private in
// the public dataset (see src/lib/ops/store.ts).
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});

const OBJECTIVE = "Grow inbound leads from synergylabs.co (Q4 2026)";
const YEAR_END = "2026-12-28";

const keyResults = [
  {
    _id: "ops.kr.organic-users",
    title: "Organic users / month: 2,500 → 3,000",
    metric: "ga4.organicUsers30d",
    baseline: 2500,
    target: 3000,
    dueDate: "2026-12-31",
    owner: "Pavel",
    order: 1,
  },
  {
    _id: "ops.kr.new-leads",
    title: "New leads recover from the 30–40% drop",
    metric: "hubspot.newContacts",
    owner: "Pavel",
    dueDate: "2026-12-31",
    order: 2,
  },
  {
    _id: "ops.kr.organic-clicks",
    title: "Search clicks / week grow every week",
    metric: "gsc.clicks",
    owner: "Bot",
    dueDate: "2026-12-31",
    order: 3,
  },
].map((kr) => ({ _type: "opsKeyResult", objective: OBJECTIVE, ...kr }));

const task = (id, title, owner, startWeek, endWeek, extra = {}) => ({
  _id: `ops.task.${id}`,
  _type: "opsTask",
  title,
  owner,
  startWeek,
  endWeek,
  status: "todo",
  ...extra,
});

const tasks = [
  // Action items from the 2026-11-02 sync.
  task("game-plan", "Build the Synergy ops game plan with Andrew (this dashboard)", "Pavel", "2026-11-02", "2026-11-02", { status: "doing", keyResult: "ops.kr.new-leads" }),
  task("kpi-tracker", "Update KPI tracker; decompose Boulder OKRs into weekly tasks", "Pavel", "2026-11-02", "2026-11-02", { keyResult: "ops.kr.new-leads", notes: "Propose tracker improvements for the Friday review." }),
  task("friday-sync", "Run Fri Nov 6 sync: Boulder OKR + Synergy plan review", "Pavel", "2026-11-02", "2026-11-02"),
  task("chatbot", "Verify staging matches prod for the AI chatbot (still unresolved)", "Pavel", "2026-11-02", "2026-11-02", { keyResult: "ops.kr.new-leads" }),
  task("location-content", "Location page content: Dallas, San Francisco, …", "Pavel", "2026-11-02", "2026-11-16", { status: "doing", keyResult: "ops.kr.organic-users" }),
  task("webhook-401", "Fix the Sanity → /api/revalidate webhook (401): /blog and sitemap don't refresh on publish", "Pavel", "2026-11-02", "2026-11-02", { keyResult: "ops.kr.organic-users" }),
  task("email-routing", "Publish separate email routing for site form submissions", "Pavel", "2026-11-09", "2026-11-09", { keyResult: "ops.kr.new-leads" }),

  // Setting up the automation.
  task("connect-data", "Connect GA4, Search Console, HubSpot to Ops (service account + private app)", "Pavel", "2026-11-09", "2026-11-09", { keyResult: "ops.kr.new-leads" }),
  task("ops-launch", "Ops live on production: OPS_PASSWORD, CRON_SECRET, ANTHROPIC_API_KEY in Vercel", "Pavel", "2026-11-09", "2026-11-09"),
  task("site-health", "Automate site health checks: forms → HubSpot, 404s, chatbot, webhook", "Pavel", "2026-11-16", "2026-11-30", { keyResult: "ops.kr.new-leads" }),

  // The weekly rhythm through year-end.
  task("monday-review", "5–10 min plan review on the Monday call", "Andrew", "2026-11-09", YEAR_END, { recurring: true }),
  task("approve-drafts", "Review & approve AI drafts (Ops → Content)", "Andrew", "2026-11-16", YEAR_END, { recurring: true, keyResult: "ops.kr.organic-users" }),
  task("bot-kpi", "Weekly KPI sync: GA4 / Search Console / HubSpot", "Bot", "2026-11-09", YEAR_END, { recurring: true, keyResult: "ops.kr.new-leads" }),
  task("bot-new-posts", "Draft 2 new SEO posts / week from search opportunities", "Bot", "2026-11-16", YEAR_END, { recurring: true, keyResult: "ops.kr.organic-users" }),
  task("bot-refresh", "Refresh 1 post / week that is losing clicks", "Bot", "2026-11-23", YEAR_END, { recurring: true, keyResult: "ops.kr.organic-clicks" }),
  task("bot-publish", "Publish approved posts on schedule", "Bot", "2026-11-16", YEAR_END, { recurring: true, keyResult: "ops.kr.organic-users" }),
  task("backlinks", "Backlinks: prospect list + outreach drafts (sent by a person)", "Pavel", "2026-11-23", YEAR_END, { recurring: true, keyResult: "ops.kr.organic-clicks" }),
];

const content = [
  { id: "location-dallas", title: "Location page content: Dallas" },
  { id: "location-san-francisco", title: "Location page content: San Francisco" },
].map(({ id, title }) => ({
  _id: `ops.content.${id}`,
  _type: "opsContent",
  title,
  kind: "location",
  week: "2026-11-02",
  status: "planned",
  keyResult: "ops.kr.organic-users",
}));

const docs = [...keyResults, ...tasks, ...content];
const tx = client.transaction();
for (const doc of docs) tx.createIfNotExists(doc);
await tx.commit();
console.log(`Seeded ${docs.length} Ops documents (existing ones left untouched).`);
