import { editionFor } from "@/lib/db";

export const runtime = "nodejs";

/** An order's painted cover, for its page and for Stripe's checkout. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.DATABASE_URL || !/^ed_[\w-]{10,40}$/.test(id)) return new Response(null, { status: 404 });
  const row = await editionFor(id);
  if (!row?.art) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(Buffer.from(row.art, "base64")), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable" } });
}
