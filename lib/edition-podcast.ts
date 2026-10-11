/**
 * The month's podcast, on the server. The fast model writes a conversation
 * between two hosts from the month's pieces: how each one opens, and the
 * lines the reader highlighted and the notes they left, which the hosts bring
 * in by name. Cartesia then records it line by line in two voices, and the
 * clips are cut into clean MP3 frames that join end to end with a breath of
 * silence between turns, so the browser can keep one file and know exactly
 * when each line starts.
 */

import { undash } from "./article";
import { isMonth, monthName, cleanName } from "./edition";
import { isTopic, TOPIC } from "./library";
import { podMinutes, SPOKEN_WPM, type PodLine, type PodPiece, type PodRequest, type PodScript, type PodSegment } from "./podcast";
import { APP_UA, completeJSON, DEFAULT_MODEL } from "./together";
import { PODCAST_HOSTS, TTS_MAX_CHARS, TTS_MODEL, TTS_URL } from "./voice";

/* ---------- what the browser sent ---------- */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parsePodRequest(body: unknown): { ok: true; req: PodRequest } | { ok: false; error: string } {
  const b = obj(body);
  if (!isMonth(b.month)) return { ok: false, error: "Which month is this?" };
  const pieces: PodPiece[] = (Array.isArray(b.pieces) ? b.pieces : []).slice(0, 60).flatMap((v, i) => {
    const p = obj(v);
    const title = str(p.title, 200);
    if (!title || !isTopic(p.topic)) return [];
    const marks = (Array.isArray(p.marks) ? p.marks : []).slice(0, 8).flatMap((m) => {
      const quote = str(obj(m).quote, 400);
      return quote ? [{ quote, note: str(obj(m).note, 400) || undefined }] : [];
    });
    return [
      {
        n: Number.isInteger(p.n) ? (p.n as number) : i + 1,
        title,
        author: str(p.author, 120) || undefined,
        source: str(p.source, 120) || undefined,
        topic: p.topic,
        words: typeof p.words === "number" && Number.isFinite(p.words) ? Math.max(0, Math.round(p.words)) : 0,
        opening: str(p.opening, 2400),
        marks,
      },
    ];
  });
  if (!pieces.length) return { ok: false, error: "There is nothing this month to talk about." };
  return { ok: true, req: { month: b.month, name: cleanName(b.name), pieces } };
}

/* ---------- the voices ---------- */

/** A host: the name they go by on air, and the Cartesia voice that speaks for them. */
export type Host = { name: string; voice: string };

export const HOSTS: [Host, Host] = [{ ...PODCAST_HOSTS[0] }, { ...PODCAST_HOSTS[1] }];

/* ---------- the script ---------- */

function system(r: PodRequest, hosts: [Host, Host]): string {
  const [a, b] = hosts.map((h) => h.name);
  const listener = r.name || "the listener";
  const minutes = podMinutes(r.pieces.length);
  const words = minutes * SPOKEN_WPM;
  const marked = r.pieces.filter((p) => p.marks.length).length;
  const thin = r.pieces.length < 3;
  const many = r.pieces.length > 10;
  // Turns, not words, are what a model keeps count of. Its turns run about 20 words (measured 2026-10-11).
  const turns = Math.max(5, Math.min(12, Math.round((words - 200) / Math.min(r.pieces.length, 10) / 20)));
  return `You write a monthly podcast for one listener, ${listener}. ${a} and ${b}, two hosts, talk through the pieces ${listener} saved to read in ${monthName(r.month)}. It goes with ${listener}'s printed edition of the same pieces, in the same order.

The hosts
- ${a} leads: keeps the thread, sets up each piece, warm and exact.
- ${b} pushes back, finds the example, connects one piece to another, and gets the odd laugh.
- They sound like two well read friends who have both just read the same things: easy, specific, sometimes disagreeing. Not radio presenters, not a lecture, no hype.

What makes the show ${listener}'s own
- The highlights and notes. ${marked ? `${marked} of the pieces have some.` : "There are none this month, so lean on the openings."} Quote highlighted lines word for word and say they were marked. Read each note back and answer it, as if ${listener} had said it across the table: agree, push on it, or take it somewhere.
- Talk to ${listener}, not about them: "you highlighted", "your note says", "you underlined this". Use the name now and then, never more than once a segment. Never call ${listener} he, she, him, her, his or hers.

Shape
- Opening segment: start cold, inside the month's most striking idea, said as a claim (never announced as "the most surprising idea"). Then a welcome to ${listener} and the month in a sentence. No "welcome to the show", no "in today's episode".
- One segment for each piece, in the order given${many ? ". There are many pieces: give full segments to the ones with marks or the richest ideas, and fold two or three slighter ones of the same subject into a single segment, listing all their numbers" : ""}. In each: what it argues or tells, the one idea worth keeping, what ${listener} marked, and an honest link to another piece where there is one.
- Closing segment: what the month adds up to, one question for ${listener} to carry into next month, and a short goodbye.

Length: about ${words} words of dialogue in all, roughly ${minutes} minutes. Count turns as you go: ${turns} turns in each piece's segment, 4 or 5 in the opening and in the close. It is a real episode, not a recap.${thin ? ` This was a light month. Say so plainly and keep it brief; never pad it out into a show.` : ""}

How it must sound
- Spoken English: short sentences, contractions, plain words. Each turn one to four sentences; hand over often; no turn over 90 words.
- Not a string of summaries. Every segment needs one live moment, each in its own words: a disagreement, something that surprised one of them, or a question the other has to think about before answering.
- Never repeat a phrase from one segment in another, and never lean on stock lines like "that's the whole piece", "it connects to" or "which we'll get to".
- Only what the openings, highlights and notes support, plus what is widely known about famous authors and works. Never invent a quotation, a fact, or a piece that is not listed.
- No stage directions, sound effects, laughter in brackets, markdown, lists, emoji or dashes. Write it exactly as it is to be said.

Reply with JSON only:
{"title": "the episode's title: three to seven words, no colon, no month or year", "segments": [{"pieces": [], "lines": [{"host": "${a}", "say": "..."}, {"host": "${b}", "say": "..."}]}, {"pieces": [1], "lines": [...]}, ..., {"pieces": [], "lines": [...]}]}
"pieces" lists the numbers of the pieces a segment covers: empty for the opening and the close.`;
}

function material(r: PodRequest): string {
  return r.pieces
    .map((p) => {
      const head = `${p.n}. "${p.title}"${p.author ? ` by ${p.author}` : ""}${p.source ? `, ${p.source}` : ""} [${TOPIC[p.topic].name}, ${p.words.toLocaleString("en-US")} words]`;
      const marks = p.marks.length
        ? `\nMarked by the reader:\n${p.marks.map((m) => `- "${m.quote}"${m.note ? `\n  Their note: ${m.note}` : ""}`).join("\n")}`
        : "\nNo marks.";
      return `${head}\nHow it opens: ${p.opening || "(not available)"}${marks}`;
    })
    .join("\n\n");
}

const tidy = (s: string) =>
  undash(s)
    .replace(/[*_#`]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*(laugh|pause|music|sigh)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

export async function writeScript(r: PodRequest, hosts: [Host, Host], opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<{ ok: true; script: PodScript; usd: number } | { ok: false; error: string }> {
  const names = hosts.map((h) => h.name) as [string, string];
  const w = await completeJSON<{ title?: unknown; segments?: { pieces?: unknown; lines?: { host?: unknown; say?: unknown }[] }[] }>({
    model: DEFAULT_MODEL,
    apiKey: opts.apiKey,
    signal: opts.signal,
    temperature: 0.75,
    maxTokens: 7000,
    messages: [
      { role: "system", content: system(r, hosts) },
      { role: "user", content: `The listener: ${r.name || "(no name given)"}\nThe month: ${monthName(r.month)}\n\nThe pieces, in the book's order:\n\n${material(r)}` },
    ],
  });
  if (!w.ok) return w;

  const known = new Set(r.pieces.map((p) => p.n));
  const titleOf = (n: number) => r.pieces.find((p) => p.n === n)?.title ?? "";
  const segments: PodSegment[] = [];
  const lines: PodLine[] = [];
  const raw = Array.isArray(w.data.segments) ? w.data.segments : [];
  raw.forEach((s, i) => {
    const pieces = (Array.isArray(s.pieces) ? s.pieces : []).map(Number).filter((n) => known.has(n));
    const said = (Array.isArray(s.lines) ? s.lines : []).flatMap((l) => {
      const say = tidy(typeof l.say === "string" ? l.say : "");
      if (!say) return [];
      const who: 0 | 1 = typeof l.host === "string" && l.host.trim().toLowerCase() === names[1].toLowerCase() ? 1 : 0;
      return [{ who, say }];
    });
    if (!said.length) return;
    const title = pieces.length ? `${titleOf(pieces[0])}${pieces.length > 1 ? `, and ${pieces.length - 1} more` : ""}` : i === 0 ? "Opening" : i === raw.length - 1 ? "Before we go" : "Between pieces";
    const seg = segments.push({ title, pieces }) - 1;
    for (const l of said) lines.push({ ...l, seg });
  });
  if (lines.length < 6) return { ok: false, error: "The script came back too short. Try again." };
  return { ok: true, script: { title: tidy(typeof w.data.title === "string" ? w.data.title : "") || `${monthName(r.month)}, talked through`, hosts: names, segments, lines }, usd: w.usage.costUsd };
}

/* ---------- the recording ---------- */

/**
 * Cartesia on Together. Sonic 3 has no published serverless price yet; Sonic 2's
 * is $65 for a million characters, and is what an episode is charged at.
 */
export const VOICE_USD_PER_CHAR = 65 / 1_000_000;
const SAMPLE_RATE = 44100;

/** A long turn, cut at sentence ends to fit one request. */
function pieces(text: string): string[] {
  if (text.length <= TTS_MAX_CHARS) return [text];
  const out: string[] = [];
  let cur = "";
  for (const s of text.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [text]) {
    if (cur && (cur + s).length > TTS_MAX_CHARS) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function speak(text: string, voice: string, apiKey: string, signal?: AbortSignal): Promise<Uint8Array> {
  let last = "";
  // A busy voice gets two more tries: one failed line would otherwise sink the episode.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
    let res: Response;
    try {
      res = await fetch(TTS_URL, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
        body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: "mp3", sample_rate: SAMPLE_RATE, bit_rate: 128000, language: "en" }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      last = "Could not reach the voice.";
      continue;
    }
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (res.status === 401) throw new Error("Together rejected that API key. Check it and try again.");
    last = `The voice answered ${res.status}.`;
    if (res.status < 500 && res.status !== 429) break;
  }
  throw new Error(last || "The voice failed.");
}

/* MP3, just enough of it: find the frames, drop the tags and the encoder's info frame, make silence. */

const KBPS = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

type Frame = { at: number; len: number; samples: number; rate: number };

function frameAt(b: Uint8Array, i: number): Frame | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1] >> 3) & 3; // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
  const layer = (b[i + 1] >> 1) & 3; // 1: Layer III
  const br = b[i + 2] >> 4;
  const ri = (b[i + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || br === 0 || br === 15 || ri === 3) return null;
  const rate = RATES[version][ri];
  const kbps = KBPS[version === 3 ? 1 : 2][br];
  const pad = (b[i + 2] >> 1) & 1;
  const len = Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + pad;
  return { at: i, len, samples: version === 3 ? 1152 : 576, rate };
}

/** The encoder's Xing/Info/VBRI frame: it states one clip's length, and would make a player believe the whole file is that long. */
function isInfo(b: Uint8Array, f: Frame): boolean {
  const tag = (o: number) => String.fromCharCode(...b.subarray(f.at + o, f.at + o + 4));
  for (const o of [13, 21, 36]) if (["Xing", "Info"].includes(tag(o))) return true;
  return tag(36) === "VBRI";
}

/** A clip's audio frames, without its ID3 tags or info frame. */
export function mp3Frames(b: Uint8Array): { frames: Uint8Array[]; seconds: number; header: Uint8Array | null } {
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + (b[5] & 0x10 ? 10 : 0);
  }
  const frames: Uint8Array[] = [];
  let seconds = 0;
  let header: Uint8Array | null = null;
  let first = true;
  while (i < b.length) {
    const f = frameAt(b, i);
    if (!f || f.at + f.len > b.length) {
      i++;
      continue;
    }
    if (!(first && isInfo(b, f))) {
      frames.push(b.subarray(f.at, f.at + f.len));
      seconds += f.samples / f.rate;
      header ??= b.slice(f.at, f.at + 4);
    }
    first = false;
    i = f.at + f.len;
  }
  return { frames, seconds, header };
}

/**
 * Silence, as frames shaped like the clip's own: the same header without
 * padding or a checksum, and every bit after it zero, which decodes to quiet.
 */
export function silence(header: Uint8Array, seconds: number): { bytes: Uint8Array; seconds: number } {
  const h = header.slice();
  h[1] |= 0x01;
  h[2] &= ~0x02;
  const f = frameAt(h, 0);
  if (!f) return { bytes: new Uint8Array(0), seconds: 0 };
  const n = Math.max(1, Math.round((seconds * f.rate) / f.samples));
  const bytes = new Uint8Array(n * f.len);
  for (let k = 0; k < n; k++) bytes.set(h, k * f.len);
  return { bytes, seconds: (n * f.samples) / f.rate };
}

const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** A breath between turns; a longer one where a chapter ends. */
const GAP = { turn: 0.22, chapter: 0.9 };

/**
 * Record the script, a few lines at a time, handing each line's audio over in
 * order as soon as it and every line before it are done.
 */
export async function record(
  script: PodScript,
  hosts: [Host, Host],
  apiKey: string,
  onClip: (i: number, mp3: Uint8Array, seconds: number) => void,
  signal?: AbortSignal
): Promise<{ chars: number }> {
  const lines = script.lines;
  // One line that cannot be recorded stops the others too.
  const stop = new AbortController();
  const quit = () => stop.abort();
  signal?.addEventListener("abort", quit);
  const done = new Map<number, Uint8Array[]>();
  let next = 0;
  let sent = 0;
  let chars = 0;

  const flush = () => {
    while (done.has(sent)) {
      const clips = done.get(sent)!;
      done.delete(sent);
      const parts: Uint8Array[] = [];
      let seconds = 0;
      let header: Uint8Array | null = null;
      for (const c of clips) {
        const m = mp3Frames(c);
        parts.push(...m.frames);
        seconds += m.seconds;
        header ??= m.header;
      }
      const end = sent === lines.length - 1;
      if (header && !end) {
        const gap = silence(header, lines[sent + 1].seg !== lines[sent].seg ? GAP.chapter : GAP.turn);
        parts.push(gap.bytes);
        seconds += gap.seconds;
      }
      onClip(sent, join(parts), seconds);
      sent++;
    }
  };

  const worker = async () => {
    while (next < lines.length) {
      if (stop.signal.aborted) return;
      const i = next++;
      const l = lines[i];
      const clips: Uint8Array[] = [];
      for (const text of pieces(l.say)) {
        clips.push(await speak(text, hosts[l.who].voice, apiKey, stop.signal));
        chars += text.length;
      }
      done.set(i, clips);
      flush();
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(6, lines.length) }, () =>
        worker().catch((e) => {
          stop.abort();
          throw e;
        })
      )
    );
  } finally {
    signal?.removeEventListener("abort", quit);
  }
  if (sent < lines.length) throw new Error("Stopped.");
  return { chars };
}
