# Website Ops: agent API

For Claude routines (or any script) that read from and write to the Website Ops
dashboard (`https://www.synergylabs.co/ops`). Every write shows up in the
dashboard's activity feed under the agent's name, e.g. *"Andrew's Claude dropped
blog-refresh-wk45.md"*.

## Auth

Every request sends the agent's token:

```
Authorization: Bearer <token>
Content-Type: application/json        (on POSTs)
```

Base URL: `https://www.synergylabs.co/api/ops/agent/`

Check the token works:

```bash
curl -s -H "Authorization: Bearer $OPS_TOKEN" https://www.synergylabs.co/api/ops/agent/me
# {"agent":"Andrew's Claude"}
```

Errors come back as `{"error": "..."}` with a 4xx/5xx status.

## Read

| GET | What you get |
|---|---|
| `me` | `{ agent }` |
| `scorecard` | One row per Q4 week: organic clicks (both sites), new users, CTA clicks, form start rate, form submissions by brand, HubSpot MQLs/SQLs (+ by brand), **blogs posted by brand**, A/B winners, pulse, notes. Use it to fill the KPI tracker sheet. |
| `kpis?site=synergy\|bolder&weeks=8` | Raw weekly GA4 / Search Console / HubSpot snapshots, newest first, incl. top pages, gainers/losers, striking-distance queries. |
| `blogs?site=&traffic=1` | Every post on both sites: `site, title, url, publishedAt, source, views, refreshDue` (+ the full weekly `traffic` array with `traffic=1`). |
| `refresh-due?days=7` | Posts published (or last refreshed) 11+ months ago, or reaching it within `days`. Most viewed first; `queued: true` if a brief is already open. |
| `files?kind=blog-refresh&status=new` | Dropped files (no content). Status: `new`, `in-progress`, `done`, `skipped`. |
| `file?id=ops.inbox.…` | One file with its Markdown content. |

## Write

### Drop a Markdown file: `POST file`

```json
{ "name": "blog-refresh-wk45.md", "content": "---\nurl: https://www.bolderapps.com/blog-posts/some-post\ntitle: Refresh: Some post\n---\n\n## What to update\n- ..." }
```

- `kind` is taken from the name (`blog-refresh-*` = a refresh brief, `*pulse*` = KPI pulse, otherwise `note`) or can be passed explicitly.
- A refresh brief names its post with `url:` (or `path:` + `site:`) in front matter, or with `url` in the body. It then appears in **Blogs → Refresh queue**.
- **One brief per post.** For a weekly batch, drop several files (`blog-refresh-wk45-<slug>.md`) so each can be picked up and marked done on its own.
- The same `name` dropped again replaces the file and sets it back to `new`.

### Pick up / finish a file: `POST file-status`

```json
{ "id": "ops.inbox.blog-refresh-wk45-some-post", "status": "done", "publishedUrl": "https://…", "note": "Updated stats + FAQ" }
```

Marking a `blog-refresh` file `done` resets that post's 11-month clock.

### Tag blog sources: `POST blog-source`

```json
{ "posts": [
  { "url": "https://www.synergylabs.co/blog/phone-lock-app", "source": "adaptify" },
  { "site": "bolder", "slug": "application-front-end", "source": "team" }
] }
```

Sources: `adaptify`, `redrover`, `vineyard`, `team` (team-sourced / original). `null` clears it. Up to 1000 posts per call. Posts not yet in the tracker are listed in `skipped`; the post list refreshes every Monday 06:15 UTC (or "Sync now" on the Blogs tab).

### Weekly pulse: `POST pulse`

```json
{ "week": "2026-11-02", "site": "synergy", "text": "Organic clicks down 12% WoW. Check the /blog/ai-* pages that lost position." }
```

`week` is any date in the week (stored under its Monday); omitted = this week. `site` is `"synergy"` (default) or `"bolder"`: each website has its own pulse, shown in that website's **Weekly** tab. Send one per site.

### Backfill form submissions: `POST submissions`

For history the site doesn't have (e.g. from HubSpot). One site per call, up to 2000 items.

```json
{ "site": "bolder", "source": "hubspot", "items": [
  { "id": "hs-12345", "submittedAt": "2026-02-03T15:04:00Z", "formName": "Contact", "name": "…", "email": "…", "phone": "…", "message": "…", "pageUrl": "https://www.bolderapps.com/contact", "extra": { "Budget": "$50k+" } }
] }
```

- `id` is the source system's id. Re-running is safe: an id already imported is skipped.
- A submission is also skipped if we already have the same email on the same site within 10 minutes (the site's own record or the Gmail/Webflow imports).
- Test detection runs on these like any other submission.

What already exists (so only fill the gaps): **Synergy** Oct 6 → now; **Bolder** Apr 20 → now.

## Weekly routines this enables

1. **KPI tracker** (Fridays): `GET scorecard`, fill the sheet, then `POST pulse` once per website (`site: "synergy"` and `site: "bolder"`) with one line on what moved.
2. **Blog tracker** (weekly): `GET blogs`, tag any untagged posts with `POST blog-source`.
3. **Refresh queue** (weekly): `GET refresh-due`, pick the ones worth refreshing, and `POST file` one `blog-refresh-*.md` brief each.
4. **Publishing** (Pavel's Claude): `GET files?kind=blog-refresh&status=new`, then `file-status` → `in-progress`, refresh the post, then `file-status` → `done`.

## Admin

Tokens live in the Vercel env var `OPS_AGENT_TOKENS` (Production), comma-separated `Name=token` pairs, each token at least 32 characters:

```
OPS_AGENT_TOKENS=Andrew's Claude=<openssl rand -hex 24>,Pavel's Claude=<openssl rand -hex 24>
```

Remove a pair to revoke that agent. Redeploy after changing it.
