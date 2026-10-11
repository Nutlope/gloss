import { after } from "next/server";
import { fulfil, paidBySession } from "@/lib/fulfil";
import { verifyStripe, type Session } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Stripe says a checkout was paid: the edition goes to press once the answer is sent. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get("stripe-signature"))) return Response.json({ error: "Bad signature." }, { status: 400 });
  const event = JSON.parse(raw) as { type?: string; data?: { object?: Session } };
  const s = event.data?.object;
  if (s && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && (await paidBySession(s))) {
    const id = s.client_reference_id!;
    after(() => fulfil(id));
  }
  return Response.json({ received: true });
}
