import type { APIRoute } from "astro";
import { Resend } from "resend";

// Receives the single-field email forms: an address plus the page it was
// entered on. Currently that is the two forms on /ambassador-program and
// /1-week-pilot, both of which submitted nowhere in Webflow.
//
// Same shape and same spam protection as src/pages/api/contact.ts and
// src/pages/api/builder.ts -- see the comments there; only what differs is
// commented again below.
//
// Runs per-request (reCAPTCHA + Resend), so it opts out of the site's default
// static prerendering.
export const prerender = false;

interface LeadPayload {
  email: string;
  /**
   * Where the form was submitted from, so the team can tell an ambassador
   * application from a pilot enquiry in the inbox. Sent by the page, so it is
   * treated as a label rather than trusted -- see ALLOWED_SOURCES.
   */
  source?: string;
  recaptchaToken?: string;
  website?: string;
  formLoadedAt?: number;
}

/**
 * The email says where the lead came from, and `source` arrives from the
 * browser, so anything posting to this route directly could otherwise write
 * its own text into a message the team reads and acts on. Only these labels
 * are ever printed; anything else becomes "unknown".
 */
const ALLOWED_SOURCES = new Set(["/ambassador-program", "/1-week-pilot"]);

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
  let payload: LeadPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body." }, 400);
  }

  const { email, source, recaptchaToken, website, formLoadedAt } = payload;

  // --- Spam protection: honeypot + minimum fill time ------------------------
  if (website && website.trim().length > 0) {
    return jsonResponse({ success: true }, 200);
  }

  if (typeof formLoadedAt === "number" && Date.now() - formLoadedAt < 3000) {
    return jsonResponse({ success: true }, 200);
  }

  // --- Required fields ------------------------------------------------------
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!email || !EMAIL_PATTERN.test(email.trim())) {
    return jsonResponse({ success: false, error: "Please enter a valid email address." }, 400);
  }

  const sourceLabel = source && ALLOWED_SOURCES.has(source) ? source : "unknown";

  // --- reCAPTCHA ------------------------------------------------------------
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

  // --- Send the email via Resend --------------------------------------------
  const resendApiKey = import.meta.env.RESEND_API_KEY;
  const toEmail = import.meta.env.CONTACT_TO_EMAIL;
  const fromEmail = import.meta.env.CONTACT_FROM_EMAIL ?? "Synergy Labs <onboarding@resend.dev>";

  if (!resendApiKey || !toEmail) {
    console.error("RESEND_API_KEY or CONTACT_TO_EMAIL is not set.");
    return jsonResponse({ success: false, error: "Server misconfiguration." }, 500);
  }

  const resend = new Resend(resendApiKey);

  try {
    // As in the other two routes: the Resend SDK resolves with an { error }
    // field rather than throwing on an API-level failure, so a thrown-exception
    // check alone would report a failed send to the browser as a success.
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email.trim(),
      subject: `Ambassador enquiry: ${email.trim()}`,
      text: [`Email: ${email.trim()}`, "", `Submitted from ${sourceLabel}.`].join("\n"),
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
