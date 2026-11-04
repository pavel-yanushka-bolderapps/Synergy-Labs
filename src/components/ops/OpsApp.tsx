// The Ops dashboard UI (mounted by src/pages/ops/index.astro). One screen per
// tab -- Overview, Plan, Content, KPIs, Bots -- all reading the single
// /api/ops/data payload and writing through /api/ops/<action>.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

// ---- Types (mirrors src/lib/ops/store.ts; that file imports node modules) ----

type Owner = "Pavel" | "Andrew" | "Bot";
interface Comment { _key: string; by: string; at: string; text: string }
interface Check { _key: string; name: string; group: string; ok: boolean; detail: string }
interface Health { checkedAt: string; checks: Check[] }
interface KeyResult { _id: string; _type: "opsKeyResult"; title: string; objective: string; metric?: string; baseline?: number; target?: number; current?: number; unit?: string; dueDate?: string; owner?: Owner; order?: number; comments?: Comment[] }
interface Task { _id: string; _type: "opsTask"; title: string; owner: Owner; keyResult?: string; status: "todo" | "doing" | "done" | "blocked"; startWeek: string; endWeek: string; recurring?: boolean; notes?: string; comments?: Comment[] }
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
  digestTo: string;
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

const OWNER_COLOR: Record<Owner, string> = {
  Pavel: "bg-sky-600",
  Andrew: "bg-violet-600",
  Bot: "bg-emerald-600",
};
const STATUS_STYLE: Record<string, string> = {
  idea: "bg-neutral-100 text-neutral-600",
  planned: "bg-sky-50 text-sky-800",
  drafting: "bg-amber-50 text-amber-800",
  review: "bg-orange-100 text-orange-900",
  approved: "bg-emerald-50 text-emerald-800",
  published: "bg-emerald-600 text-white",
  rejected: "bg-red-50 text-red-800",
  todo: "bg-neutral-100 text-neutral-700",
  doing: "bg-sky-100 text-sky-900",
  done: "bg-emerald-100 text-emerald-900",
  blocked: "bg-red-100 text-red-900",
};
const KIND_LABEL = { new: "New post", refresh: "Refresh", location: "Location page", backlink: "Backlink" };

/** A key result's live value: its metric from the newest snapshot that has it, else the manual value. */
function krValue(kr: KeyResult, kpis: Kpi[]): { value?: number; from?: string } {
  if (kr.metric) {
    const snap = kpis.find((k) => k.metrics?.[kr.metric!] !== undefined);
    if (snap) return { value: snap.metrics[kr.metric], from: snap.weekStart };
  }
  return { value: kr.current };
}

// ---- Small UI pieces --------------------------------------------------------------

const Pill = ({ s }: { s: string }) => <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[s] ?? "bg-neutral-100"}`}>{s}</span>;
const Card = ({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
    {(title || action) && (
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
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
    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
      kind === "primary" ? "bg-primary-green text-white hover:bg-secondary-green" : kind === "danger" ? "text-red-700 hover:bg-red-50" : "text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
    }`}
  >
    {children}
  </button>
);
const Empty = ({ children }: { children: ReactNode }) => <p className="py-4 text-sm text-neutral-500">{children}</p>;

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

function Form({ fields, value, onChange }: { fields: FieldDef[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  const cls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.k} className={`block text-sm ${f.type === "textarea" || f.k === "title" ? "sm:col-span-2" : ""}`}>
          <span className="mb-1 block text-neutral-600">{f.label}</span>
          {f.type === "textarea" ? (
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
              type={f.type === "number" ? "number" : f.type === "date" || f.type === "week" ? "date" : f.type === "datetime" ? "datetime-local" : "text"}
              value={f.type === "datetime" && value[f.k] ? toLocalInput(value[f.k]) : value[f.k] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set(f.k, f.type === "number" ? (v === "" ? "" : Number(v)) : f.type === "week" && v ? mondayOf(v) : f.type === "datetime" && v ? new Date(v).toISOString() : v);
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
          { k: "recurring", label: "Repeats every week", type: "checkbox" },
          { k: "notes", label: "Notes", type: "textarea" },
        ]
      : doc._type === "opsKeyResult"
        ? [
            { k: "title", label: "Key result" },
            { k: "objective", label: "Objective" },
            { k: "owner", label: "Owner", type: "select", options: ownerOptions },
            { k: "metric", label: "Tracked automatically by", type: "select", options: [["", "— manual value —"], ...Object.entries(data.metrics).map(([k, m]) => [k, m.label] as [string, string])] },
            { k: "baseline", label: "Baseline", type: "number" },
            { k: "target", label: "Target", type: "number" },
            { k: "current", label: "Current (manual)", type: "number" },
            { k: "dueDate", label: "Due", type: "date" },
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

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Key results" className="lg:col-span-3" action={<Btn kind="ghost" onClick={() => open({ _type: "opsKeyResult", objective: data.keyResults[0]?.objective ?? "", owner: "Pavel" })}>+ Key result</Btn>}>
        {data.keyResults.length === 0 && <Empty>No key results yet.</Empty>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.keyResults.map((kr) => {
            const { value, from } = krValue(kr, data.kpis);
            const base = kr.baseline ?? 0;
            const pct = kr.target !== undefined && value !== undefined && kr.target !== base ? Math.max(0, Math.min(1, (value - base) / (kr.target - base))) : undefined;
            const linked = data.tasks.filter((t) => t.keyResult === kr._id);
            return (
              <button key={kr._id} onClick={() => open(kr)} className="rounded-xl p-4 text-left ring-1 ring-neutral-200 hover:ring-primary-green">
                <p className="text-xs text-neutral-500">{kr.objective}</p>
                <p className="mt-1 font-medium">{kr.title}</p>
                <p className="mt-3 text-2xl font-semibold">
                  {fmt(value)} <span className="text-sm font-normal text-neutral-500">/ {fmt(kr.target)}</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-secondary-green" style={{ width: `${(pct ?? 0) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {kr.metric ? (from ? `Auto · week of ${weekLabel(from)}` : "Auto · waiting for first sync") : "Manual value"}
                  {" · "}{linked.length} task{linked.length === 1 ? "" : "s"}
                  {kr.dueDate && ` · due ${weekLabel(kr.dueDate)}`}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={`This week · ${weekLabel(THIS_WEEK)}`} className="lg:col-span-2" action={<Btn kind="ghost" onClick={() => open({ _type: "opsTask", owner: "Pavel", status: "todo", startWeek: THIS_WEEK, endWeek: THIS_WEEK })}>+ Task</Btn>}>
        {week.length === 0 && <Empty>Nothing open this week.</Empty>}
        {(["Pavel", "Andrew", "Bot"] as Owner[]).map((o) => {
          const mine = week.filter((t) => t.owner === o);
          if (!mine.length) return null;
          return (
            <div key={o} className="mb-3">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-neutral-500"><span className={`h-2 w-2 rounded-full ${OWNER_COLOR[o]}`} />{o}</p>
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
      </Card>

      <div className="space-y-5">
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
          <ul className="space-y-1 text-sm">
            {[["ga4", "Google Analytics 4"], ["gsc", "Search Console"], ["hubspot", "HubSpot"], ["claude", "Claude (AI drafts)"], ["email", "Email digest"]].map(([k, l]) => (
              <li key={k} className="flex justify-between"><span>{l}</span><span className={data.sources[k] && !latest?.errors?.[k] ? "text-emerald-700" : "text-amber-700"}>{data.sources[k] ? (latest?.errors?.[k] ? "error" : "connected") : "not connected"}</span></li>
            ))}
          </ul>
          {missing.length > 0 && <details className="mt-2 text-xs text-neutral-500"><summary>Details</summary>{missing.map(([k, e]) => <p key={k}>{k}: {e}</p>)}</details>}
          {latest && <p className="mt-2 text-xs text-neutral-500">Last sync {new Date(latest.syncedAt).toLocaleString()}</p>}
        </Card>
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
  const groups = [...data.keyResults.map((k) => ({ id: k._id, title: k.title })), { id: "", title: "Not linked to a key result" }];
  const [ownerFilter, setOwnerFilter] = useState<string>("");

  return (
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
      <div className="mb-3 flex gap-4 text-xs text-neutral-600">
        {(Object.keys(OWNER_COLOR) as Owner[]).map((o) => <span key={o} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded ${OWNER_COLOR[o]}`} />{o}</span>)}
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
                const endIdx = e === -1 ? weeks.length - 1 : e;
                return [
                  <button key={`${t._id}-l`} onClick={() => open(t)} className="sticky left-0 truncate bg-white py-1.5 pr-3 text-left text-sm hover:underline" title={t.title}>
                    {t.title}
                  </button>,
                  <div key={`${t._id}-b`} className="relative py-1" style={{ gridColumn: `span ${weeks.length}`, display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
                    {weeks.map((w) => <div key={w} className={`border-l ${w === THIS_WEEK ? "border-primary-green/40" : "border-neutral-100"}`} style={{ gridRow: 1, gridColumn: weeks.indexOf(w) + 1 }} />)}
                    <button
                      onClick={() => open(t)}
                      title={`${t.owner} · ${t.status}${t.notes ? ` · ${t.notes}` : ""}`}
                      className={`z-10 mx-0.5 h-6 truncate rounded-md px-2 text-left text-[11px] font-medium text-white ${t.status === "done" ? "bg-neutral-300" : OWNER_COLOR[t.owner]} ${t.status === "blocked" ? "ring-2 ring-red-500" : ""} ${t.recurring ? "bg-[length:12px_12px] bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%)]" : ""}`}
                      style={{ gridRow: 1, gridColumn: `${s + 1} / ${endIdx + 2}` }}
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
  return (
    <Card
      title="Content calendar"
      action={
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={suggest} disabled={suggesting || !data.sources.claude}>{suggesting ? "Thinking…" : "✨ Suggest topics"}</Btn>
          <Btn onClick={() => open({ _type: "opsContent", kind: "new", status: "planned", week: THIS_WEEK })}>+ Content</Btn>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2 text-xs">{Object.entries(counts).map(([s, n]) => <span key={s} className="flex items-center gap-1"><Pill s={s} />{n}</span>)}</div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {weeks.map((w) => {
          const items = data.content.filter((c) => mondayOf(c.week) === w);
          return (
            <div key={w} className={`w-60 shrink-0 rounded-xl p-2 ${w === THIS_WEEK ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-neutral-50"}`}>
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
  );
}

function Kpis({ data, sync, open }: { data: Data; sync: (weeks?: number) => void; open: (d: any) => void }) {
  const snaps = data.kpis.slice(0, 8);
  const keys = Object.keys(data.metrics).filter((k) => snaps.some((s) => s.metrics?.[k] !== undefined));
  const latest = snaps[0];
  const lists: [string, string, string][] = [
    ["gsc.opportunities", "Search opportunities (pos. 7–20)", "impr. · pos"],
    ["gsc.gainers", "Pages gaining clicks", "clicks · Δ"],
    ["gsc.losers", "Pages losing clicks", "clicks · Δ"],
    ["ga4.topOrganicPages", "Top organic landing pages", "users"],
  ];
  return (
    <div className="space-y-5">
      <Card
        title="Weekly KPIs"
        action={<div className="flex gap-2"><Btn kind="ghost" onClick={() => sync(12)}>Backfill 12 weeks</Btn><Btn onClick={() => sync(1)}>Sync now</Btn></div>}
      >
        {!snaps.length ? (
          <Empty>No data yet. Connect GA4 / Search Console / HubSpot (see Data sources on the Overview), then “Sync now”.</Empty>
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
      {latest && (
        <div className="grid gap-5 md:grid-cols-2">
          {lists.map(([key, title, unit]) => (
            <Card key={key} title={`${title} · ${weekLabel(latest.weekStart)}`}>
              {!latest.lists?.[key]?.length ? <Empty>No data.</Empty> : (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {latest.lists[key].map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate" title={r.label}>{r.label}</span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums text-neutral-600">
                        {r.value.toLocaleString()}{r.change !== undefined && ` · ${r.change > 0 && key !== "gsc.opportunities" ? "+" : ""}${r.change}`}
                        {key === "gsc.opportunities" && (
                          <button className="rounded px-1.5 text-xs text-primary-green ring-1 ring-primary-green/30 hover:bg-emerald-50" onClick={() => open({ _type: "opsContent", kind: "new", status: "planned", week: addDays(THIS_WEEK, 7), title: r.label, keyword: r.label })}>+ plan</button>
                        )}
                        {key === "gsc.losers" && r.label.startsWith("/blog/") && (
                          <button className="rounded px-1.5 text-xs text-primary-green ring-1 ring-primary-green/30 hover:bg-emerald-50" onClick={() => open({ _type: "opsContent", kind: "refresh", status: "planned", week: addDays(THIS_WEEK, 7), title: `Refresh ${r.label}`, targetPath: r.label })}>+ refresh</button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-neutral-400">{unit}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
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

const TABS = ["Overview", "Plan", "Content", "KPIs", "Health", "Bots"] as const;
type Tab = (typeof TABS)[number];

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
    <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl">Synergy Ops</h1>
          <span className="hidden text-sm text-neutral-500 sm:inline">leads first: every task ties to a key result</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">{user}</span>
          <button className="text-neutral-500 hover:text-neutral-800" onClick={() => api("logout", {}).then(() => location.reload())}>Sign out</button>
        </div>
      </header>
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-primary-green text-primary-green" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
            {t}
            {t === "Health" && data?.health?.checks.some((c) => !c.ok) && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{data.health.checks.filter((c) => !c.ok).length}</span>}
            {t === "Content" && data && data.content.some((c) => c.status === "review") && <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 text-[10px] text-white">{data.content.filter((c) => c.status === "review").length}</span>}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load: {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && (
        <>
          {tab === "Overview" && <Overview data={data} open={setEditing} sync={() => sync(1)} />}
          {tab === "Plan" && <Plan data={data} open={setEditing} />}
          {tab === "Content" && <Content data={data} open={setEditing} reload={load} setToast={setToast} />}
          {tab === "Health" && <HealthTab data={data} reload={load} setToast={setToast} />}
          {tab === "KPIs" && <Kpis data={data} sync={sync} open={setEditing} />}
          {tab === "Bots" && (
            <Card title="Bot activity">
              <p className="mb-3 text-sm text-neutral-600">
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
          )}
          {current && current._type === "opsContent" && current._id ? (
            <ContentPanel key={current._id + current.status} item={current} data={data} onClose={() => setEditing(null)} onSaved={load} />
          ) : current ? (
            <Editor doc={current} data={data} onClose={() => setEditing(null)} onSaved={load} />
          ) : null}
        </>
      )}
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
