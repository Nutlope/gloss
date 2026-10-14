import { auth } from "@clerk/nextjs/server";
import { loadCover } from "@/lib/db";

export const runtime = "nodejs";

/** A cover painted on another device, from the reader's account. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ماس قەدەملەش ئۈچۈن كىرىڭ." }, { status: 401 });
  const jpeg = await loadCover(userId, (await params).id);
  if (!jpeg) return Response.json({ error: "تېپىلمىدى." }, { status: 404 });
  return new Response(new Blob([jpeg as Uint8Array<ArrayBuffer>]), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
}
