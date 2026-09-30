import type { APIRoute } from "astro";
import { Resend } from "resend";

// Receives the /synergy-builder form: an email, a domain, and the answer to
// the "is your site mobile friendly?" gate. Same shape and same spam
// protection as src/pages/api/contact.ts -- see the comments there; anything
// that differs is commented again below.
//
// Runs per-request (reCAPTCHA + Resend), so it opts out of the site's default
// static prerendering.
export const prerender = false;

interface BuilderPayload {
  email: string;
  domain: string;
  /**
   * `true`/`false` once the visitor answers the gate, `null` when the
   * submission arrives from the page-unload beacon because they closed the
   * popup without answering. A null answer is still a lead worth having.
   */
  mobileFriendly: boolean | null;
  recaptchaToken?: string;
  website?: string;
  formLoadedAt?: number;
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyRecaptcha(token: string, secret: string): Promise<boolean> {
  if (!token) return false;

  const params = new URLSearchParams({ secret, response: token });
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

export const POST: APIRoute = async ({ request }) => {
  let payload: BuilderPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body." }, 400);
  }

  const { email, domain, mobileFriendly, recaptchaToken, website, formLoadedAt } = payload;

  // --- Spam protection: honeypot + minimum fill time ---------------------
  if (website && website.trim().length > 0) {
    return jsonResponse({ success: true }, 200);
  }

  if (typeof formLoadedAt === "number" && Date.now() - formLoadedAt < 3000) {
    return jsonResponse({ success: true }, 200);
  }

  // --- Required fields -----------------------------------------------------
  if (!email || !domain) {
    return jsonResponse({ success: false, error: "Please enter your email and domain." }, 400);
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_PATTERN.test(email.trim())) {
    return jsonResponse({ success: false, error: "Please enter a valid email address." }, 400);
  }

  // The same bare-domain shape the page checks client-side ("example.com",
  // "sub.example.co.uk") -- no scheme, no path. Re-checked here because the
  // client check is bypassable by anything posting to this route directly.
  const DOMAIN_PATTERN = /^(?=.{4,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!DOMAIN_PATTERN.test(domain.trim())) {
    return jsonResponse(
      { success: false, error: "Please enter a domain in the format example.com." },
      400
    );
  }

  // --- reCAPTCHA -----------------------------------------------------------
  const recaptchaDisabled = import.meta.env.PUBLIC_DISABLE_RECAPTCHA === "true";

  if (!recaptchaDisabled) {
    const recaptchaSecret = import.meta.env.RECAPTCHA_SECRET_KEY;
    if (!recaptchaSecret) {
      console.error("RECAPTCHA_SECRET_KEY is not set.");
      return jsonResponse({ success: false, error: "Server misconfiguration." }, 500);
    }

    const recaptchaOk = await verifyRecaptcha(recaptchaToken ?? "", recaptchaSecret);
    if (!recaptchaOk) {
      return jsonResponse(
        { success: false, error: "reCAPTCHA verification failed. Please try again." },
        400
      );
    }
  }

  // --- Send the email via Resend -------------------------------------------
  const resendApiKey = import.meta.env.RESEND_API_KEY;
  const toEmail = import.meta.env.CONTACT_TO_EMAIL;
  const fromEmail = import.meta.env.CONTACT_FROM_EMAIL ?? "Synergy Labs <onboarding@resend.dev>";

  if (!resendApiKey || !toEmail) {
    console.error("RESEND_API_KEY or CONTACT_TO_EMAIL is not set.");
    return jsonResponse({ success: false, error: "Server misconfiguration." }, 500);
  }

  const resend = new Resend(resendApiKey);

  const mobileFriendlyLine =
    mobileFriendly === true
      ? "Yes"
      : mobileFriendly === false
        ? "No — they were pointed at mobile optimization instead"
        : "Not answered (closed the popup)";

  try {
    // As in the contact route: the Resend SDK resolves with an { error } field
    // rather than throwing on an API-level failure, so a thrown-exception
    // check alone would report a failed send to the browser as a success.
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `App builder request: ${domain}`,
      text: [
        `Domain: ${domain}`,
        `Email: ${email}`,
        `Mobile friendly: ${mobileFriendlyLine}`,
        "",
        "Submitted from /synergy-builder.",
      ].join("\n"),
    });

    if (sendError) {
      console.error("Resend API error:", sendError);
      return jsonResponse(
        { success: false, error: "Could not send your request. Please try again shortly." },
        502
      );
    }
  } catch (err) {
    console.error("Resend send threw:", err);
    return jsonResponse(
      { success: false, error: "Could not send your request. Please try again shortly." },
      502
    );
  }

  return jsonResponse({ success: true }, 200);
};
