// The Ops dashboard UI (mounted by src/pages/ops/index.astro). One screen per
// tab -- Overview, Plan, Content, Forms, Feedback, KPIs, Health, Bots -- all reading the single
// /api/ops/data payload and writing through /api/ops/<action>.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { HBars, Legend, LineChart, Sparkline, StackedBars, compact, type Series } from "./charts";
import { testReason } from "../../lib/ops/formtest";

// ---- Types (mirrors src/lib/ops/store.ts; that file imports node modules) ----

type Owner = "Pavel" | "Andrew" | "Bot";
interface Comment { _key: string; by: string; at: string; text: string }
interface Check { _key: string; name: string; group: string; ok: boolean; detail: string }
interface Health { checkedAt: string; checks: Check[] }
interface Feedback { _id: string; _type: "opsFeedback"; number: number; title: string; status: "open" | "doing" | "done"; assignee?: Owner; createdBy: string; createdAt: string; host: string; path: string; viewport: string; userAgent?: string; elementText?: string; screenshot?: string; comments?: Comment[] }
interface KeyResult { _id: string; _type: "opsKeyResult"; title: string; objective: string; metric?: string; baseline?: number; target?: number; current?: number; unit?: string; dueDate?: string; owner?: Owner; order?: number; code?: string; stretch?: number; andrewKr?: string; kind?: "metric" | "milestone" | "count"; cumulative?: boolean; targetDate?: string; comments?: Comment[] }
interface Task { _id: string; _type: "opsTask"; title: string; owner: Owner; keyResult?: string; status: "todo" | "doing" | "done" | "blocked"; startWeek: string; endWeek: string; recurring?: boolean; notes?: string; dueDate?: string; andrewKr?: string; comments?: Comment[] }
interface ScoreRow { week: string; gscClicks?: number; gscClicksSynergy?: number; gscClicksBolder?: number; newUsers?: number; ctaClicks?: number; formStartRateBolder?: number; mqlsBolder: number; mqlsSynergy: number; abWinners?: number; notes?: string }
interface ContentItem { _id: string; _type: "opsContent"; title: string; kind: "new" | "refresh" | "location" | "backlink"; keyword?: string; brief?: string; week: string; status: string; keyResult?: string; postId?: string; slug?: string; targetPath?: string; publishAt?: string; publishedAt?: string; approvedBy?: string; notes?: string; comments?: Comment[] }
interface BotRun { _id: string; job: string; startedAt: string; ok: boolean; summary: string; details?: string; costUsd?: number; by?: string }
interface ListRow { label: string; value: number; change?: number }
interface Kpi { _id: string; weekStart: string; weekEnd: string; metrics: Record<string, number>; lists?: Record<string, ListRow[]>; errors?: Record<string, string>; syncedAt: string }
interface MetricDef { label: string; better?: "up" | "down"; format?: "pct" | "dec" }
interface Data {
  user: string;
  keyResults: KeyResult[];
  tasks: Task[];
  content: ContentItem[];
  runs: BotRun[];
  kpis: Kpi[];
  metrics: Record<string, MetricDef>;
  sources: Record<string, boolean>;
  health: Health | null;
  feedback: Feedback[];
  digestTo: string;
  scorecard: { rows: ScoreRow[]; derived: Record<string, { value: number; from?: string } | undefined> };
}

// ---- Helpers -------------------------------------------------------------------

async function api<T = any>(action: string, body?: object): Promise<T> {
  const res = await fetch(`/api/ops/${action}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) location.reload();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
const mondayOf = (d: Date | string) => {
  const x = typeof d === "string" ? toDate(d) : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return iso(new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY));
};
const THIS_WEEK = mondayOf(new Date());
const weekLabel = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weeksBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
};
const fmt = (v: number | undefined, def?: MetricDef) => {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  if (def?.format === "pct") return `${(v * 100).toFixed(1)}%`;
  if (def?.format === "dec") return v.toFixed(1);
  return Math.round(v).toLocaleString();
};

// Chart + identity colours. Categorical slots (owners, series) and the one-hue
// ramp for ordered pipeline stages were run through the dataviz palette
// validator (CVD-safe adjacent pairs; ramp monotone with a visible light end).
const C = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", grey: "#c3c2b7", good: "#0ca30c", critical: "#d03b3b" };
const OWNER_COLOR: Record<Owner, string> = { Pavel: C.blue, Andrew: C.orange, Bot: C.aqua };
const STAGES = ["idea", "planned", "drafting", "review", "approved", "published"] as const;
const STAGE_COLOR: Record<string, string> = { idea: "#c6dcf7", planned: "#86b6ef", drafting: "#5598e7", review: "#2a78d6", approved: "#1c5cab", published: "#104281" };
const STATUS_STYLE: Record<string, string> = {
  idea: "bg-neutral-100 text-neutral-600",
  planned: "bg-sky-50 text-sky-800 ring-sky-200",
  drafting: "bg-amber-50 text-amber-800 ring-amber-200",
  review: "bg-orange-50 text-orange-800 ring-orange-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  published: "bg-[#0a332c] text-white ring-[#0a332c]",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  todo: "bg-neutral-100 text-neutral-600",
  doing: "bg-sky-50 text-sky-800 ring-sky-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  blocked: "bg-red-50 text-red-700 ring-red-200",
};
const KIND_LABEL = { new: "New post", refresh: "Refresh", location: "Location page", backlink: "Backlink" };

/** A key result's live value: its metric from the newest snapshot that has it, else the manual value. */
function krValue(kr: KeyResult, kpis: Kpi[], derived: Data["scorecard"]["derived"] = {}): { value?: number; from?: string } {
  if (kr.metric?.startsWith("derived.")) return derived[kr.metric] ?? { value: kr.current };
  if (kr.metric) {
    const snap = kpis.find((k) => k.metrics?.[kr.metric!] !== undefined);
    if (snap) return { value: snap.metrics[kr.metric], from: snap.weekStart };
  }
  return { value: kr.current };
}

/** Q4 2026, as in the OKR sheet. */
const Q4 = { start: "2026-10-01", end: "2026-12-31" };
const q4Elapsed = () => Math.min(1, Math.max(0, (Date.now() - Date.parse(`${Q4.start}T00:00:00Z`)) / (Date.parse(`${Q4.end}T23:59:59Z`) - Date.parse(`${Q4.start}T00:00:00Z`))));
const TODAY = iso(new Date());
const isLate = (t: Task) => t.status !== "done" && !!t.dueDate && t.dueDate < TODAY;

/**
 * A key result's value and status, the way the OKR sheet grades it:
 * milestones are Done when every linked task is done and Late after their
 * date; counts are linked tasks done; metrics compare against the target --
 * pro-rated by the quarter elapsed when they add up over the quarter.
 */
function krStatus(kr: KeyResult, data: Data): { value?: number; from?: string; status: "done" | "on track" | "behind" | "late" | "open" | "no data"; pct?: number } {
  const linked = data.tasks.filter((t) => t.keyResult === kr._id);
  if (kr.kind === "milestone") {
    const done = linked.length > 0 && linked.every((t) => t.status === "done");
    return { value: linked.filter((t) => t.status === "done").length, status: done ? "done" : kr.targetDate && kr.targetDate < TODAY ? "late" : "open", pct: linked.length ? linked.filter((t) => t.status === "done").length / linked.length : 0 };
  }
  const { value, from } = kr.kind === "count" ? { value: linked.filter((t) => t.status === "done").length, from: undefined } : krValue(kr, data.kpis, data.scorecard?.derived);
  if (value === undefined || kr.target === undefined) return { value, from, status: "no data" };
  const pct = Math.max(0, value / kr.target);
  if (value >= kr.target) return { value, from, status: "done", pct };
  const bar = kr.cumulative || kr.kind === "count" ? kr.target * q4Elapsed() : kr.target;
  return { value, from, status: value >= bar ? "on track" : "behind", pct };
}
const KR_TONE: Record<string, string> = { done: "bg-emerald-50 text-emerald-800", "on track": "bg-sky-50 text-sky-800", behind: "bg-amber-50 text-amber-900", late: "bg-red-50 text-red-800", open: "bg-neutral-100 text-neutral-700", "no data": "bg-neutral-50 text-neutral-400" };
const fmtKr = (kr: KeyResult, v?: number) => (v === undefined ? "–" : kr.unit === "%" ? `${(v * 100).toFixed(1)}%` : fmt(v));

// ---- Small UI pieces --------------------------------------------------------------

const Pill = ({ s, label }: { s: string; label?: string }) => <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ring-black/5 ${STATUS_STYLE[s] ?? "bg-neutral-100"}`}>{label ?? s}</span>;
const Card = ({ title, sub, action, children, className = "" }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`min-w-0 rounded-xl border border-black/[0.07] bg-white p-5 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] font-semibold text-neutral-900">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);
const Btn = ({ children, onClick, kind = "primary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; type?: "button" | "submit" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
      kind === "primary" ? "bg-primary-green text-white hover:bg-secondary-green" : kind === "danger" ? "text-red-700 hover:bg-red-50" : "bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
    }`}
  >
    {children}
  </button>
);
const Empty = ({ children }: { children: ReactNode }) => <p className="py-4 text-sm text-neutral-500">{children}</p>;
const Dot = ({ color }: { color: string }) => <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;

/** Not-connected placeholder used inside a chart card. */
const Waiting = ({ what }: { what: string }) => (
  <div className="flex h-[180px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 text-center">
    <p className="text-sm font-medium text-neutral-600">Waiting for {what}</p>
    <p className="max-w-xs text-xs text-neutral-500">Fills in on the next KPI sync once access is granted.</p>
  </div>
);

/** A KPI tile: latest value, change vs previous week, 12-week sparkline. */
function Stat({ label, metric, data, color = C.blue, source }: { label: string; metric: string; data: Data; color?: string; source: string }) {
  const def = data.metrics[metric];
  const snaps = [...data.kpis].slice(0, 12).reverse();
  const values = snaps.map((s) => s.metrics?.[metric]);
  const latestI = values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0).pop();
  const v = latestI === undefined ? undefined : values[latestI];
  const prev = latestI === undefined ? undefined : values[latestI - 1];
  const ch = v !== undefined && prev ? (v - prev) / prev : undefined;
  const good = ch !== undefined && (def?.better === "down" ? ch < 0 : ch > 0);
  return (
    <div className="min-w-0 rounded-xl border border-black/[0.07] bg-white p-4">
      <p className="truncate text-xs font-medium text-neutral-500">{label}</p>
      {v === undefined ? (
        <>
          <p className="mt-1.5 text-2xl font-semibold text-neutral-300">–</p>
          <p className="mt-2 text-[11px] text-neutral-400">{data.sources[source] ? "Waiting for first sync" : "Not connected yet"}</p>
        </>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-neutral-900">{fmt(v, def)}</p>
            {ch !== undefined && Math.abs(ch) >= 0.005 && (
              <span className={`text-xs font-medium ${good ? "text-[#006300]" : "text-[#b42727]"}`}>{ch > 0 ? "▲" : "▼"} {Math.abs(ch * 100).toFixed(0)}%</span>
            )}
          </div>
          <div className="mt-1"><Sparkline values={values} color={color} /></div>
          <p className="text-[11px] text-neutral-400">week of {weekLabel(snaps[latestI!].weekStart)} · vs prior week</p>
        </>
      )}
    </div>
  );
}

/** Content items per week, stacked by pipeline stage. */
function PipelineChart({ data, weeks }: { data: Data; weeks: string[] }) {
  const series: Series[] = STAGES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), color: STAGE_COLOR[s], values: weeks.map((w) => data.content.filter((c) => c.status === s && mondayOf(c.week) === w).length) }));
  return (
    <>
      <Legend items={series} />
      <StackedBars x={weeks.map(weekLabel)} series={series} height={170} highlight={weeks.indexOf(THIS_WEEK)} format={(v) => String(Math.round(v))} />
    </>
  );
}

/** Open tasks per week, stacked by owner (recurring tasks count every week). */
function WorkloadChart({ data, weeks }: { data: Data; weeks: string[] }) {
  const series: Series[] = (["Pavel", "Andrew", "Bot"] as Owner[]).map((o) => ({
    key: o,
    label: o,
    color: OWNER_COLOR[o],
    values: weeks.map((w) => data.tasks.filter((t) => t.owner === o && t.status !== "done" && mondayOf(t.startWeek) <= w && mondayOf(t.endWeek) >= w).length),
  }));
  return (
    <>
      <Legend items={series} />
      <StackedBars x={weeks.map(weekLabel)} series={series} height={170} highlight={weeks.indexOf(THIS_WEEK)} format={(v) => String(Math.round(v))} />
    </>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-xl"} rounded-2xl bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-2xl">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-700" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

type FieldDef = { k: string; label: string; type?: "text" | "textarea" | "number" | "date" | "week" | "datetime" | "select" | "checkbox"; options?: [string, string][] };

/** Every Monday from 8 weeks ago to the end of next year, plus `current` if it is outside that. */
function weekOptions(current?: string): [string, string][] {
  const weeks = weeksBetween(addDays(THIS_WEEK, -56), `${new Date().getFullYear() + 1}-12-31`);
  if (current && !weeks.includes(mondayOf(current))) weeks.unshift(mondayOf(current));
  const fmtDay = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return weeks.map((w) => [w, `${fmtDay(w)} – ${fmtDay(addDays(w, 6))}${w.slice(0, 4) !== String(new Date().getFullYear()) ? `, ${w.slice(0, 4)}` : ""}${w === THIS_WEEK ? "  (this week)" : ""}`]);
}

function Form({ fields, value, onChange }: { fields: FieldDef[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (k: string, v: any) => {
    const next = { ...value, [k]: v };
    // Keep a task's range valid: moving one end past the other moves both.
    if (k === "startWeek" && next.endWeek && v > next.endWeek) next.endWeek = v;
    if (k === "endWeek" && next.startWeek && v < next.startWeek) next.startWeek = v;
    onChange(next);
  };
  const cls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.k} className={`block text-sm ${f.type === "textarea" || f.k === "title" ? "sm:col-span-2" : ""}`}>
          <span className="mb-1 block text-neutral-600">{f.label}</span>
          {f.type === "week" ? (
            <select className={cls} value={value[f.k] ? mondayOf(value[f.k]) : ""} onChange={(e) => set(f.k, e.target.value)}>
              {!value[f.k] && <option value="">Choose a week…</option>}
              {weekOptions(value[f.k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea rows={3} className={cls} value={value[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
          ) : f.type === "select" ? (
            <select className={cls} value={value[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)}>
              {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : f.type === "checkbox" ? (
            <input type="checkbox" checked={Boolean(value[f.k])} onChange={(e) => set(f.k, e.target.checked)} />
          ) : (
            <input
              className={cls}
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text"}
              value={f.type === "datetime" && value[f.k] ? toLocalInput(value[f.k]) : value[f.k] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set(f.k, f.type === "number" ? (v === "" ? "" : Number(v)) : f.type === "datetime" && v ? new Date(v).toISOString() : v);
              }}
            />
          )}
        </label>
      ))}
    </div>
  );
}
const toLocalInput = (isoStr: string) => {
  const d = new Date(isoStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// ---- Comments ---------------------------------------------------------------------

function Comments({ doc, onSaved }: { doc: { _id?: string; comments?: Comment[] }; onSaved: () => void }) {
  const [list, setList] = useState<Comment[]>(doc.comments ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!doc._id) return null;
  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const updated = await api("comment", { _id: doc._id, text });
      setList(updated.comments ?? []);
      setText("");
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 border-t border-neutral-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Discussion</p>
      <ul className="mb-3 space-y-2">
        {list.map((c) => (
          <li key={c._key} className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <p className="text-xs text-neutral-500"><b className="text-neutral-700">{c.by}</b> · {new Date(c.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            <p className="whitespace-pre-wrap">{c.text}</p>
          </li>
        ))}
        {!list.length && <li className="text-sm text-neutral-400">No comments yet.</li>}
      </ul>
      <div className="flex gap-2">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && post()} placeholder="Write a comment… (⌘↵ to send)" className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <Btn onClick={post} disabled={busy || !text.trim()}>Send</Btn>
      </div>
    </div>
  );
}

// ---- Editors ------------------------------------------------------------------------

const ownerOptions: [string, string][] = [["Pavel", "Pavel"], ["Andrew", "Andrew"], ["Bot", "Bot (automated)"]];

function krOptions(krs: KeyResult[]): [string, string][] {
  return [["", "— none —"], ...krs.map((k) => [k._id, k.title] as [string, string])];
}

function Editor({ doc, data, onClose, onSaved }: { doc: Record<string, any>; data: Data; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(doc);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fields: FieldDef[] =
    doc._type === "opsTask"
      ? [
          { k: "title", label: "Task" },
          { k: "owner", label: "Owner", type: "select", options: ownerOptions },
          { k: "status", label: "Status", type: "select", options: ["todo", "doing", "done", "blocked"].map((s) => [s, s]) },
          { k: "startWeek", label: "From week", type: "week" },
          { k: "endWeek", label: "To week", type: "week" },
          { k: "keyResult", label: "Drives key result", type: "select", options: krOptions(data.keyResults) },
          { k: "dueDate", label: "Due (late after this date)", type: "date" },
          { k: "andrewKr", label: "Andrew's KR (e.g. O5 KR2)" },
          { k: "recurring", label: "Repeats every week", type: "checkbox" },
          { k: "notes", label: "Notes", type: "textarea" },
        ]
      : doc._type === "opsKeyResult"
        ? [
            { k: "code", label: "Number (e.g. 1.1, K2)" },
            { k: "title", label: "Key result" },
            { k: "objective", label: "Objective" },
            { k: "andrewKr", label: "Andrew's KR (e.g. O5 KR2)" },
            { k: "kind", label: "Graded as", type: "select", options: [["metric", "A number vs target"], ["milestone", "Milestone: done when all linked tasks are done"], ["count", "Count of linked tasks done"]] },
            ...(v.kind === "milestone"
              ? [{ k: "targetDate", label: "Target date", type: "date" } as FieldDef]
              : [
                  ...(v.kind === "count" ? [] : [{ k: "metric", label: "Tracked automatically by", type: "select", options: [["", "— manual value —"], ...Object.entries(data.metrics).map(([k, m]) => [k, m.label] as [string, string])] } as FieldDef, { k: "cumulative", label: "Adds up over the quarter (judge against pro-rated target)", type: "checkbox" } as FieldDef]),
                  { k: "baseline", label: "Q3 / baseline", type: "number" } as FieldDef,
                  { k: "target", label: "Target", type: "number" } as FieldDef,
                  { k: "stretch", label: "Stretch", type: "number" } as FieldDef,
                  ...(v.kind === "count" || v.metric ? [] : [{ k: "current", label: "Current (manual)", type: "number" } as FieldDef]),
                  { k: "unit", label: "Unit (% for rates stored as 0.02)" } as FieldDef,
                ]),
            { k: "owner", label: "Owner", type: "select", options: ownerOptions },
            { k: "order", label: "Order", type: "number" },
          ]
        : [
            { k: "title", label: "Title / topic" },
            { k: "kind", label: "Type", type: "select", options: Object.entries(KIND_LABEL) },
            { k: "week", label: "Planned week", type: "week" },
            { k: "keyword", label: "Target keyword" },
            { k: "status", label: "Status", type: "select", options: ["idea", "planned", "drafting", "review", "approved", "published", "rejected"].map((s) => [s, s]) },
            { k: "keyResult", label: "Drives key result", type: "select", options: krOptions(data.keyResults) },
            ...(v.kind === "refresh" ? [{ k: "targetPath", label: "Existing post path (/blog/...)" } as FieldDef] : []),
            { k: "brief", label: "Brief for the writer (angle, audience, must-cover points)", type: "textarea" },
            { k: "notes", label: "Notes", type: "textarea" },
          ];

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("save", v);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this?")) return;
    await api("delete", { _id: doc._id });
    onSaved();
    onClose();
  };
  return (
    <Modal title={doc._id ? "Edit" : "New"} onClose={onClose}>
      <Form fields={fields} value={v} onChange={setV} />
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      <div className="mt-5 flex justify-between">
        {doc._id ? <Btn kind="danger" onClick={remove}>Delete</Btn> : <span />}
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || !v.title}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
      <Comments doc={doc} onSaved={onSaved} />
    </Modal>
  );
}

// ---- Content review ------------------------------------------------------------------

function ContentPanel({ item, data, onClose, onSaved }: { item: ContentItem; data: Data; onClose: () => void; onSaved: () => void }) {
  const [post, setPost] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [publishAt, setPublishAt] = useState(item.publishAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (item.postId) api(`post?id=${encodeURIComponent(item.postId)}`).then(setPost).catch(() => {});
  }, [item.postId, item.status]);

  const act = async (action: string, body: object = {}) => {
    setBusy(action);
    setErr("");
    try {
      await api(action, { _id: item._id, ...body });
      onSaved();
      if (action !== "draft") onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  if (editing) return <Editor doc={item} data={data} onClose={() => setEditing(false)} onSaved={onSaved} />;
  const canDraft = (item.kind === "new" || item.kind === "refresh") && ["idea", "planned", "rejected", "review"].includes(item.status);

  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <Pill s={item.status} />
        <span>{KIND_LABEL[item.kind]}</span>
        <span>· week of {weekLabel(item.week)}</span>
        {item.keyword && <span>· keyword “{item.keyword}”</span>}
        {item.publishAt && item.status === "approved" && <span>· publishes {new Date(item.publishAt).toLocaleString()}</span>}
        {item.approvedBy && <span>· approved by {item.approvedBy}</span>}
      </div>
      {item.brief && <p className="mb-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm">{item.brief}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Btn kind="ghost" onClick={() => setEditing(true)}>Edit details</Btn>
        {canDraft && (
          <Btn onClick={() => act("draft")} disabled={!!busy || !data.sources.claude}>
            {busy === "draft" ? "Writing… (1–3 min)" : item.postId ? "Rewrite draft with AI" : "Write draft with AI"}
          </Btn>
        )}
        {item.postId && item.status !== "published" && (
          <a className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50" href={`/studio/intent/edit/id=${encodeURIComponent(item.postId)};type=blogPost`} target="_blank" rel="noreferrer">
            Edit in Studio ↗
          </a>
        )}
        {item.status === "published" && item.slug && (
          <a className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50" href={`/blog/${item.slug}`} target="_blank" rel="noreferrer">View live ↗</a>
        )}
      </div>
      {!data.sources.claude && canDraft && <p className="mb-3 text-sm text-amber-800">AI drafting needs ANTHROPIC_API_KEY on this deployment.</p>}

      {(item.status === "review" || item.status === "approved") && item.postId && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-orange-50 p-4">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-700">Publish at (your time)</span>
            <input type="datetime-local" className="rounded-lg border border-neutral-300 px-3 py-1.5" value={toLocalInput(publishAt)} onChange={(e) => e.target.value && setPublishAt(new Date(e.target.value).toISOString())} />
          </label>
          <Btn onClick={() => act("approve", { publishAt })} disabled={!!busy}>{item.status === "approved" ? "Reschedule" : "Approve & schedule"}</Btn>
          <Btn kind="ghost" onClick={() => confirm("Publish this post to the live site now?") && act("publish")} disabled={!!busy}>{busy === "publish" ? "Publishing…" : "Publish now"}</Btn>
          <Btn kind="danger" onClick={() => act("reject", { notes: prompt("What should change? (saved to notes)") ?? item.notes })} disabled={!!busy}>Send back</Btn>
        </div>
      )}
      {(item.status === "idea" || item.status === "rejected") && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 p-4 text-sm">
          <span className="flex-1">Topic idea{item.notes ? ` — ${item.notes}` : ""}. Approve it and the bot drafts it when its week starts.</span>
          <Btn onClick={() => act("save", { _type: "opsContent", status: "planned" })} disabled={!!busy}>Approve topic</Btn>
          {item.status === "idea" && <Btn kind="danger" onClick={() => act("save", { _type: "opsContent", status: "rejected" })} disabled={!!busy}>Reject</Btn>}
        </div>
      )}
      {err && <p className="mb-3 text-sm text-red-700">{err}</p>}

      {post ? (
        <article className="ops-article rounded-xl border border-neutral-200 p-6">
          <p className="text-xs text-neutral-500">/blog/{post.slug} · {post.readingMinutes} min · {post.author}</p>
          <h1 className="mt-2 text-3xl">{post.title}</h1>
          {post.previewText && <p className="mt-2 text-neutral-600">{post.previewText}</p>}
          <div className="prose-ops mt-6" dangerouslySetInnerHTML={{ __html: post.articleHtml ?? "" }} />
        </article>
      ) : item.postId ? (
        <Empty>Loading draft…</Empty>
      ) : (
        <Empty>No draft yet.</Empty>
      )}
      <Comments doc={item} onSaved={onSaved} />
    </Modal>
  );
}

// ---- Tabs ------------------------------------------------------------------------------

function Overview({ data, open, sync }: { data: Data; open: (d: any) => void; sync: () => void }) {
  const week = data.tasks.filter((t) => t.startWeek <= THIS_WEEK && t.endWeek >= THIS_WEEK && t.status !== "done");
  const review = data.content.filter((c) => c.status === "review");
  const upcoming = data.content.filter((c) => c.status === "approved").sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""));
  const latest = data.kpis[0];
  const missing = Object.entries(latest?.errors ?? {});

  const leadsKr = data.keyResults.find((k) => k.metric?.startsWith("hubspot.") && k.target !== undefined);
  const trend = [...data.kpis].slice(0, 12).reverse();
  const around = weeksBetween(addDays(THIS_WEEK, -21), addDays(THIS_WEEK, 56));
  const doneCount = data.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 lg:col-span-3 xl:grid-cols-4">
        <Stat label="New leads (HubSpot)" metric="hubspot.newContacts" source="hubspot" data={data} color={C.blue} />
        <Stat label="Organic users" metric="ga4.organicUsers" source="ga4" data={data} color={C.blue} />
        <Stat label="Search clicks" metric="gsc.clicks" source="gsc" data={data} color={C.blue} />
        <Stat label="Avg. search position" metric="gsc.position" source="gsc" data={data} color={C.blue} />
      </div>

      <Card title="Form MQLs per week" sub="Real form submissions this quarter (Forms tab, tests excluded)" className="lg:col-span-3">
        <StackedBars
          x={data.scorecard.rows.map((r) => weekLabel(r.week))}
          series={[
            { key: "b", label: "bolderapps.com", color: C.blue, values: data.scorecard.rows.map((r) => (r.week <= THIS_WEEK ? r.mqlsBolder : undefined)) },
            { key: "s", label: "synergylabs.co", color: C.orange, values: data.scorecard.rows.map((r) => (r.week <= THIS_WEEK ? r.mqlsSynergy : undefined)) },
          ]}
          highlight={data.scorecard.rows.findIndex((r) => r.week === THIS_WEEK)}
        />
        <div className="mt-2"><Legend items={[{ label: "bolderapps.com", color: C.blue }, { label: "synergylabs.co", color: C.orange }]} /></div>
      </Card>

      <Card title="Leads per week (HubSpot)" sub={leadsKr ? `Dashed line: key result target (${leadsKr.title})` : "New HubSpot contacts, all sources vs organic search"} className="lg:col-span-3">
        {!trend.some((k) => k.metrics?.["hubspot.newContacts"] !== undefined) ? (
          <Waiting what="HubSpot access" />
        ) : (
          <>
            <Legend items={[{ label: "All leads", color: C.blue }, { label: "From organic search", color: C.orange }]} />
            <LineChart
              x={trend.map((k) => weekLabel(k.weekStart))}
              series={[
                { key: "all", label: "All leads", color: C.blue, values: trend.map((k) => k.metrics?.["hubspot.newContacts"]) },
                { key: "org", label: "From organic search", color: C.orange, values: trend.map((k) => k.metrics?.["hubspot.newContactsOrganic"]) },
              ]}
              target={leadsKr && leadsKr.metric === "hubspot.newContacts" ? { value: leadsKr.target!, label: `Target ${fmt(leadsKr.target)}` } : undefined}
              height={220}
            />
          </>
        )}
      </Card>

      <Card
        title="Q4 2026 key results"
        sub={`Q4 elapsed ${(q4Elapsed() * 100).toFixed(1)}% · numbers update from Forms, GA4 and Search Console; milestones from the Plan tab`}
        className="lg:col-span-3"
        action={<Btn kind="ghost" onClick={() => open({ _type: "opsKeyResult", kind: "metric", objective: data.keyResults[0]?.objective ?? "", owner: "Pavel" })}>+ Add</Btn>}
      >
        {data.keyResults.length === 0 && <Empty>No key results yet.</Empty>}
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y border-neutral-100 bg-neutral-50/70 text-xs text-neutral-500">
              <tr><th className="py-2 pl-5 pr-2 text-left font-medium">#</th><th className="py-2 pr-3 text-left font-medium">Key result</th><th className="px-2 py-2 text-right font-medium">Q3</th><th className="px-2 py-2 text-right font-medium">Target</th><th className="px-2 py-2 text-right font-medium">Stretch</th><th className="px-2 py-2 text-right font-medium">Q4 so far</th><th className="px-2 py-2 text-left font-medium">Status</th><th className="py-2 pl-2 pr-5 text-left font-medium">Andrew's KR</th></tr>
            </thead>
            {[...new Set(data.keyResults.map((k) => k.objective))].map((obj) => (
              <tbody key={obj} className="divide-y divide-neutral-100">
                <tr><td colSpan={8} className="pb-1 pl-5 pt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">{obj}</td></tr>
                {data.keyResults.filter((k) => k.objective === obj).map((kr) => {
                  const st = krStatus(kr, data);
                  const linked = data.tasks.filter((t) => t.keyResult === kr._id);
                  return (
                    <tr key={kr._id} onClick={() => open(kr)} className="cursor-pointer hover:bg-neutral-50">
                      <td className="py-2.5 pl-5 pr-2 align-top tabular-nums text-neutral-500">{kr.code}</td>
                      <td className="py-2.5 pr-3 align-top">
                        <p className="font-medium leading-snug">{kr.title}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {kr.kind === "milestone" ? `${st.value}/${linked.length} linked tasks done` : kr.kind === "count" ? `linked tasks done` : kr.metric ? (st.from ? `auto, week of ${weekLabel(st.from)}` : kr.metric.startsWith("derived.forms") || kr.metric === "derived.abWinnersQtd" ? "auto" : "auto, waiting for data") : "manual"}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-right align-top tabular-nums text-neutral-500">{kr.kind === "milestone" ? "—" : fmtKr(kr, kr.baseline)}</td>
                      <td className="px-2 py-2.5 text-right align-top tabular-nums">{kr.kind === "milestone" ? (kr.targetDate ? new Date(`${kr.targetDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—") : fmtKr(kr, kr.target)}</td>
                      <td className="px-2 py-2.5 text-right align-top tabular-nums text-neutral-500">{kr.stretch !== undefined ? fmtKr(kr, kr.stretch) : ""}</td>
                      <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{kr.kind === "milestone" ? "" : fmtKr(kr, st.value)}</td>
                      <td className="px-2 py-2.5 align-top"><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${KR_TONE[st.status]}`}>{st.status}</span></td>
                      <td className="py-2.5 pl-2 pr-5 align-top text-xs text-neutral-500">{kr.andrewKr}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </Card>

      <Card title={`This week · ${weekLabel(THIS_WEEK)}`} sub={`${week.length} open · ${doneCount} of ${data.tasks.length} tasks done overall`} className="lg:col-span-2" action={<Btn kind="ghost" onClick={() => open({ _type: "opsTask", owner: "Pavel", status: "todo", startWeek: THIS_WEEK, endWeek: THIS_WEEK })}>+ Task</Btn>}>
        {week.length === 0 && <Empty>Nothing open this week.</Empty>}
        <div className={`grid gap-x-6 gap-y-3 ${new Set(week.map((t) => t.owner)).size > 1 ? "md:grid-cols-2" : ""}`}>
          {(["Pavel", "Andrew", "Bot"] as Owner[]).map((o) => {
            const mine = week.filter((t) => t.owner === o);
            if (!mine.length) return null;
            return (
              <div key={o}>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-neutral-500"><Dot color={OWNER_COLOR[o]} />{o} · {mine.length}</p>
                <ul className="divide-y divide-neutral-100">
                  {mine.map((t) => (
                    <li key={t._id} className="flex items-center justify-between gap-3 py-2">
                      <button className="text-left text-sm hover:underline" onClick={() => open(t)}>{t.title}{!!t.comments?.length && <span className="ml-1.5 text-xs text-neutral-500">💬 {t.comments.length}</span>}</button>
                      <Pill s={t.status} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4 lg:row-span-2">
        <Card title={`Needs review (${review.length})`}>
          {review.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <ul className="space-y-2">{review.map((c) => <li key={c._id}><button className="text-left text-sm font-medium hover:underline" onClick={() => open(c)}>{c.title}</button></li>)}</ul>
          )}
        </Card>
        <Card title="Scheduled">
          {upcoming.length === 0 ? <Empty>Nothing scheduled.</Empty> : (
            <ul className="space-y-2 text-sm">{upcoming.map((c) => <li key={c._id}><button className="text-left hover:underline" onClick={() => open(c)}>{c.title}</button><span className="block text-xs text-neutral-500">{c.publishAt && new Date(c.publishAt).toLocaleString()}</span></li>)}</ul>
          )}
        </Card>
        <HealthSummary data={data} />
        <Card title="Data sources" action={<Btn kind="ghost" onClick={sync}>Sync now</Btn>}>
          <ul className="space-y-1.5 text-sm">
            {[["ga4", "Google Analytics 4"], ["gsc", "Search Console"], ["hubspot", "HubSpot"], ["claude", "Claude (AI drafts)"], ["email", "Email digest"]].map(([k, l]) => {
              const state = data.sources[k] ? (latest?.errors?.[k] ? "error" : "connected") : "not connected";
              return (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{l}</span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${state === "connected" ? "text-[#006300]" : state === "error" ? "text-[#b42727]" : "text-neutral-500"}`}>
                    {state === "connected" ? "✓" : state === "error" ? "✕" : "○"} {state}
                  </span>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <details className="mt-2 text-xs text-neutral-500"><summary>Details</summary>{missing.map(([k, e]) => <p key={k}>{k}: {e}</p>)}</details>}
          {latest && <p className="mt-2 text-xs text-neutral-500">Last sync {new Date(latest.syncedAt).toLocaleString()}</p>}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
        <Card title="Content pipeline" sub="Items per planned week, by stage"><PipelineChart data={data} weeks={around} /></Card>
        <Card title="Workload" sub="Open tasks per week, by owner"><WorkloadChart data={data} weeks={around} /></Card>
      </div>

      <Card title="Recent bot activity" className="lg:col-span-3"><RunList runs={data.runs.slice(0, 8)} /></Card>
    </div>
  );
}

function HealthSummary({ data }: { data: Data }) {
  const failing = data.health?.checks.filter((c) => !c.ok) ?? [];
  return (
    <Card title="Site health" action={<a href="#Health" onClick={() => window.dispatchEvent(new HashChangeEvent("hashchange"))} className="text-sm text-primary-green hover:underline">Details</a>}>
      {!data.health ? (
        <Empty>Not checked yet.</Empty>
      ) : failing.length ? (
        <ul className="space-y-1 text-sm">{failing.map((c) => <li key={c._key} className="text-red-800">✕ {c.group} · {c.name}</li>)}</ul>
      ) : (
        <p className="text-sm text-emerald-700">✓ All {data.health.checks.length} checks pass</p>
      )}
      {data.health && <p className="mt-2 text-xs text-neutral-500">Checked {new Date(data.health.checkedAt).toLocaleString()}</p>}
    </Card>
  );
}

/** One square per recent health run (from the activity log), oldest first. */
function HealthHistory({ runs }: { runs: BotRun[] }) {
  const list = runs.filter((r) => r.job === "health").slice(0, 30).reverse();
  if (!list.length) return null;
  const bad = list.filter((r) => !r.ok).length;
  return (
    <div className="mb-5 rounded-lg bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-600">
        <span className="font-medium">Last {list.length} runs</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.good }} />✓ all pass</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.critical }} />✕ something failed ({bad})</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {list.map((r) => (
          <span
            key={r._id}
            title={`${new Date(r.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${r.summary}`}
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
            style={{ background: r.ok ? C.good : C.critical }}
          >
            {r.ok ? "" : "✕"}
          </span>
        ))}
      </div>
    </div>
  );
}

function HealthTab({ data, reload, setToast }: { data: Data; reload: () => void; setToast: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setToast("Running health checks (about 20 seconds)…");
    try {
      await api("health", {});
      setToast("Health checks done");
      reload();
    } catch (e: any) {
      setToast(`Health check failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const groups = [...new Set(data.health?.checks.map((c) => c.group) ?? [])];
  return (
    <Card title="Site health" action={<Btn onClick={run} disabled={busy}>{busy ? "Checking…" : "Run checks now"}</Btn>}>
      <p className="mb-4 text-sm text-neutral-600">
        Runs daily at 07:00 UTC against the live site. When a check starts failing, everyone on the digest list gets an email.
        {data.health && <> Last run {new Date(data.health.checkedAt).toLocaleString()}.</>}
      </p>
      {!data.health && <Empty>Not checked yet — click “Run checks now”.</Empty>}
      <HealthHistory runs={data.runs} />
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">{g}</p>
            <ul className="divide-y divide-neutral-100">
              {data.health!.checks.filter((c) => c.group === g).map((c) => (
                <li key={c._key} className="flex items-start gap-2 py-1.5 text-sm">
                  <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✕"}</span>
                  <span className="min-w-0 flex-1"><b className="font-medium">{c.name}</b> <span className="text-neutral-500">— {c.detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

const FB_STATUS: Record<Feedback["status"], string> = { open: "Open", doing: "In progress", done: "Done" };
const fbLink = (f: Feedback) => `https://${f.host}${f.path}?feedback=${f.number}`;
const browserOf = (ua = "") => (/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "") + (/Mobile|iPhone|Android/.test(ua) ? " mobile" : "");

function FeedbackPanel({ item, onClose, onSaved }: { item: Feedback; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(item);
  const save = async (fields: Partial<Feedback>) => {
    setF(await api("save", { _id: f._id, _type: "opsFeedback", ...fields }));
    onSaved();
  };
  return (
    <Modal title={`#${f.number} · ${f.path}`} onClose={onClose} wide>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div>
          <p className="whitespace-pre-wrap text-base">{f.title}</p>
          {f.screenshot && (
            <a href={f.screenshot} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl ring-1 ring-neutral-200">
              <img src={`${f.screenshot}?w=1200`} alt="Screenshot" className="w-full" />
            </a>
          )}
          <Comments doc={f} onSaved={onSaved} />
        </div>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-neutral-600">Status</span>
            <select className="w-full rounded-lg border border-neutral-300 px-3 py-2" value={f.status} onChange={(e) => save({ status: e.target.value as Feedback["status"] })}>
              {Object.entries(FB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-neutral-600">Assignee</span>
            <select className="w-full rounded-lg border border-neutral-300 px-3 py-2" value={f.assignee ?? ""} onChange={(e) => save({ assignee: (e.target.value || "") as Owner })}>
              <option value="">Unassigned</option><option>Pavel</option><option>Andrew</option>
            </select>
          </label>
          <a href={fbLink(f)} target="_blank" rel="noreferrer" className="block rounded-lg bg-primary-green px-3 py-2 text-center font-medium text-white hover:bg-secondary-green">Open on the page ↗</a>
          <dl className="space-y-1 text-neutral-600">
            <div><dt className="inline text-neutral-400">By </dt><dd className="inline">{f.createdBy}, {new Date(f.createdAt).toLocaleString()}</dd></div>
            <div><dt className="inline text-neutral-400">Site </dt><dd className="inline">{f.host}</dd></div>
            <div><dt className="inline text-neutral-400">Screen </dt><dd className="inline">{f.viewport} {browserOf(f.userAgent)}</dd></div>
            {f.elementText && <div><dt className="inline text-neutral-400">Element </dt><dd className="inline">“{f.elementText.slice(0, 120)}”</dd></div>}
          </dl>
          <Btn kind="danger" onClick={async () => { if (confirm("Delete this feedback?")) { await api("delete", { _id: f._id }); onSaved(); onClose(); } }}>Delete</Btn>
        </div>
      </div>
    </Modal>
  );
}

function FeedbackTab({ data, reload }: { data: Data; reload: () => void }) {
  const [status, setStatus] = useState<"active" | Feedback["status"] | "all">("active");
  const [who, setWho] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = data.feedback.filter((f) => (status === "all" ? true : status === "active" ? f.status !== "done" : f.status === status) && (!who || f.assignee === who));
  const opened = data.feedback.find((f) => f._id === openId);
  return (
    <Card
      title={`Site feedback (${data.feedback.filter((f) => f.status !== "done").length} open)`}
      action={
        <div className="flex gap-2 text-sm">
          <select className="rounded-lg border border-neutral-300 px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">Open + in progress</option><option value="open">Open</option><option value="doing">In progress</option><option value="done">Done</option><option value="all">All</option>
          </select>
          <select className="rounded-lg border border-neutral-300 px-2 py-1" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anyone</option><option>Pavel</option><option>Andrew</option>
          </select>
        </div>
      }
    >
      <p className="mb-4 text-sm text-neutral-600">
        While you are signed in here, every page of the site (production and staging) shows a <b>Feedback</b> bar in the bottom-left corner: click <b>+ Add</b>, click any element, and write what should change. A screenshot is attached automatically.
      </p>
      {!list.length && <Empty>No feedback{status !== "all" ? " in this view" : ""} yet.</Empty>}
      <ul className="divide-y divide-neutral-100">
        {list.map((f) => (
          <li key={f._id}>
            <button onClick={() => setOpenId(f._id)} className="flex w-full items-start gap-4 py-3 text-left hover:bg-neutral-50">
              {f.screenshot ? <img src={`${f.screenshot}?w=240&h=150&fit=crop`} alt="" className="h-[75px] w-[120px] shrink-0 rounded-lg object-cover ring-1 ring-neutral-200" /> : <div className="h-[75px] w-[120px] shrink-0 rounded-lg bg-neutral-100" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-500">#{f.number} · {f.host.startsWith("dev.") ? "staging " : ""}{f.path} · {f.createdBy}, {new Date(f.createdAt).toLocaleDateString()}</p>
                <p className="line-clamp-2 text-sm font-medium">{f.title}</p>
                <p className="mt-1 text-xs text-neutral-500">{f.assignee ? `→ ${f.assignee}` : "Unassigned"}{f.comments?.length ? ` · 💬 ${f.comments.length}` : ""}</p>
              </div>
              <Pill s={f.status === "open" ? "review" : f.status} label={FB_STATUS[f.status]} />
            </button>
          </li>
        ))}
      </ul>
      {opened && <FeedbackPanel key={opened._id} item={opened} onClose={() => setOpenId(null)} onSaved={reload} />}
    </Card>
  );
}

// ---- Forms (every submission from the site's forms) ------------------------------

interface Submission {
  _id: string; site?: "synergy" | "bolder"; form: "contact" | "lead" | "builder" | "webflow" | "import"; formName: string; submittedAt: string;
  name?: string; email?: string; phone?: string; budget?: string; message?: string; domain?: string;
  extra?: { _key: string; key: string; value: string }[];
  pageUrl?: string; country?: string; city?: string; referrer?: string; userAgent?: string;
  env: string; emailSent?: boolean; emailError?: string; test?: boolean;
}

const FORM_LABEL: Record<Submission["form"], string> = { contact: "Contact", lead: "Ambassador / pilot", builder: "App builder", webflow: "Webflow form", import: "Imported" };
const SITE_LABEL = { synergy: "Synergy Labs", bolder: "Bolder Apps" } as const;
const siteOf = (s: Submission) => s.site ?? "synergy";
const pathOf = (u?: string) => {
  if (!u) return "";
  try { const x = new URL(u); return x.pathname + x.search; } catch { return u; }
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function toCsv(rows: Submission[], rules: string[]): string {
  const extraKeys = [...new Set(rows.flatMap((r) => (r.extra ?? []).map((x) => x.key)))];
  const head = ["Submitted (UTC)", "Website", "Form", "Name", "Email", "Phone", "Budget", "Message", "Domain", ...extraKeys, "Page", "Country", "City", "Referrer", "Email delivered", "Test", "Test reason", "Environment", "ID"];
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    // Leading = + - @ would run as a formula in Excel/Sheets; phone numbers
    // ("+1 305 ...") are left as they are.
    const safe = /^[=+\-@]/.test(s) && !/^\+[\d\s().-]+$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = rows.map((r) => {
    const reason = testReason(r, rules);
    const extra = Object.fromEntries((r.extra ?? []).map((x) => [x.key, x.value]));
    return [r.submittedAt.replace("T", " ").slice(0, 19), SITE_LABEL[siteOf(r)], r.formName, r.name, r.email, r.phone, r.budget, r.message, r.domain, ...extraKeys.map((k) => extra[k]), r.pageUrl, r.country, r.city, r.referrer, r.emailSent === false ? "NO" : r.emailSent ? "yes" : "", reason ? "yes" : "no", reason, r.env, r._id].map(cell).join(",");
  });
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SubmissionPanel({ s, rules, onClose, act }: { s: Submission; rules: string[]; onClose: () => void; act: (action: "submission-mark" | "submission-delete", ids: string[], test?: boolean | null) => Promise<void> }) {
  const reason = testReason(s, rules);
  const rows: [string, ReactNode][] = [
    ["Website", SITE_LABEL[siteOf(s)]],
    ["Form", s.formName],
    ["Submitted", when(s.submittedAt)],
    ["Name", s.name],
    ["Email", s.email && <a className="text-secondary-green underline" href={`mailto:${s.email}`}>{s.email}</a>],
    ["Phone", s.phone && <a className="text-secondary-green underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>],
    ["Budget", s.budget],
    ["Domain", s.domain],
    ...(s.extra ?? []).map((x) => [x.key, x.value] as [string, ReactNode]),
    ["Page", s.pageUrl && <a className="break-all text-secondary-green underline" href={s.pageUrl} target="_blank" rel="noreferrer">{pathOf(s.pageUrl)}</a>],
    ["Location", [s.city, s.country].filter(Boolean).join(", ")],
    ["Came from", s.referrer],
    ["Browser", s.userAgent && browserOf(s.userAgent)],
    ["Email to team", s.emailSent === false ? <span className="text-red-700">Not delivered{s.emailError ? `: ${s.emailError}` : ""}</span> : s.emailSent ? "Delivered" : ""],
    ["Environment", s.env],
  ];
  return (
    <Modal title={s.name || s.email || "Submission"} onClose={onClose}>
      {reason && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Counted as a test: {reason}</p>}
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-neutral-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
        ))}
      </dl>
      {s.message && <div className="mt-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm">{s.message}</div>}
      <div className="mt-5 flex flex-wrap gap-2">
        {s.email && <a className="rounded-lg bg-primary-green px-3 py-1.5 text-sm font-medium text-white hover:bg-secondary-green" href={`mailto:${s.email}?subject=${encodeURIComponent("Re: your Synergy Labs enquiry")}`}>Reply</a>}
        {reason ? <Btn kind="ghost" onClick={() => act("submission-mark", [s._id], false)}>Not a test</Btn> : <Btn kind="ghost" onClick={() => act("submission-mark", [s._id], true)}>Mark as test</Btn>}
        {s.test !== undefined && <Btn kind="ghost" onClick={() => act("submission-mark", [s._id], null)}>Back to automatic</Btn>}
        <span className="flex-1" />
        <Btn kind="danger" onClick={() => confirm("Delete this submission for good?") && act("submission-delete", [s._id]).then(onClose)}>Delete</Btn>
      </div>
    </Modal>
  );
}

function RulesEditor({ rules, onClose, onSaved }: { rules: string[]; onClose: () => void; onSaved: (r: string[]) => void }) {
  const [text, setText] = useState(rules.join("\n"));
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Test-submission rules" onClose={onClose}>
      <p className="mb-3 text-sm text-neutral-600">
        One per line. A plain word flags a submission when it appears as a whole word in any field (<b>test</b> catches “Test”, “test2”, but not “testimonial”). Anything with <b>@</b> or a dot is matched inside the email or domain, e.g. <b>@bolderapps.com</b> or <b>example.com</b>. Submissions from staging always count as tests. Nothing is deleted: tests are only hidden from the default view.
      </p>
      <textarea className="h-64 w-full rounded-lg border border-neutral-300 p-2 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex justify-end gap-2">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ testRules: string[] }>("form-rules", { rules: text.split("\n") });
            onSaved(r.testRules);
            onClose();
          } catch (e: any) { alert(e.message); } finally { setBusy(false); }
        }}>Save rules</Btn>
      </div>
    </Modal>
  );
}

function FormsTab({ setToast }: { setToast: (s: string) => void }) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [site, setSite] = useState<"synergy" | "bolder" | "all">(() => { try { return (localStorage.getItem("ops.forms.site") as any) || "synergy"; } catch { return "synergy"; } });
  useEffect(() => { try { localStorage.setItem("ops.forms.site", site); } catch {} }, [site]);
  const [form, setForm] = useState("");
  const [range, setRange] = useState("90");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [show, setShow] = useState<"real" | "test" | "all">("real");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [editRules, setEditRules] = useState(false);

  const load = useCallback(() => api<{ submissions: Submission[]; testRules: string[] }>("submissions").then((d) => { setSubs(d.submissions); setRules(d.testRules); }).catch((e) => setErr(e.message)), []);
  useEffect(() => void load(), [load]);

  const act = async (action: "submission-mark" | "submission-delete", ids: string[], test?: boolean | null) => {
    try {
      await api(action, { ids, test });
      setToast(action === "submission-delete" ? `Deleted ${ids.length}` : test === true ? `Marked ${ids.length} as test` : test === false ? `Marked ${ids.length} as real` : "Back to automatic detection");
      setSelected(new Set());
      await load();
    } catch (e: any) { setToast(e.message); }
  };

  const withReason = useMemo(() => (subs ?? []).map((s) => ({ s, reason: testReason(s, rules) })), [subs, rules]);
  const inRange = useMemo(() => {
    const min = range === "custom" ? (from ? `${from}T00:00:00` : "") : range === "all" ? "" : new Date(Date.now() - Number(range) * DAY).toISOString();
    const max = range === "custom" && to ? `${to}T23:59:59.999` : "";
    return withReason.filter(({ s }) => (site === "all" || siteOf(s) === site) && (!min || s.submittedAt >= min) && (!max || s.submittedAt <= max));
  }, [withReason, range, from, to, site]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inRange.filter(({ s, reason }) =>
      (!form || s.formName === form) &&
      (show === "all" || (show === "test" ? !!reason : !reason)) &&
      (!needle || [s.name, s.email, s.phone, s.message, s.domain, s.budget, s.pageUrl, s.formName, s.country, s.city].some((v) => v?.toLowerCase().includes(needle)))
    );
  }, [inRange, form, show, q]);

  if (err) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load submissions: {err}</p>;
  if (!subs) return <p className="text-sm text-neutral-500">Loading submissions…</p>;

  const real = inRange.filter((x) => !x.reason);
  const failed = inRange.filter((x) => x.s.emailSent === false && !x.reason).length;
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(THIS_WEEK, (i - 11) * 7));
  const perWeek = (pred: (x: { reason: string }) => boolean) => weeks.map((w) => withReason.filter((x) => (site === "all" || siteOf(x.s) === site) && pred(x) && mondayOf(x.s.submittedAt) === w).length);
  const pages = Object.entries(real.reduce<Record<string, number>>((m, { s }) => { const p = pathOf(s.pageUrl).split("?")[0] || "(unknown)"; m[p] = (m[p] ?? 0) + 1; return m; }, {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const allSelected = list.length > 0 && list.every(({ s }) => selected.has(s._id));
  const opened = subs.find((s) => s._id === openId);
  const sel = "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-500">Website</span>
        <div className="flex overflow-hidden rounded-lg ring-1 ring-neutral-300">
          {(["synergy", "bolder", "all"] as const).map((v) => (
            <button key={v} onClick={() => { setSite(v); setForm(""); setSelected(new Set()); }} className={`px-3 py-1.5 text-sm ${site === v ? "bg-primary-green text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {v === "all" ? "Both" : SITE_LABEL[v]} <span className="opacity-60">{subs.filter((s) => v === "all" || siteOf(s) === v).length}</span>
            </button>
          ))}
        </div>
        {site === "bolder" && !subs.some((s) => siteOf(s) === "bolder") && <span className="text-xs text-amber-800">Waiting for the Webflow webhook / CSV import</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Real submissions", real.length, "in the selected dates"],
          ["Contact form leads", real.filter((x) => x.s.form === "contact").length, "the ones with a project brief"],
          ["Tests filtered out", inRange.length - real.length, "by your rules or marked by hand"],
          ["Emails not delivered", failed, failed ? "check these by hand: the team never got them" : "every notification went out"],
        ].map(([label, n, sub]) => (
          <div key={label as string} className={`rounded-xl border bg-white p-4 ${label === "Emails not delivered" && failed ? "border-red-300" : "border-black/[0.07]"}`}>
            <p className="text-xs font-medium text-neutral-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{n}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Submissions per week" sub="Last 12 weeks, all forms" className="lg:col-span-2">
          <StackedBars x={weeks.map(weekLabel)} series={[
            { key: "real", label: "Real", color: C.blue, values: perWeek((x) => !x.reason) },
            { key: "test", label: "Test", color: C.grey, values: perWeek((x) => !!x.reason) },
          ]} highlight={11} />
          <div className="mt-2"><Legend items={[{ label: "Real", color: C.blue }, { label: "Test", color: C.grey }]} /></div>
        </Card>
        <Card title="Top pages" sub="Where real submissions came from">
          {pages.length ? <HBars rows={pages} color={C.aqua} /> : <Empty>Nothing in these dates.</Empty>}
        </Card>
      </div>

      <Card
        title={`Submissions (${list.length.toLocaleString()})`}
        sub="Every form on the site: contact, ambassador / 1-week pilot, app builder. Stored from the moment this tab went live; older ones can be imported from a Webflow CSV."
        action={
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={() => setEditRules(true)}>Test rules ({rules.length})</Btn>
            <Btn kind="ghost" disabled={!list.length} onClick={() => download(`synergy-form-submissions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(list.map((x) => x.s), rules))}>Download CSV</Btn>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className={`${sel} min-w-[14rem] flex-1`} placeholder="Search name, email, phone, message, page…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={sel} value={form} onChange={(e) => setForm(e.target.value)}>
            <option value="">All forms</option>
            {[...new Set(inRange.map((x) => x.s.formName))].sort().map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className={sel} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option><option value="custom">Custom dates…</option>
          </select>
          {range === "custom" && (<>
            <input type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="text-sm text-neutral-400">–</span>
            <input type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </>)}
          <div className="flex overflow-hidden rounded-lg ring-1 ring-neutral-300">
            {(["real", "test", "all"] as const).map((v) => (
              <button key={v} onClick={() => setShow(v)} className={`px-3 py-1.5 text-sm ${show === v ? "bg-primary-green text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{v === "real" ? "Real" : v === "test" ? "Tests" : "All"}</button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <b>{selected.size} selected</b>
            <Btn kind="ghost" onClick={() => act("submission-mark", [...selected], true)}>Mark as test</Btn>
            <Btn kind="ghost" onClick={() => act("submission-mark", [...selected], false)}>Mark as real</Btn>
            <Btn kind="ghost" onClick={() => download(`synergy-form-submissions-selected.csv`, toCsv(subs.filter((s) => selected.has(s._id)), rules))}>Download selected</Btn>
            <span className="flex-1" />
            <Btn kind="danger" onClick={() => confirm(`Delete ${selected.size} submission(s) for good?`) && act("submission-delete", [...selected])}>Delete</Btn>
          </div>
        )}

        {!list.length ? (
          <Empty>{subs.length ? "No submissions match these filters." : "No submissions stored yet. New ones appear here as soon as someone sends a form on the live site."}</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-y border-neutral-100 bg-neutral-50/70 text-xs text-neutral-500">
                <tr>
                  <th className="w-10 py-2 pl-5 pr-2"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((x) => x.s._id)))} aria-label="Select all" /></th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Form</th>
                  <th className="py-2 pr-3 font-medium">Name / email</th>
                  <th className="py-2 pr-3 font-medium">Phone</th>
                  <th className="py-2 pr-3 font-medium">Budget</th>
                  <th className="py-2 pr-3 font-medium">Message</th>
                  <th className="py-2 pr-5 font-medium">Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {list.slice(0, 500).map(({ s, reason }) => (
                  <tr key={s._id} onClick={() => setOpenId(s._id)} className={`cursor-pointer align-top hover:bg-neutral-50 ${reason ? "text-neutral-400" : ""}`}>
                    <td className="py-2.5 pl-5 pr-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(s._id)} onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(s._id) ? n.delete(s._id) : n.add(s._id); return n; })} aria-label="Select" />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{when(s.submittedAt)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3">
                      {site === "all" && <span className="mr-1.5 rounded bg-neutral-100 px-1 text-[10px] font-semibold uppercase text-neutral-600">{siteOf(s) === "bolder" ? "Bolder" : "Synergy"}</span>}
                      {s.formName}
                      {reason && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800" title={reason}>test</span>}
                      {s.emailSent === false && <span className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-semibold uppercase text-red-700" title={s.emailError}>email failed</span>}
                    </td>
                    <td className="max-w-[14rem] py-2.5 pr-3"><p className="truncate font-medium">{s.name || s.domain || "—"}</p><p className="truncate text-xs text-neutral-500">{s.email}</p></td>
                    <td className="whitespace-nowrap py-2.5 pr-3">{s.phone}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3">{s.budget}</td>
                    <td className="max-w-[20rem] py-2.5 pr-3"><p className="line-clamp-2">{s.message}</p></td>
                    <td className="max-w-[12rem] truncate py-2.5 pr-5 text-xs text-neutral-500">{pathOf(s.pageUrl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 500 && <p className="px-5 pt-3 text-xs text-neutral-500">Showing the newest 500 of {list.length.toLocaleString()} — narrow the filters, or download the CSV for all of them.</p>}
          </div>
        )}
      </Card>
      {opened && <SubmissionPanel key={opened._id + String(opened.test)} s={opened} rules={rules} onClose={() => setOpenId(null)} act={act} />}
      {editRules && <RulesEditor rules={rules} onClose={() => setEditRules(false)} onSaved={setRules} />}
    </div>
  );
}

function Plan({ data, open }: { data: Data; open: (d: any) => void }) {
  const start = useMemo(() => {
    const first = data.tasks.reduce((m, t) => (t.startWeek < m ? t.startWeek : m), THIS_WEEK);
    return first < addDays(THIS_WEEK, -21) ? addDays(THIS_WEEK, -21) : first;
  }, [data.tasks]);
  const end = useMemo(() => {
    const yearEnd = mondayOf(`${new Date().getFullYear()}-12-31`);
    return data.tasks.reduce((m, t) => (t.endWeek > m ? t.endWeek : m), yearEnd);
  }, [data.tasks]);
  const weeks = weeksBetween(start, end);
  const groups = [...data.keyResults.map((k) => ({ id: k._id, title: k.code ? `${k.code} · ${k.title}` : k.title })), { id: "", title: "Not linked to a key result" }];
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const byStatus = (["todo", "doing", "blocked", "done"] as const).map((s) => [s, data.tasks.filter((t) => t.status === s).length] as const);
  const total = data.tasks.length || 1;
  const STATUS_BAR: Record<string, string> = { done: C.blue, doing: "#86b6ef", todo: "#e1e0d9", blocked: C.critical };

  return (
    <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Progress" sub={`${byStatus[3][1]} of ${data.tasks.length} tasks done`}>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {byStatus.filter(([, n]) => n).map(([s, n]) => <div key={s} title={`${s}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: STATUS_BAR[s] }} />)}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {byStatus.map(([s, n]) => (
            <li key={s} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR[s] }} /><span className="capitalize text-neutral-600">{s}</span><b className="ml-auto font-semibold tabular-nums">{n}</b></li>
          ))}
        </ul>
      </Card>
      <Card title="Workload" sub="Open tasks per week, by owner" className="lg:col-span-2"><WorkloadChart data={data} weeks={weeks.slice(0, 16)} /></Card>
    </div>
    <Card
      title="Plan through year-end"
      action={
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-neutral-300 px-2 py-1 text-sm" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">Everyone</option><option>Pavel</option><option>Andrew</option><option>Bot</option>
          </select>
          <Btn onClick={() => open({ _type: "opsTask", owner: "Bot", status: "todo", startWeek: THIS_WEEK, endWeek: addDays(THIS_WEEK, 7 * 3), recurring: true })}>+ Task</Btn>
        </div>
      }
    >
      <p className="mb-3 text-sm text-neutral-600">
        Each row is a task, grouped under the key result it moves. The bar covers the weeks it runs; striped bars repeat every week.
        <b> Click a task or its bar</b> to change its weeks, owner or status, or to comment.
      </p>
      <div className="mb-3 flex gap-4 text-xs text-neutral-600">
        {(Object.keys(OWNER_COLOR) as Owner[]).map((o) => <span key={o} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ background: OWNER_COLOR[o] }} />{o}</span>)}
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-neutral-300" />done</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]" style={{ display: "grid", gridTemplateColumns: `minmax(220px, 300px) repeat(${weeks.length}, minmax(56px, 1fr))` }}>
          <div className="sticky left-0 bg-white" />
          {weeks.map((w) => (
            <div key={w} className={`border-l border-neutral-100 px-1 pb-2 text-center text-[11px] ${w === THIS_WEEK ? "font-semibold text-primary-green" : "text-neutral-500"}`}>{weekLabel(w)}</div>
          ))}
          {groups.map((g) => {
            const rows = data.tasks.filter((t) => (t.keyResult ?? "") === g.id && (!ownerFilter || t.owner === ownerFilter));
            if (!rows.length) return null;
            return [
              <div key={`${g.id}-h`} className="sticky left-0 col-span-1 bg-white pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">{g.title}</div>,
              <div key={`${g.id}-hs`} style={{ gridColumn: `span ${weeks.length}` }} className="pt-4" />,
              ...rows.flatMap((t) => {
                const s = Math.max(0, weeks.indexOf(mondayOf(t.startWeek)));
                const e = weeks.indexOf(mondayOf(t.endWeek));
                // Ended before the visible weeks: a stub in the first column.
                const endIdx = e === -1 ? (mondayOf(t.endWeek) < weeks[0] ? 0 : weeks.length - 1) : e;
                return [
                  <button key={`${t._id}-l`} onClick={() => open(t)} className={`sticky left-0 truncate bg-white py-1.5 pr-3 text-left text-sm hover:underline ${t.status === "done" ? "text-neutral-400 line-through decoration-neutral-300" : ""}`} title={`${t.title}${t.dueDate ? ` · due ${t.dueDate}` : ""}${t.andrewKr ? ` · ${t.andrewKr}` : ""}`}>
                    {isLate(t) && <span className="mr-1.5 rounded bg-red-100 px-1 text-[10px] font-semibold uppercase text-red-700">late</span>}
                    {t.title}
                  </button>,
                  <div key={`${t._id}-b`} className="relative py-1" style={{ gridColumn: `span ${weeks.length}`, display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
                    {weeks.map((w) => <div key={w} className={`border-l ${w === THIS_WEEK ? "border-primary-green/40" : "border-neutral-100"}`} style={{ gridRow: 1, gridColumn: weeks.indexOf(w) + 1 }} />)}
                    <button
                      onClick={() => open(t)}
                      title={`${t.owner} · ${t.status}${t.notes ? ` · ${t.notes}` : ""}`}
                      className={`z-10 mx-0.5 h-6 truncate rounded-md px-2 text-left text-[11px] font-medium text-white transition hover:brightness-110 ${t.status === "blocked" ? "ring-2 ring-red-500 ring-offset-1" : ""} ${t.recurring ? "bg-[length:12px_12px] bg-[linear-gradient(45deg,rgba(255,255,255,.18)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.18)_50%,rgba(255,255,255,.18)_75%,transparent_75%)]" : ""}`}
                      style={{ gridRow: 1, gridColumn: `${s + 1} / ${endIdx + 2}`, backgroundColor: t.status === "done" ? C.grey : OWNER_COLOR[t.owner] }}
                    >
                      {t.owner}{t.recurring ? " · weekly" : ""}
                    </button>
                  </div>,
                ];
              }),
            ];
          })}
        </div>
      </div>
      {data.tasks.length === 0 && <Empty>No tasks yet.</Empty>}
    </Card>
    </div>
  );
}

function Content({ data, open, reload, setToast }: { data: Data; open: (d: any) => void; reload: () => void; setToast: (s: string) => void }) {
  const [suggesting, setSuggesting] = useState(false);
  const suggest = async () => {
    setSuggesting(true);
    setToast("Claude is reading the search data and planning topics (about a minute)…");
    try {
      const ideas = await api("suggest", { count: 6 });
      setToast(`${ideas.length} topic ideas added — open one to approve or reject it`);
      reload();
    } catch (e: any) {
      setToast(`Suggestions failed: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  };
  const end = mondayOf(`${new Date().getFullYear()}-12-31`);
  const first = data.content.reduce((m, c) => (c.week < m ? c.week : m), THIS_WEEK);
  const weeks = weeksBetween(first < addDays(THIS_WEEK, -14) ? addDays(THIS_WEEK, -14) : first, end);
  const counts = data.content.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
  const total = data.content.length || 1;
  return (
    <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Pipeline" sub={`${data.content.length} items · ${counts.published ?? 0} published`}>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {STAGES.filter((s) => counts[s]).map((s) => <div key={s} title={`${s}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: STAGE_COLOR[s] }} />)}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {[...STAGES, "rejected"].map((s) => (
            <li key={s} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STAGE_COLOR[s] ?? "#e1e0d9" }} /><span className="capitalize text-neutral-600">{s}</span><b className="ml-auto font-semibold tabular-nums">{counts[s] ?? 0}</b></li>
          ))}
        </ul>
      </Card>
      <Card title="Content per week" sub="By stage; current week highlighted" className="lg:col-span-2"><PipelineChart data={data} weeks={weeks.slice(0, 16)} /></Card>
    </div>
    <Card
      title="Content calendar"
      action={
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={suggest} disabled={suggesting || !data.sources.claude}>{suggesting ? "Thinking…" : "✨ Suggest topics"}</Btn>
          <Btn onClick={() => open({ _type: "opsContent", kind: "new", status: "planned", week: THIS_WEEK })}>+ Content</Btn>
        </div>
      }
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {weeks.map((w) => {
          const items = data.content.filter((c) => mondayOf(c.week) === w);
          return (
            <div key={w} className={`w-60 shrink-0 rounded-xl p-2 ${w === THIS_WEEK ? "bg-[#eef7f8] ring-1 ring-[#007244]/25" : "bg-neutral-50"}`}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className={`text-xs font-semibold ${w === THIS_WEEK ? "text-primary-green" : "text-neutral-500"}`}>Week of {weekLabel(w)}</p>
                <button className="text-lg leading-none text-neutral-400 hover:text-neutral-700" onClick={() => open({ _type: "opsContent", kind: "new", status: "planned", week: w })} aria-label="Add">+</button>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <button key={c._id} onClick={() => open(c)} className="block w-full rounded-lg bg-white p-2.5 text-left shadow-sm ring-1 ring-black/5 hover:ring-primary-green">
                    <div className="mb-1 flex items-center justify-between gap-1"><span className="text-[10px] uppercase tracking-wide text-neutral-500">{KIND_LABEL[c.kind]}</span><Pill s={c.status} /></div>
                    <p className="text-sm font-medium leading-snug">{c.title}</p>
                    {c.keyword && <p className="mt-1 truncate text-xs text-neutral-500">🔑 {c.keyword}</p>}
                    {!!c.comments?.length && <p className="mt-1 text-xs text-neutral-500">💬 {c.comments.length}</p>}
                  </button>
                ))}
                {!items.length && <p className="px-1 py-3 text-xs text-neutral-400">—</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Ideas (from “Suggest topics” or the Monday bot) need a person to approve them. Then the bot drafts “New post” and “Refresh” items automatically on weekdays once their week starts (or click one → “Write draft with AI”). Drafts are private until someone approves them; approved posts publish at their scheduled time.
      </p>
    </Card>
    </div>
  );
}

/** One editable cell of the Weekly tab (saved when it loses focus). */
function WeeklyInput({ row, field, reload, wide }: { row: ScoreRow; field: "abWinners" | "notes"; reload: () => void; wide?: boolean }) {
  const initial = row[field] === undefined ? "" : String(row[field]);
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  useEffect(() => setV(initial), [initial]);
  const save = async () => {
    if (v === initial) return;
    setState("saving");
    try {
      await api("weekly-save", { week: row.week, abWinners: field === "abWinners" ? v : row.abWinners ?? "", notes: field === "notes" ? v : row.notes ?? "" });
      setState("saved");
      reload();
    } catch {
      setState("error");
    }
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(field === "abWinners" ? e.target.value.replace(/[^\d]/g, "") : e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      inputMode={field === "abWinners" ? "numeric" : undefined}
      className={`w-full rounded border bg-transparent px-1.5 py-1 text-sm ${state === "error" ? "border-red-400" : state === "saved" ? "border-emerald-300" : "border-transparent hover:border-neutral-200 focus:border-neutral-300"} ${wide ? "min-w-[14rem]" : "text-right"}`}
      placeholder={field === "notes" ? "Add a note…" : "–"}
    />
  );
}

/** Pavel's Q4 OKR "Weekly" sheet: one row per week, filled from the data where it exists. */
function WeeklyTab({ data, reload }: { data: Data; reload: () => void }) {
  const rows = data.scorecard.rows;
  const pct = (v?: number) => (v === undefined ? "–" : `${(v * 100).toFixed(1)}%`);
  const num = (v?: number) => (v === undefined ? "–" : v.toLocaleString());
  const past = rows.filter((r) => r.week <= THIS_WEEK);
  const total = (k: "mqlsBolder" | "mqlsSynergy" | "abWinners") => past.reduce((a, r) => a + (r[k] ?? 0), 0);
  const csv = () => {
    const head = ["Week of", "Organic search clicks (Search Console)", "  synergylabs.co", "  bolderapps.com", "New users (GA4)", "CTA clicks", "Form start rate, bolderapps.com", "Form MQLs, Bolder", "Form MQLs, Synergy", "A/B tests finished with a winner", "Notes"];
    const cell = (x: unknown) => { const t = x === undefined || x === null ? "" : String(x); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const body = rows.map((r) => [weekLabel(r.week), r.gscClicks, r.gscClicksSynergy, r.gscClicksBolder, r.newUsers, r.ctaClicks, r.formStartRateBolder === undefined ? "" : `${(r.formStartRateBolder * 100).toFixed(2)}%`, r.week <= THIS_WEEK ? r.mqlsBolder : "", r.week <= THIS_WEEK ? r.mqlsSynergy : "", r.abWinners, r.notes].map(cell).join(","));
    download(`q4-2026-weekly-${TODAY}.csv`, "\uFEFF" + [head.map(cell).join(","), ...body].join("\r\n"));
  };
  const missing = [
    !data.scorecard.rows.some((r) => r.gscClicks !== undefined) && "Search Console",
    !data.scorecard.rows.some((r) => r.newUsers !== undefined) && "GA4",
    !data.scorecard.rows.some((r) => r.ctaClicks !== undefined) && "CTA clicks (GA4 event name, GA4_CTA_EVENT)",
  ].filter(Boolean);
  const th = "px-2 py-2 text-right font-medium align-bottom";
  return (
    <Card
      title="Q4 2026 weekly"
      sub="Monday–Sunday weeks, same columns as the OKR sheet. Grey numbers fill in automatically; A/B tests and notes are typed here."
      action={<Btn kind="ghost" onClick={csv}>Download CSV</Btn>}
    >
      {missing.length > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Waiting for: {missing.join(" · ")}. Those columns stay empty until access is granted (see KPIs → Google access).</p>}
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-y border-neutral-100 bg-neutral-50/70 text-xs text-neutral-500">
            <tr>
              <th className="py-2 pl-5 pr-2 text-left font-medium align-bottom">Week of</th>
              <th className={th}>Organic search clicks<br /><span className="font-normal">Search Console, both</span></th>
              <th className={th}>New users<br /><span className="font-normal">GA4, both</span></th>
              <th className={th}>CTA clicks</th>
              <th className={th}>Form start rate<br /><span className="font-normal">bolderapps.com</span></th>
              <th className={th}>Form MQLs<br /><span className="font-normal">Bolder</span></th>
              <th className={th}>Form MQLs<br /><span className="font-normal">Synergy</span></th>
              <th className={th}>A/B tests<br /><span className="font-normal">with a winner</span></th>
              <th className="py-2 pl-2 pr-5 text-left font-medium align-bottom">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => {
              const future = r.week > THIS_WEEK;
              return (
                <tr key={r.week} className={r.week === THIS_WEEK ? "bg-emerald-50/40" : future ? "text-neutral-300" : ""}>
                  <td className="whitespace-nowrap py-1.5 pl-5 pr-2 font-medium">{weekLabel(r.week)}{r.week === THIS_WEEK && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary-green">now</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" title={r.gscClicks !== undefined ? `synergylabs.co ${num(r.gscClicksSynergy)} · bolderapps.com ${num(r.gscClicksBolder)}` : undefined}>{num(r.gscClicks)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.newUsers)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.ctaClicks)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.formStartRateBolder)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{future ? "" : r.mqlsBolder}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums" title={r.week < "2026-10-12" ? "Synergy was still on Webflow: not in the Forms tab" : undefined}>{future ? "" : r.week < "2026-10-12" ? "–" : r.mqlsSynergy}</td>
                  <td className="w-24 px-1 py-1"><WeeklyInput row={r} field="abWinners" reload={reload} /></td>
                  <td className="py-1 pl-1 pr-5"><WeeklyInput row={r} field="notes" reload={reload} wide /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-neutral-200 text-sm font-semibold">
            <tr>
              <td className="py-2 pl-5 pr-2">Q4 so far</td>
              <td colSpan={4} />
              <td className="px-2 py-2 text-right tabular-nums">{total("mqlsBolder")}</td>
              <td className="px-2 py-2 text-right tabular-nums">{total("mqlsSynergy")}</td>
              <td className="px-2 py-2 text-right tabular-nums">{total("abWinners")}</td>
              <td className="py-2 pl-2 pr-5 text-xs font-normal text-neutral-500">Form MQLs = real submissions (tests excluded; Synergy counted from the Oct 12 launch)</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** The Bolder Apps website: its form leads (live now) and GA4 / Search Console once access is granted. */
function BolderTab({ data, setToast }: { data: Data; setToast: (s: string) => void }) {
  const [b, setB] = useState<{ kpis: Kpi[]; sources: Record<string, boolean>; metrics: Record<string, MetricDef> } | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [rules, setRules] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api("bolder").then(setB).catch((e) => setErr(e.message));
    api<{ submissions: Submission[]; testRules: string[] }>("submissions").then((d) => { setSubs(d.submissions.filter((s) => s.site === "bolder")); setRules(d.testRules); }).catch(() => {});
  }, []);
  useEffect(() => void load(), [load]);

  const sync = async (weeks = 1) => {
    setToast(weeks > 1 ? `Syncing ${weeks} weeks of Bolder Apps — the rest fill in over a minute…` : "Syncing Bolder Apps…");
    try {
      const snap = await api("sync", { weeks, site: "bolder" });
      const errs = Object.keys(snap.errors ?? {});
      setToast(errs.length ? `Synced; not connected or failed: ${errs.map((k) => `${k} (${snap.errors[k]})`).join("; ")}` : "Bolder Apps synced");
    } catch (e: any) {
      setToast(`Sync failed: ${e.message}`);
    }
    load();
  };

  if (err) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load: {err}</p>;
  if (!b) return <p className="text-sm text-neutral-500">Loading…</p>;

  const weeks = Array.from({ length: 12 }, (_, i) => addDays(THIS_WEEK, (i - 11) * 7));
  const marked = subs.map((s) => ({ s, test: !!testReason(s, rules) }));
  const per = (test: boolean) => weeks.map((w) => marked.filter((x) => x.test === test && mondayOf(x.s.submittedAt) === w).length);
  const real = per(false);
  const thisWeek = real[11], lastWeek = real[10];
  const last4 = real.slice(7, 11).reduce((a, n) => a + n, 0);
  const prev4 = real.slice(3, 7).reduce((a, n) => a + n, 0);
  const pages = Object.entries(marked.filter((x) => !x.test && x.s.submittedAt >= `${weeks[0]}`).reduce<Record<string, number>>((m, { s }) => { const p = (s.pageUrl ?? "").replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "(unknown)"; m[p] = (m[p] ?? 0) + 1; return m; }, {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const tile = (label: string, n: number, sub: string) => (
    <div className="rounded-xl border border-black/[0.07] bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{n}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        www.bolderapps.com. Form leads arrive live from Webflow; Google Analytics and Search Console fill in once the service account has access (see <b>Google access</b> below).
      </p>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tile("Form leads this week", thisWeek, `${lastWeek} last week`)}
        {tile("Form leads, last 4 weeks", last4, `${prev4} in the 4 weeks before`)}
        {tile("All-time real leads", marked.filter((x) => !x.test).length, `since ${subs.length ? new Date(subs[subs.length - 1].submittedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}`)}
        {tile("Tests filtered out", marked.filter((x) => x.test).length, "test words, webflow.io staging")}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Form leads per week" sub="Webflow forms on bolderapps.com, last 12 weeks" className="lg:col-span-2">
          <StackedBars x={weeks.map(weekLabel)} series={[{ key: "real", label: "Real", color: C.blue, values: real }, { key: "test", label: "Test", color: C.grey, values: per(true) }]} highlight={11} />
          <div className="mt-2"><Legend items={[{ label: "Real", color: C.blue }, { label: "Test", color: C.grey }]} /></div>
        </Card>
        <Card title="Pages that convert" sub="Real form leads, last 12 weeks">
          {pages.length ? <HBars rows={pages} color={C.aqua} /> : <Empty>No leads in this period.</Empty>}
        </Card>
      </div>
      <Kpis data={{ ...data, kpis: b.kpis, sources: b.sources, metrics: b.metrics }} sync={sync} open={() => {}} site="bolder" />
    </div>
  );
}

/** Which GA4 properties and Search Console sites the Ops service account can read. */
function GoogleAccess({ site = "synergy" }: { site?: "synergy" | "bolder" }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { setRes(await api("google-access")); } catch (e: any) { setRes({ error: e.message }); } finally { setBusy(false); }
  };
  return (
    <Card
      title="Google access"
      sub="Which GA4 properties and Search Console sites this dashboard is allowed to read."
      action={<Btn kind="ghost" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check Google access"}</Btn>}
    >
      {!res ? (
        <p className="text-sm text-neutral-500">To connect a website, give the service account read access to its GA4 property (Viewer) and Search Console property (Restricted user), then check here.</p>
      ) : res.error ? (
        <p className="text-sm text-red-700">Could not sign in to Google: {res.error}</p>
      ) : (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <p className="md:col-span-2 text-neutral-600">Service account: <code className="rounded bg-neutral-100 px-1">{res.serviceAccount}</code> · this tab reads GA4 <b>{res.configured[site]?.ga4Property ?? "not set"}</b>, Search Console <b>{res.configured[site]?.gscSite}</b></p>
          <div>
            <p className="mb-1 font-medium">GA4 properties</p>
            {res.ga4.error ? <p className="text-red-700">{res.ga4.error}</p> : !res.ga4.properties.length ? <p className="text-amber-800">None yet: nobody has added the service account to a GA4 property.</p> : (
              <ul className="space-y-1">{res.ga4.properties.map((p: any) => <li key={p.id}><code className="rounded bg-neutral-100 px-1">{p.id}</code> {p.name} <span className="text-neutral-500">({p.account})</span></li>)}</ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-medium">Search Console sites</p>
            {res.gsc.error ? <p className="text-red-700">{res.gsc.error}</p> : !res.gsc.sites.length ? <p className="text-amber-800">None yet: nobody has added the service account in Search Console.</p> : (
              <ul className="space-y-1">{res.gsc.sites.map((s: any) => <li key={s.url}><code className="rounded bg-neutral-100 px-1">{s.url}</code> <span className="text-neutral-500">{s.permission}</span></li>)}</ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Kpis({ data, sync, open, site = "synergy" }: { data: Data; sync: (weeks?: number) => void; open: (d: any) => void; site?: "synergy" | "bolder" }) {
  const synergy = site === "synergy";
  const snaps = data.kpis.slice(0, 8);
  const keys = Object.keys(data.metrics).filter((k) => snaps.some((s) => s.metrics?.[k] !== undefined));
  const latest = snaps[0];
  const lists: [string, string, string][] = [
    ["gsc.opportunities", "Search opportunities (position 7–20)", "impressions · avg. position"],
    ["ga4.topOrganicPages", "Top organic landing pages", "organic users"],
    ["gsc.gainers", "Pages gaining clicks", "clicks · change vs prior week"],
    ["gsc.losers", "Pages losing clicks", "clicks · change vs prior week"],
  ];
  const trend = [...data.kpis].slice(0, 26).reverse();
  const xs = trend.map((k) => weekLabel(k.weekStart));
  const m = (key: string) => trend.map((k) => k.metrics?.[key]);
  const hasAny = (...keys: string[]) => keys.some((key) => m(key).some((v) => v !== undefined));
  const chart = (title: string, sub: string, keys: [string, string, string][], source: string, opts: { zero?: boolean; invert?: boolean; format?: (v: number) => string } = {}) => (
    <Card title={title} sub={sub}>
      {!hasAny(...keys.map((k) => k[0])) ? (
        <Waiting what={source} />
      ) : (
        <>
          {keys.length > 1 && <Legend items={keys.map(([, label, color]) => ({ label, color }))} />}
          <LineChart x={xs} series={keys.map(([key, label, color]) => ({ key, label, color, values: m(key) }))} height={190} {...opts} />
        </>
      )}
    </Card>
  );
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {latest ? <>Weekly snapshots, Monday–Sunday. Last sync {new Date(latest.syncedAt).toLocaleString()}.</> : synergy ? "No data yet. Connect GA4 / Search Console / HubSpot (see Data sources on the Overview), then “Sync now”." : "No Google data yet. Once the service account can read Bolder’s GA4 and Search Console (see Google access), click “Backfill 12 weeks”."}
        </p>
        <div className="flex gap-2"><Btn kind="ghost" onClick={() => sync(12)}>Backfill 12 weeks</Btn><Btn onClick={() => sync(1)}>Sync now</Btn></div>
      </div>
      <GoogleAccess site={site} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {synergy ? (
          <>
            <Stat label="New leads" metric="hubspot.newContacts" source="hubspot" data={data} />
            <Stat label="Leads from organic" metric="hubspot.newContactsOrganic" source="hubspot" data={data} />
          </>
        ) : (
          <>
            <Stat label="All users" metric="ga4.users" source="ga4" data={data} />
            <Stat label="Search impressions" metric="gsc.impressions" source="gsc" data={data} />
          </>
        )}
        <Stat label="Organic users" metric="ga4.organicUsers" source="ga4" data={data} />
        <Stat label="Search clicks" metric="gsc.clicks" source="gsc" data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {synergy && chart("Leads", "New HubSpot contacts per week", [["hubspot.newContacts", "All leads", C.blue], ["hubspot.newContactsOrganic", "From organic search", C.orange]], "HubSpot access")}
        {synergy && chart("Lead quality", "Contacts that became MQL / SQL that week", [["hubspot.mql", "MQLs", C.blue], ["hubspot.sql", "SQLs", C.orange]], "HubSpot access")}
        {chart("Website users", "GA4, per week", [["ga4.users", "All users", C.blue], ["ga4.organicUsers", "Organic users", C.orange]], "Google Analytics access")}
        {chart("Sessions", "GA4, per week", [["ga4.sessions", "All sessions", C.blue], ["ga4.organicSessions", "Organic sessions", C.orange]], "Google Analytics access")}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {chart("Search clicks", "Google Search Console", [["gsc.clicks", "Clicks", C.blue]], "Search Console access")}
        {chart("Impressions", "Google Search Console", [["gsc.impressions", "Impressions", C.blue]], "Search Console access")}
        {chart("Click-through rate", "Clicks ÷ impressions", [["gsc.ctr", "CTR", C.blue]], "Search Console access", { zero: false, format: pct })}
        {chart("Avg. position", "Lower is better (axis flipped)", [["gsc.position", "Position", C.blue]], "Search Console access", { zero: false, invert: true, format: (v) => v.toFixed(1) })}
      </div>

      {latest && (
        <div className="grid gap-4 md:grid-cols-2">
          {lists.map(([key, title, unit]) => (
            <Card key={key} title={title} sub={`Week of ${weekLabel(latest.weekStart)} · ${unit}`}>
              {!latest.lists?.[key]?.length ? <Empty>No data.</Empty> : (
                <HBars
                  rows={latest.lists[key].slice(0, 10)}
                  color={key === "gsc.losers" ? C.orange : C.blue}
                  format={compact}
                  note={(r) => r.change !== undefined && <span className="w-12 text-right text-neutral-500">{key === "gsc.opportunities" ? `#${r.change}` : `${r.change > 0 ? "+" : ""}${r.change}`}</span>}
                  action={(r) =>
                    !synergy ? null : key === "gsc.opportunities" ? (
                      <button className="rounded px-1.5 text-xs text-primary-green ring-1 ring-primary-green/30 hover:bg-emerald-50" onClick={() => open({ _type: "opsContent", kind: "new", status: "planned", week: addDays(THIS_WEEK, 7), title: r.label, keyword: r.label })}>+ plan</button>
                    ) : key === "gsc.losers" && r.label.startsWith("/blog/") ? (
                      <button className="rounded px-1.5 text-xs text-primary-green ring-1 ring-primary-green/30 hover:bg-emerald-50" onClick={() => open({ _type: "opsContent", kind: "refresh", status: "planned", week: addDays(THIS_WEEK, 7), title: `Refresh ${r.label}`, targetPath: r.label })}>+ refresh</button>
                    ) : null
                  }
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <Card title="All numbers" sub="Last 8 weeks, with change vs the week before">
        {!snaps.length ? (
          <Empty>No data yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  {snaps.map((s) => <th key={s.weekStart} className="px-2 py-2 text-right font-medium">{weekLabel(s.weekStart)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {keys.map((k) => {
                  const def = data.metrics[k];
                  return (
                    <tr key={k}>
                      <td className="py-2 pr-4">{def.label}</td>
                      {snaps.map((s, i) => {
                        const v = s.metrics?.[k];
                        const prev = snaps[i + 1]?.metrics?.[k];
                        const ch = v !== undefined && prev ? (v - prev) / prev : undefined;
                        const good = ch !== undefined && (def.better === "down" ? ch < 0 : ch > 0);
                        return (
                          <td key={s.weekStart} className="px-2 py-2 text-right tabular-nums">
                            {fmt(v, def)}
                            {ch !== undefined && Math.abs(ch) >= 0.005 && <span className={`ml-1 text-[10px] ${good ? "text-emerald-700" : "text-red-700"}`}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch * 100).toFixed(0)}%</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Runs per day over the last 14 days, split into succeeded / failed. */
function ActivityChart({ runs }: { runs: BotRun[] }) {
  const days = Array.from({ length: 14 }, (_, i) => iso(new Date(Date.now() - (13 - i) * DAY)));
  const count = (ok: boolean) => days.map((d) => runs.filter((r) => r.ok === ok && r.startedAt.slice(0, 10) === d).length);
  const series: Series[] = [
    { key: "ok", label: "✓ Succeeded", color: C.blue, values: count(true) },
    { key: "fail", label: "✕ Failed", color: C.critical, values: count(false) },
  ];
  return (
    <>
      <Legend items={series} />
      <StackedBars x={days.map((d) => toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }))} series={series} height={160} highlight={13} format={(v) => String(Math.round(v))} />
      <p className="mt-1 text-[11px] text-neutral-400">The log keeps the latest 60 entries, so older days may be incomplete.</p>
    </>
  );
}

function RunList({ runs }: { runs: BotRun[] }) {
  if (!runs.length) return <Empty>No activity yet.</Empty>;
  return (
    <ul className="divide-y divide-neutral-100 text-sm">
      {runs.map((r) => (
        <li key={r._id} className="flex items-start gap-3 py-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-emerald-500" : "bg-red-500"}`} />
          <div className="min-w-0 flex-1">
            <p>{r.summary}</p>
            {r.details && <p className="truncate text-xs text-neutral-500" title={r.details}>{r.details}</p>}
          </div>
          <div className="shrink-0 text-right text-xs text-neutral-500">
            <p>{r.job}{r.by ? ` · ${r.by}` : ""}</p>
            <p>{new Date(r.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ""}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- App -----------------------------------------------------------------------------------

const TABS = ["Overview", "Plan", "Weekly", "Content", "Forms", "Feedback", "KPIs", "Bolder Apps", "Health", "Bots"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Overview: "◎", Plan: "▤", Weekly: "▦", Content: "✎", Forms: "✉", "Bolder Apps": "◆", Feedback: "◍", KPIs: "↗", Health: "♥", Bots: "⚙" };
const TAB_SUB: Record<Tab, string> = {
  Overview: "Leads first: every task ties to a key result.",
  Plan: "Who does what, week by week, through year-end.",
  Weekly: "The Q4 OKR sheet’s weekly numbers, filled in automatically.",
  Content: "Topics, AI drafts, review and scheduled publishing.",
  Forms: "Every form submission on the site: filter, search, download.",
  Feedback: "Pins left on the live and staging site.",
  KPIs: "GA4, Search Console and HubSpot, synced every Monday.",
  "Bolder Apps": "bolderapps.com: form leads, Google Analytics and Search Console.",
  Health: "Daily checks against the live site.",
  Bots: "Everything the automations did, and what it cost.",
};

export default function OpsApp({ user }: { user: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    return (TABS as readonly string[]).includes(h) ? (h as Tab) : "Overview";
  });
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(() => api<Data>("data").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => void load(), [load]);
  useEffect(() => void history.replaceState(null, "", `#${tab}`), [tab]);
  useEffect(() => {
    const onHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if ((TABS as readonly string[]).includes(h)) setTab(h as Tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const sync = async (weeks = 1) => {
    setToast(weeks > 1 ? `Syncing ${weeks} weeks — the newest shows now, the rest fill in over a minute…` : "Syncing KPIs…");
    try {
      const snap = await api("sync", { weeks });
      const errs = Object.keys(snap.errors ?? {});
      setToast(errs.length ? `Synced; not connected or failed: ${errs.join(", ")}` : "KPIs synced");
    } catch (e: any) {
      setToast(`Sync failed: ${e.message}`);
    }
    load();
  };

  const current = editing && data ? (editing._type === "opsContent" && editing._id ? data.content.find((c) => c._id === editing._id) ?? editing : editing) : null;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 z-30 bg-primary-green text-white lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Synergy Labs</p>
            <p className="font-display text-2xl leading-tight">Ops</p>
          </div>
          <div className="flex items-center gap-3 text-sm lg:hidden">
            <span className="text-white/70">{user}</span>
            <button className="text-white/60 hover:text-white" onClick={() => api("logout", {}).then(() => location.reload())}>Sign out</button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
          {TABS.map((t) => {
            const badge =
              t === "Feedback" ? data?.feedback.filter((f) => f.status !== "done").length
              : t === "Health" ? data?.health?.checks.filter((c) => !c.ok).length
              : t === "Content" ? data?.content.filter((c) => c.status === "review").length
              : 0;
            return (
              <button key={t} onClick={() => setTab(t)} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${tab === t ? "bg-white/[0.12] text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}`}>
                <span className="hidden w-4 text-center text-white/60 lg:inline" aria-hidden>{TAB_ICON[t]}</span>
                {t}
                {!!badge && <span className={`ml-auto rounded-full px-1.5 text-[10px] font-semibold ${t === "Health" ? "bg-red-500" : "bg-orange-500"} text-white`}>{badge}</span>}
              </button>
            );
          })}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-sm lg:block">
          <p className="text-white/80">{user}</p>
          <button className="text-xs text-white/50 hover:text-white" onClick={() => api("logout", {}).then(() => location.reload())}>Sign out</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-16 sm:px-6 lg:ml-56 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-5 pt-6">
        <div>
          <h1 className="text-3xl">{tab}</h1>
          <p className="mt-1 text-sm text-neutral-500">{TAB_SUB[tab]}</p>
        </div>
      </header>

      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load: {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && (
        <>
          {tab === "Overview" && <Overview data={data} open={setEditing} sync={() => sync(1)} />}
          {tab === "Plan" && <Plan data={data} open={setEditing} />}
          {tab === "Weekly" && <WeeklyTab data={data} reload={load} />}
          {tab === "Content" && <Content data={data} open={setEditing} reload={load} setToast={setToast} />}
          {tab === "Forms" && <FormsTab setToast={setToast} />}
          {tab === "Feedback" && <FeedbackTab data={data} reload={load} />}
          {tab === "Health" && <HealthTab data={data} reload={load} setToast={setToast} />}
          {tab === "KPIs" && <Kpis data={data} sync={sync} open={setEditing} />}
          {tab === "Bolder Apps" && <BolderTab data={data} setToast={setToast} />}
          {tab === "Bots" && (
            <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Runs per day" sub="Last 14 days" className="lg:col-span-2"><ActivityChart runs={data.runs} /></Card>
              <Card title="By job" sub="Entries in the log">
                <HBars
                  rows={Object.entries(data.runs.reduce<Record<string, number>>((m, r) => ((m[r.job] = (m[r.job] ?? 0) + 1), m), {}))
                    .map(([label, value]) => ({ label, value }))
                    .sort((a, b) => b.value - a.value)}
                  color={C.blue}
                />
                {!data.runs.length && <Empty>No activity yet.</Empty>}
              </Card>
            </div>
            <Card title="Bot activity">
              <p className="mb-3 text-sm text-neutral-600">
                A log of everything the automations did (KPI syncs, health checks, drafts, publishing, digests) and key actions by people, so you can see the bots are running and what they cost.
                <br />
                Schedules (UTC): Mondays 06:00 KPI sync, 06:30 topic ideas, 08:00 digest email · daily 07:00 health checks · weekdays 09:00 &amp; 13:00 drafting · hourly publishing. Claude spend in this list:{" "}
                <b>${data.runs.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(2)}</b>
              </p>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3 text-sm">
                <span className="flex-1">Weekly digest → {data.digestTo || <span className="text-amber-800">no recipients (set OPS_DIGEST_TO)</span>}</span>
                <a className="rounded-lg px-3 py-1.5 font-medium text-neutral-700 ring-1 ring-neutral-300 hover:bg-white" href="/api/ops/digest" target="_blank" rel="noreferrer">Preview</a>
                <Btn
                  disabled={!data.sources.email}
                  onClick={async () => {
                    if (!confirm(`Send the digest to ${data.digestTo} now?`)) return;
                    try {
                      const r = await api("digest", {});
                      setToast(`Sent: ${r.subject}`);
                    } catch (e: any) {
                      setToast(`Send failed: ${e.message}`);
                    }
                  }}
                >
                  Send now
                </Btn>
              </div>
              <RunList runs={data.runs} />
            </Card>
            </div>
          )}
          {current && current._type === "opsContent" && current._id ? (
            <ContentPanel key={current._id + current.status} item={current} data={data} onClose={() => setEditing(null)} onSaved={load} />
          ) : current ? (
            <Editor doc={current} data={data} onClose={() => setEditing(null)} onSaved={load} />
          ) : null}
        </>
      )}
      </main>
      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <style>{`
        .prose-ops h2 { font-size: 1.5rem; margin: 1.75rem 0 .75rem; }
        .prose-ops h3 { font-size: 1.2rem; margin: 1.25rem 0 .5rem; }
        .prose-ops p { margin: .6rem 0; line-height: 1.65; }
        .prose-ops ul { list-style: disc; padding-left: 1.4rem; margin: .6rem 0; }
        .prose-ops ol { list-style: decimal; padding-left: 1.4rem; margin: .6rem 0; }
        .prose-ops li { margin: .25rem 0; }
        .prose-ops a { color: #007244; text-decoration: underline; }
        .prose-ops table { border-collapse: collapse; margin: 1rem 0; font-size: .9rem; width: 100%; }
        .prose-ops th, .prose-ops td { border: 1px solid #e5e5e5; padding: .4rem .6rem; text-align: left; vertical-align: top; }
        .prose-ops th { background: #fafafa; }
      `}</style>
    </div>
  );
}
