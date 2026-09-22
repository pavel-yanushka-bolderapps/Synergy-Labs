/**
 * One place that decides whether reCAPTCHA is on, so the three forms cannot
 * disagree and a missing key cannot ship unnoticed.
 *
 * Why this exists: every Vercel deployment rendered
 * `<div class="g-recaptcha" data-sitekey>` -- the attribute empty, because
 * PUBLIC_RECAPTCHA_SITE_KEY is not set there -- and Google's script then threw
 * "Missing required parameters: sitekey" on every page carrying a form. It was
 * invisible locally, where PUBLIC_DISABLE_RECAPTCHA=true removes the widget
 * altogether, so the two environments failed in opposite directions and
 * neither one showed the problem.
 *
 * A missing key is handled differently depending on where the build is going,
 * because the cost of being wrong is not the same in both places:
 *
 * - Production: throw. Forms cannot work without the key either way (the API
 *   route needs RECAPTCHA_SECRET_KEY to verify a token), so the choice is
 *   between a build that stops and a live site quietly losing every lead.
 *   Stopping is the only one that cannot go unnoticed.
 *
 * - Anywhere else (preview, local, CI): render no widget and no script, and
 *   warn loudly in the build output. A preview is for reading the site, and
 *   failing the whole build over a key that only the forms need would block
 *   that for no gain. Submissions still will not succeed -- the API rejects a
 *   request with no token -- but the pages are reviewable and the console is
 *   clean.
 *
 * VERCEL_ENV is set by Vercel to "production" | "preview" | "development".
 * It is absent locally, which lands in the lenient branch, as intended.
 */
export interface RecaptchaConfig {
  /** True when no widget should be rendered at all. */
  disabled: boolean;
  /** Empty only when `disabled` is true. */
  siteKey: string;
}

export function recaptchaConfig(): RecaptchaConfig {
  const explicitlyDisabled = import.meta.env.PUBLIC_DISABLE_RECAPTCHA === "true";
  const siteKey = import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY ?? "";

  if (explicitlyDisabled) return { disabled: true, siteKey: "" };
  if (siteKey) return { disabled: false, siteKey };

  const target = import.meta.env.VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development";

  if (target === "production") {
    throw new Error(
      "PUBLIC_RECAPTCHA_SITE_KEY is not set for this production build. The reCAPTCHA " +
        "widget would render without a site key, Google's script would throw on every " +
        "page with a form, and no submission could be verified -- every lead would be " +
        "lost silently. Set PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in the " +
        "project's environment variables, or set PUBLIC_DISABLE_RECAPTCHA=true to turn " +
        "reCAPTCHA off deliberately."
    );
  }

  console.warn(
    `\n[recaptcha] PUBLIC_RECAPTCHA_SITE_KEY is not set (VERCEL_ENV=${target}).\n` +
      "           Rendering the forms without a reCAPTCHA widget so the pages stay\n" +
      "           reviewable. Submissions will be rejected until the key is set.\n" +
      "           A production build with no key fails instead of warning.\n"
  );

  return { disabled: true, siteKey: "" };
}
