import type { APIRoute } from "astro";
import { Resend } from "resend";

// This route needs to run per-request (to call reCAPTCHA + Resend), so it
// opts out of the site's default static prerendering. Every other page
// stays a prerendered static file.
export const prerender = false;

interface ContactPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  projectDetails: string;
  budgetRange: string;
  recaptchaToken: string;
  // Spam-protection fields (see README-CONTACT-FORM.md): a honeypot field
  // real users never see/fill, and a page-load timestamp so submissions
  // faster than a human could plausibly fill the form are treated as bots.
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
  let payload: ContactPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body." }, 400);
  }

  const { firstName, lastName, email, phone, projectDetails, budgetRange, recaptchaToken, website, formLoadedAt } =
    payload;

  // --- Spam protection: honeypot + minimum fill time ---------------------
  // `website` is a hidden field real visitors never see or fill (see the
  // form markup in contact.astro). Any bot that fills every input on the
  // page trips it. Respond with a fake success so the bot doesn't learn its
  // submission was rejected, but never send an email or hit reCAPTCHA/Resend.
  if (website && website.trim().length > 0) {
    return jsonResponse({ success: true }, 200);
  }

  // A human can't realistically read the form and fill 6 fields in under
  // ~3 seconds. formLoadedAt is set client-side when the form mounts.
  if (typeof formLoadedAt === "number" && Date.now() - formLoadedAt < 3000) {
    return jsonResponse({ success: true }, 200);
  }

  // --- Required fields -----------------------------------------------------
  if (!firstName || !lastName || !email || !projectDetails) {
    return jsonResponse({ success: false, error: "Please fill in all required fields." }, 400);
  }

  // --- Field format validation ----------------------------------------------
  // The form validates these client-side (email pattern + intl-tel-input),
  // but that can always be bypassed by anyone posting to this route directly,
  // so the same checks are enforced again here.
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_PATTERN.test(email.trim())) {
    return jsonResponse({ success: false, error: "Please enter a valid email address." }, 400);
  }

  // Phone is optional, but if one was provided it should already be in E.164
  // format (the client sends iti.getNumber() -- e.g. "+14155552671").
  if (phone && phone.trim()) {
    const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
    if (!PHONE_PATTERN.test(phone.trim())) {
      return jsonResponse({ success: false, error: "Please enter a valid phone number." }, 400);
    }
  }

  // --- reCAPTCHA (verified server-side -- a client-side-only check can be
  // spoofed by anything that isn't an actual browser running Google's JS) --
  // PUBLIC_DISABLE_RECAPTCHA=true is a temporary local-testing escape hatch
  // (see contact.astro) -- remove/unset it before deploying anywhere real,
  // since it skips spam protection entirely.
  const recaptchaDisabled = import.meta.env.PUBLIC_DISABLE_RECAPTCHA === "true";

  if (!recaptchaDisabled) {
    const recaptchaSecret = import.meta.env.RECAPTCHA_SECRET_KEY;
    if (!recaptchaSecret) {
      console.error("RECAPTCHA_SECRET_KEY is not set.");
      return jsonResponse({ success: false, error: "Server misconfiguration." }, 500);
    }

    const recaptchaOk = await verifyRecaptcha(recaptchaToken, recaptchaSecret);
    if (!recaptchaOk) {
      return jsonResponse({ success: false, error: "reCAPTCHA verification failed. Please try again." }, 400);
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

  try {
    // The Resend SDK does NOT throw on an API-level failure (e.g. an
    // unverified "from" domain) -- it resolves normally with an { error }
    // field instead. Checking only for a thrown exception here previously
    // meant a failed send was reported back to the browser as a success.
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `New project inquiry from ${firstName} ${lastName}`,
      text: [
        `Name: ${firstName} ${lastName}`,
        `Email: ${email}`,
        `Phone: ${phone || "(not provided)"}`,
        `Budget range: ${budgetRange || "(not provided)"}`,
        "",
        "What they need help with:",
        projectDetails,
      ].join("\n"),
    });

    if (sendError) {
      console.error("Resend API error:", sendError);
      return jsonResponse({ success: false, error: "Could not send your message. Please try again shortly." }, 502);
    }
  } catch (err) {
    console.error("Resend send threw:", err);
    return jsonResponse({ success: false, error: "Could not send your message. Please try again shortly." }, 502);
  }

  return jsonResponse({ success: true }, 200);
};
