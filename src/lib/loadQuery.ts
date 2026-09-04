import type { QueryParams } from "sanity";
import { sanityClient } from "sanity:client";

/**
 * Single entry point for every Sanity query, so the Studio's Preview tab
 * (the Presentation tool -- see sanity.config.ts) can swap the whole site
 * over to unpublished content in one place.
 *
 * Two modes:
 *
 * - Normal (default everywhere, including production builds): fetch the
 *   `published` perspective through Sanity's CDN. Identical to what
 *   `sanityClient.fetch()` did before this file existed.
 *
 * - Preview: fetch the `drafts` perspective, bypass the CDN, and ask Sanity
 *   for a Content Source Map so strings can be "stega"-encoded. Stega hides
 *   the document/field each string came from inside the string itself using
 *   invisible Unicode characters, which is how the <VisualEditing /> overlay
 *   in Layout.astro knows that clicking a heading should open that exact
 *   field in the Studio.
 *
 * Preview mode needs BOTH PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true and a
 * SANITY_API_READ_TOKEN (drafts are not publicly readable). If the flag is
 * set without a token we log once and stay in normal mode rather than
 * throwing -- a missing token should degrade the Preview tab to "shows
 * published content, no click-to-edit", not break the dev server.
 */

const visualEditingRequested =
  import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === "true";
const token = import.meta.env.SANITY_API_READ_TOKEN;

/**
 * Whether queries actually run in preview mode. Layout.astro reads this to
 * decide whether to mount the visual-editing overlay -- mounting it when
 * queries aren't stega-encoded would give an overlay with nothing to click.
 */
export const previewEnabled = visualEditingRequested && Boolean(token);

if (visualEditingRequested && !token) {
  console.warn(
    "[sanity] PUBLIC_SANITY_VISUAL_EDITING_ENABLED is true but SANITY_API_READ_TOKEN is missing, " +
      "so the Studio's Preview tab will show published content without click-to-edit. " +
      "Create a Viewer token at https://sanity.io/manage (API -> Tokens) and add it to .env."
  );
}

/** Tracks the one-time warning for a token that exists but isn't accepted. */
let warnedAboutRejectedToken = false;

export async function loadQuery<QueryResponse>({
  query,
  params,
}: {
  query: string;
  params?: QueryParams;
}): Promise<QueryResponse> {
  if (!previewEnabled) {
    return fetchPublished<QueryResponse>(query, params);
  }

  try {
    const { result } = await sanityClient.fetch<QueryResponse>(query, params ?? {}, {
      filterResponse: false,
      perspective: "drafts",
      resultSourceMap: "withKeyArraySelector",
      useCdn: false,
      token,
      stega: {
        enabled: true,
        // The built-in filter already skips strings where invisible
        // characters would break something rather than help -- anything
        // under a key starting with `_` (image asset `_ref`s), plus a
        // denylist that includes `href` (so the service links keep
        // working). It does not skip `metaDescription`, which we render
        // into a <meta> tag where stega would be invisible padding in page
        // metadata instead of a clickable overlay, so exclude that here.
        filter: (props) =>
          props.sourcePath.at(-1) === "metaDescription"
            ? false
            : props.filterDefault(props),
      },
    });

    return result;
  } catch (err) {
    // A token that Sanity rejects (wrong project, revoked, typo) would
    // otherwise bubble up to each caller's catch block and fall all the way
    // back to the hardcoded content in src/content/*.ts -- so a bad token
    // would hide the real CMS content rather than just the click-to-edit
    // overlay. Retry once as an anonymous published read: the Preview tab
    // then shows the same content the live site does, and only the
    // click-to-edit overlay is missing.
    if (!isAuthError(err)) throw err;

    if (!warnedAboutRejectedToken) {
      warnedAboutRejectedToken = true;
      console.warn(
        `[sanity] SANITY_API_READ_TOKEN was rejected (${describeAuthError(err)}). ` +
          "Falling back to published content, so the Preview tab will work but " +
          "without click-to-edit. Check that the token was created in the same " +
          "project as PUBLIC_SANITY_PROJECT_ID, with the Viewer role."
      );
    }

    return fetchPublished<QueryResponse>(query, params);
  }
}

/** The plain, public read that the live site has always used. */
async function fetchPublished<QueryResponse>(
  query: string,
  params?: QueryParams
): Promise<QueryResponse> {
  const { result } = await sanityClient.fetch<QueryResponse>(query, params ?? {}, {
    filterResponse: false,
    perspective: "published",
    resultSourceMap: false,
    useCdn: true,
    stega: false,
  });

  return result;
}

function isAuthError(err: unknown): boolean {
  const status = (err as { statusCode?: number; response?: { statusCode?: number } })
    ?.response?.statusCode ?? (err as { statusCode?: number })?.statusCode;
  return status === 401 || status === 403;
}

function describeAuthError(err: unknown): string {
  const body = (err as { response?: { body?: { error?: { description?: string } } } })
    ?.response?.body?.error?.description;
  return body || (err as Error)?.message || "unknown reason";
}
