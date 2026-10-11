import { editionByJob, editionFor } from "@/lib/db";
import { applyJob } from "@/lib/fulfil";
import { verifyLulu, type LuluJob } from "@/lib/lulu";

export const runtime = "nodejs";

/** Lulu says a print job moved: printing, shipped (with tracking), delivered, or turned away. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLulu(raw, req.headers.get("lulu-hmac-sha256"))) return Response.json({ error: "Bad signature." }, { status: 401 });
  const body = JSON.parse(raw) as { topic?: string; data?: LuluJob & { external_id?: string } };
  if (body.topic !== "PRINT_JOB_STATUS_CHANGED" || !body.data?.id) return Response.json({ received: true });
  const row = (await editionByJob(String(body.data.id))) ?? (body.data.external_id ? await editionFor(body.data.external_id) : null);
  if (row) await applyJob(row, body.data);
  return Response.json({ received: true });
}
