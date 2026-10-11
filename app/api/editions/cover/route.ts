import { isMonth, type CoverCopy } from "@/lib/edition";
import { EDITION_COVER_USD, paintEditionCover, writeCover, type CoverTitle } from "@/lib/edition-cover";
import { isTopic } from "@/lib/library";
import { chargeFree, checkFree, needKey } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * A cover for a month's edition: the words, written from the month's titles,
 * and the painting. With `copy`, the same words are painted again.
 */
export async function POST(req: Request) {
  let body: { month?: unknown; titles?: unknown; copy?: CoverCopy; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!isMonth(body.month)) return Response.json({ error: "month is required." }, { status: 400 });
  const titles: CoverTitle[] = (Array.isArray(body.titles) ? body.titles : [])
    .slice(0, 60)
    .flatMap((t) => {
      const x = t as { title?: unknown; topic?: unknown; tags?: unknown };
      if (typeof x.title !== "string" || !isTopic(x.topic)) return [];
      const tags = Array.isArray(x.tags) ? x.tags.filter((g): g is string => typeof g === "string").slice(0, 3).map((g) => g.slice(0, 32)) : [];
      return [{ title: x.title.slice(0, 200), topic: x.topic, tags }];
    });
  if (!titles.length) return Response.json({ error: "titles are required." }, { status: 400 });

  const apiKey = body.apiKey?.trim() || undefined;
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!apiKey) {
    if (!process.env.TOGETHER_API_KEY) return needKey(null, "Painted covers need a Together API key. Add yours, and the cover paints itself.");
    free = await checkFree(req, 6);
    if (!free.ok) return needKey(free);
  }

  let copy = body.copy && typeof body.copy.scene === "string" && isTopic(body.copy.topic) ? body.copy : null;
  let usd = 0;
  if (!copy) {
    const w = await writeCover({ month: body.month, titles }, { apiKey, signal: req.signal });
    if (!w.ok) return Response.json({ error: w.error }, { status: 502 });
    copy = w.copy;
    usd += w.usd;
  }
  const p = await paintEditionCover(copy, { apiKey, signal: req.signal });
  if (p.ok) usd += EDITION_COVER_USD;
  if (free) await chargeFree(free.subject, usd);
  return Response.json({ copy, art: p.ok ? Buffer.from(p.jpeg).toString("base64") : null, error: p.ok ? undefined : p.error });
}
