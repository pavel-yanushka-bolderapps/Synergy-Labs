// Scheduled jobs, called by Vercel Cron (schedules in vercel.json). Vercel
// sends `Authorization: Bearer $CRON_SECRET`; set CRON_SECRET in the Vercel
// project (Production) or every call is refused.
//
//   kpi-sync   Mondays: last two weeks of GA4 / Search Console / HubSpot
//              (two, because Search Console's last days fill in late)
//   publish    hourly: publishes approved posts whose time has come
//   draft      twice on weekdays: drafts the next planned calendar item that is
//              due (one per call, to stay inside the function time limit)
import type { APIRoute } from "astro";
import { json } from "../../../lib/ops/auth";
import { logRun } from "../../../lib/ops/store";
import { completedWeeks, syncWeek } from "../../../lib/ops/kpi";
import { draftDue, publishDue } from "../../../lib/ops/content";

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
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logRun({ job: String(params.job), startedAt, ok: false, by: "Bot", summary: `${params.job} failed`, details: msg });
    return json({ error: msg }, 500);
  }
  return json({ error: "Unknown job" }, 404);
};
