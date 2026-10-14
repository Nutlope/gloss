import { chargeFree, checkFree, needKey } from "@/lib/quota";
import { APP_UA, TOGETHER_URL } from "@/lib/together";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * One PDF page the text layer cannot give us (a scan, an image of text, garbled
 * glyphs), read by a vision model into Markdown. Qwen3.8 Flash is the vision
 * model Together serves per request; the dedicated OCR models (GLM-OCR,
 * DeepSeek-OCR-2) need their own endpoint. Checked 2026-10-10.
 */
const MODEL = "Qwen/Qwen3.8-Flash";
const PRICE = { inPerM: 0.15, outPerM: 0.47 };
/**
 * mode "layout": a page whose text layer reads but whose layout came out
 * badly (columns, tables, maths), read again in the background
 * (lib/upgrade.ts). Qwen3.5-9B scored 6.9/10 on such pages in
 * scripts/pdf-eval against 3.9 for the text layer, at about $0.0005 a page.
 */
const LAYOUT_MODEL = "Qwen/Qwen3.5-9B";
const LAYOUT_PRICE = { inPerM: 0.17, outPerM: 0.25 };
const MAX_IMAGE_CHARS = 3_500_000;

const PROMPT = `Transcribe this document page into clean Markdown, in reading order.
- Multiple columns: the whole left column first, then the next.
- Keep each paragraph whole on one line; join words hyphenated across line breaks.
- # and ## for headings, - for list items, Markdown tables for tables.
- Leave out page numbers, running headers and footers.
- For a picture or chart, write its caption only, if it has one. Never write image links.
- Write only what is on the page. No commentary, no code fences around the whole.`;

const LAYOUT_PROMPT = `${PROMPT}
- Maths as LaTeX between $ signs, inline, or $$ on its own line for a displayed equation.
- Keep equation numbers such as (3) beside their equation.`;

/** Reasoning some models print into the answer, and fences some wrap it in. */
function clean(md: string): string {
  let t = md.replace(/<think>[\s\S]*?<\/think>/g, "");
  if (t.includes("</think>")) t = t.slice(t.lastIndexOf("</think>") + 8);
  return t
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1")
    // Author marks written as LaTeX ($^{1,2}$, $^{\dagger}$) read better as plain text.
    .replace(/\$\^\{?([^}$]{1,24})\}?\$/g, (_, m: string) => m.replace(/\\dagger/g, "†").replace(/\\ddagger/g, "‡").replace(/\\ast|\*/g, "\\*"))
    .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .trim();
}

export async function POST(req: Request) {
  let body: { image?: string; apiKey?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const image = body.image ?? "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) return Response.json({ error: "بەتنى رەسىم قىلىپ ئەۋەتىڭ." }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return Response.json({ error: "بۇ بەت رەسىمى بەك چوڭ." }, { status: 413 });

  const headerKey = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const own = body.apiKey?.trim() || headerKey || undefined;
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!own) {
    if (!process.env.TOGETHER_API_KEY) return needKey(null);
    free = await checkFree(req, 90);
    if (!free.ok) return needKey(free);
  }

  const layout = body.mode === "layout";
  const model = layout ? LAYOUT_MODEL : MODEL;
  const price = layout ? LAYOUT_PRICE : PRICE;

  let res: Response;
  try {
    res = await fetch(TOGETHER_URL, {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${own ?? process.env.TOGETHER_API_KEY}`, "User-Agent": APP_UA },
      body: JSON.stringify({
        model,
        stream: true, // Qwen3.8 Flash only answers as a stream
        stream_options: { include_usage: true },
        temperature: 0,
        max_tokens: 4096,
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: image } }, { type: "text", text: layout ? LAYOUT_PROMPT : PROMPT }] }],
      }),
    });
  } catch {
    return Response.json({ error: "بەت ئوقۇغۇچقا ئۇلىنالمىدى." }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    let msg = `The page reader answered ${res.status}.`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = typeof j.error === "string" ? j.error : j.error?.message ?? msg;
    } catch {}
    return Response.json({ error: msg }, { status: res.status === 401 || res.status === 429 ? res.status : 502 });
  }

  // Gather the stream: the content, and what it cost.
  let text = "";
  type Usage = { prompt_tokens?: number; completion_tokens?: number };
  let usage: Usage | null = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!data || data === "[DONE]" || !line.trim().startsWith("data:")) continue;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; usage?: Usage };
        text += j.choices?.[0]?.delta?.content ?? "";
        if (j.usage) usage = j.usage;
      } catch {}
    }
  }

  if (free) {
    const cost = ((usage?.prompt_tokens ?? 1900) * price.inPerM + (usage?.completion_tokens ?? 1000) * price.outPerM) / 1_000_000;
    await chargeFree(free.subject, cost);
  }
  return Response.json({ markdown: clean(text) });
}
