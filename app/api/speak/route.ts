import { needKey } from "@/lib/quota";
import { APP_UA } from "@/lib/together";
import { TTS_MAX_CHARS, TTS_MODEL, TTS_URL, TTS_VOICE } from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One passage, spoken. The audio streams straight through from Together as
 * MP3, so playback can begin before the whole clip exists.
 */
export async function POST(req: Request) {
  let body: { text?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "ئوقۇيدىغان نەرسە يوق." }, { status: 400 });
  if (text.length > TTS_MAX_CHARS + 200) return Response.json({ error: "بۇ بۆلەك بىر قېتىمدا ئوقۇشقا بەك ئۇزۇن." }, { status: 413 });

  const headerKey = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  // Reading aloud is never on the shared key: a minute of voice costs more than a day of free answers.
  const apiKey = body.apiKey?.trim() || headerKey || undefined;
  if (!apiKey) return needKey(null, "Reading aloud uses your own Together API key. Add it to listen.");

  let res: Response;
  try {
    res = await fetch(TTS_URL, {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: "mp3" }),
    });
  } catch {
    return Response.json({ error: "ئاۋاز مۇلازىمىتىگە ئۇلىنالمىدى. تورىڭىزنى تەكشۈرۈڭ." }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    let msg = `The voice answered ${res.status}.`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = typeof j.error === "string" ? j.error : j.error?.message ?? msg;
    } catch {}
    if (res.status === 401) msg = "Together rejected that API key. Check it and try again.";
    return Response.json({ error: msg }, { status: res.status === 401 || res.status === 429 ? res.status : 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
