/** The document model. Shared by server (import) and client (reader). */

import { texToText } from "./tex";

export type Run = { text: string; em?: boolean; strong?: boolean; code?: boolean; href?: string };

export type BlockType = "p" | "h2" | "h3" | "quote" | "li" | "pre" | "note" | "figure" | "table";

/**
 * Figures carry an image by its original URL (never a copy), with the caption
 * as their runs. Tables carry their cells; their runs are empty, so nothing in
 * a table can be anchored, but the model still reads it (see modelText).
 */
export type Block = {
  id: string;
  type: BlockType;
  runs: Run[];
  src?: string;
  alt?: string;
  rows?: string[][];
  head?: boolean;
  /** The PDF page it came from, so one page can be read again and swapped in alone. */
  page?: number;
};

export type Article = {
  id: string;
  title: string;
  author?: string;
  published?: string;
  dek?: string;
  source?: string;
  sourceUrl?: string;
  blocks: Block[];
  /** The page's own lead picture (og:image), by its original URL: the library shows it on the cover. */
  image?: string;
  /** Where it came from: the bundled shelf, a link, pasted text, or a file. */
  origin?: "sample" | "url" | "paste" | "file";
  /** Saved as a link to look at later: the page had too little text to read here, so this is a placeholder that points back out. */
  bookmark?: boolean;
  /** PDF pages that looked hard (columns, tables, maths) and wait to be read again by a vision model (lib/upgrade.ts). */
  upgrade?: number[];
  addedAt?: number;
};

export type BriefData = {
  gist: string;
  claims: { text: string; cite: number }[];
  /** What to keep in mind before relying on it. Briefs written before caveats existed have none. */
  caveats?: { text: string; cite: number }[];
  sections: { title: string; start: number }[];
};

export const blockText = (b: Block) => b.runs.map((r) => r.text).join("");

export const isHeading = (b: Block) => b.type === "h2" || b.type === "h3";

/** What the model reads for a block: a table as pipe-separated rows, anything else as its text. */
export function modelText(b: Block): string {
  if (b.type === "table" && b.rows) return b.rows.map((r) => r.join(" | ")).join("\n");
  return blockText(b);
}

/**
 * Paragraph numbers, the shared address system between reader and model.
 * Headings and pictures are not numbered; everything else is, in reading order.
 */
export function numberBlocks(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const b of blocks) if (!isHeading(b) && b.type !== "figure") map.set(b.id, ++n);
  return map;
}

export function wordCount(a: Article): number {
  let w = 0;
  for (const b of a.blocks) w += blockText(b).split(/\s+/).filter(Boolean).length;
  return w;
}

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 230));

/** Normalize model or source text so no em or en dash ever reaches the page. */
export function undash(s: string): string {
  return s
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2")
    .replace(/\s*\u2014\s*/g, " - ")
    .replace(/\s+\u2013\s+/g, " - ")
    .replace(/\u2013/g, "-");
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "over", "the", "to", "up", "via", "vs", "with"]);

/** True for text that is mostly capitals, like a PDF title or a shouting headline. */
export function isShouting(s: string): boolean {
  const letters = s.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z\u00C0-\u00DE]/g, "").length;
  return upper / letters.length > 0.72;
}

/** Title case that leaves the small words small. Keeps string length, so anchors stay valid. */
export function titleCase(s: string): string {
  let i = 0;
  return s.toLowerCase().replace(/[A-Za-z\u00C0-\u024F][^\s-]*/g, (w) => {
    const first = i++ === 0;
    if (!first && SMALL_WORDS.has(w.replace(/[^a-z]/g, ""))) return w;
    return w[0].toUpperCase() + w.slice(1);
  });
}

/** Display form of a title or heading: shouting text is brought down to title case. */
export function tidyTitle(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return isShouting(t) ? titleCase(t) : t;
}

/** A display size for the reader's title that keeps long titles from towering. */
export function titleClass(title: string): string {
  const n = title.length;
  if (n <= 26) return "text-[clamp(2.6rem,6.4vw,4.3rem)] leading-[1.02]";
  if (n <= 50) return "text-[clamp(2.3rem,5vw,3.4rem)] leading-[1.06]";
  if (n <= 90) return "text-[clamp(2rem,3.8vw,2.7rem)] leading-[1.1]";
  return "text-[clamp(1.7rem,3vw,2.2rem)] leading-[1.14]";
}

/** Shouting headings inside a document, normalized for display without changing offsets. */
export function displayArticle(a: Article): Article {
  let changed = false;
  const blocks = a.blocks.map((b) => {
    if (!isHeading(b) || !isShouting(blockText(b))) return b;
    changed = true;
    return { ...b, runs: b.runs.map((r) => ({ ...r, text: titleCase(r.text) })) };
  });
  const title = tidyTitle(a.title);
  if (!changed && title === a.title) return a;
  return { ...a, title, blocks };
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48) || "untitled"
  );
}

/** Plain text (or light Markdown) into blocks. Used for paste and .txt/.md files. */
export function textToArticle(input: string, opts: { title?: string; origin: Article["origin"] }): Article {
  const { title, blocks } = parseMarkdown(input, { title: opts.title, takeTitle: true });
  return {
    id: `${slugify(title ?? "pasted")}-${Math.random().toString(36).slice(2, 7)}`,
    title: title ? tidyTitle(title) : "Untitled",
    blocks,
    origin: opts.origin,
    addedAt: Date.now(),
  };
}

/** Markdown into blocks, nothing taken as the title. Used for PDF pages read by a vision model. */
export const markdownBlocks = (md: string): Block[] => parseMarkdown(md, { takeTitle: false }).blocks;

/** A Markdown table: a row of cells, a |---| rule, then more rows. */
function tableOf(chunk: string): Block | null {
  const lines = chunk.split("\n").map((l) => l.trim());
  if (lines.length < 3 || !lines.every((l) => l.startsWith("|")) || !/^\|?\s*:?-{2,}/.test(lines[1])) return null;
  // A cell reads as plain text: emphasis marks dropped, maths between $ signs made readable.
  const cells = (l: string) =>
    l
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((c) =>
        inlineMd(c.trim())
          .map((r) => r.text)
          .join("")
      );
  const rows = [cells(lines[0]), ...lines.slice(2).map(cells)];
  const cols = Math.max(...rows.map((r) => r.length));
  return { id: "", type: "table", runs: [], rows: rows.map((r) => [...r, ...Array(cols - r.length).fill("")]), head: true };
}

function parseMarkdown(input: string, opts: { title?: string; takeTitle: boolean }): { title?: string; blocks: Block[] } {
  const text = undash(input.replace(/\r/g, "")).trim();
  const chunks = text.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  let title = opts.title;
  const blocks: Block[] = [];
  let i = 0;
  const id = () => `b${++i}`;

  for (const raw of chunks) {
    // Images have nothing behind them here; a figure's caption, if any, stays as text.
    const chunk = raw.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "").trim();
    if (!chunk || /^(-{3,}|\*{3,})$/.test(chunk)) continue;
    const h = chunk.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      if (opts.takeTitle && !title && h[1].length === 1) {
        title = unescapeMd(h[2].trim());
        continue;
      }
      blocks.push({ id: id(), type: h[1].length <= 2 ? "h2" : "h3", runs: inlineMd(h[2].trim()) });
      continue;
    }
    const table = tableOf(chunk);
    if (table) {
      blocks.push({ ...table, id: id() });
      continue;
    }
    if (/^([-*+]|\d+\.)\s+/.test(chunk)) {
      for (const line of chunk.split("\n")) {
        const t = line.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim();
        if (t) blocks.push({ id: id(), type: "li", runs: inlineMd(t) });
      }
      continue;
    }
    if (chunk.startsWith(">")) {
      blocks.push({ id: id(), type: "quote", runs: inlineMd(chunk.replace(/^>\s?/gm, "").replace(/\n/g, " ")) });
      continue;
    }
    if (chunk.startsWith("```")) {
      blocks.push({ id: id(), type: "pre", runs: [{ text: chunk.replace(/^```\w*\n?|```$/g, "") }] });
      continue;
    }
    const joined = chunk.replace(/\s*\n\s*/g, " ");
    // A short first line with no terminal punctuation reads as a title.
    if (opts.takeTitle && !title && blocks.length === 0 && joined.length < 120 && !/[.!?]$/.test(joined)) {
      title = unescapeMd(joined);
      continue;
    }
    blocks.push({ id: id(), type: "p", runs: inlineMd(joined) });
  }
  return { title, blocks };
}

/** Markdown's backslash escapes, as plain characters. */
const unescapeMd = (s: string) => s.replace(/\\([\\`*_{}\[\]()#+\-.!|~<>$%&])/g, "$1");

/** Characters that would open emphasis, code or a link, set aside so they read as themselves. */
const shield = (t: string) => t.replace(/[\\`*_{}\[\]()#+\-.!|~<>$%&]/g, (c) => String.fromCharCode(0xe000 + c.charCodeAt(0)));

/**
 * Maths between $ signs (from page readers) as readable text, before anything
 * else: otherwise "$d_k$ ... $q_i$" opens emphasis at the first underscore.
 * Inline maths must not start or end with a space, nor be followed by a digit,
 * so "$5 and $10" stays money.
 */
const MATH = /\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

/** **strong**, *em* / _em_, `code`, [text](url) and $maths$. Deliberately small. */
export function inlineMd(input: string): Run[] {
  const withMaths = input.replace(MATH, (_, display: string | undefined, inline: string | undefined) => shield(texToText(display ?? inline ?? "")));
  // Escaped characters are set aside first, so \\* never opens emphasis, then restored.
  const s = withMaths.replace(/\\([\\`*_{}\[\]()#+\-.!|~<>$%&])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
  const runs: Run[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:[^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    if (m[2]) runs.push({ text: m[2], strong: true });
    else if (m[4]) runs.push({ text: m[4], em: true });
    else if (m[6]) runs.push({ text: m[6], em: true });
    else if (m[8]) runs.push({ text: m[8], code: true });
    else if (m[10]) runs.push({ text: m[10], href: m[11] });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  const restore = (t: string) => t.replace(/[\ue000-\ue0ff]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));
  return (runs.length ? runs : [{ text: s }]).map((r) => ({ ...r, text: restore(r.text) }));
}
