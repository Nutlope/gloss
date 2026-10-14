import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { parseCarefully, type Tier } from "@/lib/llamaparse";
import { APP_UA } from "@/lib/together";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Read it more carefully": a PDF read again by LlamaParse, for layouts the
 * free reader gets wrong. It runs on Gloss's LlamaParse key, but only for
 * readers who have added their own Together key; they get a daily page cap.
 */
// Agentic scored 8.1/10 against cost_effective's 6.9 in scripts/pdf-eval, at $0.0125 a page against $0.0037.
const TIER: Tier = "agentic";
/** Vercel refuses request bodies over 4.5MB. */
const MAX_BYTES = 4_300_000;
const MAX_PAGES = 60;
const PAGES_PER_DAY = 200;
const USD_PER_CREDIT = 0.00125;

/** Keys checked recently, so a reader's second PDF does not wait on Together again. */
const goodKeys = new Map<string, number>();

async function togetherKeyWorks(key: string): Promise<boolean> {
  const id = hash(key);
  if ((goodKeys.get(id) ?? 0) > Date.now()) return true;
  try {
    const res = await fetch("https://api.together.xyz/v1/models", { headers: { Authorization: `Bearer ${key}`, "User-Agent": APP_UA }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) goodKeys.set(id, Date.now() + 3_600_000);
    return res.ok;
  } catch {
    return false;
  }
}

const hash = (s: string) => createHash("sha256").update(`gloss:${s}`).digest("hex").slice(0, 32);

/** Pages read carefully today by the holder of this key. */
async function pagesToday(subject: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const rows = await db().query("select count from free_usage where subject = $1 and day = current_date", [subject]);
    return rows.length ? Number(rows[0].count) : 0;
  } catch {
    return 0;
  }
}

async function record(subject: string, pages: number, usd: number) {
  if (!process.env.DATABASE_URL) return;
  try {
    await db().query(
      `insert into free_usage (subject, day, count, usd) values ($1, current_date, $2, $3)
       on conflict (subject, day) do update set count = free_usage.count + excluded.count, usd = free_usage.usd + excluded.usd`,
      [subject, pages, usd]
    );
  } catch (e) {
    console.error("pdf-careful: could not record pages read", e);
  }
}

export async function POST(req: Request) {
  const key = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!key) return Response.json({ error: "ئەستايىدىل ئوقۇشقا Together ئاچقۇچىڭىز كېرەك. ئاچقۇچ كۇنۇپكىسىدىن قوشۇڭ.", code: "need_key" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 10_000) return tooLarge();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {}
  if (!file) return Response.json({ error: "PDF نى ھۆججەت قىلىپ ئەۋەتىڭ." }, { status: 400 });
  if (file.size > MAX_BYTES) return tooLarge();

  if (!(await togetherKeyWorks(key))) return Response.json({ error: "Together ئاچقۇچىڭىزنى قوبۇل قىلمىدى. ئاچقۇچ تىزىملىكىدە تەكشۈرۈڭ.", code: "need_key" }, { status: 401 });

  const subject = `careful:${hash(key)}`;
  const used = await pagesToday(subject);
  if (used >= PAGES_PER_DAY) return Response.json({ error: `بۈگۈن ${PAGES_PER_DAY} بەتنى ئەستايىدىل ئوقۇدىڭىز. ئەتە يەنە بولىدۇ.` }, { status: 429 });

  const result = await parseCarefully(file, { tier: TIER, maxPages: Math.min(MAX_PAGES, PAGES_PER_DAY - used), signal: req.signal, deadlineMs: 270_000 });
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  await record(subject, result.pages.length, (result.credits ?? 0) * USD_PER_CREDIT);
  return Response.json({ pages: result.pages, truncated: result.pages.length >= MAX_PAGES });
}

function tooLarge() {
  return Response.json({ error: "بۇ PDF ‏4MB دىن چوڭ، بۇ يەردە ئەستايىدىل ئوقۇشقا بەك چوڭ." }, { status: 413 });
}
