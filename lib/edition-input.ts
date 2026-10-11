/**
 * An edition as a browser sends it to press, checked field by field: the
 * texts and marks are the reader's own, but nothing reaches the press, the
 * database or a fetch without being the right shape and a sane size.
 */

import type { Block, BlockType, Run } from "./article";
import { cleanName, estimatePages, isMonth, PRINT, sizeOf, type CoverCopy, type EditionInput, type PrintMark, type PrintText } from "./edition";
import { isTopic } from "./library";
import { MARKERS, type Marker } from "./settings";

const TYPES = new Set<BlockType>(["p", "h2", "h3", "quote", "li", "pre", "note", "figure", "table"]);
const MARKER = new Set<string>(MARKERS.map((m) => m.key));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const http = (v: unknown, max = 2000) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v.slice(0, max) : undefined);
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function run(v: unknown): Run | null {
  const r = obj(v);
  const text = str(r.text, 40_000);
  if (text === undefined) return null;
  return { text, em: r.em === true || undefined, strong: r.strong === true || undefined, code: r.code === true || undefined };
}

function block(v: unknown): Block | null {
  const b = obj(v);
  const id = str(b.id, 64);
  if (!id || !TYPES.has(b.type as BlockType)) return null;
  const out: Block = { id, type: b.type as BlockType, runs: arr(b.runs, 400).map(run).filter((r): r is Run => Boolean(r)) };
  if (out.type === "figure") {
    out.src = http(b.src);
    out.alt = str(b.alt, 400);
  }
  if (out.type === "table") {
    out.rows = arr(b.rows, 120).map((r) => arr(r, 24).map((c) => str(c, 2000) ?? ""));
    out.head = b.head === true;
  }
  return out;
}

function mark(v: unknown): PrintMark | null {
  const m = obj(v);
  const point = (p: unknown) => {
    const x = obj(p);
    const b = str(x.b, 64);
    return b && Number.isInteger(x.o) && (x.o as number) >= 0 ? { b, o: x.o as number } : null;
  };
  const start = point(m.start), end = point(m.end);
  if (!start || !end) return null;
  return { start, end, color: MARKER.has(m.color as string) ? (m.color as Marker) : undefined, note: str(m.note, 2000)?.trim() || undefined };
}

const PLATE = /^(\/library\/covers\/[\w-]+\.webp|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]{100,600000})$/;

function text(v: unknown): PrintText | null {
  const t = obj(v);
  const id = str(t.id, 128);
  const title = str(t.title, 300)?.trim();
  if (!id || !title || !isTopic(t.topic)) return null;
  const blocks = arr(t.blocks, 6000).map(block).filter((b): b is Block => Boolean(b));
  if (!blocks.length) return null;
  return {
    id,
    title,
    author: str(t.author, 200)?.trim() || undefined,
    source: str(t.source, 300) || undefined,
    sourceUrl: http(t.sourceUrl, 1000),
    published: str(t.published, 40) || undefined,
    topic: t.topic,
    addedAt: typeof t.addedAt === "number" && Number.isFinite(t.addedAt) ? t.addedAt : 0,
    blocks,
    marks: arr(t.marks, 3000).map(mark).filter((m): m is PrintMark => Boolean(m)),
    plate: typeof t.plate === "string" && PLATE.test(t.plate) ? t.plate : undefined,
  };
}

/** The cover's words: the model's, possibly edited, kept short. */
function copy(v: unknown, fallback: PrintText[]): CoverCopy {
  const c = obj(v);
  return {
    theme: str(c.theme, 120)?.trim() ?? "",
    lines: arr(c.lines, 3).map((l) => str(l, 60)?.trim() ?? "").filter(Boolean),
    scene: str(c.scene, 400)?.trim() ?? "",
    topic: isTopic(c.topic) ? c.topic : (fallback[0]?.topic ?? "living"),
  };
}

export function parseEdition(body: unknown): { ok: true; input: EditionInput } | { ok: false; error: string } {
  const b = obj(body);
  if (!isMonth(b.month)) return { ok: false, error: "Which month is this edition?" };
  const texts = arr(b.texts, 80).map(text).filter((t): t is PrintText => Boolean(t));
  if (texts.length < 1) return { ok: false, error: "There is nothing in this edition to print." };
  const pages = estimatePages(texts.map((t) => sizeOf(t.blocks, Boolean(t.plate))));
  // A little room over the cap: the estimate is an estimate, and the reader saw it in the same terms.
  if (pages > PRINT.maxPages + 12) return { ok: false, error: `That runs to about ${pages} pages. An edition prints up to ${PRINT.maxPages}: leave a long one out.` };
  const art = typeof b.art === "string" && /^\/9j\/[A-Za-z0-9+/=]+$/.test(b.art) && b.art.length < 4_000_000 ? b.art : undefined;
  return { ok: true, input: { month: b.month, name: cleanName(b.name), copy: copy(b.copy, texts), art, texts } };
}
