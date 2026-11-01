/**
 * Pages with too little text to read as an article, saved as a link to look
 * at later. Pure and shared: the server decides, the tests check the shape.
 */
import type { Block } from "./article";

/** Too little to read as an article: fewer than two paragraphs, or under `minWords` words. */
export const isTooLittle = (blocks: Block[], minWords = 80): boolean => {
  const words = blocks.reduce((n, b) => n + b.runs.map((r) => r.text).join("").split(/\s+/).filter(Boolean).length, 0);
  return blocks.filter((b) => b.type === "p").length < 2 || words < minWords;
};

export const BOOKMARK_NOTE = "This page has too little text to read as an article in Gloss, so it was saved as a link to look at later. Nothing was lost: the original page is one click away.";

/** The placeholder text a saved link carries: its own description when it has one, the note, and the way back out. */
export function bookmarkBlocks(opts: { dek?: string; url: string }): Block[] {
  const blocks: Block[] = [];
  if (opts.dek?.trim()) blocks.push({ id: "b1", type: "p", runs: [{ text: opts.dek.trim() }] });
  blocks.push({ id: `b${blocks.length + 1}`, type: "p", runs: [{ text: BOOKMARK_NOTE }] });
  blocks.push({ id: `b${blocks.length + 1}`, type: "p", runs: [{ text: "Open the original page", href: opts.url }] });
  return blocks;
}
