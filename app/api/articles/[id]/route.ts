import { auth } from "@clerk/nextjs/server";
import { articleDoc } from "@/lib/db";

export const runtime = "nodejs";

/** One imported text from the reader's account, for a device that has the shelf entry but not the text. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ماس قەدەملەش ئۈچۈن كىرىڭ." }, { status: 401 });
  const doc = await articleDoc(userId, (await params).id);
  if (!doc) return Response.json({ error: "تېپىلمىدى." }, { status: 404 });
  return Response.json({ doc });
}
