// Daily site health check: everything that has silently broken before, or
// would cost leads if it did. Results are saved as the "ops.health.latest"
// document (shown on the Ops overview) and logged; a check that goes from
// passing to failing triggers an alert email (digest.ts).
//
// Nothing here writes to the site or sends a lead: the contact-form check
// posts a submission with a bogus reCAPTCHA token, which the route rejects
// after validation and before any email is sent.
import { opsClient, logRun } from "./store";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";

export const SITE = () => env("OPS_SITE_URL") || "https://www.synergylabs.co";
const STAGING = () => env("OPS_STAGING_URL") || "https://dev.synergylabs.co";

export interface Check {
  _key: string;
  name: string;
  group: string;
  ok: boolean;
  detail: string;
}
export interface Health {
  _id: "ops.health.latest";
  _type: "opsHealth";
  checkedAt: string;
  checks: Check[];
}

const KEY_PAGES = ["/", "/contact", "/blog", "/our-services", "/portfolio", "/locations", "/about-us"];

/** Third-party scripts the lead flow depends on, by a string their tag contains. */
const SCRIPTS: Record<string, string> = {
  "Google Analytics": "googletagmanager.com",
  HubSpot: "hs-scripts.com",
  RevenueHero: "revenuehero.io",
  reCAPTCHA: "recaptcha",
};

async function get(url: string, init?: RequestInit) {
  const started = Date.now();
  const res = await fetch(url, { redirect: "manual", ...init, headers: { "User-Agent": "SynergyOps-HealthCheck/1.0", ...(init?.headers ?? {}) } });
  const body = res.status < 300 ? await res.text() : "";
  return { status: res.status, ms: Date.now() - started, body, headers: res.headers };
}

const scriptsIn = (html: string) => Object.entries(SCRIPTS).filter(([, needle]) => html.includes(needle)).map(([name]) => name);

export async function runHealth(): Promise<Health> {
  const site = SITE();
  const checks: Check[] = [];
  const add = (group: string, name: string, ok: boolean, detail: string): void => {
    checks.push({ _key: `c${checks.length}`, group, name, ok, detail });
  };
  const safely = async (group: string, name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      add(group, name, false, err instanceof Error ? err.message : String(err));
    }
  };

  // 1. Key pages answer 200, fast, and are indexable.
  const pages = new Map<string, string>();
  await Promise.all(
    KEY_PAGES.map((path) =>
      safely("Pages", path, async () => {
        const r = await get(site + path);
        pages.set(path, r.body);
        const noindex = /noindex/i.test(r.headers.get("x-robots-tag") ?? "") || /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(r.body);
        const ok = r.status === 200 && !noindex && r.ms < 8000;
        add("Pages", path, ok, `${r.status} in ${r.ms} ms${noindex ? " — NOINDEX" : ""}${r.ms >= 8000 ? " — slow" : ""}`);
      })
    )
  );

  // 2. Tracking + lead-routing scripts are on the pages that need them.
  const home = pages.get("/") ?? "";
  const contact = pages.get("/contact") ?? "";
  for (const name of ["Google Analytics", "HubSpot"]) {
    add("Tracking", name, scriptsIn(home).includes(name), scriptsIn(home).includes(name) ? "Loaded on /" : "Missing on /");
  }
  for (const name of ["RevenueHero", "reCAPTCHA"]) {
    add("Tracking", name, scriptsIn(contact).includes(name), scriptsIn(contact).includes(name) ? "Loaded on /contact" : "Missing on /contact");
  }

  // 3. The contact form's API runs and has its reCAPTCHA secret. A valid
  //    submission with a fake token must come back 400 "reCAPTCHA"; a 500
  //    means misconfiguration, anything else means the route changed.
  await safely("Forms", "Contact form API", async () => {
    const r = await fetch(`${site}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "SynergyOps-HealthCheck/1.0" },
      body: JSON.stringify({
        firstName: "Health",
        lastName: "Check",
        email: "healthcheck@example.com",
        phone: "+12025550123",
        projectDetails: "Automated health check -- not a lead.",
        budgetRange: "",
        recaptchaToken: "ops-health-check",
        formLoadedAt: Date.now() - 60_000,
      }),
    });
    const body = await r.json().catch(() => ({}));
    const ok = r.status === 400 && /recaptcha/i.test(body.error ?? "");
    add("Forms", "Contact form API", ok, ok ? "Validates and checks reCAPTCHA" : `Unexpected ${r.status}: ${body.error ?? ""}`);
  });

  // 4. Publishing reaches the site: the newest post in Sanity is on /blog
  //    and in the sitemap. This is what fails when the Sanity -> Vercel
  //    webhook breaks (it returned 401 for weeks in Oct/Nov 2026).
  await safely("Publishing", "Newest post is live", async () => {
    const newest = await opsClient().fetch<{ slug: string; title: string; _updatedAt: string } | null>(
      `*[_type == "blogPost" && !(_id in path("drafts.**"))] | order(date desc, _createdAt desc)[0]{ "slug": slug.current, title, _updatedAt }`
    );
    if (!newest) return add("Publishing", "Newest post is live", false, "No posts found in Sanity");
    // Ten minutes' grace for a post published moments ago.
    const fresh = Date.now() - Date.parse(newest._updatedAt) < 10 * 60_000;
    const blog = pages.get("/blog") ?? (await get(`${site}/blog`)).body;
    const sitemap = (await get(`${site}/sitemap-0.xml`)).body;
    const onBlog = blog.includes(`/blog/${newest.slug}`);
    const inSitemap = sitemap.includes(`/blog/${newest.slug}`);
    add(
      "Publishing",
      "Newest post is live",
      fresh || (onBlog && inSitemap),
      `“${newest.title}”: ${onBlog ? "on /blog" : "NOT on /blog"}, ${inSitemap ? "in sitemap" : "NOT in sitemap"}` +
        (!onBlog || !inSitemap ? " — check the Sanity webhook (/api/revalidate)" : "")
    );
  });
  await safely("Publishing", "Revalidate webhook endpoint", async () => {
    // JSON, as Sanity sends it: a text/plain POST is stopped by Astro's
    // cross-site form check (403) before it reaches the route.
    const r = await fetch(`${site}/api/revalidate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    add("Publishing", "Revalidate webhook endpoint", r.status === 401, r.status === 401 ? "Up (rejects unsigned calls)" : `Unexpected ${r.status}`);
  });

  // 5. A sample of sitemap URLs still resolve.
  await safely("SEO", "Sitemap URLs", async () => {
    const xml = (await get(`${site}/sitemap-0.xml`)).body;
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!urls.length) return add("SEO", "Sitemap URLs", false, "Sitemap is empty or unreadable");
    const sample = urls.sort(() => Math.random() - 0.5).slice(0, 20);
    const results = await Promise.all(sample.map(async (u) => ({ u, s: (await fetch(u, { method: "HEAD", redirect: "manual" })).status })));
    const bad = results.filter((r) => r.s !== 200);
    add("SEO", "Sitemap URLs", bad.length === 0, `${urls.length} URLs; sampled 20, ${bad.length} not 200${bad.length ? `: ${bad.slice(0, 3).map((b) => `${b.u.replace(site, "")} (${b.s})`).join(", ")}` : ""}`);
  });
  await safely("SEO", "robots.txt", async () => {
    const r = await get(`${site}/robots.txt`);
    const blocked = /^Disallow:\s*\/\s*$/m.test(r.body);
    add("SEO", "robots.txt", r.status === 200 && !blocked, blocked ? "Blocks the whole site!" : `${r.status}`);
  });

  // 6. Staging matches production: same lead-flow scripts on /contact.
  //    GA and HubSpot are production-only by design (VERCEL_ENV gate in
  //    Analytics.astro), so they -- and HubSpot's chat widget -- are left out
  //    of the comparison.
  await safely("Staging", "Staging matches prod", async () => {
    const r = await get(`${STAGING()}/contact`);
    if (r.status !== 200) return add("Staging", "Staging matches prod", false, `${STAGING()} answered ${r.status}`);
    const PROD_ONLY = ["Google Analytics", "HubSpot"];
    const prodScripts = scriptsIn(contact).filter((s) => !PROD_ONLY.includes(s));
    const stagingScripts = scriptsIn(r.body).filter((s) => !PROD_ONLY.includes(s));
    const missing = prodScripts.filter((s) => !stagingScripts.includes(s));
    const extra = stagingScripts.filter((s) => !prodScripts.includes(s));
    add(
      "Staging",
      "Staging matches prod",
      !missing.length && !extra.length,
      !missing.length && !extra.length ? `Same lead-flow scripts on /contact (${prodScripts.join(", ")}); GA + HubSpot (incl. its chat) load on production only` : `Missing on staging: ${missing.join(", ") || "—"}; only on staging: ${extra.join(", ") || "—"}`
    );
  });

  const order = ["Pages", "Forms", "Publishing", "Tracking", "SEO", "Staging"];
  checks.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  checks.forEach((c, i) => (c._key = `c${i}`));
  const health: Health = { _id: "ops.health.latest", _type: "opsHealth", checkedAt: new Date().toISOString(), checks };
  return health;
}

/** Runs the checks, saves them, logs, and returns what newly broke. */
export async function runAndSaveHealth(by: string) {
  const c = opsClient();
  const previous = await c.getDocument<Health>("ops.health.latest");
  const health = await runHealth();
  await c.createOrReplace(health);
  const failing = health.checks.filter((x) => !x.ok);
  const wasOk = new Set((previous?.checks ?? []).filter((x) => x.ok).map((x) => `${x.group}/${x.name}`));
  const newlyBroken = failing.filter((x) => wasOk.has(`${x.group}/${x.name}`) || !previous);
  await logRun({
    job: "health",
    ok: failing.length === 0,
    by,
    summary: failing.length ? `Health: ${failing.length} of ${health.checks.length} checks failing` : `Health: all ${health.checks.length} checks pass`,
    details: failing.map((x) => `${x.group} · ${x.name}: ${x.detail}`).join("\n") || undefined,
  });
  return { health, failing, newlyBroken };
}
