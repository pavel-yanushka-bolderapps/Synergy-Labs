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

// A publish that touches every post (an author edit) is a few hundred
// re-renders -- longer than Sanity waits for a webhook to answer, which would
// make it retry and do the whole lot again. Past this many, reply at once and
// finish in the background.
const ANSWER_FIRST_ABOVE = 40;

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

  if (paths.length > ANSWER_FIRST_ABOVE) {
    waitUntil(revalidate(url.origin, paths, token));
    return Response.json({ type: event.type, queued: paths.length }, { status: 202 });
  }

  const results = await revalidate(url.origin, paths, token);
  const failed = results.filter((r) => r.status === "error" || r.status >= 500);
  if (failed.length) console.error("[revalidate] Failed:", failed);

  return Response.json({ type: event.type, results }, { status: failed.length ? 502 : 200 });
};
