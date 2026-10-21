// Splits a rendered English page into the pieces of text a translator sees,
// and writes the translations back into the same HTML.
//
// The unit is a block of running text, not a text node. "Read our <a>case
// study</a> to learn more" is one sentence; translated a fragment at a time it
// comes back in English word order. So any element whose contents are only
// text and inline markup -- a <p>, an <h2>, an <li>, a <button> -- is sent
// whole, with each inline tag swapped for a numbered placeholder:
//
//   Read our <1>case study</1> to learn more
//
// The translator moves the placeholders to wherever the phrase lands in the
// target language, and they are swapped back for the original tags -- so the
// href, classes and anything else on them never pass through the model and
// cannot be altered by it. Placeholders are numbered per block, so the same
// sentence linking to two different places is still one translation.
//
// Elements that mix text with block children (a card <a> wrapping <div>s)
// are walked into instead, and any loose text in them is its own unit.
import { parse, type HTMLElement, type Node, type TextNode } from "node-html-parser";

/** Header, footer and nav text: identical on every page, so stored once per language. */
export type Scope = "shared" | "page";

export interface Unit {
  /** The source text with placeholders, whitespace collapsed. Also the lookup key. */
  source: string;
  scope: Scope;
  /** Writes a translation of `source` into the page. Returns false if it was rejected. */
  apply: (translated: string) => boolean;
}

/** Never translated, contents included. */
const SKIP = new Set(["script", "style", "noscript", "template", "textarea", "pre", "code", "svg", "math", "head"]);

/** Inline tags whose text is part of the surrounding sentence. */
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "data", "del", "dfn", "em", "font", "i", "ins",
  "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var",
]);

/** Inline but opaque: kept as one self-closing placeholder, contents untouched. */
const ATOMIC = new Set(["br", "wbr", "img", "picture", "svg", "code", "input", "video", "audio", "iframe", "math", "kbd"]);

const ATTRIBUTES = ["alt", "title", "placeholder", "aria-label"];

const HAS_LETTER = /\p{L}/u;

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isText = (node: Node): node is TextNode => node.nodeType === 3;
const tag = (el: HTMLElement) => (el.rawTagName || "").toLowerCase();

function skipped(el: HTMLElement): boolean {
  return (
    SKIP.has(tag(el)) ||
    el.getAttribute("translate") === "no" ||
    el.hasAttribute("data-no-translate") ||
    el.classList?.contains("notranslate")
  );
}

/** True if every descendant is text or inline markup that can be sent as one sentence. */
function inlineOnly(el: HTMLElement): boolean {
  return el.childNodes.every((child) => {
    if (isText(child)) return true;
    if (!isElement(child)) return true; // comments
    const t = tag(child);
    if (ATOMIC.has(t)) return true;
    return INLINE.has(t) && !skipped(child) && inlineOnly(child);
  });
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const openTag = (el: HTMLElement) => `<${el.rawTagName}${el.rawAttrs ? " " + el.rawAttrs : ""}>`;

/** Turns an inline-only element's contents into placeholder text plus the map back. */
function encode(el: HTMLElement) {
  const tags: { open: string; close: string; atomic?: string }[] = [];
  const walk = (node: HTMLElement): string =>
    node.childNodes
      .map((child) => {
        if (isText(child)) return child.rawText;
        if (!isElement(child)) return "";
        const n = tags.length + 1;
        if (ATOMIC.has(tag(child)) || skipped(child)) {
          tags.push({ open: "", close: "", atomic: child.toString() });
          return `<${n}/>`;
        }
        tags.push({ open: openTag(child), close: `</${child.rawTagName}>` });
        return `<${n}>${walk(child)}</${n}>`;
      })
      .join("");
  return { text: walk(el), tags };
}

function decode(translated: string, tags: ReturnType<typeof encode>["tags"]): string | null {
  // Every placeholder must come back exactly once, or the markup would be lost
  // or duplicated -- reject the translation and keep the English instead.
  const found = [...translated.matchAll(/<(\/?)(\d+)(\/?)>/g)].map((m) => `${m[1]}${m[2]}${m[3]}`);
  const expected = tags.flatMap((t, i) => (t.atomic !== undefined ? [`${i + 1}/`] : [`${i + 1}`, `/${i + 1}`]));
  if (found.length !== expected.length || !expected.every((p) => found.includes(p))) return null;
  return translated.replace(/<(\/?)(\d+)(\/?)>/g, (_, close, num, selfClose) => {
    const t = tags[Number(num) - 1];
    if (selfClose) return t.atomic ?? "";
    return close ? t.close : t.open;
  });
}

/** Keeps the whitespace the original had around its text, so inline spacing survives. */
function edges(raw: string) {
  return { lead: raw.match(/^\s*/)![0], trail: raw.match(/\s*$/)![0] };
}

export interface ParsedPage {
  root: HTMLElement;
  units: Unit[];
}

export function segmentPage(html: string): ParsedPage {
  const root = parse(html, {
    comment: true,
    blockTextElements: { script: true, noscript: true, style: true, pre: true },
  });
  const units: Unit[] = [];

  const visit = (el: HTMLElement, scope: Scope) => {
    if (skipped(el)) return;
    const t = tag(el);
    if (t === "header" || t === "footer" || t === "nav") scope = "shared";

    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value && HAS_LETTER.test(value)) {
        units.push({
          source: collapse(value),
          scope,
          apply: (tr) => (el.setAttribute(name, tr), true),
        });
      }
    }
    const type = el.getAttribute("type");
    if (t === "input" && (type === "submit" || type === "button")) {
      const value = el.getAttribute("value");
      if (value && HAS_LETTER.test(value)) {
        units.push({ source: collapse(value), scope, apply: (tr) => (el.setAttribute("value", tr), true) });
      }
    }

    const hasOwnText = HAS_LETTER.test(el.text);
    if (t !== "body" && t !== "html" && hasOwnText && el.childNodes.length && inlineOnly(el)) {
      const { text, tags } = encode(el);
      const source = collapse(text);
      if (HAS_LETTER.test(source.replace(/<\/?\d+\/?>/g, ""))) {
        const { lead, trail } = edges(text);
        units.push({
          source,
          scope,
          apply: (tr) => {
            const restored = decode(tr, tags);
            if (restored === null) return false;
            el.innerHTML = lead + restored + trail;
            return true;
          },
        });
      }
      // Attributes on inline children (an <img alt> inside a link) still need
      // translating; their text is already covered by the block above.
      for (const child of el.querySelectorAll("[alt],[title],[aria-label],[placeholder]")) {
        for (const name of ATTRIBUTES) {
          const value = child.getAttribute(name);
          if (value && HAS_LETTER.test(value)) {
            units.push({ source: collapse(value), scope, apply: (tr) => (child.setAttribute(name, tr), true) });
          }
        }
      }
      return;
    }

    for (const child of el.childNodes) {
      if (isElement(child)) visit(child, scope);
      else if (isText(child) && HAS_LETTER.test(child.rawText)) {
        const { lead, trail } = edges(child.rawText);
        units.push({
          source: collapse(child.rawText),
          scope,
          apply: (tr) => ((child.rawText = lead + tr + trail), true),
        });
      }
    }
  };

  // <head>: the title and the descriptions search engines and share cards show.
  const head = root.querySelector("head");
  if (head) {
    const title = head.querySelector("title");
    if (title && HAS_LETTER.test(title.text)) {
      units.push({ source: collapse(title.innerHTML), scope: "page", apply: (tr) => ((title.innerHTML = tr), true) });
    }
    const metas = head.querySelectorAll(
      'meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]'
    );
    for (const meta of metas) {
      const content = meta.getAttribute("content");
      if (content && HAS_LETTER.test(content)) {
        units.push({ source: collapse(content), scope: "page", apply: (tr) => (meta.setAttribute("content", tr), true) });
      }
    }
  }

  const body = root.querySelector("body");
  if (body) visit(body, "page");

  return { root, units };
}
