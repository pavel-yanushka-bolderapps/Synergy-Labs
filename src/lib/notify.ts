import type { CreateEmailOptions, Resend } from "resend";

/**
 * Sends a form notification to every inbox in CONTACT_TO_EMAIL as its own
 * email, so each recipient sees only their own address -- the way Webflow's
 * form notifications arrived. One email with several `to` addresses would
 * show the whole team list to everyone on it.
 *
 * One batch request (up to 100 emails), so it is still a single API call.
 * Like `emails.send`, it resolves with an { error } field rather than
 * throwing on an API-level failure.
 */
export function sendToEachRecipient(
  resend: Resend,
  recipientList: string,
  email: Omit<CreateEmailOptions, "to">
) {
  const recipients = recipientList
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return resend.batch.send(recipients.map((to) => ({ ...email, to }) as CreateEmailOptions));
}
