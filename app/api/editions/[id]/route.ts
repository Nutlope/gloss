import { after } from "next/server";
import { editionFor } from "@/lib/db";
import type { EditionInput } from "@/lib/edition";
import { fulfil, orderOf, paidBySession, refresh } from "@/lib/fulfil";
import { getSession, stripeReady } from "@/lib/stripe";

export const runtime = "nodejs";
// The press may run here, after the answer: setting a long book takes a minute or two.
export const maxDuration = 300;

/**
 * One order, brought up to date. Back from Stripe with `session`, the payment
 * is checked here too, so an order moves on even before the webhook lands.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.DATABASE_URL || !/^ed_[\w-]{10,40}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  let row = await editionFor(id);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  const session = new URL(req.url).searchParams.get("session");
  if (row.status === "draft" && session && stripeReady()) {
    try {
      const s = await getSession(session);
      if (s.client_reference_id === id && (await paidBySession(s))) row = (await editionFor(id)) ?? row;
    } catch {}
  }

  const r = await refresh(row);
  if (r.press) after(() => fulfil(id));
  return Response.json({ order: orderOf(r.row), art: Boolean(r.row.art), copy: (r.row.input as EditionInput).copy });
}
