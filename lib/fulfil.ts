/**
 * An order, from paid to posted: set the book, keep the files where the
 * printer can fetch them, send Lulu the print job, then follow it until it
 * ships. Every step moves the edition on only from where it should be, so the
 * Stripe webhook, a retry and the reader's own page can all call in here
 * without a book ever being printed twice.
 */

import { DONE, editionTitle, monthName, type EditionInput, type EditionOrder, type EditionStatus } from "./edition";
import { editionFor, moveEdition, patchEdition, type EditionRow } from "./db";
import { blobReady, putFile } from "./files";
import { createJob, getJob, luluReady, statusFromLulu, trackingOf, type LuluJob, type ShipTo } from "./lulu";
import { setBook } from "./print/press";
import { refund, shippingOf, stripeReady, type Session } from "./stripe";

/** Tries at setting a book before the order is refunded. */
const ATTEMPTS = 2;

export async function fulfil(id: string): Promise<void> {
  const row = await moveEdition(id, ["paid"], "setting", {}, { stale: true, claim: true });
  if (!row) return;
  // This attempt's number: every later step is taken only while the order is still this attempt's.
  const run = row.attempts;
  try {
    const book = await setBook({ ...(row.input as EditionInput), art: row.art ?? undefined });
    const files = { interior: await putFile(`${id}-interior.pdf`, book.interior), cover: await putFile(`${id}-cover.pdf`, book.cover) };
    if (!(await moveEdition(id, ["setting"], "setting", { pages: book.pages, files }, { run }))) return;
    if (row.test) {
      await moveEdition(id, ["setting"], "sent", { error: null }, { run });
      return;
    }
    if (!luluReady() || !blobReady()) throw new Error("Printing is not set up: Lulu needs LULU_CLIENT_KEY and LULU_CLIENT_SECRET, and BLOB_READ_WRITE_TOKEN to fetch the files.");
    const job = await createJob({
      id,
      title: `Gloss, ${editionTitle(row.name)}, ${monthName(row.month)}`,
      interior: files.interior,
      cover: files.cover,
      ship: row.ship_to as ShipTo,
      email: row.email ?? "",
    });
    await moveEdition(id, ["setting"], statusFromLulu(job.status.name), { lulu_job: String(job.id), arrival: arrivalOf(job), error: null }, { run });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`edition ${id}: ${error}`);
    if (run < ATTEMPTS) await moveEdition(id, ["setting"], "paid", { error }, { run });
    else await fail(id, ["setting"], error, run);
  }
}

/** An order that cannot be printed: say so, and give the money back. */
async function fail(id: string, from: string[], error: string, run?: number) {
  const row = await moveEdition(id, from, "failed", { error }, { run });
  if (row?.payment_intent && stripeReady() && !row.test) {
    try {
      await refund(row.payment_intent, id);
    } catch (e) {
      console.error(`edition ${id}: refund failed: ${String(e)}`);
    }
  }
}

const arrivalOf = (job: LuluJob) => (job.estimated_shipping_dates ? { min: job.estimated_shipping_dates.arrival_min, max: job.estimated_shipping_dates.arrival_max } : null);

/** Take in what Lulu says about a job: from its webhook, or asked for. */
export async function applyJob(row: EditionRow, job: LuluJob): Promise<void> {
  const status = statusFromLulu(job.status.name);
  if (status === "failed") return fail(row.id, [row.status], job.status.message || "The printer could not print this edition.");
  await patchEdition(row.id, { status, tracking: trackingOf(job) ?? row.tracking, arrival: arrivalOf(job) ?? row.arrival });
}

/** Bring an order up to date: start a press that never started, and ask Lulu where a job is, every few minutes at most. */
export async function refresh(row: EditionRow): Promise<{ row: EditionRow; press: boolean }> {
  if (row.status === "paid" || (row.status === "setting" && Date.now() - Date.parse(row.updated_at) > 10 * 60_000)) return { row, press: true };
  if (!row.lulu_job || !luluReady() || DONE.includes(row.status as EditionStatus) || Date.now() - Date.parse(row.updated_at) < 3 * 60_000) return { row, press: false };
  try {
    await applyJob(row, await getJob(row.lulu_job));
    return { row: (await editionFor(row.id)) ?? row, press: false };
  } catch {
    return { row, press: false };
  }
}

/** What the reader sees of an order. */
export function orderOf(row: EditionRow & { texts?: number }): EditionOrder {
  const input = row.input as EditionInput | undefined;
  return {
    id: row.id,
    month: row.month,
    name: row.name,
    status: row.status as EditionStatus,
    pages: row.pages,
    texts: row.texts ?? input?.texts.length ?? 0,
    createdAt: new Date(row.created_at).toISOString(),
    test: row.test,
    tracking: (row.tracking as EditionOrder["tracking"]) ?? null,
    files: (row.files as EditionOrder["files"]) ?? null,
    error: row.status !== "failed" ? null : row.test ? `The press stopped: ${row.error ?? "no reason given"}` : "This edition could not be printed, and your payment has been refunded.",
    arrival: (row.arrival as EditionOrder["arrival"]) ?? null,
  };
}

/** A Stripe session that has been paid: the order moves on to the press, with where to post it. True when it did. */
export async function paidBySession(s: Session): Promise<boolean> {
  const id = s.client_reference_id;
  if (!id || s.payment_status !== "paid") return false;
  const row = await moveEdition(id, ["draft"], "paid", {
    ship_to: shippingOf(s),
    email: s.customer_details?.email ?? null,
    payment_intent: s.payment_intent ?? null,
    stripe_session: s.id,
  });
  return Boolean(row);
}
