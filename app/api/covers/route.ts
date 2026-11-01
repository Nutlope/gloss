import { auth } from "@clerk/nextjs/server";
import { saveCover } from "@/lib/db";
import { isCustomKey, isTopic } from "@/lib/library";
import { COVER_USD, paintCover } from "@/lib/paint";
import { chargeFree, checkFree, needKey } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Paint a cover for one text, opt-in from the reader's settings. Signed in,
 * it is kept with the account, so other devices fetch it instead of painting
 * it again. The picture comes back as a JPEG.
 */
export async function POST(req: Request) {
  let body: { id?: string; scene?: string; topic?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.slice(0, 120) : "";
  const scene = typeof body.scene === "string" ? body.scene.slice(0, 300).trim() : "";
  if (!id || !scene || !(isTopic(body.topic) || isCustomKey(body.topic))) return Response.json({ error: "id, scene and topic are required." }, { status: 400 });

  const apiKey = body.apiKey?.trim() || undefined;
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!apiKey) {
    if (!process.env.TOGETHER_API_KEY) return needKey(null);
    free = await checkFree(req, 12);
    if (!free.ok) return needKey(free);
  }
  const r = await paintCover({ scene, topic: body.topic, apiKey, signal: req.signal });
  if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
  if (free) await chargeFree(free.subject, COVER_USD);

  const { userId } = await auth();
  if (userId && process.env.DATABASE_URL) await saveCover(userId, id, r.jpeg).catch(() => {});
  return new Response(new Blob([r.jpeg as Uint8Array<ArrayBuffer>]), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
}
