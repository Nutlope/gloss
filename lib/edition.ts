/**
 * A monthly edition: the texts a reader saved in one month, set as a 6 × 9
 * inch paperback with their highlights and notes, printed and posted by Lulu.
 * Shared by the client (the book you leaf through before ordering) and the
 * server (the press): no React, no store, no fetches.
 */

import { blockText, type Block } from "./article";
import type { TopicKey } from "./library";
import type { Marker } from "./settings";
import type { Point } from "./store";

/** What every edition is: one trim, one paper, one price, shipping included. */
export const PRINT = {
  /** Inches. */
  trim: { w: 6, h: 9 },
  bleed: 0.125,
  /** Pages per inch of 60# paper, for the width of the spine. */
  ppi: 444,
  /** 6 × 9, full colour, standard quality, perfect bound, 60# uncoated white, matte cover. */
  pod: "0600X0900.FC.STD.PB.060UW444.MXX",
  /** Lulu binds nothing thinner; shorter editions end in pages ruled for notes. */
  minPages: 32,
  /**
   * The most $25 pays for. Lulu charges about $1.99 a book plus 4.4¢ a page in colour,
   * $5.69 to post it tracked in the US and 75¢ to pack it, then sales tax; Stripe takes
   * 2.9% and 30¢. At 300 pages that leaves a little over for the odd reprint.
   */
  maxPages: 300,
  priceCents: 2500,
  /** USPS through Lulu, tracked: 11 to 14 business days once printed. */
  shipping: "MAIL",
  arrives: "in about three weeks",
} as const;

export const price = (cents = PRINT.priceCents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** The width of the spine for a page count, in inches: Lulu's own formula. */
export const spineInches = (pages: number) => pages / PRINT.ppi + 0.06;

/** Below this, the spine is too narrow to carry its title. */
export const SPINE_TEXT_PAGES = 80;

/* ---------- what goes to press ---------- */

/** One highlight as it prints: where it runs, its ink, and the reader's note on it. */
export type PrintMark = { start: Point; end: Point; color?: Marker; note?: string };

/** One text as it goes to press: the words, and the reader's marks on them. */
export type PrintText = {
  id: string;
  title: string;
  author?: string;
  source?: string;
  sourceUrl?: string;
  published?: string;
  topic: TopicKey;
  addedAt: number;
  blocks: Block[];
  marks: PrintMark[];
  /**
   * The text's own cover, printed on the page facing its opening: a bundled
   * classic's ("/library/covers/...") or one painted for it (a JPEG data URI).
   */
  plate?: string;
};

/** What the cover says: written by the model from the month's titles. */
export type CoverCopy = {
  /** The edition's subtitle, under the masthead: "On attention, machines and the deep sea". */
  theme: string;
  /** Two or three cover lines, each pointing at a text inside. */
  lines: string[];
  /** The painting, in words, for the painter. */
  scene: string;
  /** The topic whose inks the cover is printed in. */
  topic: TopicKey;
};

/** Everything the press needs for one edition. `art` is the painted cover, a base64 JPEG. */
export type EditionInput = {
  month: string;
  name: string;
  copy: CoverCopy;
  art?: string;
  texts: PrintText[];
};

/* ---------- where an order is ---------- */

export type EditionStatus =
  /** Made, waiting to be paid for. */
  | "draft"
  /** Paid; the press has not started. */
  | "paid"
  /** Setting the type and the cover. */
  | "setting"
  /** With the printer, before production starts. */
  | "sent"
  | "printing"
  | "shipped"
  | "delivered"
  | "failed"
  | "canceled";

/** One order as the reader sees it. */
export type EditionOrder = {
  id: string;
  month: string;
  name: string;
  status: EditionStatus;
  pages: number | null;
  texts: number;
  createdAt: string;
  /** A test order: paid with no card, never sent to a printer. */
  test: boolean;
  tracking?: { url?: string; carrier?: string; id?: string } | null;
  /** The files the printer was sent, for a test order or a reader who wants to see them. */
  files?: { interior?: string; cover?: string } | null;
  error?: string | null;
  arrival?: { min?: string; max?: string } | null;
};

export const SHIPPED: EditionStatus[] = ["shipped", "delivered"];
export const DONE: EditionStatus[] = ["shipped", "delivered", "failed", "canceled"];

/* ---------- months ---------- */

/** "2026-10" for a moment, in the reader's own time zone. */
export function monthOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function monthName(month: string, opts: { year?: boolean } = {}): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "long", ...(opts.year === false ? {} : { year: "numeric" }) });
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(y, m - 1 + by, 15).getTime());
}

/* ---------- names ---------- */

/** A first name fit for a cover: letters, a hyphen or an apostrophe, and not too long. */
export function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[^\p{L}\p{M}' -]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22);
}

export const editionTitle = (name: string) => (name ? `The ${name} Edition` : "Your Edition");

/* ---------- how long it runs ---------- */

/**
 * Words on a full page of body text: Newsreader at 10.5 on 14.6 points, a
 * 4.5 inch measure, 34 lines. Measured against the press, not guessed.
 */
export const WORDS_PER_PAGE = 380;

export type TextSize = { words: number; figures: number; tables: number; code: number; plate: boolean };

export function sizeOf(blocks: Block[], plate = false): TextSize {
  let words = 0, figures = 0, tables = 0, code = 0;
  for (const b of blocks) {
    if (b.type === "figure") figures++;
    else if (b.type === "table") tables += (b.rows?.length ?? 0);
    else if (b.type === "pre") code += blockText(b).split("\n").length;
    else words += blockText(b).split(/\s+/).filter(Boolean).length;
  }
  return { words, figures, tables, code, plate };
}

/** Pages one text takes, its opening page and the blank before it included. */
export function textPages(s: TextSize): number {
  const body = s.words / WORDS_PER_PAGE + s.figures * 0.42 + s.tables / 30 + s.code / 52;
  // The opener's title takes the top of the first page. A text opens on a right-hand page: with its
  // plate facing it, which half the time needs a blank before; without one, half the time a blank.
  return body + 0.38 + (s.plate ? 1.5 : 0.5);
}

/** Front matter (half title, title, colophon, contents), the sources at the back, padded to what Lulu binds. */
export function estimatePages(sizes: TextSize[]): number {
  const contents = Math.max(1, Math.ceil(sizes.length / 16));
  const front = 4 + contents + (contents % 2);
  const back = 1 + Math.ceil(sizes.length / 18);
  const total = front + sizes.reduce((n, s) => n + textPages(s), 0) + back;
  return evenPages(Math.max(PRINT.minPages, Math.ceil(total)));
}

export const evenPages = (n: number) => n + (n % 2);

/* ---------- the order a book runs in ---------- */

/** By subject, the subject with the most pieces first; within one, in the order they were saved. */
export function arrange<T extends { topic: TopicKey; addedAt: number }>(texts: T[]): T[] {
  const count = new Map<TopicKey, number>();
  const first = new Map<TopicKey, number>();
  for (const t of texts) {
    count.set(t.topic, (count.get(t.topic) ?? 0) + 1);
    first.set(t.topic, Math.min(first.get(t.topic) ?? Infinity, t.addedAt));
  }
  return [...texts].sort((a, b) => count.get(b.topic)! - count.get(a.topic)! || first.get(a.topic)! - first.get(b.topic)! || a.addedAt - b.addedAt);
}
