// The weekly scorecard (Pavel's Q4 OKR sheet, "Weekly" tab) and the live
// values behind the key results on the Overview.
//
// Columns, per Monday-Sunday week:
//   Organic search clicks   Search Console, Synergy + Bolder
//   New users               GA4, Synergy + Bolder
//   CTA clicks              GA4 event GA4_CTA_EVENT, Synergy + Bolder
//   Form start rate         GA4 form_start / sessions, bolderapps.com
//   Form MQLs Bolder / Synergy   real (non-test) form submissions, Forms tab
//   A/B tests with a winner, Notes   typed in (ops.weekly.<week>)
//   Blogs posted Bolder / Synergy    posts by publish date (blog tracker, ops.blog.*)
//   MQLs / SQLs (HubSpot)            lifecycle stage reached that week, split by brand
//   Pulse                            one line on what moved, written by a person or agent
import { opsClient, mondayOf, addDays, type KpiSnapshot } from "./store";
import { testReason } from "./formtest";
import type { Submission } from "./submissions";

export const QUARTER = { start: "2026-10-01", end: "2026-12-31", firstWeek: "2026-09-28", lastWeek: "2026-12-28" };

export interface WeeklyNote {
  _id: string;
  _type: "opsWeekly";
  week: string;
  abWinners?: number;
  notes?: string;
  pulse?: string;
  pulseBy?: string;
}

export interface ScoreRow {
  week: string;
  gscClicks?: number;
  gscClicksSynergy?: number;
  gscClicksBolder?: number;
  newUsers?: number;
  ctaClicks?: number;
  formStartRateBolder?: number;
  mqlsBolder: number;
  mqlsSynergy: number;
  abWinners?: number;
  notes?: string;
  blogsBolder: number;
  blogsSynergy: number;
  mqlHubspot?: number;
  mqlHubspotBolder?: number;
  mqlHubspotSynergy?: number;
  sqlHubspot?: number;
  pulse?: string;
  pulseBy?: string;
}

/** Live values a key result can be "tracked automatically by". */
export const DERIVED_METRICS: Record<string, { label: string; format?: "pct" }> = {
  "derived.forms.mqlQtd": { label: "Form MQLs this quarter, both sites (real submissions)" },
  "derived.forms.mqlQtdBolder": { label: "Form MQLs this quarter, bolderapps.com" },
  "derived.forms.mqlQtdSynergy": { label: "Form MQLs this quarter, synergylabs.co" },
  "derived.both.gscClicks": { label: "Organic search clicks per week, both sites (latest week)" },
  "derived.both.newUsers": { label: "New users per week, both sites (latest week)" },
  "derived.both.ctaClicks": { label: "CTA clicks per week, both sites (latest week)" },
  "derived.bolder.formStartRate": { label: "Form start rate, bolderapps.com (latest week)", format: "pct" },
  "derived.abWinnersQtd": { label: "A/B tests with a winner this quarter (Weekly tab)" },
};

const sum = (...v: (number | undefined)[]) => (v.some((x) => x !== undefined) ? v.reduce<number>((a, x) => a + (x ?? 0), 0) : undefined);

export function buildScorecard(synergy: KpiSnapshot[], bolder: KpiSnapshot[], submissions: Submission[], rules: string[], notes: WeeklyNote[], blogs: { site: string; publishedAt?: string }[] = []) {
  const weeks: string[] = [];
  for (let w = QUARTER.firstWeek; w <= QUARTER.lastWeek; w = addDays(w, 7)) weeks.push(w);
  const at = (list: KpiSnapshot[], w: string) => list.find((k) => k.weekStart === w)?.metrics ?? {};
  const real = submissions.filter((s) => !testReason(s, rules));
  const mqls = (site: string, w: string) => real.filter((s) => (s.site ?? "synergy") === site && mondayOf(s.submittedAt) === w).length;

  const rows: ScoreRow[] = weeks.map((week) => {
    const sy = at(synergy, week);
    const bo = at(bolder, week);
    const note = notes.find((n) => n.week === week);
    return {
      week,
      gscClicksSynergy: sy["gsc.clicks"],
      gscClicksBolder: bo["gsc.clicks"],
      gscClicks: sum(sy["gsc.clicks"], bo["gsc.clicks"]),
      newUsers: sum(sy["ga4.newUsers"], bo["ga4.newUsers"]),
      ctaClicks: sum(sy["ga4.ctaClicks"], bo["ga4.ctaClicks"]),
      formStartRateBolder: bo["ga4.formStartRate"],
      mqlsBolder: mqls("bolder", week),
      mqlsSynergy: mqls("synergy", week),
      abWinners: note?.abWinners,
      notes: note?.notes,
      blogsBolder: blogs.filter((b) => b.site === "bolder" && b.publishedAt && mondayOf(b.publishedAt) === week).length,
      blogsSynergy: blogs.filter((b) => b.site === "synergy" && b.publishedAt && mondayOf(b.publishedAt) === week).length,
      mqlHubspot: sy["hubspot.mql"],
      mqlHubspotBolder: sy["hubspot.mql.bolder"],
      mqlHubspotSynergy: sy["hubspot.mql.synergy"],
      sqlHubspot: sy["hubspot.sql"],
      pulse: note?.pulse,
      pulseBy: note?.pulseBy,
    };
  });

  // Latest complete week that has a value.
  const thisWeek = mondayOf(new Date());
  const done = rows.filter((r) => r.week < thisWeek).reverse();
  const latest = (k: keyof ScoreRow) => {
    const r = done.find((x) => x[k] !== undefined);
    return r ? { value: r[k] as number, from: r.week } : undefined;
  };
  const inQuarter = real.filter((s) => s.submittedAt >= QUARTER.start && s.submittedAt <= `${QUARTER.end}T23:59:59.999Z`);
  const derived: Record<string, { value: number; from?: string } | undefined> = {
    "derived.forms.mqlQtd": { value: inQuarter.length },
    "derived.forms.mqlQtdBolder": { value: inQuarter.filter((s) => s.site === "bolder").length },
    "derived.forms.mqlQtdSynergy": { value: inQuarter.filter((s) => (s.site ?? "synergy") === "synergy").length },
    "derived.both.gscClicks": latest("gscClicks"),
    "derived.both.newUsers": latest("newUsers"),
    "derived.both.ctaClicks": latest("ctaClicks"),
    "derived.bolder.formStartRate": latest("formStartRateBolder"),
    "derived.abWinnersQtd": { value: rows.reduce((a, r) => a + (r.abWinners ?? 0), 0) },
  };
  return { rows, derived };
}

export async function loadWeeklyNotes(): Promise<WeeklyNote[]> {
  return opsClient().fetch<WeeklyNote[]>(`*[_type == "opsWeekly" && _id in path("ops.**")]`);
}
