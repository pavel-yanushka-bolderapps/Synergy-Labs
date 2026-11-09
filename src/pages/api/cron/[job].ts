// Scheduled jobs, called by Vercel Cron (schedules in vercel.json). Vercel
// sends `Authorization: Bearer $CRON_SECRET`; set CRON_SECRET in the Vercel
// project (Production) or every call is refused.
//
//   kpi-sync   Mondays: last two weeks of GA4 / Search Console / HubSpot
//              (two, because Search Console's last days fill in late)
//   publish    hourly: publishes approved posts whose time has come
//   draft      twice on weekdays: drafts the next planned calendar item that is
//              due (one per call, to stay inside the function time limit)
//   health     daily: site health checks; emails when a check starts failing
//   ideas      Mondays: tops the calendar up with topic ideas from Search
//              Console when fewer than 6 ideas/planned items are coming up
//   digest     Mondays: the weekly email to OPS_DIGEST_TO
import type { APIRoute } from "astro";
import { json } from "../../../lib/ops/auth";
import { logRun } from "../../../lib/ops/store";
import { completedWeeks, syncWeek } from "../../../lib/ops/kpi";
import { draftDue, publishDue, suggestTopics } from "../../../lib/ops/content";
import { runAndSaveHealth } from "../../../lib/ops/health";
import { emailStatus, sendDigest, sendHealthAlert } from "../../../lib/ops/digest";
import { loadAll, mondayOf, addDays } from "../../../lib/ops/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const startedAt = new Date().toISOString();
  try {
    switch (params.job) {
      case "kpi-sync": {
        const snaps: Awaited<ReturnType<typeof syncWeek>>[] = [];
        for (const week of completedWeeks(2)) snaps.push(await syncWeek(week));
        const failed = Object.keys(snaps[0].errors ?? {});
        await logRun({
          job: "kpi-sync",
          startedAt,
          ok: failed.length < 3,
          by: "Bot",
          summary: `Weekly KPI sync` + (failed.length ? `; not synced: ${failed.join(", ")}` : ""),
          details: failed.map((k) => `${k}: ${snaps[0].errors![k]}`).join("\n") || undefined,
        });
        // Bolder Apps: same weeks, logged on its own line.
        const bolder: Awaited<ReturnType<typeof syncWeek>>[] = [];
        for (const week of completedWeeks(2)) bolder.push(await syncWeek(week, "bolder"));
        const bFailed = Object.keys(bolder[0].errors ?? {});
        await logRun({
          job: "kpi-sync",
          startedAt,
          ok: bFailed.length < 2,
          by: "Bot",
          summary: `Bolder Apps KPI sync` + (bFailed.length ? `; not synced: ${bFailed.join(", ")}` : ""),
          details: bFailed.map((k) => `${k}: ${bolder[0].errors![k]}`).join("\n") || undefined,
        });
        return json({ ok: true, weeks: snaps.map((s) => s.weekStart) });
      }
      case "publish": {
        const results = await publishDue(url.origin);
        return json({ ok: true, results });
      }
      case "draft": {
        const results = await draftDue();
        return json({ ok: true, results });
      }
      case "health": {
        const { failing, newlyBroken } = await runAndSaveHealth("Bot");
        const alerted = await sendHealthAlert(newlyBroken).catch((e) => (console.error("[ops] alert", e), false));
        return json({ ok: true, failing: failing.length, alerted });
      }
      case "ideas": {
        if (!process.env.ANTHROPIC_API_KEY) return json({ ok: true, skipped: "ANTHROPIC_API_KEY not set" });
        const { content } = await loadAll();
        const horizon = addDays(mondayOf(new Date()), 21);
        const upcoming = content.filter((c) => (c.status === "idea" || c.status === "planned") && c.week <= horizon && (c.kind === "new" || c.kind === "refresh"));
        if (upcoming.length >= 6) return json({ ok: true, skipped: `${upcoming.length} items already planned` });
        const created = await suggestTopics(6 - upcoming.length, "Bot");
        return json({ ok: true, created: created.length });
      }
      case "digest": {
        if (!emailStatus().configured) return json({ ok: true, skipped: "email not configured" });
        const subject = await sendDigest();
        await logRun({ job: "digest", startedAt, ok: true, by: "Bot", summary: `Sent weekly digest to ${emailStatus().to}`, details: subject });
        return json({ ok: true, subject });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logRun({ job: String(params.job), startedAt, ok: false, by: "Bot", summary: `${params.job} failed`, details: msg });
    return json({ error: msg }, 500);
  }
  return json({ error: "Unknown job" }, 404);
};
