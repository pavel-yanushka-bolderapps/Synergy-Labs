// Email from the Ops dashboard, via Resend (the same account the contact form
// uses):
//
//   - the Monday digest: key results, KPI changes, what needs approval, the
//     week's tasks, overdue items, site health, and what the bots did;
//   - an alert when a health check starts failing.
//
// Recipients: OPS_DIGEST_TO (comma-separated). Sender: OPS_FROM_EMAIL, else
// CONTACT_FROM_EMAIL -- it must be on a domain verified in Resend.
import { Resend } from "resend";
import { loadAll, mondayOf, opsClient, type KeyResult, type KpiSnapshot } from "./store";
import { METRICS } from "./kpi";
import { SITE, type Check, type Health } from "./health";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";

export function emailStatus() {
  return {
    configured: Boolean(env("RESEND_API_KEY") && env("OPS_DIGEST_TO") && (env("OPS_FROM_EMAIL") || env("CONTACT_FROM_EMAIL"))),
    to: env("OPS_DIGEST_TO"),
  };
}

async function send(subject: string, html: string) {
  const to = env("OPS_DIGEST_TO").split(",").map((s) => s.trim()).filter(Boolean);
  if (!env("RESEND_API_KEY") || !to.length) throw new Error("Email not configured: set RESEND_API_KEY and OPS_DIGEST_TO");
  const from = env("OPS_FROM_EMAIL") || env("CONTACT_FROM_EMAIL");
  if (!from) throw new Error("Email not configured: set OPS_FROM_EMAIL (or CONTACT_FROM_EMAIL)");
  const { error } = await new Resend(env("RESEND_API_KEY")).emails.send({ from, to, subject, html });
  if (error) throw new Error(`Resend: ${error.message}`);
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (v: number | undefined, fmt?: string) =>
  v === undefined ? "–" : fmt === "pct" ? `${(v * 100).toFixed(1)}%` : fmt === "dec" ? v.toFixed(1) : Math.round(v).toLocaleString("en-US");
const dateLabel = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const H2 = (t: string) => `<h2 style="font:600 13px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin:28px 0 8px">${t}</h2>`;
const list = (items: string[], empty: string) =>
  items.length ? `<ul style="margin:0;padding-left:18px">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join("")}</ul>` : `<p style="color:#6b7280;margin:0">${empty}</p>`;
const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f6f7f6">
<div style="max-width:640px;margin:0 auto;padding:24px;font:15px/1.5 Arial,sans-serif;color:#1b1b1b">
<p style="margin:0;color:#007244;font-weight:600;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Website Ops</p>
<h1 style="font:500 26px/1.25 Georgia,serif;margin:4px 0 0">${title}</h1>
${body}
<p style="margin-top:32px"><a href="${SITE()}/ops" style="background:#0a332c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open Website Ops</a></p>
</div></body></html>`;

function krLine(kr: KeyResult, kpis: KpiSnapshot[]) {
  const snap = kr.metric ? kpis.find((k) => k.metrics?.[kr.metric!] !== undefined) : undefined;
  const value = snap ? snap.metrics[kr.metric!] : kr.current;
  const prev = snap && kpis[kpis.indexOf(snap) + 1]?.metrics?.[kr.metric!];
  const change = value !== undefined && prev ? ` <span style="color:${value >= prev ? "#047857" : "#b91c1c"}">${value >= prev ? "▲" : "▼"}${Math.abs(((value - prev) / prev) * 100).toFixed(0)}% WoW</span>` : "";
  return `<b>${esc(kr.title)}</b>: ${num(value)}${kr.target !== undefined ? ` / ${num(kr.target)}` : ""}${change}`;
}

/** Builds the weekly digest. Returned rather than sent so the UI can preview it. */
export async function buildDigest() {
  const data = await loadAll();
  const health = await opsClient().getDocument<Health>("ops.health.latest");
  const thisWeek = mondayOf(new Date());
  const weekAgo = Date.now() - 7 * 86_400_000;

  const [latest, previous] = data.kpis;
  const kpiRows = latest
    ? Object.entries(METRICS)
        .filter(([k]) => latest.metrics[k] !== undefined)
        .map(([k, def]) => {
          const v = latest.metrics[k];
          const p = previous?.metrics?.[k];
          const ch = p ? (v - p) / p : undefined;
          const good = ch !== undefined && (def.better === "down" ? ch < 0 : ch > 0);
          return `<tr><td style="padding:4px 12px 4px 0">${def.label}</td><td style="padding:4px 0;text-align:right">${num(v, def.format)}</td><td style="padding:4px 0 4px 10px;text-align:right;color:${good ? "#047857" : "#b91c1c"}">${ch !== undefined && Math.abs(ch) >= 0.005 ? `${ch > 0 ? "▲" : "▼"}${Math.abs(ch * 100).toFixed(0)}%` : ""}</td></tr>`;
        })
    : [];

  const review = data.content.filter((c) => c.status === "review");
  const ideas = data.content.filter((c) => c.status === "idea");
  const scheduled = data.content.filter((c) => c.status === "approved");
  const published = data.content.filter((c) => c.publishedAt && Date.parse(c.publishedAt) > weekAgo);
  const open = data.tasks.filter((t) => t.startWeek <= thisWeek && t.endWeek >= thisWeek && t.status !== "done" && t.owner !== "Bot");
  const overdue = data.tasks.filter((t) => t.endWeek < thisWeek && t.status !== "done" && !t.recurring);
  const failing = (health?.checks ?? []).filter((c) => !c.ok);
  const runs = data.runs.filter((r) => Date.parse(r.startedAt) > weekAgo);
  const failedRuns = runs.filter((r) => !r.ok);
  const spend = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);

  const body = [
    H2("Key results"),
    list(data.keyResults.map((kr) => krLine(kr, data.kpis)), "No key results yet."),
    H2(latest ? `KPIs · week of ${dateLabel(latest.weekStart)}` : "KPIs"),
    kpiRows.length ? `<table style="border-collapse:collapse;font-size:14px">${kpiRows.join("")}</table>` : `<p style="color:#6b7280;margin:0">No KPI data yet — connect GA4 / Search Console / HubSpot.</p>`,
    H2(`Needs your approval (${review.length})`),
    list(review.map((c) => esc(c.title)), "Nothing waiting."),
    ideas.length ? H2(`New topic ideas (${ideas.length})`) + list(ideas.slice(0, 8).map((c) => `${esc(c.title)}${c.keyword ? ` <span style="color:#6b7280">— ${esc(c.keyword)}</span>` : ""}`), "") : "",
    H2("Published last week / scheduled"),
    list(
      [
        ...published.map((c) => `✅ <a href="${SITE()}/blog/${esc(c.slug)}">${esc(c.title)}</a>`),
        ...scheduled.map((c) => `🗓 ${esc(c.title)} — ${c.publishAt ? new Date(c.publishAt).toUTCString().slice(0, 22) : ""}`),
      ],
      "Nothing published or scheduled."
    ),
    H2(`This week · ${dateLabel(thisWeek)}`),
    list(open.map((t) => `<b>${t.owner}</b>: ${esc(t.title)}${t.status === "blocked" ? ' <span style="color:#b91c1c">(blocked)</span>' : ""}`), "No open tasks."),
    overdue.length ? H2(`Overdue (${overdue.length})`) + list(overdue.map((t) => `<b>${t.owner}</b>: ${esc(t.title)} <span style="color:#6b7280">(due ${dateLabel(t.endWeek)})</span>`), "") : "",
    H2("Site health"),
    health ? list(failing.map((c) => `❌ ${esc(c.group)} · ${esc(c.name)}: ${esc(c.detail)}`), `✅ All ${health.checks.length} checks pass.`) : `<p style="color:#6b7280;margin:0">Not checked yet.</p>`,
    H2("Bots last 7 days"),
    `<p style="margin:0">${runs.length} runs${failedRuns.length ? `, <span style="color:#b91c1c">${failedRuns.length} failed</span>` : ""} · Claude spend $${spend.toFixed(2)}</p>`,
    failedRuns.length ? list(failedRuns.slice(0, 5).map((r) => `${esc(r.summary)}`), "") : "",
  ].join("\n");

  const subject = `Website Ops · week of ${dateLabel(thisWeek)}${review.length ? ` · ${review.length} to approve` : ""}${failing.length ? ` · ${failing.length} health issue${failing.length > 1 ? "s" : ""}` : ""}`;
  return { subject, html: wrap(`Weekly digest · ${dateLabel(thisWeek)}`, body) };
}

export async function sendDigest() {
  const { subject, html } = await buildDigest();
  await send(subject, html);
  return subject;
}

export async function sendHealthAlert(broken: Check[]) {
  if (!broken.length || !emailStatus().configured) return false;
  const body = H2("Started failing") + list(broken.map((c) => `<b>${esc(c.group)} · ${esc(c.name)}</b>: ${esc(c.detail)}`), "");
  await send(`⚠️ Synergy site: ${broken.length} health check${broken.length > 1 ? "s" : ""} failing`, wrap("Site health alert", body));
  return true;
}
