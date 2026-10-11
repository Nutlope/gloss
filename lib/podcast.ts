/**
 * The month as a podcast: two hosts talk through what a reader saved in one
 * month, the same pieces as their printed edition, with their highlights and
 * notes in the conversation. One episode a month, to go with the book.
 * Shared by the browser (which keeps and plays it) and the server (which
 * writes and records it): no React, no fetches.
 */

import type { TopicKey } from "./library";

/** One piece as the hosts read it: how it opens, and what the reader marked in it. */
export type PodPiece = {
  /** Its place in the book, from 1. */
  n: number;
  title: string;
  author?: string;
  source?: string;
  topic: TopicKey;
  words: number;
  /** The first few hundred words. */
  opening: string;
  marks: { quote: string; note?: string }[];
};

/** What the browser sends to have an episode made. */
export type PodRequest = {
  month: string;
  /** The listener's first name, as on the cover. */
  name: string;
  pieces: PodPiece[];
};

/** A chapter: the opening, one or more pieces in the book's order, or the close. */
export type PodSegment = { title: string; pieces: number[] };

/** One turn of the conversation. `who` is the host's index; `seg` the chapter it is in. */
export type PodLine = { who: 0 | 1; say: string; seg: number };

export type PodScript = {
  title: string;
  hosts: [string, string];
  segments: PodSegment[];
  lines: PodLine[];
};

/**
 * What the server streams back, one JSON object a line: the script once it is
 * written, then each line's audio in order, then what it cost.
 */
export type PodEvent =
  | { type: "script"; script: PodScript }
  /** MP3 frames, silence after included; `seconds` is exact, counted from the frames. */
  | { type: "clip"; i: number; b64: string; seconds: number }
  | { type: "done"; usd: number }
  | { type: "error"; error: string; code?: string };

/** About as long as the month deserves: a few minutes for a thin one, never past a quarter of an hour. */
export function podMinutes(pieces: number): number {
  return Math.round(Math.min(14, Math.max(3, 2.5 + pieces * 0.95)));
}

/** Words of dialogue a minute, at the voices' own pace. */
export const SPOKEN_WPM = 155;

/** "11:40" */
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
