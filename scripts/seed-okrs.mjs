// Loads Pavel's Q4 2026 OKR sheet into Ops: the key results (Overview) and
// the Priorities list (Plan tab). Source: the "Pavel · Q4 2026 OKRs" sheet,
// shared 2026-11-06.
//
//   node --env-file=.env scripts/seed-okrs.mjs [--dry-run]
//
// Re-runnable: fixed ids; each run re-applies the fields below except task
// status (comments and anything not listed here are kept). The three placeholder key results from
// the first seed (ops.kr.new-leads / organic-clicks / organic-users) are
// reused for 1.1 / K1 / K2, so tasks and content already linked to them stay
// linked.
import { createClient } from "@sanity/client";

const dryRun = process.argv.includes("--dry-run");
const client = createClient({
  projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
  dataset: process.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});

const O1 = "1. Turn the traffic into website MQLs";
const O2 = "2. Ship the site work the other channels depend on";
const W = "Watch (not graded)";

const kr = (id, fields) => ({ _id: `ops.kr.${id}`, _type: "opsKeyResult", owner: "Pavel", dueDate: "2026-12-31", ...fields });
const keyResults = [
  kr("new-leads", { order: 1, code: "1.1", objective: O1, title: "Website form MQLs, both sites (15 a month)", kind: "metric", metric: "derived.forms.mqlQtd", cumulative: true, target: 45, stretch: 72, andrewKr: "O5" }),
  kr("form-start-rate", { order: 2, code: "1.2", objective: O1, title: "Form start rate, bolderapps.com (latest week)", kind: "metric", metric: "derived.bolder.formStartRate", baseline: 0.013, target: 0.02, stretch: 0.03, unit: "%", andrewKr: "O5 KR2" }),
  kr("ab-tests", { order: 3, code: "1.3", objective: O1, title: "A/B tests finished with a declared winner", kind: "metric", metric: "derived.abWinnersQtd", cumulative: true, baseline: 0, target: 3, stretch: 5, andrewKr: "O5 KR6, O2 KR7" }),
  kr("form-tracking", { order: 4, code: "2.1", objective: O2, title: "Form tracking fixed and ad scroll bug fixed", kind: "milestone", targetDate: "2026-10-31", andrewKr: "O5 KR1, O2 KR1" }),
  kr("synergy-rebuild", { order: 5, code: "2.2", objective: O2, title: "Synergy rebuild live", kind: "milestone", targetDate: "2026-10-31", andrewKr: "O1 KR8" }),
  kr("ad-landing-pages", { order: 6, code: "2.3", objective: O2, title: "Ad landing pages live, one per ad group theme", kind: "milestone", targetDate: "2026-11-14", andrewKr: "O2 KR7" }),
  kr("ai-local-groundwork", { order: 7, code: "2.4", objective: O2, title: "AI search and local groundwork: LLMs.txt, schema fixes, location pages match GMB", kind: "milestone", targetDate: "2026-11-14", andrewKr: "O1 KR3, O1 KR1" }),
  kr("cms-collections", { order: 8, code: "2.5", objective: O2, title: "New CMS collections live (Top AI Tools, Top Apps, App Founders by City; Agents Rankings is stretch)", kind: "count", baseline: 0, target: 3, stretch: 4, andrewKr: "O1 KR6" }),
  kr("organic-clicks", { order: 9, code: "K1", objective: W, title: "Organic search clicks per week (Search Console)", kind: "metric", metric: "derived.both.gscClicks", baseline: 398, target: 400, andrewKr: "O1" }),
  kr("organic-users", { order: 10, code: "K2", objective: W, title: "New users per week (GA4)", kind: "metric", metric: "derived.both.newUsers", baseline: 2133, target: 2133 }),
  kr("cta-clicks", { order: 11, code: "K3", objective: W, title: "CTA clicks per week", kind: "metric", metric: "derived.both.ctaClicks", baseline: 30, target: 60, stretch: 80, andrewKr: "O5" }),
];
// Fields the placeholder versions had that no longer apply.
const KR_UNSET = ["current", "unit", "baseline", "stretch", "metric", "targetDate", "cumulative"];

const monday = (d) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
const task = (title, due, status, krId, andrewKr, extra = {}) => {
  const week = due ? monday(due) : undefined;
  return {
    _id: `ops.task.p-${slug(title)}`,
    _type: "opsTask",
    title,
    owner: "Pavel",
    status: status === "Done" ? "done" : "todo",
    startWeek: week ?? "2026-11-09",
    endWeek: week ?? "2026-12-28",
    ...(due ? { dueDate: due } : {}),
    ...(krId ? { keyResult: `ops.kr.${krId}` } : {}),
    ...(andrewKr && andrewKr !== "—" ? { andrewKr } : {}),
    ...extra,
  };
};
const q3 = (title, status, extra = {}) =>
  task(title, undefined, status, undefined, undefined, {
    notes: "Carried from Q3 (no date yet)",
    ...(status === "Done" ? { startWeek: "2026-09-28", endWeek: "2026-09-28" } : {}),
    ...extra,
  });

const tasks = [
  task("Form tracking fixed: one GA4 event per submit, HubSpot form source by brand, spam filter on forms", "2026-10-31", "Late", "form-tracking", "O5 KR1, O2 KR1"),
  task("Fix the ad landing-page scroll bug", "2026-10-31", "Done", "form-tracking", "O2 KR1"),
  task("Synergy rebuild live", "2026-10-31", "Done", "synergy-rebuild", "O1 KR8"),
  task("LLMs.txt live and correct", "2026-10-31", "Done", "ai-local-groundwork", "O1 KR3"),
  task("Clarity on the top 10 pages, with a list of drop-off points", "2026-11-07", "Open", "form-start-rate", "O5 KR2"),
  task("Schema audit fixes shipped", "2026-11-14", "Open", "ai-local-groundwork", "O1 KR3"),
  task("Location pages: name, address, phone and schema match each GMB listing", "2026-11-14", "Done", "ai-local-groundwork", "O1 KR1"),
  task("One ad landing page per ad group theme", "2026-11-14", "Open", "ad-landing-pages", "O2 KR7"),
  task("Shorter contact and estimate forms", "2026-11-14", "Open", "form-start-rate", "O5 KR2"),
  task("Partner page on the site, with the partner sign-up form and /partners/refer", "2026-11-15", "Open", undefined, "S1 KR1"),
  task("CTA above the fold on every blog and location page", "2026-11-21", "Open", "cta-clicks", "O5 KR2"),
  task("Top AI Tools CMS collection live", "2026-11-30", "Open", "cms-collections", "O1 KR6"),
  task("A/B test: homepage hero copy", "2026-11-30", "Open", "ab-tests", "O5 KR6"),
  task("Top Apps in App Store CMS collection live", "2026-12-15", "Open", "cms-collections", "O1 KR6"),
  task("App Founders by City CMS collection live: top 10 per city, Miami first (founder list from Marco by Dec 1), title and meta refreshed each quarter", "2026-12-15", "Open", "cms-collections", "O1 KR6"),
  task("A/B test: main CTA", "2026-12-15", "Open", "ab-tests", "O5 KR6"),
  task("A/B test: hero and CTA on ad landing pages", "2026-12-15", "Open", "ab-tests", "O2 KR7"),
  task("A/B test: estimate form length", "2026-12-31", "Open", "ab-tests", "O5 KR6"),
  task("Agents Rankings CMS collection live (stretch)", "2026-12-31", "Open", "cms-collections", "O1 KR6"),
  q3("Phone number fixes", "Done"),
  q3("About Us page rebuild", "Done"),
  q3("Combo Integrations CMS page", "Open"),
  q3("Project Hub page design fixes", "Open"),
  q3("Video testimonials across the site", "Open"),
  q3("Subservices page (waiting on Roman's design)", "Done"),
  q3("How we work page (waiting on Roman's design)", "Open", { status: "blocked" }),
  q3("AI solutions pages (waiting on Roman's design)", "Open", { status: "blocked" }),
  q3("SVG on each location page", "Open"),
  q3("Interlinking across the site", "Open"),
];

// Tasks from the first seed whose status moved on since.
const statusFixes = [
  ["ops.task.game-plan", "done", "Game plan built: this dashboard + the OKR sheet loaded into it (2026-11-06)."],
  ["ops.task.webhook-401", "done", "Fixed: newest post shows on /blog and in the sitemap (Health check passing since 2026-11-05)."],
];

if (dryRun) {
  console.log(`${keyResults.length} key results, ${tasks.length} tasks, ${statusFixes.length} status fixes (dry run)`);
  process.exit(0);
}
const tx = client.transaction();
for (const { _id, _type, ...fields } of keyResults) {
  tx.createIfNotExists({ _id, _type, title: fields.title, objective: fields.objective });
  tx.patch(_id, (p) => p.unset(KR_UNSET.filter((k) => !(k in fields))).set(fields));
}
for (const { _id, _type, ...fields } of tasks) {
  // Status comes from the sheet only when the task is first created; after
  // that the Plan tab owns it.
  const { status, ...rest } = fields;
  tx.createIfNotExists({ _id, _type, ...fields });
  tx.patch(_id, (p) => p.set(rest));
}
for (const [id, status, note] of statusFixes) tx.patch(id, (p) => p.set({ status, notes: note }));
await tx.commit();
console.log(`Loaded ${keyResults.length} key results and ${tasks.length} Priorities tasks; updated ${statusFixes.length} task statuses.`);
