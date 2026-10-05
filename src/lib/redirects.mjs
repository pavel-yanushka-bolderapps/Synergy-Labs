// The legacy URL map: every URL the Webflow site served that this site does
// not, and where it goes now. Lives here rather than in astro.config.mjs so
// the blog renderer can read it too (src/lib/blog.ts points in-article links
// straight at the final URL instead of through a redirect hop). Plain JS with
// no imports, so the config can load it before Vite is running.

// --- Legacy URL map ------------------------------------------------------
//
// Every URL the Webflow site served that this site does not. Without these
// they 404 on cutover and their rankings go with them.
//
// SHIPPED AS 302 ON PURPOSE. A 301 is cached by browsers more or less
// permanently and cannot be recalled, so these stay temporary until the
// redirects have been checked against a preview deployment and the site is
// live and settled. Then flip REDIRECT_STATUS to 301 -- that is the only
// change needed.
//
// DANGER: the Vercel adapter emits these *before* `handle: filesystem`, so a
// source that is also a real route hides that route. Never add a source for a
// page that exists. `npm run audit:launch` fails if one ever does.
const REDIRECT_STATUS = 302;

const to = (destination) => ({ status: REDIRECT_STATUS, destination });

/**
 * The old flat location URLs. Webflow gave every office a top-level page with
 * the whole company name in the slug; they are /locations/<city> here.
 * Note "phonix" -- Webflow's typo, which is a live indexed URL, so it is
 * mapped as spelled.
 */
const LEGACY_LOCATIONS = {
  'mobile-and-web-developers-agency-in-chicago': 'chicago',
  'mobile-and-web-developers-agency-in-dubai': 'dubai',
  'mobile-and-web-developers-agency-in-london': 'london',
  'mobile-and-web-developers-agency-in-los-angeles': 'los-angeles',
  'mobile-and-web-developers-agency-in-orlando': 'orlando',
  'mobile-and-web-developers-agency-in-riyadh': 'riyadh',
  'mobile-and-web-developers-agency-in-singapore': 'singapore',
  'mobile-and-web-developers-agency-in-tampa': 'tampa',
  'mobile-and-web-development-agency-in-qatar': 'qatar',
  'mobile-app-and-web-developers-agency-in-austin': 'austin',
  'mobile-app-and-web-developers-agency-in-hartford': 'hartford',
  'mobile-app-and-web-development-agency-in-atlanta': 'atlanta',
  'mobile-app-and-web-development-agency-in-houston': 'houston',
  'mobile-app-and-web-development-agency-in-jackson': 'jackson',
  'mobile-app-and-web-development-agency-in-jacksonville': 'jacksonville',
  'mobile-app-and-web-development-agency-in-miami': 'miami',
  'mobile-app-and-web-development-agency-in-new-york-city': 'new-york-city',
  'mobile-app-and-web-development-agency-in-philadelphia': 'philadelphia',
  'mobile-app-and-web-development-agency-in-phonix': 'phoenix',
  'mobile-app-and-web-development-agency-in-san-diego': 'san-diego',
  'mobile-app-and-web-development-agency-in-san-francisco': 'san-francisco',
};

/**
 * The ten /top-* Clutch landings that were never seeded into Sanity, pointed
 * at the city page for the same place.
 *
 * This is a stopgap, not the end state: these are paid/referral landing pages
 * and the landing template converts better than a location page. The right
 * fix is ten more rows in scripts/data/clutch-landings.json, at which point
 * each entry here MUST be deleted -- a redirect left behind would shadow the
 * page it was standing in for. Connecticut has no city page of its own;
 * Hartford is the office there.
 */
const UNSEEDED_LANDINGS = {
  'top-app-developers-in-austin': 'austin',
  'top-app-developers-in-chicago': 'chicago',
  'top-app-developers-in-connecticut': 'hartford',
  'top-app-developers-in-dubai': 'dubai',
  'top-app-developers-in-london': 'london',
  'top-app-developers-in-miami': 'miami',
  'top-app-developers-in-nyc': 'new-york-city',
  'top-app-developers-in-qatar': 'qatar',
  'top-app-developers-in-riyadh': 'riyadh',
  'top-app-developers-in-singapore': 'singapore',
};

/**
 * Webflow's own 301 rules (Site settings > Publishing > 301 redirects,
 * exported 2026-09-30 to scripts/data/webflow/redirects-2026-09-30.csv) that
 * are not already covered above.
 *
 * These are 301 from day one rather than REDIRECT_STATUS: Webflow has been
 * serving every one of them as a 301 for months, so browsers and Google
 * already hold them as permanent and a 302 here would only muddy that.
 *
 * Where Webflow chained (the Riyadh and Miami "-map" pages hop two or three
 * times) or pointed at a page that no longer exists (/signal,
 * /rich-page-demo), the target here is the final page instead.
 * Deliberately NOT copied: Webflow sends the "phonix" typo URL to San Diego;
 * it goes to Phoenix above, which is the city it names.
 */
const WEBFLOW_301S = {
  '/30': '/our-services',
  '/services': '/our-services',
  '/our-locations': '/locations',
  '/app-development': '/top-app-development',
  '/referring': '/ambassador-program',
  '/projects/casestudy/revamping-joe': '/projects/casestudy/joe-the-juice',
  '/portfolio-signal': '/projects/casestudy/signal',
  '/rich-page': '/',
  '/top-app-developers-in-miami-map': '/locations/miami',
  '/top-app-developers-in-riyadh-map': '/locations/riyadh',
  '/www-synergylabs-co-top-app-developers-in-riyadh-map': '/locations/riyadh',
  // Location URL variants ("app-and-web-development" vs "and-web-developers").
  '/synergy-labs---mobile-app-and-web-developers-agency-in-san-francisco': '/locations/san-francisco',
  '/synergy-labs---mobile-app-and-web-development-agency-in-dubai': '/locations/dubai',
  '/synergy-labs---mobile-app-and-web-development-agency-in-hartford': '/locations/hartford',
  '/synergy-labs---mobile-app-and-web-development-agency-in-london': '/locations/london',
  '/synergy-labs---mobile-app-and-web-development-agency-in-los-angeles': '/locations/los-angeles',
  '/synergy-labs---mobile-app-and-web-development-agency-in-orlando': '/locations/orlando',
  '/synergy-labs---mobile-app-and-web-development-agency-in-phoenix': '/locations/phoenix',
  '/synergy-labs---mobile-app-and-web-development-agency-in-qatar': '/locations/qatar',
  '/synergy-labs---mobile-app-and-web-development-agency-in-singapore': '/locations/singapore',
  '/synergy-labs---mobile-app-and-web-development-agency-in-tampa': '/locations/tampa',
  // Blog posts re-slugged from "-2025" to "-2026".
  '/blog/7-best-rork-ai-alternatives-for-smarter-workflow-automation-in-2025': '/blog/best-rork-ai-alternatives-automation-2026',
  '/blog/7-must-have-flutter-plugins-for-app-development-in-2025': '/blog/best-flutter-plugins-app-dev-2026',
  '/blog/agentic-ai-explained-from-chatbots-to-autonomous-ai-agents-in-2025': '/blog/agentic-ai-explained-from-chatbots-to-autonomous-ai-agents-in-2026',
  '/blog/all-about-flutterflow-pricing-2025-a-deep-dive-into-the-best-plans-for-scaling-your-app': '/blog/flutterflow-pricing-2026-a-deep-dive-into-the-best-plans-for-scaling-your-app',
  '/blog/all-about-xano-pricing-in-2025-what-startups-should-know': '/blog/xano-pricing-2026-guide-startups',
  '/blog/android-games-paid': '/blog/android-games-paid-for-2025',
  '/blog/best-vibe-coding-platforms-of-2025-where-culture-meets-code': '/blog/best-vibe-coding-platforms-2026-guide',
  '/blog/beyond-ads-the-2025-monetization-stack-for-high-ltv-apps': '/blog/beyond-ads-the-2026-monetization-stack-for-high-ltv-apps',
  '/blog/building-smarter-apps-in-2025-ai-personalization-predictive-models-and-nlp-ui': '/blog/smarter-apps-ai-best-practices-2026',
  '/blog/complete-guide-to-modernization-best-practices-in-2025': '/blog/best-legacy-modernization-guide-2026',
  '/blog/design-focused-dev-platforms-in-2025': '/blog/design-focused-development-platforms-2026',
  '/blog/digital-transformation-services-definitive-guide-2025': '/blog/the-definitive-guide-to-digital-transformation-services-for-mid-sized-enterprises-in-2026',
  '/blog/dubais-no-code-ai-startup-ecosystem-in-2025': '/blog/dubai-no-code-ai-ecosystem-guide-2026',
  '/blog/enterprise-app-development-complete-guide-2025': '/blog/enterprise-app-development-complete-guide-2026',
  '/blog/no-code-vs-ai-generated-apps-what-businesses-should-choose-in-2025': '/blog/no-code-vs-ai-generated-apps-what-businesses-should-choose-in-2026',
  '/blog/top-gpt-wrapper-use-cases-for-business-automation-in-2025': '/blog/best-gpt-wrapper-automation-2026',
  '/blog/why-san-diego-is-emerging-as-a-hub-for-app-dev-ai-innovation-in-2025': '/blog/san-diego-app-ai-innovation-2026-guide',
};

/**
 * Every source is registered as `<path>{/}?` so it matches with or without a
 * trailing slash.
 *
 * A bare source compiles to an exact `^/articles$`, and `/articles/` then
 * matches nothing, falls past the filesystem handle and 404s. Real pages are
 * unaffected -- Vercel resolves /contact and /contact/ to the same file -- so
 * this is specific to redirects, and it does not show up in the build output:
 * both forms have to be requested against a running deployment to see it.
 * `npm run verify:redirects <url>` does exactly that.
 *
 * Registering the slashed source as a second key does not work: the route
 * normaliser strips the slash and both keys collapse to the same pattern.
 * `/articles/?` is rejected outright as an invalid source pattern. `{/}?` is
 * path-to-regexp's optional-group syntax and compiles to `^/articles(?:/)?$`,
 * which is the one form that covers both.
 *
 * The suffix is added here rather than written into each key so the map above
 * stays readable and no entry can be forgotten.
 */
const optionalTrailingSlash = (map) =>
  Object.fromEntries(Object.entries(map).map(([source, target]) => [`${source}{/}?`, target]));

export const redirects = optionalTrailingSlash({
  ...Object.fromEntries(
    Object.entries(WEBFLOW_301S).map(([source, destination]) => [source, { status: 301, destination }])
  ),
  ...Object.fromEntries(
    Object.entries(LEGACY_LOCATIONS).map(([slug, city]) => [
      `/synergy-labs---${slug}`,
      to(`/locations/${city}`),
    ])
  ),
  ...Object.fromEntries(
    Object.entries(UNSEEDED_LANDINGS).map(([slug, city]) => [`/${slug}`, to(`/locations/${city}`)])
  ),

  // Two offices also had a short-form URL.
  '/locations-dallas': to('/locations/dallas'),
  '/locations-san-antonio': to('/locations/san-antonio'),

  // The service keeps its live, indexed URL (with the "-service" suffix, like
  // the other services). /our-services/web-app-development is the slug this
  // rebuild used before matching it, so it is covered too. Two older
  // root-level copies of the same page predate /our-services entirely.
  '/our-services/web-app-development': to('/our-services/web-app-development-service'),
  '/web-app-development': to('/our-services/web-app-development-service'),
  '/web-app-development-copy': to('/our-services/web-app-development-service'),

  // A Webflow stub whose body copy was still lorem ipsum. The service page is
  // what it was meant to become.
  '/mobile-apps': to('/our-services/app-development-service'),

  // The news-articles collection has not been migrated. Until it is, the blog
  // is the closest thing this site has to it.
  '/articles': to('/blog'),

  // Titled "Calculator" but contains no calculator -- it is the contact form
  // and its thank-you state, nothing else.
  '/calculator': to('/contact'),

  // TODO: decide before flipping to 301. This was a real, indexable paid
  // landing page ("Top Mobile App Design Optimization Agency") built on the
  // same template as /top-*, with a founder video and a PDF checklist behind
  // the form. If Search Console shows it earning impressions, delete this
  // entry and seed it as a clutchLanding instead. 302 keeps that door open.
  '/mobile-app-design-optimization': to('/our-services/app-development-service'),

  // Live on Webflow but published after the CMS export this site was seeded
  // from, so there is no copy of the article here. Each goes to the closest
  // post on the same topic rather than the blog index, which Google would
  // treat as a soft 404. Import the posts and delete these to recover them.
  '/blog/ai-powered-app-development-for-miami-businesses': to('/blog/miami-app-development-ultimate-2026-guide'),
  '/blog/android-antivirus-licensing-model': to('/blog/phone-antivirus'),
  '/blog/antivirus-apps-for-mac': to('/blog/mobile-security-software'),
  '/blog/app-for-apartment-maintenance': to('/blog/app-maintenance-services'),
  '/blog/best-free-security-apps-for-android': to('/blog/best-free-android-security-tips-2026'),
  '/blog/unlock-locked-phone-complete-guide-2026': to('/blog/how-do-i-unlock-my-iphone'),
  '/news-articles/mobile-developers-in-miami': to('/locations/miami'),

  // Author archives and podcast episode pages have no equivalent here: posts
  // show their author inline, and episodes are embedded on /podcast.
  ...Object.fromEntries(
    ['andrew-abbey', 'brian-a', 'jhaymes-clark-n-caracuel', 'jon-knight', 'lily-kelce', 'sardor-akhmedov'].map(
      (slug) => [`/author/${slug}`, to('/blog')]
    )
  ),
  ...Object.fromEntries(
    [
      'ai-startups-product-market-fit-disrupting-big-tech-founder-pod-at-synergy-labs',
      'from-playbook-to-product-how-founders-are-building-viral-apps-in-2025',
      'mastering-mobile-app-development-overcoming-perfectionism-ai-search-the-future-of-mvps',
      'the-500-billion-stargate-project-openais-bold-plan-to-dominate-ais-future',
      'the-future-of-ai-startups-disrupting-tech-giants-pmf-challenges-ai-driven-design',
      'the-future-of-mobile-apps-nikita-biers-explode-social-media-trends-app-innovation',
    ].map((slug) => [`/podcast/${slug}`, to('/podcast')])
  ),
});
