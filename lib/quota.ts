/**
 * The free allowance on the shared Together key, in dollars: what a reader's
 * answers and briefs actually cost Together, up to a small amount a day
 * (more when signed in). After that they bring their own key, which is never
 * counted. A ceiling across everyone keeps a rush of visitors bounded.
 * Reading aloud is never free: it uses the reader's own key.
 *
 * Spent per day in Postgres, so the limit holds across serverless instances.
 * Signed-out readers are counted by a hash of their address. Without a
 * database (local dev), it falls back to a per-instance tally.
 */

import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { db } from "./db";
import { allow, clientId } from "./ratelimit";

/** Dollars a day on the shared key: per reader, and across all readers. */
export const FREE_USD = { anon: 0.1, user: 0.2 } as const;
export const FREE_USD_ALL = 1000;
const ALL = "free:all";

/** `left` is the share of today's allowance still unspent, from 0 to 1. */
export type FreeState = { ok: boolean; left: number; signedIn: boolean; subject: string; reason?: "reader" | "everyone" | "burst" };

async function who(req: Request) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {}
  if (userId) return { subject: `free:user:${userId}`, limit: FREE_USD.user, signedIn: true };
  const ip = createHash("sha256").update(`gloss:${clientId(req)}`).digest("hex").slice(0, 32);
  return { subject: `free:ip:${ip}`, limit: FREE_USD.anon, signedIn: false };
}

/* Without a database: a per-instance tally, keyed by day. */
const memory = new Map<string, number>();
const today = () => new Date().toISOString().slice(0, 10);
const memSpent = (subject: string) => memory.get(`${today()}:${subject}`) ?? 0;
function memAdd(subject: string, usd: number) {
  const k = `${today()}:${subject}`;
  memory.set(k, (memory.get(k) ?? 0) + usd);
  if (memory.size > 20_000) for (const key of memory.keys()) if (!key.startsWith(today())) memory.delete(key);
}

async function spent(subject: string): Promise<{ mine: number; all: number }> {
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db().query("select subject, usd from free_usage where day = current_date and subject in ($1, $2)", [subject, ALL]);
      const get = (s: string) => Number(rows.find((r) => r.subject === s)?.usd ?? 0);
      return { mine: get(subject), all: get(ALL) };
    } catch {
      // The database is unreachable: fall through to the per-instance tally rather than block everyone.
    }
  }
  return { mine: memSpent(subject), all: memSpent(ALL) };
}

/**
 * May this reader use the shared key right now? Spends nothing; `chargeFree` records the cost after.
 * `burst` is how many requests a minute one reader may start: a PDF's pages arrive in a rush.
 */
export async function checkFree(req: Request, burst = 20): Promise<FreeState> {
  return check(await who(req), burst);
}

/** The same check for a signed-in reader known only by id: an agent saving to their library. */
export async function checkFreeUser(userId: string, burst = 60): Promise<FreeState> {
  return check({ subject: `free:user:${userId}`, limit: FREE_USD.user, signedIn: true }, burst);
}

/** A budget of its own on the shared key, in dollars a day: a printed edition's podcast, say. */
export async function checkBudget(subject: string, usd: number, burst = 4): Promise<FreeState> {
  return check({ subject, limit: usd, signedIn: true }, burst);
}

async function check(w: { subject: string; limit: number; signedIn: boolean }, burst: number): Promise<FreeState> {
  // A burst guard, so a script cannot fire many requests before their costs land.
  if (!allow(`burst:${w.subject}`, burst, 60_000)) return { ok: false, left: 1, signedIn: w.signedIn, subject: w.subject, reason: "burst" };
  const s = await spent(w.subject);
  const left = Math.max(0, 1 - s.mine / w.limit);
  if (s.all >= FREE_USD_ALL) return { ok: false, left, signedIn: w.signedIn, subject: w.subject, reason: "everyone" };
  return { ok: left > 0, left, signedIn: w.signedIn, subject: w.subject, reason: left > 0 ? undefined : "reader" };
}

/** A cost when the model never reported one (a stream cut short): the whole prompt, at the fresh rate. */
export const estimateUsd = (promptChars: number, inPerM: number) => ((promptChars / 4) * inPerM) / 1_000_000;

/** Record what a request on the shared key cost, against the reader and against everyone. */
export async function chargeFree(subject: string, usd: number) {
  if (!(usd > 0)) return;
  if (process.env.DATABASE_URL) {
    try {
      await db().query(
        `insert into free_usage (subject, day, count, usd) values ($1, current_date, 1, $3), ($2, current_date, 1, $3)
         on conflict (subject, day) do update set count = free_usage.count + 1, usd = free_usage.usd + excluded.usd`,
        [subject, ALL, usd]
      );
      return;
    } catch {}
  }
  memAdd(subject, usd);
  memAdd(ALL, usd);
}

/** Today's allowance without using any of it, for the key menu. */
export async function peekFree(req: Request): Promise<{ left: number; signedIn: boolean }> {
  const w = await who(req);
  const s = await spent(w.subject);
  return { left: s.all >= FREE_USD_ALL ? 0 : Math.max(0, 1 - s.mine / w.limit), signedIn: w.signedIn };
}

/** The JSON a route answers with when a reader needs their own key. */
export function needKey(state: FreeState | null, message?: string): Response {
  if (state?.reason === "burst") return Response.json({ error: "That's a lot at once. Wait a moment, then try again." }, { status: 429 });
  const error =
    message ??
    (!state
      ? "Add your Together API key to start. It stays in this browser."
      : state.reason === "everyone"
        ? "Free answers are resting for today. Add your Together API key to keep going."
        : state.signedIn
          ? "That's today's free reading. Add your Together API key to keep going, or come back tomorrow."
          : "That's today's free reading. Sign in for more, or add your Together API key to keep going.");
  return Response.json({ error, code: "need_key", signIn: Boolean(state && !state.signedIn && state.reason === "reader") }, { status: state ? 429 : 401, headers: { "X-Free-Left": "0" } });
}
