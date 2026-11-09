// Whether a form submission is a test. Shared by the Forms tab (browser) and
// the scorecard (server), so "real form MQLs" means the same thing in both.
// No Node imports: this file is bundled into the dashboard.

export interface TestableSubmission {
  form: string;
  env: string;
  test?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  domain?: string;
  budget?: string;
  pageUrl?: string;
  extra?: { key: string; value: string }[];
}

/** Starting list; editable in the Forms tab (stored in ops.settings.forms). */
export const DEFAULT_TEST_RULES = [
  "test",
  "testing",
  "tester",
  "asdf",
  "qwerty",
  "lorem",
  "ipsum",
  "dummy",
  "fake",
  "example.com",
  "@bolderapps.com",
  "@synergylabs.co",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Why a submission looks like a test, or "" if it looks real. A person's
 * mark wins; staging/local submissions and Webflow's *.webflow.io staging
 * copy are always tests. A rule with "@" or "." matches inside the email or
 * domain ("@bolderapps.com", "example.com"); any other rule matches as a
 * whole word, optionally followed by digits ("test", "test2", "Test123" --
 * but not "testimonial").
 */
export function testReason(s: TestableSubmission, rules: string[]): string {
  if (s.test === true) return "Marked as test";
  if (s.test === false) return "";
  if (s.env !== "production" && s.env !== "import") return s.env === "preview" ? "Sent from staging" : "Sent from a local build";
  if (/^https?:\/\/[^/]+\.webflow\.io(\/|$)/i.test(s.pageUrl ?? "")) return "Sent from Webflow staging (webflow.io)";
  const addr = `${s.email ?? ""} ${s.domain ?? ""}`.toLowerCase();
  const text = [s.name, s.email, s.phone, s.message, s.domain, s.budget, ...(s.extra ?? []).map((x) => x.value)].filter(Boolean).join(" \n ").toLowerCase();
  for (const r of rules) {
    if (/[@.]/.test(r)) {
      if (addr.includes(r)) return `Contains “${r}”`;
    } else if (new RegExp(`(^|[^a-z0-9])${escapeRe(r)}\\d*($|[^a-z0-9])`, "i").test(text)) return `Contains “${r}”`;
  }
  return "";
}
