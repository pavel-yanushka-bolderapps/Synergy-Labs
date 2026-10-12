// Same-origin copies of the service pages' hero animations, so the browser
// never has to fetch them cross-origin from Sanity's CDN (which refuses
// origins missing from the project's CORS list). See toSameOriginLottie() in
// src/lib/sanity.ts.
//
// Rendered on demand and cached by Vercel like the pages that use them; a
// file name is a content hash, so a cached copy never goes stale.
import type { APIRoute } from "astro";
import { getHeroLottieFiles } from "../../../lib/sanity";

export const GET: APIRoute = async ({ params }) => {
  const source = (await getHeroLottieFiles()).find(({ file }) => file === params.file);
  if (!source) return new Response(null, { status: 404 });

  const res = await fetch(source.url);
  // An error, not a 404: the file is in use, and a 404 would be cached over it.
  if (!res.ok) throw new Error(`Could not copy hero Lottie ${source.url} (${res.status})`);

  const isJson = source.url.split("?")[0].endsWith(".json");
  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": isJson ? "application/json" : "application/zip" },
  });
};
