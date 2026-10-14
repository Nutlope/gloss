import { auth } from "@clerk/nextjs/server";
import { isCollection, pullRows, pushRows, type Collection, type PushRow } from "@/lib/db";

export const runtime = "nodejs";

/** Vercel caps a request body at 4.5MB; the client batches below this. */
const MAX_BODY = 4_400_000;
const MAX_ROWS = 2000;
const MAX_DATA = 256_000;

type InRow = { id: string; articleId: string; data: unknown; deleted?: boolean; doc?: unknown };

/**
 * Pull: every row of the signed-in reader's that changed since `since`,
 * tombstones included. Article texts are left out; they are fetched one at a
 * time from /api/articles/[id], so a big shelf never makes a huge response.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ماس قەدەملەش ئۈچۈن كىرىڭ." }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : "1970-01-01T00:00:00Z";
  return Response.json(await pullRows(userId, since));
}

/** Push: upsert the rows a device changed. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ماس قەدەملەش ئۈچۈن كىرىڭ." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "بەك چوڭ." }, { status: 413 });

  let body: { changes?: Record<string, InRow[]> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const changes: Partial<Record<Collection, PushRow[]>> = {};
  let count = 0;
  for (const [table, rows] of Object.entries(body.changes ?? {})) {
    if (!isCollection(table) || !Array.isArray(rows)) continue;
    changes[table] = rows.filter(valid).map((r) => ({
      id: r.id,
      article_id: r.articleId,
      data: r.deleted ? {} : r.data,
      deleted: Boolean(r.deleted),
      ...(table === "articles" ? { doc: r.deleted ? null : r.doc ?? null } : {}),
    }));
    count += changes[table].length;
  }
  if (count > MAX_ROWS) return Response.json({ error: "بىر قېتىمدا بەك كۆپ قۇر ئەۋەتىلدى." }, { status: 413 });
  await pushRows(userId, changes);
  return Response.json({ ok: true, count });
}

function valid(r: InRow): boolean {
  if (!r || typeof r.id !== "string" || typeof r.articleId !== "string") return false;
  if (!r.id || r.id.length > 120 || !r.articleId || r.articleId.length > 120) return false;
  if (r.deleted) return true;
  return typeof r.data === "object" && r.data !== null && JSON.stringify(r.data).length <= MAX_DATA;
}
