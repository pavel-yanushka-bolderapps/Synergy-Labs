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

/** List prices, $ per million input / output tokens. The Batch API is half. */
export const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** At list price; 0 for a model missing from PRICES. */
  usd: number;
}

/** Segments per request: keeps each response well inside max_tokens. */
export const CHUNK_SIZE = 60;

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

// Native digits (Arabic-Indic, Persian, Devanagari) count as the same numbers.
const NATIVE_DIGITS: [number, number][] = [[0x660, 0x669], [0x6f0, 0x6f9], [0x966, 0x96f]];
function digitsOf(text: string): string {
  const out: string[] = [];
  // Placeholders and HTML entities (&#39;) carry digits that are not numbers.
  for (const ch of text.replace(/<\/?\d+\/?>/g, "").replace(/&#?[a-z0-9]+;/gi, "")) {
    if (ch >= "0" && ch <= "9") out.push(ch);
    else {
      const code = ch.codePointAt(0)!;
      const range = NATIVE_DIGITS.find(([lo, hi]) => code >= lo && code <= hi);
      if (range) out.push(String(code - range[0]));
    }
  }
  // Zeros are ignored: "$30K" may come back as "30 000 $".
  return out.filter((d) => d !== "0").sort().join("");
}
const placeholdersOf = (text: string) => [...text.matchAll(/<\/?\d+\/?>/g)].map((m) => m[0]).sort().join("");

/**
 * Whether `translated` can belong to `source`: the same markup placeholders
 * and the same digits. A translation attached to the wrong segment (the model
 * mixing up ids, or results matched to the wrong request) almost always fails
 * one of the two -- and is dropped rather than saved under the wrong English.
 */
export function plausibleTranslation(source: string, translated: string): boolean {
  return placeholdersOf(source) === placeholdersOf(translated) && digitsOf(source) === digitsOf(translated);
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
  let rejected = 0;
  for (const { id, text } of translations) {
    if (segments[id] === undefined || !text.trim()) continue;
    if (plausibleTranslation(segments[id], text)) out.set(segments[id], text);
    else rejected++;
  }
  // Many rejections in one response means the ids drifted: then even the
  // ones that passed may sit on the wrong segment, so keep none of them.
  if (rejected > Math.max(2, segments.length * 0.1)) {
    console.error(`[translate] ${rejected} of ${segments.length} translations did not match their segment; discarding this response.`);
    return new Map();
  }
  if (rejected) console.warn(`[translate] Dropped ${rejected} translation(s) whose markup or numbers did not match the English.`);
  return out;
}

let client: Anthropic | undefined;

/** Translates segments into one language, a chunk per request, chunks in parallel. */
export async function translateSegments(
  segments: string[],
  lang: Language
): Promise<{ translations: Map<string, string>; usage: Usage }> {
  client ??= new Anthropic();
  const chunks: string[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) chunks.push(segments.slice(i, i + CHUNK_SIZE));

  const usage: Usage = { inputTokens: 0, outputTokens: 0, usd: 0 };
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const message = await client!.messages.stream(translationRequest(chunk, lang)).finalMessage();
        // Counted before parsing: a response that cannot be used is still billed.
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
        return parseTranslations(message, chunk);
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) console.error("[translate] Rate limited:", err.message);
        else if (err instanceof Anthropic.APIError) console.error(`[translate] API error ${err.status}:`, err.message);
        else console.error("[translate] Failed:", err);
        return new Map<string, string>();
      }
    })
  );
  const [pin, pout] = PRICES[MODEL] ?? [0, 0];
  usage.usd = (usage.inputTokens * pin + usage.outputTokens * pout) / 1e6;
  return { translations: new Map(results.flatMap((m) => [...m])), usage };
}
