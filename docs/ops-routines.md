# Website Ops: routines for Andrew's Claude

Ready-to-paste prompts for scheduled Claude routines that read from and write to
the Website Ops dashboard through the agent API (`docs/ops-agent-api.md`).
Each routine needs the agent token in its environment as `OPS_TOKEN`.

Every write shows up in the dashboard's activity feed (Bots tab) under the
token's name, e.g. "Andrew's Claude wrote the Synergy Labs weekly pulse".

---

## 1. KPI tracker (every Friday)

```
You fill in the weekly KPI tracker for our two websites, synergylabs.co and
bolderapps.com, from the Website Ops dashboard.

API: https://www.synergylabs.co/api/ops/agent/ , header
"Authorization: Bearer $OPS_TOKEN". Guide: docs/ops-agent-api.md.

1. GET scorecard. It returns one row per Q4 week (Monday-Sunday). Use the
   last complete week (the row before the current one) and the week before it.
2. Add a row for that week to the KPI tracker sheet, Bolder and Synergy in
   separate columns:
   - Organic search clicks: gscClicksBolder / gscClicksSynergy
   - New users (GA4): newUsersBolder / newUsersSynergy
   - CTA clicks: ctaClicksBolder / ctaClicksSynergy
   - Form start rate: formStartRateBolder / formStartRateSynergy
   - Form submissions (real, tests excluded): mqlsBolder / mqlsSynergy
   - MQLs (HubSpot): mqlHubspotBolder / mqlHubspotSynergy
   - SQLs (HubSpot): sqlHubspotBolder / sqlHubspotSynergy
   - Blogs posted: blogsBolder / blogsSynergy
   A missing value means the source is not connected yet: leave the cell
   empty, do not write 0.
3. For each website, compare with the week before and write ONE line on what
   moved and whether it is worth looking into, e.g. "Organic clicks down 12%
   WoW (440 -> 387); /blog/ai-* lost position, check". If nothing moved more
   than ~10%, say so. For the "check X" part, GET kpis?site=<site>&weeks=2 and
   look at lists["gsc.losers"], lists["gsc.gainers"] and
   lists["ga4.topOrganicPages"].
4. POST pulse {"week": "<that Monday>", "site": "synergy", "text": "..."} and
   the same with "site": "bolder".
5. Reply with the two pulse lines and anything that failed.
```

## 2. Blog tracker and refresh queue (every Monday, after 07:00 UTC)

```
You keep the blog tracker in the Website Ops dashboard up to date and flag
posts worth refreshing. API and auth as in docs/ops-agent-api.md
(https://www.synergylabs.co/api/ops/agent/, Bearer $OPS_TOKEN).

A. Sources. GET blogs. For every post with no "source", decide where it came
   from and POST blog-source with {"posts":[{"url":..., "source":...}]}:
   adaptify (Adaptify auto-posts), redrover (Red Rover), vineyard (Vineyard),
   team (written by our team). If you cannot tell, leave it untagged and list
   it in your reply.

B. Refresh queue. GET refresh-due?days=7 (posts 11+ months old, most viewed
   first; queued=true means a brief already exists, skip those). Pick the ones
   worth refreshing: real traffic or a keyword we still want, outdated facts,
   years or prices. For each, POST file with
   name "blog-refresh-wk<ISO week>-<slug>.md" and content:

     ---
     url: <the post's url>
     title: Refresh: <post title>
     ---
     ## Why now
     ## What to update
     - specific outdated claims, stats, screenshots, years
     ## Add
     - sections, FAQs, internal links worth adding
     ## Keep
     - what ranks / converts and must not change

   One file per post. Pavel's Claude picks them up and publishes them.

C. Reply with how many posts you tagged and which briefs you dropped.
```

## 3. One-off: Synergy form submissions before Oct 6, 2026

The dashboard has Synergy's form submissions from Oct 6, 2026 and Bolder's
from Apr 20, 2026. The rest of 2026 for Synergy is in HubSpot.

```
Import synergylabs.co form submissions from HubSpot into the Website Ops
dashboard for Jan 1 - Oct 5, 2026.

1. In HubSpot, export the form submissions of the synergylabs.co website
   forms (contact / quote, ambassador, 1-week pilot, app builder) in that
   date range.
2. POST https://www.synergylabs.co/api/ops/agent/submissions (Bearer
   $OPS_TOKEN), up to 2000 items per call:
   {"site": "synergy", "source": "hubspot", "items": [{"id": "hs-<submission
   id>", "submittedAt": "<ISO time, UTC>", "formName": "<form name>",
   "name": "...", "email": "...", "phone": "...", "message": "...",
   "pageUrl": "<page it was sent from>", "extra": {"Budget": "..."}}]}
   Re-running is safe: ids already imported are skipped.
3. Reply with how many were imported and skipped.
```
