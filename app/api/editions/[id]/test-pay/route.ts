import { after } from "next/server";
import { cleanName } from "@/lib/edition";
import { editionFor, moveEdition } from "@/lib/db";
import { fulfil } from "@/lib/fulfil";
import { testOrders } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The test checkout's "pay": a test order moves on to the press with the
 * address it was given and no card. Only while Stripe is not set up, on a
 * local run or where EDITIONS_TEST=1, and only for an order made as a test.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!testOrders()) return Response.json({ error: "Not here." }, { status: 404 });
  const { id } = await params;
  const row = /^ed_[\w-]{10,40}$/.test(id) ? await editionFor(id) : null;
  if (!row?.test) return Response.json({ error: "Not found." }, { status: 404 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const s = (k: string, n: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, n) : "");
  const ship = { name: cleanName(s("name", 35)) || s("name", 35), line1: s("line1", 60), line2: s("line2", 60) || undefined, city: s("city", 40), state: s("state", 3), postcode: s("postcode", 10), country: "US", phone: s("phone", 20), email: s("email", 120) || undefined };
  if (!ship.name || !ship.line1 || !ship.city || !ship.state || !ship.postcode) return Response.json({ error: "Fill in the address." }, { status: 400 });
  const moved = await moveEdition(id, ["draft"], "paid", { ship_to: ship, email: ship.email ?? null });
  if (moved) after(() => fulfil(id));
  return Response.json({ ok: true });
}
