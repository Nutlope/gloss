/**
 * An edition's cover, on the server. The fast model reads the month's titles
 * and writes what a magazine's art director would: a subtitle for the issue,
 * three cover lines, and one scene that ties the month together. FLUX.2 then
 * paints that scene at print size, in the inks of the month's main subject,
 * leaving the top of the picture open for the masthead.
 */

import { undash } from "./article";
import type { CoverCopy } from "./edition";
import { isTopic, TOPIC, TOPICS, type TopicKey } from "./library";
import { APP_UA, completeJSON, DEFAULT_MODEL } from "./together";

export type CoverTitle = { title: string; topic: TopicKey; tags?: string[] };

const SYSTEM = `You are the art director of a small printed magazine made for one reader: each month's edition gathers the texts they saved that month.

From the month's titles, write the cover:
- theme: the edition's subtitle, under the masthead. Six to nine words that name what the month was about, in sentence case, like "On doing great work, and the machines learning to help". No colon, no quotation marks, no dashes.
- lines: three cover lines, each pointing at a different text inside, two to six words, in the voice of a good magazine cover: "Hamming on the hard problems", "Why the bitter lesson keeps winning". No dashes.
- scene: one picture for the cover that ties the month's main ideas together in a single visual metaphor: a place, objects, perhaps a figure seen from a distance. Under 45 words. Tall portrait composition, with the upper third left open (sky, a wall, empty paper) for the masthead. No text, letters, numbers, logos, flags or screens with writing. No real people's likenesses.
- topic: the key of the subject whose inks suit the month best, from: ${TOPICS.filter((t) => t.key !== "unsorted")
  .map((t) => t.key)
  .join(", ")}.

Reply with JSON only: {"theme": "...", "lines": ["...", "...", "..."], "scene": "...", "topic": "<key>"}`;

const clean = (s: unknown, max: number) => (typeof s === "string" ? undash(s).replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The subject with the most texts: the inks when the model doesn't pick. */
export function mainTopic(titles: CoverTitle[]): TopicKey {
  const n = new Map<TopicKey, number>();
  for (const t of titles) if (t.topic !== "unsorted") n.set(t.topic, (n.get(t.topic) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "living";
}

export async function writeCover(input: { month: string; titles: CoverTitle[] }, opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<{ ok: true; copy: CoverCopy; usd: number } | { ok: false; error: string }> {
  const list = input.titles
    .slice(0, 60)
    .map((t) => `- ${t.title} [${TOPIC[t.topic].name}${t.tags?.length ? `; ${t.tags.slice(0, 3).join(", ")}` : ""}]`)
    .join("\n");
  const r = await completeJSON<{ theme?: unknown; lines?: unknown; scene?: unknown; topic?: unknown }>({
    model: DEFAULT_MODEL,
    apiKey: opts.apiKey,
    signal: opts.signal,
    maxTokens: 400,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `The month: ${input.month}\nThe texts saved:\n${list}` },
    ],
  });
  if (!r.ok) return r;
  const lines = (Array.isArray(r.data.lines) ? r.data.lines : []).map((l) => clean(l, 48)).filter(Boolean).slice(0, 3);
  const copy: CoverCopy = {
    theme: clean(r.data.theme, 90),
    lines,
    scene: clean(r.data.scene, 320),
    topic: isTopic(r.data.topic) && r.data.topic !== "unsorted" ? r.data.topic : mainTopic(input.titles),
  };
  if (!copy.scene) return { ok: false, error: "The cover came back without a picture to paint." };
  return { ok: true, copy, usd: r.usage.costUsd };
}

const MODEL = "black-forest-labs/FLUX.2-dev";
/** 2:3, the shape of the page: about 210 dots an inch across a 6 inch cover. */
const SIZE = { width: 1280, height: 1920 };
/** FLUX.2 [dev] at 2.5 megapixels, on the high side, charged to the free allowance. */
export const EDITION_COVER_USD = 0.06;

export async function paintEditionCover(copy: CoverCopy, opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<{ ok: true; jpeg: Uint8Array } | { ok: false; error: string }> {
  const apiKey = opts.apiKey?.trim() || process.env.TOGETHER_API_KEY;
  if (!apiKey) return { ok: false, error: "No Together API key." };
  const prompt = `Illustrated magazine cover, risograph print. ${copy.scene.replace(/\.?$/, ".")} Tall portrait composition; the upper third is calm open space, plain sky or empty paper, for a masthead. Two-colour palette of ${TOPIC[copy.topic].inks} ink on warm cream paper, grain and halftone texture, mid-century editorial illustration, full bleed, wordless, no lettering, no text, no border, no frame.`;
  let res: Response;
  try {
    res = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
      body: JSON.stringify({ model: MODEL, prompt, ...SIZE, n: 1, response_format: "base64", output_format: "jpeg", prompt_upsampling: false }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Together: ${String(e)}` };
  }
  const j = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const b64 = j.data?.[0]?.b64_json;
  if (!res.ok || !b64) return { ok: false, error: j.error?.message ?? `Together answered ${res.status}.` };
  return { ok: true, jpeg: Uint8Array.from(Buffer.from(b64, "base64")) };
}
