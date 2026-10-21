// Machine translation of page segments with Claude.
//
// Used two ways: live, by translatePage.ts when a visitor (or the publish
// webhook) asks for a page with text that has never been translated, and in
// bulk by scripts/translate-site.mjs through the Batch API at half price.
// Both build their requests with `translationRequest` so the prompt and
// output format can never drift apart.
import Anthropic from "@anthropic-ai/sdk";
import type { Language } from "./languages";

/** Overridable without a deploy, e.g. TRANSLATE_MODEL=claude-sonnet-5-5. */
export const MODEL = process.env.TRANSLATE_MODEL || "claude-opus-5-5";

/** Segments per request: keeps each response well inside max_tokens. */
export const CHUNK_SIZE = 120;

const SYSTEM = `You translate the website of Synergy Labs, a mobile app and AI development agency, from English.

Rules:
- Write natural, fluent copy a native marketer in the target language would publish. Keep the meaning, tone and level of formality; do not add or drop information.
- Numbered tags like <1>, </1> and <2/> stand for HTML markup. Keep every one exactly once, in the place where the words they surround land in the translation. Never translate, renumber or remove them.
- Keep unchanged: brand and product names (Synergy Labs, Clutch, Forbes, Google, App Store, iOS, Android, Flutter, React Native and similar), people's names, URLs, email addresses, phone numbers, code, and HTML entities such as &amp;.
- Keep numbers, prices and units as they are, adjusting only the number formatting conventions of the target language.
- A segment that is already in the target language, or is only a name, comes back unchanged.
- Each segment is independent text from the page; translate each one on its own.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, text: { type: "string" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
} as const;

export function translationRequest(segments: string[], lang: Language) {
  const input = segments.map((text, id) => ({ id, text }));
  return {
    model: MODEL,
    max_tokens: 64000,
    // Translation needs little deliberation; low effort keeps it fast and cheap.
    output_config: {
      effort: "low" as const,
      format: { type: "json_schema" as const, schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user" as const,
        content: `Translate each segment's "text" into ${lang.name}. Return every id.\n\n${JSON.stringify(input)}`,
      },
    ],
  };
}

/** Reads a response's JSON back into translations keyed by the source segment. */
export function parseTranslations(message: Anthropic.Message, segments: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (message.stop_reason !== "end_turn") {
    console.error(`[translate] Stopped with ${message.stop_reason}; skipping ${segments.length} segments.`);
    return out;
  }
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const { translations } = JSON.parse(text) as { translations: { id: number; text: string }[] };
  for (const { id, text } of translations) {
    if (segments[id] !== undefined && text.trim()) out.set(segments[id], text);
  }
  return out;
}

let client: Anthropic | undefined;

/** Translates segments into one language, a chunk per request, chunks in parallel. */
export async function translateSegments(segments: string[], lang: Language): Promise<Map<string, string>> {
  client ??= new Anthropic();
  const chunks: string[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) chunks.push(segments.slice(i, i + CHUNK_SIZE));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const message = await client!.messages.stream(translationRequest(chunk, lang)).finalMessage();
        return parseTranslations(message, chunk);
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) console.error("[translate] Rate limited:", err.message);
        else if (err instanceof Anthropic.APIError) console.error(`[translate] API error ${err.status}:`, err.message);
        else console.error("[translate] Failed:", err);
        return new Map<string, string>();
      }
    })
  );
  return new Map(results.flatMap((m) => [...m]));
}
