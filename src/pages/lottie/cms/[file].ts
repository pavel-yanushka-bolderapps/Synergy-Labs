// Same-origin copies of the service pages' hero animations, written into the
// static build so the browser never has to fetch them cross-origin from
// Sanity's CDN (which refuses origins missing from the project's CORS list).
// See toSameOriginLottie() in src/lib/sanity.ts.
//
// Like the pages that use them, these are fetched once at build time: a new
// or replaced animation in Studio needs a rebuild before it is served.
import type { APIRoute, GetStaticPaths } from "astro";
import { getHeroLottieFiles } from "../../../lib/sanity";

export const getStaticPaths = (async () => {
  const files = await getHeroLottieFiles();
  return files.map(({ file, url }) => ({ params: { file }, props: { url } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const res = await fetch(props.url as string);
  // Failing the build beats shipping a page whose animation 404s.
  if (!res.ok) throw new Error(`Could not copy hero Lottie ${props.url} (${res.status})`);

  const isJson = (props.url as string).split("?")[0].endsWith(".json");
  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": isJson ? "application/json" : "application/zip" },
  });
};
