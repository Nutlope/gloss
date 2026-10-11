import { editionSummaries } from "@/lib/db";
import { HOSTS, parsePodRequest, record, VOICE_USD_PER_CHAR, writeScript } from "@/lib/edition-podcast";
import type { PodEvent } from "@/lib/podcast";
import { chargeFree, checkBudget, needKey } from "@/lib/quota";
import { allow, clientId } from "@/lib/ratelimit";

export const runtime = "nodejs";
// Writing the script takes half a minute; recording sixty-odd lines, six at a time, about as long again.
export const maxDuration = 300;

/** Printed and paid for: the podcast comes with it. */
const PAID = ["paid", "setting", "sent", "printing", "shipped", "delivered"];
/** What one edition's podcast may spend on the shared key in a day: a remake or two. */
const PER_EDITION_USD = 2.5;

/**
 * The month as a podcast. Voice is never on the free allowance (a minute of
 * it costs more than a day of answers), so an episode is made with the
 * reader's own key, or on ours when it goes with an edition they have had
 * printed, or on ours in a local run. The answer streams: the script, then
 * each line's audio in order, one JSON object a line.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = parsePodRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { req: pod } = parsed;

  const own = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  let budget: string | null = null;
  if (!own) {
    const order = typeof body.order === "string" && /^ed_[\w-]{10,40}$/.test(body.order) ? body.order : null;
    const local = process.env.NODE_ENV !== "production";
    let printed = false;
    if (order && process.env.DATABASE_URL) {
      const [row] = await editionSummaries({ ids: [order] }).catch(() => []);
      printed = Boolean(row && row.month === pod.month && PAID.includes(row.status) && (!row.test || local));
    }
    if (!process.env.TOGETHER_API_KEY || (!printed && !local))
      return needKey(null, "The podcast comes with a printed edition. To make one now, add your own Together key.");
    if (printed) {
      const b = await checkBudget(`podcast:${order}`, PER_EDITION_USD);
      if (!b.ok) return needKey(b, b.reason === "burst" ? undefined : "That's today's podcasts for this edition. Add your own Together key to make another.");
      budget = `podcast:${order}`;
    } else if (!allow(`podcast:${clientId(req)}`, 4, 600_000)) {
      return Response.json({ error: "That's a lot of podcasts at once. Wait a few minutes." }, { status: 429 });
    }
  }
  const apiKey = own || process.env.TOGETHER_API_KEY!;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: PodEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      let usd = 0;
      try {
        const w = await writeScript(pod, HOSTS, { apiKey, signal: req.signal });
        if (!w.ok) return send({ type: "error", error: w.error });
        usd += w.usd;
        send({ type: "script", script: w.script });
        await record(
          w.script,
          HOSTS,
          apiKey,
          (i, mp3, seconds) => {
            usd += w.script.lines[i].say.length * VOICE_USD_PER_CHAR;
            send({ type: "clip", i, b64: Buffer.from(mp3).toString("base64"), seconds });
          },
          req.signal
        );
        send({ type: "done", usd });
      } catch (e) {
        if (!req.signal.aborted) send({ type: "error", error: e instanceof Error ? e.message : "The podcast could not be made." });
      } finally {
        if (budget) await chargeFree(budget, usd);
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
