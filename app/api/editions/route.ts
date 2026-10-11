import { randomBytes } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createEdition, editionSummaries } from "@/lib/db";
import { editionTitle, monthName, PRINT } from "@/lib/edition";
import { parseEdition } from "@/lib/edition-input";
import { allow, clientId } from "@/lib/ratelimit";
import { orderOf } from "@/lib/fulfil";
import { createCheckout, stripeReady, testOrders } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The body comes gzipped (a month of texts compresses about fourfold), and never unpacks past 40 MB. */
async function readBody(req: Request): Promise<unknown> {
  if (req.headers.get("content-type") !== "application/x-gloss-edition" || !req.body) return req.json();
  const reader = req.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 40_000_000) throw new Error("too large");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Send an edition to press: keep it, then hand the reader to Stripe (or, in a test, to the test checkout). */
export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Printing needs the database." }, { status: 503 });
  const test = testOrders();
  if (!stripeReady() && !test) return Response.json({ error: "Printed editions open soon.", code: "soon" }, { status: 503 });
  // Each order keeps a month of texts: a dozen tries an hour is plenty for anyone who means it.
  if (!allow(`edition:${clientId(req)}`, 12, 3_600_000)) return Response.json({ error: "That's a lot of editions at once. Try again in a while." }, { status: 429 });

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return Response.json({ error: "That edition did not arrive whole. Try again." }, { status: 400 });
  }
  const parsed = parseEdition(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { art, ...input } = parsed.input;

  const { userId } = await auth();
  const email = userId ? ((await currentUser().catch(() => null))?.primaryEmailAddress?.emailAddress ?? null) : null;
  const id = `ed_${randomBytes(15).toString("base64url")}`;
  await createEdition({ id, userId, month: input.month, name: input.name, input, art: art ?? null, priceCents: PRINT.priceCents, test, email });

  const origin = new URL(req.url).origin;
  if (test) return Response.json({ id, url: `/print/checkout?edition=${id}`, test: true });
  try {
    const session = await createCheckout({
      id,
      title: `Gloss, ${editionTitle(input.name)}`,
      description: `${monthName(input.month)} · ${input.texts.length} ${input.texts.length === 1 ? "piece" : "pieces"} with your highlights · a 6 × 9 inch paperback, printed and posted to you`,
      priceCents: PRINT.priceCents,
      origin,
      email,
    });
    return Response.json({ id, url: session.url });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not start the checkout." }, { status: 502 });
  }
}

/** The reader's orders: the ones this browser placed, and, signed in, every one on the account. */
export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ orders: [] });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((x) => /^ed_[\w-]{10,40}$/.test(x))
    .slice(0, 24);
  const { userId } = await auth();
  if (!ids.length && !userId) return Response.json({ orders: [] });
  const rows = await editionSummaries({ ids, userId: userId ?? undefined });
  return Response.json({ orders: rows.filter((r) => r.status !== "draft").map(orderOf) });
}
