/**
 * A painted cover for one text, on the server: the scene the classifier
 * wrote, as a two-colour risograph print in its topic's inks. The title is
 * never in the prompt, or the model letters it onto the picture.
 */

import { shelfDef } from "./library";
import { APP_UA } from "./together";

const MODEL = "black-forest-labs/FLUX.2-dev";
const SIZE = 640;
/**
 * What one cover costs, charged to the free allowance. FLUX.2 [dev] at 640px:
 * an estimate on the high side until Together's per-megapixel price is checked.
 */
export const COVER_USD = 0.02;

export async function paintCover(req: { scene: string; topic: string; apiKey?: string; signal?: AbortSignal }): Promise<{ ok: true; jpeg: Uint8Array } | { ok: false; error: string }> {
  const apiKey = req.apiKey?.trim() || process.env.TOGETHER_API_KEY;
  if (!apiKey) return { ok: false, error: "No Together API key." };
  const prompt = `Editorial risograph print. ${req.scene.replace(/\.?$/, ".")} Two-colour palette of ${shelfDef(req.topic).inks} ink on warm cream paper filling the whole image, grain and halftone texture, mid-century book-cover illustration, wordless, no lettering, no border.`;
  let res: Response;
  try {
    res = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
      body: JSON.stringify({ model: MODEL, prompt, width: SIZE, height: SIZE, n: 1, response_format: "base64", prompt_upsampling: false }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Together: ${String(e)}` };
  }
  const j = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const b64 = j.data?.[0]?.b64_json;
  if (!res.ok || !b64) return { ok: false, error: j.error?.message ?? `Together answered ${res.status}.` };
  return { ok: true, jpeg: Uint8Array.from(Buffer.from(b64, "base64")) };
}
