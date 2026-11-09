// Data for the Ops dashboard (/ops): the plan, tasks, content calendar, KPI
// snapshots and the bots' activity log, kept in the site's Sanity dataset.
//
// Every Ops document has an _id starting "ops." -- that is what keeps them
// private. The production dataset is public (the site reads it without a
// token), but Sanity never returns documents whose id contains a dot to an
// unauthenticated request; the same rule keeps "drafts.*" private. So these
// are readable only with a token, i.e. only through this server code.
//
// No Studio schema is registered for these types on purpose: a document
// created in the Studio would get a random, dot-free id and be public.
import { createClient, type SanityClient } from "@sanity/client";
import { randomUUID } from "node:crypto";

let client: SanityClient | undefined;

/** Server-side client with write access. Never import this from browser code. */
export function opsClient(): SanityClient {
  const token = process.env.SANITY_API_WRITE_TOKEN || import.meta.env.SANITY_API_WRITE_TOKEN;
  if (!token) throw new Error("SANITY_API_WRITE_TOKEN is not set");
  client ??= createClient({
    projectId: process.env.PUBLIC_SANITY_PROJECT_ID || import.meta.env.PUBLIC_SANITY_PROJECT_ID || "toot3mhg",
    dataset: process.env.PUBLIC_SANITY_DATASET || import.meta.env.PUBLIC_SANITY_DATASET || "production",
    apiVersion: "2024-01-01",
    token,
    useCdn: false,
    // "raw" so drafts (blog drafts written by the content bot) are visible.
    perspective: "raw",
  });
  return client;
}

export const OPS_TYPES = ["opsKeyResult", "opsTask", "opsContent", "opsRun", "opsKpi", "opsFeedback", "opsSubmission", "opsWeekly"] as const;
export type OpsType = (typeof OPS_TYPES)[number];

const PREFIX: Record<OpsType, string> = {
  opsKeyResult: "ops.kr.",
  opsTask: "ops.task.",
  opsContent: "ops.content.",
  opsRun: "ops.run.",
  opsKpi: "ops.kpi.",
  opsFeedback: "ops.feedback.",
  opsSubmission: "ops.submission.",
  opsWeekly: "ops.weekly.",
};

export const newId = (type: OpsType, suffix: string = randomUUID().slice(0, 12)) => PREFIX[type] + suffix;
export const isOpsId = (id: unknown): id is string => typeof id === "string" && id.startsWith("ops.");

export type Owner = "Pavel" | "Andrew" | "Bot";

/** Discussion on a task, key result or content item. */
export interface Comment {
  _key: string;
  by: string;
  at: string;
  text: string;
}

export interface KeyResult {
  _id: string;
  _type: "opsKeyResult";
  title: string;
  objective: string;
  /** A KPI key (see METRICS in kpi.ts): the current value then updates itself. */
  metric?: string;
  baseline?: number;
  target?: number;
  /** Manual value, used when there is no metric or no data for it yet. */
  current?: number;
  unit?: string;
  dueDate?: string;
  owner?: Owner;
  order?: number;
  /** "1.1", "K2"... as in the OKR sheet. */
  code?: string;
  stretch?: number;
  /** Andrew's OKR this rolls up to, e.g. "O5 KR2". */
  andrewKr?: string;
  /**
   * How progress is judged: "metric" (a number vs target), "milestone" (done
   * when every linked task is done, late after targetDate), "count" (number
   * of linked tasks done vs target).
   */
  kind?: "metric" | "milestone" | "count";
  /** Metric KRs: the value adds up over the quarter (vs. a latest-week level). */
  cumulative?: boolean;
  targetDate?: string;
  comments?: Comment[];
}

export type TaskStatus = "todo" | "doing" | "done" | "blocked";
export interface Task {
  _id: string;
  _type: "opsTask";
  title: string;
  owner: Owner;
  keyResult?: string;
  status: TaskStatus;
  /** Monday of the first and last week, YYYY-MM-DD. */
  startWeek: string;
  endWeek: string;
  /** "Every week" bot jobs and human tasks render the same way on the plan. */
  recurring?: boolean;
  notes?: string;
  /** Deadline from the OKR sheet's Priorities; late when past and not done. */
  dueDate?: string;
  andrewKr?: string;
  comments?: Comment[];
}

export type ContentKind = "new" | "refresh" | "location" | "backlink";
export type ContentStatus = "idea" | "planned" | "drafting" | "review" | "approved" | "published" | "rejected";
export interface ContentItem {
  _id: string;
  _type: "opsContent";
  title: string;
  kind: ContentKind;
  keyword?: string;
  brief?: string;
  week: string;
  status: ContentStatus;
  keyResult?: string;
  /** The blogPost the bot drafted (its published id; the draft is "drafts." + this). */
  postId?: string;
  slug?: string;
  /** For refreshes: the existing post's path. */
  targetPath?: string;
  /** ISO datetime the publish cron releases it at. */
  publishAt?: string;
  publishedAt?: string;
  approvedBy?: string;
  notes?: string;
  comments?: Comment[];
}

export type FeedbackStatus = "open" | "doing" | "done";
/** A comment pinned to an element of a site page (the on-site feedback tool). */
export interface Feedback {
  _id: string;
  _type: "opsFeedback";
  /** Sequential number shown on the pin. */
  number: number;
  title: string;
  status: FeedbackStatus;
  assignee?: Owner;
  createdBy: string;
  createdAt: string;
  /** Host + path the pin is on, e.g. "www.synergylabs.co" and "/contact". */
  host: string;
  path: string;
  /** CSS selector of the clicked element, and where in it (0-1 fractions). */
  selector: string;
  offsetX: number;
  offsetY: number;
  /** Fallback position: page coordinates at the time, and the viewport. */
  pageX: number;
  pageY: number;
  viewport: string;
  userAgent?: string;
  elementText?: string;
  screenshot?: string;
  comments?: Comment[];
}

export interface BotRun {
  _id: string;
  _type: "opsRun";
  job: string;
  startedAt: string;
  ok: boolean;
  summary: string;
  details?: string;
  costUsd?: number;
  by?: string;
}

export interface KpiSnapshot {
  _id: string;
  _type: "opsKpi";
  /** Missing = Synergy Labs; "bolder" = Bolder Apps (ids "ops.kpi.bolder-<week>"). */
  site?: "bolder";
  /** Monday..Sunday of the week measured. */
  weekStart: string;
  weekEnd: string;
  metrics: Record<string, number>;
  /** Top pages and queries, for the "what moved" lists. */
  lists?: Record<string, { label: string; value: number; change?: number }[]>;
  errors?: Record<string, string>;
  syncedAt: string;
}

// Sanity field names cannot contain dots, and metric keys do ("gsc.clicks"),
// so a snapshot is stored with its maps as keyed arrays and converted back
// on read.
type Keyed<T> = ({ _key: string; key: string } & T)[];
interface StoredKpi extends Omit<KpiSnapshot, "metrics" | "lists" | "errors"> {
  metrics: Keyed<{ value: number }>;
  lists?: Keyed<{ rows: ({ _key: string } & { label: string; value: number; change?: number })[] }>;
  errors?: Keyed<{ message: string }>;
}
const k = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, "_");

export function toStoredKpi(s: KpiSnapshot): StoredKpi {
  return {
    ...s,
    metrics: Object.entries(s.metrics).map(([key, value]) => ({ _key: k(key), key, value })),
    lists: Object.entries(s.lists ?? {}).map(([key, rows]) => ({
      _key: k(key),
      key,
      rows: rows.map((r, i) => ({ _key: `r${i}`, ...r })),
    })),
    errors: Object.entries(s.errors ?? {}).map(([key, message]) => ({ _key: k(key), key, message })),
  };
}

function fromStoredKpi(s: StoredKpi): KpiSnapshot {
  return {
    ...s,
    metrics: Object.fromEntries((s.metrics ?? []).map((m) => [m.key, m.value])),
    lists: Object.fromEntries((s.lists ?? []).map((l) => [l.key, l.rows.map(({ _key, ...r }) => r)])),
    errors: Object.fromEntries((s.errors ?? []).map((e) => [e.key, e.message])),
  };
}

export async function loadAll() {
  const c = opsClient();
  const [keyResults, tasks, content, runs, kpis, feedback] = await Promise.all([
    c.fetch<KeyResult[]>(`*[_type == "opsKeyResult" && _id in path("ops.**")] | order(order asc, _createdAt asc)`),
    c.fetch<Task[]>(`*[_type == "opsTask" && _id in path("ops.**")] | order(startWeek asc, _createdAt asc)`),
    c.fetch<ContentItem[]>(`*[_type == "opsContent" && _id in path("ops.**")] | order(week asc, _createdAt asc)`),
    c.fetch<BotRun[]>(`*[_type == "opsRun" && _id in path("ops.**")] | order(startedAt desc)[0...60]`),
    c
      .fetch<StoredKpi[]>(`*[_type == "opsKpi" && _id in path("ops.**") && !defined(site)] | order(weekStart desc)[0...26]`)
      .then((list) => list.map(fromStoredKpi)),
    c.fetch<Feedback[]>(`*[_type == "opsFeedback" && _id in path("ops.**")] | order(number desc)`),
  ]);
  return { keyResults, tasks, content, runs, kpis, feedback };
}

/** Weekly snapshots for another website's tab (Bolder Apps), newest first. */
export async function loadSiteKpis(site: "bolder"): Promise<KpiSnapshot[]> {
  const list = await opsClient().fetch<StoredKpi[]>(
    `*[_type == "opsKpi" && _id in path("ops.**") && site == $site] | order(weekStart desc)[0...26]`,
    { site }
  );
  return list.map(fromStoredKpi);
}

/** Appends to the bot activity log. Never throws: logging must not fail a job. */
export async function logRun(run: Omit<BotRun, "_id" | "_type" | "startedAt"> & { startedAt?: string }) {
  const startedAt = run.startedAt ?? new Date().toISOString();
  try {
    await opsClient().create({
      _id: newId("opsRun", `${startedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`),
      _type: "opsRun",
      ...run,
      startedAt,
    });
  } catch (err) {
    console.error("[ops] Could not log run:", err);
  }
}

/** Monday of the week containing `date`, as YYYY-MM-DD (UTC). */
export function mondayOf(date: Date | string): string {
  const d = new Date(typeof date === "string" ? `${date.slice(0, 10)}T00:00:00Z` : date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
