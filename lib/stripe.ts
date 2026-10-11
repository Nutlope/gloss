/**
 * Stripe Checkout for an edition: one hosted page that takes the card, the
 * address it is posted to (the US only, for now) and a phone number for the
 * carrier. Plain REST, form-encoded, like the rest of Gloss's calls out; the
 * webhook's signature is checked by hand.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const stripeReady = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Test orders, paid with no card and never printed: on a local run, or wherever EDITIONS_TEST=1, and only while Stripe is not set up. */
export const testOrders = () => !stripeReady() && (process.env.NODE_ENV !== "production" || process.env.EDITIONS_TEST === "1");

/** Stripe's nested form encoding: line_items[0][price_data][currency]=usd. */
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotency?: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    body: body ? form(body).toString() : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${j.error?.message ?? res.status}`);
  return j;
}

export type Session = {
  id: string;
  url?: string;
  status?: "open" | "complete" | "expired";
  payment_status?: "paid" | "unpaid" | "no_payment_required";
  client_reference_id?: string | null;
  payment_intent?: string | null;
  customer_details?: { email?: string | null; phone?: string | null; name?: string | null; address?: Address | null } | null;
  collected_information?: { shipping_details?: { name?: string; address?: Address } | null } | null;
  /** Before the 2025-03-31 API version, the address was here. */
  shipping_details?: { name?: string; address?: Address } | null;
};
type Address = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };

export async function createCheckout(o: { id: string; title: string; description: string; priceCents: number; origin: string; email?: string | null }): Promise<Session> {
  return stripe<Session>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      client_reference_id: o.id,
      metadata: { edition: o.id },
      customer_email: o.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: o.priceCents, product_data: { name: o.title, description: o.description } } }],
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
      payment_intent_data: { description: o.title, metadata: { edition: o.id } },
      custom_text: {
        shipping_address: { message: "Printed on demand and posted to this address. US only, for now." },
        submit: { message: "Shipping is included. Arrives in about three weeks." },
      },
      success_url: `${o.origin}/library?edition=${o.id}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${o.origin}/library?edition=${o.id}&canceled=1`,
    },
    `checkout-${o.id}`
  );
}

export const getSession = (id: string) => stripe<Session>("GET", `/checkout/sessions/${encodeURIComponent(id)}`);

/** Money back for an edition that could not be printed. */
export async function refund(paymentIntent: string, editionId: string): Promise<void> {
  await stripe("POST", "/refunds", { payment_intent: paymentIntent, metadata: { edition: editionId } }, `refund-${editionId}`);
}

/** Where a paid session says to post the book. */
export function shippingOf(s: Session) {
  const ship = s.collected_information?.shipping_details ?? s.shipping_details;
  const a = ship?.address;
  if (!a?.line1 || !a.city || !a.postal_code) return null;
  return {
    name: ship?.name ?? s.customer_details?.name ?? "",
    line1: a.line1,
    line2: a.line2 ?? undefined,
    city: a.city,
    state: a.state ?? "",
    postcode: a.postal_code,
    country: a.country ?? "US",
    phone: s.customer_details?.phone ?? "",
    email: s.customer_details?.email ?? undefined,
  };
}

/** Stripe signs each webhook: `t=<time>,v1=<HMAC-SHA256 of "time.body">`. Five minutes of tolerance. */
export function verifyStripe(raw: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex"));
  return sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}
