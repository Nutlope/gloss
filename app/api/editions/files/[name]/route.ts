import { localFile } from "@/lib/files";

export const runtime = "nodejs";

/** A test order's PDFs, kept on this machine when there is no Blob store. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  const { name } = await params;
  const pdf = await localFile(name);
  if (!pdf) return new Response(null, { status: 404 });
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
