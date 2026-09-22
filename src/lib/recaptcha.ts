/**
 * One place that decides whether reCAPTCHA is on, so the three forms cannot
 * disagree and a missing key cannot ship.
 *
 * It throws rather than degrading. Every Vercel deployment so far rendered
 * `<div class="g-recaptcha" data-sitekey>` -- the attribute empty, because
 * PUBLIC_RECAPTCHA_SITE_KEY is not set there -- and Google's script then threw
 * "Missing required parameters: sitekey" on every page carrying a form. It was
 * invisible locally, where PUBLIC_DISABLE_RECAPTCHA=true removes the widget
 * altogether, so the two environments failed in opposite directions and
 * neither one showed the problem.
 *
 * Rendering nothing instead would be worse: the form would post without a
 * token and the API route would reject every submission, so a broken widget
 * becomes a silently broken form. A build that stops is the only outcome that
 * cannot reach production unnoticed.
 */
export interface RecaptchaConfig {
  /** True when reCAPTCHA is deliberately switched off; render no widget. */
  disabled: boolean;
  /** Empty only when `disabled` is true. */
  siteKey: string;
}

export function recaptchaConfig(): RecaptchaConfig {
  const disabled = import.meta.env.PUBLIC_DISABLE_RECAPTCHA === "true";
  const siteKey = import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY ?? "";

  if (disabled) return { disabled: true, siteKey: "" };

  if (!siteKey) {
    throw new Error(
      "PUBLIC_RECAPTCHA_SITE_KEY is not set, so the reCAPTCHA widget would render " +
        "without a site key and Google's script would throw on every page with a form. " +
        "Set it in the environment this build runs in (for Vercel: Project Settings -> " +
        "Environment Variables, for every environment that builds the site), or set " +
        "PUBLIC_DISABLE_RECAPTCHA=true to turn reCAPTCHA off deliberately."
    );
  }

  return { disabled: false, siteKey };
}
