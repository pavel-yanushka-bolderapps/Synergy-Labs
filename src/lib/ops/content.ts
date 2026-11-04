// The content pipeline behind the Ops calendar:
//
//   planned -> [draft: Claude writes a blogPost DRAFT in Sanity] -> review
//           -> [approve: a person picks the publish time]        -> approved
//           -> [publish cron, or "Publish now"]                  -> published
//
// Nothing the bot writes is public until a person approves it: drafts live at
// "drafts.<id>", which the public dataset never returns.
import Anthropic from "@anthropic-ai/sdk";
import { opsClient, logRun, type ContentItem } from "./store";
import { pathsFor, revalidate } from "../revalidate";

const env = (k: string) => process.env[k] || (import.meta.env as Record<string, string | undefined>)[k] || "";

/** Overridable without a deploy, e.g. OPS_DRAFT_MODEL=claude-sonnet-5-5 to halve the cost. */
const MODEL = () => env("OPS_DRAFT_MODEL") || "claude-opus-5-5";
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
/** Whose byline bot drafts carry until someone changes it in the review. */
const DEFAULT_AUTHOR = () => env("OPS_DRAFT_AUTHOR") || "blog-author-andrew-abbey";
const TEMPLATES = Array.from({ length: 7 }, (_, i) => `template-${i + 1}`);

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 90).replace(/-+$/, "");

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "slug", "previewText", "articleHtml"],
  properties: {
    title: { type: "string", description: "H1 / title tag, under 65 characters, contains the target keyword." },
    slug: { type: "string", description: "URL slug, lowercase-hyphenated, keyword-first, no year unless the topic is time-bound." },
    previewText: { type: "string", description: "Meta description and listing standfirst: 140-160 characters, ends with a reason to click." },
    articleHtml: { type: "string", description: "The article body as HTML (no <h1>, no <html>/<body>)." },
  },
} as const;

const SYSTEM = `You write long-form SEO articles for Synergy Labs (synergylabs.co), a US mobile and web app development agency (iOS, Android, cross-platform, AI products, MVPs for startups and enterprises).

Every article exists to win organic search traffic that turns into leads for app-development projects. Write for founders, product owners and CTOs evaluating whether and how to build an app.

Article requirements:
- 1,600-2,400 words of genuinely useful, specific content: concrete steps, numbers, cost ranges, timelines, trade-offs, examples. No filler, no generic AI phrasing, no "In today's fast-paced world".
- Structure with <h2> and <h3> (each with an id attribute, kebab-case), short paragraphs, <ul>/<ol> lists, and at least one <table> where a comparison helps.
- Use the target keyword naturally in the first 100 words, one H2, and the conclusion. Cover the related questions a searcher has.
- End with an FAQ section (<h2 id="faq">Frequently asked questions</h2>, 4-6 <h3> questions with concise answers) and a short closing section that invites readers to talk to Synergy Labs about their app, linking to /contact.
- Add 3-5 internal links (<a href="/...">) to the most relevant pages from the list provided. Use only those URLs; never invent internal URLs. No external links unless citing a well-known primary source.
- Never invent statistics, client names, case studies or quotes. State ranges and typical figures as estimates.
- Write "Synergy Labs" (two words) for the company.
- HTML only: no Markdown, no <h1>, no inline styles, no images.`;

export async function sitePages(): Promise<string> {
  const c = opsClient();
  const [posts, services, locations] = await Promise.all([
    c.fetch<{ title: string; slug: string }[]>(
      `*[_type == "blogPost" && !(_id in path("drafts.**"))] | order(date desc)[0...80]{ title, "slug": slug.current }`
    ),
    c.fetch<{ title: string; href: string }[]>(`*[_type == "service" && defined(href) && !(_id in path("drafts.**"))]{ title, href }`),
    c.fetch<{ name: string; slug: string }[]>(
      `*[_type == "location" && !(_id in path("drafts.**"))][0...40]{ "name": city, "slug": slug.current }`
    ),
  ]);
  return [
    "/contact -- Contact / get a quote",
    "/our-services -- All services",
    "/portfolio -- Portfolio",
    ...services.map((s) => `${s.href} -- ${s.title}`),
    ...locations.filter((l) => l.slug).map((l) => `/locations/${l.slug} -- App development in ${l.name}`),
    ...posts.map((p) => `/blog/${p.slug} -- ${p.title}`),
  ].join("\n");
}

function cost(usage: Anthropic.Usage): number {
  const [pin, pout] = PRICES[MODEL()] ?? [0, 0];
  return (usage.input_tokens * pin + usage.output_tokens * pout) / 1e6;
}

/** Writes a draft for a calendar item and moves it to "review". */
export async function draftContent(item: ContentItem, by: string): Promise<ContentItem> {
  const startedAt = new Date().toISOString();
  const c = opsClient();
  await c.patch(item._id).set({ status: "drafting" }).commit();

  try {
    let existing = "";
    if (item.kind === "refresh" && item.targetPath) {
      const slug = item.targetPath.replace(/^\/blog\//, "");
      const post = await c.fetch<{ title: string; articleHtml: string } | null>(
        `*[_type == "blogPost" && slug.current == $slug && !(_id in path("drafts.**"))][0]{ title, articleHtml }`,
        { slug }
      );
      if (!post) throw new Error(`No published post at ${item.targetPath}`);
      existing = `\n\nThis is a REFRESH of the existing article below. Keep its slug and its core topic, keep whatever is still accurate and good, update anything outdated for ${new Date().getFullYear()}, fill gaps competitors cover, tighten weak sections, and improve internal links. Return the full rewritten article.\n\n<existing_title>${post.title}</existing_title>\n<existing_article>\n${post.articleHtml}\n</existing_article>`;
    }

    const prompt = `Write the article for this content-calendar item.

<item>
Title / topic: ${item.title}
Type: ${item.kind}
Target keyword: ${item.keyword || "(choose the best-fit keyword for the topic)"}
Brief: ${item.brief || "(none)"}
</item>

<internal_pages>
${await sitePages()}
</internal_pages>${existing}`;

    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") || undefined });
    const message = await client.messages
      .stream({
        model: MODEL(),
        max_tokens: 32000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      })
      .finalMessage();

    if (message.stop_reason === "refusal") throw new Error("Claude declined to write this article");
    if (message.stop_reason === "max_tokens") throw new Error("The draft was cut off (max_tokens)");
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const draft = JSON.parse(text) as { title: string; slug: string; previewText: string; articleHtml: string };

    // A refresh rewrites the existing post (same id and slug) as a draft; a
    // new article gets its own id.
    let postId: string;
    let slug: string;
    if (item.kind === "refresh" && item.targetPath) {
      slug = item.targetPath.replace(/^\/blog\//, "");
      const id = await c.fetch<string>(`*[_type == "blogPost" && slug.current == $slug && !(_id in path("drafts.**"))][0]._id`, { slug });
      postId = id;
    } else {
      slug = slugify(draft.slug || draft.title);
      const taken = await c.fetch<number>(`count(*[_type == "blogPost" && slug.current == $slug])`, { slug });
      if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      postId = `blog-post-${slug}`;
    }

    const published = await c.getDocument(postId);
    const words = draft.articleHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    await c.createOrReplace({
      ...(published ?? {}),
      _id: `drafts.${postId}`,
      _type: "blogPost",
      title: draft.title,
      slug: { _type: "slug", current: slug },
      date: (published?.date as string) ?? new Date().toISOString().slice(0, 10),
      author: published?.author ?? { _type: "reference", _ref: DEFAULT_AUTHOR() },
      previewText: draft.previewText,
      template: published?.template ?? TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)],
      readingMinutes: Math.max(1, Math.round(words / 225)),
      articleHtml: draft.articleHtml,
    });

    const usd = cost(message.usage);
    const updated = await c
      .patch(item._id)
      .set({ status: "review", postId, slug, notes: item.notes })
      .commit<ContentItem>();
    await logRun({
      job: "content-draft",
      startedAt,
      ok: true,
      by,
      summary: `Drafted "${draft.title}" (${words.toLocaleString()} words) for review`,
      details: `/blog/${slug}`,
      costUsd: Math.round(usd * 100) / 100,
    });
    return updated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await c.patch(item._id).set({ status: "planned" }).commit();
    await logRun({ job: "content-draft", startedAt, ok: false, by, summary: `Draft failed: ${item.title}`, details: msg });
    throw err;
  }
}

/** Promotes the item's draft to the live post and refreshes the pages it shows on. */
export async function publishContent(item: ContentItem, origin: string, by: string): Promise<ContentItem> {
  if (!item.postId) throw new Error("Nothing to publish: no draft yet");
  const c = opsClient();
  const draft = await c.getDocument(`drafts.${item.postId}`);
  const live = await c.getDocument(item.postId);
  if (!draft && !live) throw new Error("The draft no longer exists");

  if (draft) {
    const { _id, _rev, _createdAt, _updatedAt, ...fields } = draft;
    // A new post is dated the day it goes live; a refresh keeps its date.
    const date = live ? fields.date : new Date().toISOString().slice(0, 10);
    await c
      .transaction()
      .createOrReplace({ ...fields, date, _id: item.postId, _type: "blogPost" })
      .delete(`drafts.${item.postId}`)
      .commit();
  }

  const slugs = [item.slug, (live?.slug as { current?: string } | undefined)?.current].filter(Boolean) as string[];
  const token = env("ISR_BYPASS_TOKEN");
  if (token) {
    try {
      await revalidate(origin, await pathsFor({ type: "blogPost", slugs }), token);
    } catch (err) {
      console.error("[ops] revalidate failed:", err);
    }
  }

  const updated = await c
    .patch(item._id)
    .set({ status: "published", publishedAt: new Date().toISOString() })
    .commit<ContentItem>();
  await logRun({ job: "publish", ok: true, by, summary: `Published "${item.title}"`, details: `/blog/${item.slug}` });
  return updated;
}

/** Everything approved whose publish time has come. Run by the publish cron. */
export async function publishDue(origin: string) {
  const due = await opsClient().fetch<ContentItem[]>(
    `*[_type == "opsContent" && _id in path("ops.**") && status == "approved" && defined(publishAt) && publishAt <= now()]`
  );
  const results = [];
  for (const item of due) {
    try {
      await publishContent(item, origin, "Bot");
      results.push({ id: item._id, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logRun({ job: "publish", ok: false, by: "Bot", summary: `Publish failed: ${item.title}`, details: msg });
      results.push({ id: item._id, ok: false, error: msg });
    }
  }
  return results;
}

/** Drafts every calendar item planned for this week or earlier. Run by the content cron. */
export async function draftDue(limit = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const due = await opsClient().fetch<ContentItem[]>(
    `*[_type == "opsContent" && _id in path("ops.**") && status == "planned" && kind in ["new", "refresh"] && week <= $today] | order(week asc)[0...$limit]`,
    { today, limit }
  );
  const results = [];
  for (const item of due) {
    try {
      await draftContent(item, "Bot");
      results.push({ id: item._id, ok: true });
    } catch (err) {
      results.push({ id: item._id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** The draft (or live post) behind a calendar item, for the review preview. */
export async function loadPost(postId: string) {
  return opsClient().fetch(
    `coalesce(*[_id == $draft][0], *[_id == $id][0]){ _id, title, "slug": slug.current, previewText, articleHtml, readingMinutes, date, "author": author->name }`,
    { draft: `drafts.${postId}`, id: postId }
  );
}
