/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  /** Public: safe to expose to the browser (this is the reCAPTCHA *site* key, not the secret). */
  readonly PUBLIC_RECAPTCHA_SITE_KEY: string;
  /** Public, optional: set to "true" to skip reCAPTCHA entirely (widget, client check, and server verification) for local testing. Unset/false before deploying anywhere real. */
  readonly PUBLIC_DISABLE_RECAPTCHA?: string;
  /** Server-only: Google reCAPTCHA secret key, verified in src/pages/api/contact.ts. Never expose to the client. */
  readonly RECAPTCHA_SECRET_KEY: string;
  /** Server-only: Resend API key. */
  readonly RESEND_API_KEY: string;
  /** Server-only: where contact-form submissions get emailed. */
  readonly CONTACT_TO_EMAIL: string;
  /** Server-only, optional: the Resend "from" address. Defaults to Resend's shared test sender until you verify your own domain. */
  readonly CONTACT_FROM_EMAIL?: string;
  /** Public: Sanity project ID (from sanity.io/manage). Safe to expose -- it's not a secret, just an identifier. */
  readonly PUBLIC_SANITY_PROJECT_ID: string;
  /** Public: Sanity dataset name, usually "production". */
  readonly PUBLIC_SANITY_DATASET: string;
  /** Public, optional: set to "true" to turn on the Studio's Preview tab (drafts + click-to-edit overlays). Leave unset in production -- see src/lib/loadQuery.ts. */
  readonly PUBLIC_SANITY_VISUAL_EDITING_ENABLED?: string;
  /** Server-only, optional: Sanity Viewer token, required to read drafts for the Preview tab. Never expose to the client. */
  readonly SANITY_API_READ_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
