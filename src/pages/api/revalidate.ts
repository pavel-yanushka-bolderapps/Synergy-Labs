// The Sanity webhook's target: Studio publish -> here -> Vercel re-renders
// the pages that document appears on, so the change is live in seconds
// without a rebuild. See src/lib/revalidate.ts for which pages those are.
//
// Setup, once per environment (production and staging):
//   - Vercel env: ISR_BYPASS_TOKEN (random, 32+ characters; the same value
//     the build hands the ISR config) and SANITY_WEBHOOK_SECRET.
//   - Sanity webhook (sanity.io/manage -> API -> Webhooks):
//       URL         https://<host>/api/revalidate
//       Dataset     production
//       Trigger on  Create, Update, Delete
//       Filter      _type in ["blogPost", "blogAuthor", "service", "location",
//                     "locationService", "locationIndustry",
//                     "locationTechnology", "project", "clutchLanding"]
//       Projection  {"type": _type,
//                    "slugs": [before().slug.current, after().slug.current],
//                    "hrefs": [before().href, after().href]}
//       Secret      the SANITY_WEBHOOK_SECRET value
import type { APIRoute } from "astro";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { waitUntil } from "@vercel/functions";
import { pathsFor, revalidate, type PublishEvent } from "../../lib/revalidate";

export const prerender = false;

// Pages read Sanity through its CDN (src/lib/loadQuery.ts), which can still
// serve the previous version for a moment after a publish. So: reply to Sanity
// at once (it retries a slow webhook, which would redo the lot), re-render
// after a short wait, and once more later in case the CDN was still behind the
// first time. Both run in the background, well inside the function time limit.
const FIRST_PASS_MS = 10_000;
const SECOND_PASS_MS = 75_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function revalidateTwice(origin: string, paths: string[], token: string) {
  await sleep(FIRST_PASS_MS);
  await revalidate(origin, paths, token);
  await sleep(SECOND_PASS_MS - FIRST_PASS_MS);
  const results = await revalidate(origin, paths, token);
  const failed = results.filter((r) => r.status === "error" || r.status >= 500);
  if (failed.length) console.error("[revalidate] Failed:", failed);
}

export const POST: APIRoute = async ({ request, url }) => {
  const token = process.env.ISR_BYPASS_TOKEN;
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!token || !secret) {
    console.error("[revalidate] ISR_BYPASS_TOKEN or SANITY_WEBHOOK_SECRET is not set.");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER_NAME) ?? "";
  if (!(await isValidSignature(body, signature, secret))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PublishEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }

  const paths = await pathsFor(event);

  waitUntil(revalidateTwice(url.origin, paths, token));
  return Response.json({ type: event.type, queued: paths.length }, { status: 202 });
};
