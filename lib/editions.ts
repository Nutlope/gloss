"use client";

/**
 * A month's edition in the browser: which texts it gathers, with their words
 * and your marks from this device (or the account, for a text never opened
 * here), the cover painted for it and kept here, and the orders placed from
 * this browser.
 */

import { blockText, tidyTitle } from "./article";
import { readApiKey } from "./ask";
import { paintedUrl } from "./covers";
import { monthOf, sizeOf, type CoverCopy, type EditionInput, type EditionOrder, type PrintMark, type PrintText, type TextSize } from "./edition";
import { TOPIC, topicOf, type TopicKey } from "./library";
import type { PodEvent, PodPiece, PodScript } from "./podcast";
import { loadDoc, useStore, type LibraryItem } from "./store";
import { fetchText } from "./sync";

/** One text in the month: its words when this device has them, how long it runs, your marks on it. */
export type Pick = {
  item: LibraryItem;
  text: PrintText | null;
  size: TextSize;
  marks: number;
  notes: number;
  /** Its own cover for the list and the plate page: a bundled path or a painted one's object URL. */
  thumb?: string;
};

/** Months with something saved in them, newest first. */
export function monthsOf(library: LibraryItem[]): string[] {
  return [...new Set(library.filter((x) => x.origin !== "sample").map((x) => monthOf(x.addedAt)))].sort().reverse();
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Everything saved in a month, ready for press. */
export async function gather(month: string): Promise<Pick[]> {
  const st = useStore.getState();
  const items = st.library.filter((x) => x.origin !== "sample" && monthOf(x.addedAt) === month).sort((a, b) => a.addedAt - b.addedAt);
  return Promise.all(
    items.map(async (item): Promise<Pick> => {
      const doc = (await loadDoc(item.id)) ?? (await fetchText(item.id));
      const marks = st.highlights[item.id] ?? [];
      let plate: string | undefined;
      let thumb: string | undefined;
      if (item.cover?.startsWith("/library/covers/")) plate = thumb = item.cover;
      else if (item.cover === "painted") {
        thumb = (await paintedUrl(item.id)) ?? undefined;
        if (thumb) plate = await asDataUrl(await (await fetch(thumb)).blob()).catch(() => undefined);
      }
      const text: PrintText | null = doc
        ? {
            id: item.id,
            title: tidyTitle(item.title || doc.title),
            author: item.author ?? doc.author,
            source: item.source ?? doc.source,
            sourceUrl: item.sourceUrl ?? doc.sourceUrl,
            published: doc.published ?? (item.year ? String(item.year) : undefined),
            topic: topicOf(item.topic),
            addedAt: item.addedAt,
            blocks: doc.blocks,
            marks: marks.map((h) => ({ start: h.anchor.start, end: h.anchor.end, color: h.color, note: h.note })),
            plate,
          }
        : null;
      const size = doc ? sizeOf(doc.blocks, Boolean(plate)) : { words: item.words, figures: 0, tables: 0, code: 0, plate: false };
      return { item, text, size, marks: marks.length, notes: marks.filter((h) => h.note?.trim()).length, thumb };
    })
  );
}

/* ---------- the cover ---------- */

/** A cover kept for a month: its words, and the painting as a base64 JPEG. */
export type KeptCover = { copy: CoverCopy; art: string | null; at: number };

/** Covers and podcasts each in a database of their own, so adding one never waits on a tab holding the other open. */
type Store = "covers" | "podcasts";
const DBS: Record<Store, string> = { covers: "gloss-editions", podcasts: "gloss-podcasts" };
const opening = new Map<Store, Promise<IDBDatabase>>();
function idb(store: Store): Promise<IDBDatabase> {
  let p = opening.get(store);
  if (!p) {
    p = new Promise((resolve, reject) => {
      // No version asked for: whatever is there opens as it is, and a new database starts at 1 with its store.
      const req = indexedDB.open(DBS[store]);
      req.onupgradeneeded = () => req.result.createObjectStore(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    opening.set(store, p);
  }
  return p;
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store: Store = "covers"): Promise<T | null> {
  try {
    const db = await idb(store);
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(store, mode).objectStore(store));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

export const keptCover = (month: string) => tx<KeptCover | undefined>("readonly", (s) => s.get(month)).then((c) => c ?? null);
export const keepCover = (month: string, c: KeptCover) => tx("readwrite", (s) => s.put(c, month));

/** The cover's words without the model: the month's subjects, and three of its titles. */
export function plainCopy(picks: Pick[]): CoverCopy {
  const count = new Map<TopicKey, number>();
  for (const p of picks) {
    const t = topicOf(p.item.topic);
    if (t !== "unsorted") count.set(t, (count.get(t) ?? 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const names = top.slice(0, 3).map((k) => (k === "ai" ? TOPIC[k].name : TOPIC[k].name.toLowerCase()));
  const theme = names.length > 1 ? `On ${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.length ? `On ${names[0]}` : "";
  const lines = picks
    .slice()
    .sort((a, b) => b.marks - a.marks || b.size.words - a.size.words)
    .slice(0, 3)
    .map((p) => tidyTitle(p.item.title))
    .map((t) => (t.length > 44 ? `${t.slice(0, 43).replace(/\s+\S*$/, "")}…` : t));
  return { theme, lines, scene: "", topic: top[0] ?? "living" };
}

export type Painted = { ok: true; cover: KeptCover; error?: string } | { ok: false; error: string; needKey?: boolean };

/** Ask for a cover: written from the month's titles and painted. With `copy`, the same words painted again. */
export async function paintCover(month: string, picks: Pick[], copy?: CoverCopy): Promise<Painted> {
  try {
    const res = await fetch("/api/editions/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        titles: picks.map((p) => ({ title: tidyTitle(p.item.title), topic: topicOf(p.item.topic), tags: p.item.tags })),
        copy,
        apiKey: readApiKey() || undefined,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { copy?: CoverCopy; art?: string | null; error?: string; code?: string };
    if (!res.ok || !j.copy) return { ok: false, error: j.error ?? "The cover could not be painted.", needKey: j.code === "need_key" };
    const cover: KeptCover = { copy: j.copy, art: j.art ?? null, at: Date.now() };
    await keepCover(month, cover);
    return { ok: true, cover, error: j.art ? undefined : j.error };
  } catch {
    return { ok: false, error: "Could not reach Gloss. Check your connection." };
  }
}

/* ---------- the podcast ---------- */

/** A month's episode, kept on this device: the script, where each line starts, the audio, and its shape for the waveform. */
export type KeptPodcast = {
  script: PodScript;
  /** Seconds from the start, one for each line. */
  starts: number[];
  seconds: number;
  audio: Blob;
  /** Loudness across the episode, 0 to 1, for the waveform. */
  peaks: number[];
  /** The pieces it talks about, to tell when the book has changed since. */
  ids: string[];
  at: number;
};

export const keptPodcast = (month: string) => tx<KeptPodcast | undefined>("readonly", (s) => s.get(month), "podcasts").then((c) => c ?? null);
export const keepPodcast = (month: string, p: KeptPodcast) => tx("readwrite", (s) => s.put(p, month), "podcasts");

/** The words a highlight covers, across blocks if it runs over more than one. */
function quoteOf(blocks: PrintText["blocks"], m: PrintMark): string {
  const a = blocks.findIndex((b) => b.id === m.start.b);
  const z = blocks.findIndex((b) => b.id === m.end.b);
  if (a < 0 || z < a) return "";
  const parts = blocks.slice(a, z + 1).map((b, i, all) => {
    const t = blockText(b);
    return t.slice(i === 0 ? m.start.o : 0, i === all.length - 1 ? m.end.o : t.length);
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * What the hosts read of each piece, in the book's order: its opening, as much
 * as a month this size leaves room for, and every highlight and note on it.
 */
export function podPieces(texts: PrintText[]): PodPiece[] {
  const budget = Math.max(70, Math.min(320, Math.floor(6000 / Math.max(1, texts.length))));
  return texts.map((t, i) => {
    const words: string[] = [];
    for (const b of t.blocks) {
      if (words.length >= budget) break;
      if (b.type === "p" || b.type === "quote" || b.type === "li" || b.type === "h2" || b.type === "h3") words.push(...blockText(b).split(/\s+/).filter(Boolean));
    }
    const opening = words.slice(0, budget).join(" ") + (words.length > budget ? " …" : "");
    const marks = t.marks
      .map((m) => ({ quote: quoteOf(t.blocks, m).slice(0, 400), note: m.note?.trim() || undefined }))
      .filter((m) => m.quote)
      .slice(0, 8);
    return { n: i + 1, title: t.title, author: t.author, source: t.source, topic: t.topic, words: sizeOf(t.blocks).words, opening, marks };
  });
}

/** Loudness in `n` buckets, from the audio itself: decoded once, at a low rate, so a phone can manage it. */
async function peaksOf(audio: Blob, n = 160): Promise<number[]> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 8000);
    const buf = await ctx.decodeAudioData(await audio.arrayBuffer());
    const data = buf.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / n));
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let j = k * size, end = Math.min(data.length, j + size); j < end; j++) sum += data[j] * data[j];
      out.push(Math.sqrt(sum / size));
    }
    const top = Math.max(...out) || 1;
    return out.map((v) => Math.min(1, Math.sqrt(v / top)));
  } catch {
    return [];
  }
}

export type PodProgress = { stage: "writing" } | { stage: "recording"; done: number; of: number; script: PodScript };
export type Made = { ok: true; podcast: KeptPodcast } | { ok: false; error: string; needKey?: boolean };

/**
 * Have the month's episode made: the script arrives first, then the lines'
 * audio in order, which are joined into one MP3 and kept here.
 */
export async function makePodcast(
  req: { month: string; name: string; texts: PrintText[]; order?: string },
  onProgress: (p: PodProgress) => void,
  signal?: AbortSignal
): Promise<Made> {
  onProgress({ stage: "writing" });
  let res: Response;
  try {
    res = await fetch("/api/editions/podcast", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: req.month, name: req.name, pieces: podPieces(req.texts), order: req.order, apiKey: readApiKey() || undefined }),
    });
  } catch {
    return { ok: false, error: signal?.aborted ? "Stopped." : "Could not reach Gloss. Check your connection." };
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return { ok: false, error: j.error ?? "The podcast could not be made.", needKey: j.code === "need_key" };
  }

  let script: PodScript | null = null;
  const clips: Uint8Array<ArrayBuffer>[] = [];
  const lengths: number[] = [];
  let failed: string | null = null;
  let finished = false;
  const handle = (e: PodEvent) => {
    if (e.type === "script") {
      script = e.script;
      onProgress({ stage: "recording", done: 0, of: e.script.lines.length, script: e.script });
    } else if (e.type === "clip" && script) {
      clips[e.i] = Uint8Array.from(atob(e.b64), (c) => c.charCodeAt(0));
      lengths[e.i] = e.seconds;
      onProgress({ stage: "recording", done: e.i + 1, of: script.lines.length, script });
    } else if (e.type === "error") failed = e.error;
    else if (e.type === "done") finished = true;
  };

  try {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) handle(JSON.parse(line) as PodEvent);
      }
    }
  } catch {
    return { ok: false, error: signal?.aborted ? "Stopped." : "The connection dropped while it was recording. Try again." };
  }
  const s = script as PodScript | null;
  if (failed || !finished || !s || clips.length < s.lines.length) return { ok: false, error: failed ?? "The podcast stopped before the end. Try again." };

  const audio = new Blob(clips, { type: "audio/mpeg" });
  const starts: number[] = [];
  let t = 0;
  for (const l of lengths) {
    starts.push(t);
    t += l;
  }
  const podcast: KeptPodcast = { script: s, starts, seconds: t, audio, peaks: await peaksOf(audio), ids: req.texts.map((x) => x.id), at: Date.now() };
  await keepPodcast(req.month, podcast);
  return { ok: true, podcast };
}

/* ---------- orders ---------- */

const ORDERS = "gloss:editions";

export function orderIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDERS) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberOrder(id: string) {
  try {
    localStorage.setItem(ORDERS, JSON.stringify([id, ...orderIds().filter((x) => x !== id)].slice(0, 24)));
  } catch {}
}

export async function fetchOrders(): Promise<EditionOrder[]> {
  try {
    const res = await fetch(`/api/editions?ids=${orderIds().join(",")}`);
    return res.ok ? ((await res.json()) as { orders: EditionOrder[] }).orders : [];
  } catch {
    return [];
  }
}

export async function fetchOrder(id: string, session?: string | null): Promise<{ order: EditionOrder; art: boolean; copy?: CoverCopy } | null> {
  try {
    const res = await fetch(`/api/editions/${encodeURIComponent(id)}${session ? `?session=${encodeURIComponent(session)}` : ""}`);
    if (!res.ok) return null;
    rememberOrder(id);
    return (await res.json()) as { order: EditionOrder; art: boolean; copy?: CoverCopy };
  } catch {
    return null;
  }
}

export type Placed = { ok: true; id: string; url: string; test?: boolean } | { ok: false; error: string; soon?: boolean };

/** Send an edition to press: gzipped, since a month of texts runs to megabytes. Back comes where to pay. */
export async function placeOrder(input: EditionInput): Promise<Placed> {
  try {
    const raw = new Blob([JSON.stringify(input)]);
    const body = await new Response(raw.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    const res = await fetch("/api/editions", { method: "POST", headers: { "Content-Type": "application/x-gloss-edition" }, body });
    const j = (await res.json().catch(() => ({}))) as { id?: string; url?: string; test?: boolean; error?: string; code?: string };
    if (!res.ok || !j.id || !j.url) return { ok: false, error: j.error ?? "The order could not be placed.", soon: j.code === "soon" };
    rememberOrder(j.id);
    return { ok: true, id: j.id, url: j.url, test: j.test };
  } catch {
    return { ok: false, error: "Could not reach Gloss. Check your connection." };
  }
}
