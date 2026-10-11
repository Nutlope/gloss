/**
 * Postgres on Neon, over its HTTP driver: one round trip per query, no pool
 * to manage in serverless functions. Server-side only.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    client = neon(url);
  }
  return client;
}

/** The tables the sync route reads and writes. Names are only ever taken from this list. */
export const COLLECTIONS = ["articles", "highlights", "glosses", "briefs", "progress"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const isCollection = (v: unknown): v is Collection => typeof v === "string" && (COLLECTIONS as readonly string[]).includes(v);

export type PushRow = { id: string; article_id: string; data: unknown; deleted: boolean; doc?: unknown };
export type PullRow = { id: string; articleId: string; data: unknown; deleted: boolean };

/** Rows changed since `since` in every collection, tombstones included, plus the server clock to pull from next time. */
export async function pullRows(userId: string, since: string): Promise<{ now: string; changes: Record<Collection, PullRow[]> }> {
  const sql = db();
  const [clock, ...results] = await sql.transaction([
    sql.query("select now() as now"),
    ...COLLECTIONS.map((t) =>
      sql.query(`select id, article_id, data, deleted from ${t} where user_id = $1 and updated_at > $2 order by updated_at`, [userId, since])
    ),
  ]);
  const changes = Object.fromEntries(
    COLLECTIONS.map((t, i) => [
      t,
      (results[i] as Record<string, unknown>[]).map((r) => ({ id: String(r.id), articleId: String(r.article_id), data: r.deleted ? null : r.data, deleted: Boolean(r.deleted) })),
    ])
  ) as Record<Collection, PullRow[]>;
  return { now: new Date((clock as { now: string }[])[0].now).toISOString(), changes };
}

/** Upsert every collection's rows in one transaction. The server stamps the time, so the latest write wins. */
export async function pushRows(userId: string, changes: Partial<Record<Collection, PushRow[]>>): Promise<void> {
  const sql = db();
  const queries = Object.entries(changes)
    .filter(([t, rows]) => isCollection(t) && rows?.length)
    .map(([t, rows]) => sql.query(upsert(t as Collection), [userId, JSON.stringify(rows)]));
  // A text taken off the shelf takes its painted cover with it.
  const gone = (changes.articles ?? []).filter((r) => r.deleted).map((r) => r.id);
  if (gone.length) queries.push(sql.query("delete from covers where user_id = $1 and id = any($2::text[])", [userId, gone]));
  if (queries.length) await sql.transaction(queries);
}

/** One article's full text. */
export async function articleDoc(userId: string, id: string): Promise<unknown | null> {
  const rows = await db().query("select doc from articles where user_id = $1 and id = $2 and not deleted and doc is not null", [userId, id]);
  return rows.length ? rows[0].doc : null;
}

/** One statement per table: unpack the JSON array of rows and upsert them all. An article pushed without its text keeps the stored one. */
function upsert(table: Collection): string {
  const isArticles = table === "articles";
  return `insert into ${table} (user_id, id, article_id, data, deleted, updated_at${isArticles ? ", doc" : ""})
    select $1, r.id, r.article_id, r.data, r.deleted, now()${isArticles ? ", r.doc" : ""}
    from jsonb_to_recordset($2::jsonb) as r(id text, article_id text, data jsonb, deleted boolean${isArticles ? ", doc jsonb" : ""})
    on conflict (user_id, id) do update set
      article_id = excluded.article_id, data = excluded.data, deleted = excluded.deleted, updated_at = now()${
        isArticles ? ", doc = case when excluded.deleted then null else coalesce(excluded.doc, articles.doc) end" : ""
      }`;
}

/* ---------- painted covers ---------- */

export async function saveCover(userId: string, id: string, jpeg: Uint8Array): Promise<void> {
  await db().query(
    `insert into covers (user_id, id, jpeg) values ($1, $2, $3)
     on conflict (user_id, id) do update set jpeg = excluded.jpeg, created_at = now()`,
    [userId, id, Buffer.from(jpeg).toString("base64")]
  );
}

export async function loadCover(userId: string, id: string): Promise<Uint8Array | null> {
  const rows = await db().query("select jpeg from covers where user_id = $1 and id = $2", [userId, id]);
  return rows.length ? Uint8Array.from(Buffer.from(String(rows[0].jpeg), "base64")) : null;
}

/* ---------- agent tokens ---------- */

export type AgentToken = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

export async function createToken(userId: string, id: string, hash: string, label: string): Promise<void> {
  await db().query("insert into agent_tokens (id, user_id, hash, label) values ($1, $2, $3, $4)", [id, userId, hash, label]);
}

export async function listTokens(userId: string): Promise<AgentToken[]> {
  const rows = await db().query("select id, label, created_at, last_used_at from agent_tokens where user_id = $1 and not revoked order by created_at desc", [userId]);
  return rows.map((r) => ({ id: String(r.id), label: String(r.label), createdAt: new Date(r.created_at).toISOString(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null }));
}

export async function revokeToken(userId: string, id: string): Promise<boolean> {
  const rows = await db().query("update agent_tokens set revoked = true where user_id = $1 and id = $2 and not revoked returning id", [userId, id]);
  return rows.length > 0;
}

/** The reader a token belongs to, noting that it was used. Null for an unknown or revoked token. */
export async function tokenUser(hash: string): Promise<{ userId: string; label: string } | null> {
  const rows = await db().query("update agent_tokens set last_used_at = now() where hash = $1 and not revoked returning user_id, label", [hash]);
  return rows.length ? { userId: String(rows[0].user_id), label: String(rows[0].label ?? "") } : null;
}

/* ---------- the library, for an agent ---------- */

export type ShelfRow = { id: string; data: Record<string, unknown>; pct: number };

/** Every text on a reader's shelf, with how far they've read. */
export async function shelfOf(userId: string): Promise<ShelfRow[]> {
  const rows = await db().query(
    `select a.id, a.data, p.data as progress from articles a
     left join progress p on p.user_id = a.user_id and p.id = a.id and not p.deleted
     where a.user_id = $1 and not a.deleted order by a.updated_at desc`,
    [userId]
  );
  return rows.map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, unknown>, pct: Number((r.progress as { pct?: number } | null)?.pct ?? 0) }));
}

/** Put one imported text on a reader's shelf, as their browser would: the next sync brings it down. */
export async function shelveForUser(userId: string, item: { id: string }, doc: unknown): Promise<void> {
  await db().query(
    `insert into articles (user_id, id, article_id, data, doc, deleted, updated_at) values ($1, $2, $2, $3, $4, false, now())
     on conflict (user_id, id) do update set data = excluded.data, doc = excluded.doc, deleted = false, updated_at = now()`,
    [userId, item.id, JSON.stringify(item), JSON.stringify(doc)]
  );
}

/* ---------- printed editions ---------- */

export type EditionRow = {
  id: string;
  user_id: string | null;
  month: string;
  name: string;
  input: unknown;
  art: string | null;
  status: string;
  test: boolean;
  attempts: number;
  pages: number | null;
  price_cents: number;
  email: string | null;
  ship_to: unknown;
  stripe_session: string | null;
  payment_intent: string | null;
  lulu_job: string | null;
  files: unknown;
  tracking: unknown;
  arrival: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
};

/** Everything but the texts and the painting, for the reader's list of orders. */
const SUMMARY = "id, user_id, month, name, status, test, attempts, pages, price_cents, email, stripe_session, lulu_job, files, tracking, arrival, error, created_at, updated_at, jsonb_array_length(input->'texts') as texts";

export async function createEdition(e: { id: string; userId: string | null; month: string; name: string; input: unknown; art: string | null; priceCents: number; test: boolean; email: string | null }): Promise<void> {
  await db().query(
    "insert into editions (id, user_id, month, name, input, art, price_cents, test, email) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [e.id, e.userId, e.month, e.name, JSON.stringify(e.input), e.art, e.priceCents, e.test, e.email]
  );
}

/** One edition, with what goes to press. */
export async function editionFor(id: string): Promise<EditionRow | null> {
  const rows = await db().query("select * from editions where id = $1", [id]);
  return (rows[0] as EditionRow | undefined) ?? null;
}

export async function editionSummaries(where: { ids?: string[]; userId?: string }): Promise<(EditionRow & { texts: number })[]> {
  const rows = where.userId
    ? await db().query(`select ${SUMMARY} from editions where user_id = $1 or id = any($2::text[]) order by created_at desc limit 40`, [where.userId, where.ids ?? []])
    : await db().query(`select ${SUMMARY} from editions where id = any($1::text[]) order by created_at desc limit 40`, [where.ids ?? []]);
  return rows as (EditionRow & { texts: number })[];
}

const PATCHABLE = ["status", "attempts", "pages", "email", "ship_to", "stripe_session", "payment_intent", "lulu_job", "files", "tracking", "arrival", "error"] as const;
type Patch = Partial<Record<(typeof PATCHABLE)[number], unknown>>;

/** Change an edition. Only the named columns can be set; objects are stored as JSON. */
export async function patchEdition(id: string, patch: Patch): Promise<void> {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => {
    const v = patch[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  await db().query(`update editions set ${sets}, updated_at = now() where id = $1`, [id, ...values]);
}

/**
 * Move an edition on from one status to the next, only if it is still where
 * the caller thinks: when two requests race for the same order, one wins.
 * `stale` also claims a press that has said nothing for ten minutes: it died.
 * A claim counts an attempt, and `run` names the attempt a later step belongs
 * to, so a press that was given up on can never overwrite the one after it.
 */
export async function moveEdition(id: string, from: string[], to: string, patch: Patch = {}, opts: { stale?: boolean; claim?: boolean; run?: number } = {}): Promise<EditionRow | null> {
  const keys = PATCHABLE.filter((k) => k in patch && k !== "status" && k !== "attempts");
  const sets = keys.map((k, i) => `, ${k} = $${i + 6}`).join("");
  const values = keys.map((k) => {
    const v = patch[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const rows = await db().query(
    `update editions set status = $2, updated_at = now()${opts.claim ? ", attempts = attempts + 1" : ""}${sets}
     where id = $1 and (status = any($3::text[]) or ($4 and status = 'setting' and updated_at < now() - interval '10 minutes'))
       and ($5::int is null or attempts = $5::int)
     returning *`,
    [id, to, from, Boolean(opts.stale), opts.run ?? null, ...values]
  );
  return (rows[0] as EditionRow | undefined) ?? null;
}

export async function editionByJob(job: string): Promise<EditionRow | null> {
  const rows = await db().query("select * from editions where lulu_job = $1", [job]);
  return (rows[0] as EditionRow | undefined) ?? null;
}
