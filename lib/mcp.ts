/**
 * The Gloss MCP server: a reader's agent saves articles (by link, or as text it
 * has read itself) to their library and looks through it. Streamable HTTP, stateless: every request is one JSON-RPC
 * message answered with JSON, no session and no event stream.
 *
 * Auth is a personal token from the library ("Connect an agent"), sent as
 * `Authorization: Bearer gls_...`, or as the last part of the URL
 * (usegloss.io/mcp/gls_...) for clients that only take a URL.
 */

import { hashToken, looksLikeToken } from "./agent";
import { normalizeUrl } from "./links";
import { blockText, textToArticle, wordCount, type Article } from "./article";
import { shelfOf, shelveForUser, tokenUser, type ShelfRow } from "./db";
import { arxivFullText, fetchArticle, notAnArticle } from "./fetch-article";
import { TOPICS, isTopic, shelfDef, yearOf } from "./library";
import { chargeFree, checkFreeUser } from "./quota";
import { allow } from "./ratelimit";
import { classify } from "./shelve";
import { excerptOf } from "./excerpt";
import type { LibraryItem } from "./store";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const PER_CALL = 25;
/** About 60,000 words: a long essay or a two-hour transcript, well short of a book. */
const MAX_TEXT = 400_000;
const PER_DAY = 1000;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://usegloss.io";

const INSTRUCTIONS = `Gloss is a reader. This server is the reader's own library in Gloss: save articles to it, and look through what is there.
When saving from social posts or bookmarks, send the URL of the article, essay or paper itself (the link inside the post), not the post. Gloss reads each page in, sorts it onto a topic, and it appears on the reader's shelves the next time they open Gloss.
Gloss can't fetch posts on X and other social sites, videos, or pages behind a login. When the post itself is the piece (an X Article, a long post, a thread) or the reader wants a video's transcript, read it yourself and send the full text with save_text.`;

const TOOLS = [
  {
    name: "save_articles",
    title: "Save articles to the library",
    description: `Save web articles, essays, blog posts or papers to the reader's Gloss library. Gloss fetches each page, keeps its full text and sorts it onto a topic. A page with too little text to read is saved as a link to look at later. Up to ${PER_CALL} URLs per call. Send the article's own URL, not a link to a post on X or another social site. Links already in the library are skipped. Returns what happened to each URL.`,
    inputSchema: {
      type: "object",
      properties: { urls: { type: "array", items: { type: "string" }, minItems: 1, maxItems: PER_CALL, description: "Article URLs to save." } },
      required: ["urls"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "save_text",
    title: "Save a text to the library",
    description: "Save a text you have read yourself to the reader's Gloss library, for what Gloss can't fetch from a link: an X Article, a long post or a thread on X, a video's transcript, a page behind a login. Send the whole text as Markdown (blank lines between paragraphs, # for headings), word for word, not a summary. Give the original URL so the reader can open the source and the text isn't saved twice. One text per call.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: MAX_TEXT, description: "The full text, as Markdown." },
        title: { type: "string", description: "Its title. For a post with none, a short title in the author's words." },
        author: { type: "string", description: "Who wrote or said it." },
        url: { type: "string", description: "Where it came from: the post, article or video URL." },
        source: { type: "string", description: "The publication or site, like \"X\" or a YouTube channel. Defaults to the URL's site." },
        published: { type: "string", description: "When it was published, as a date." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "search_library",
    title: "Search the library",
    description: "Find texts in the reader's Gloss library by words in the title, author, source or tags, by topic, or by reading status. With no arguments, lists the most recently added.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for." },
        topic: { type: "string", enum: TOPICS.map((t) => t.key), description: "A topic key, from list_topics." },
        status: { type: "string", enum: ["unread", "reading", "finished"] },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_topics",
    title: "List topics",
    description: "The library's topics, with how many texts are on each.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
const fail = (id: Rpc["id"], code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);

export function options() {
  return new Response(null, { status: 204, headers: CORS });
}

export function notAllowed() {
  return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function handle(req: Request, pathToken?: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, "Parse error: the body must be JSON-RPC.", 400);
  }
  // Clients on the 2025-03-26 protocol may send a batch: an array of messages, answered with an array.
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Rpc[];
  if (!msgs.length || msgs.some((m) => typeof m !== "object" || !m)) return fail(null, -32600, "Send a JSON-RPC message, or an array of them.", 400);
  const first = msgs[0];
  console.info("mcp:", msgs.map((m) => m.method).join(", "), first.method === "initialize" ? JSON.stringify({ v: first.params?.protocolVersion, client: first.params?.clientInfo }) : "");

  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = looksLikeToken(header) ? header : looksLikeToken(pathToken) ? pathToken : null;
  if (!process.env.DATABASE_URL) return fail(first.id, -32000, "The Gloss library is not available on this server.", 503);
  let who: { userId: string; label: string } | null = null;
  try {
    who = token ? await tokenUser(hashToken(token)) : null;
  } catch {
    return fail(first.id, -32000, "The Gloss library is not reachable right now. Try again in a minute.", 503);
  }
  if (!who) return fail(first.id, -32001, `Missing or revoked Gloss token. Make one in your library at ${SITE}/library, under Connect an agent.`, 401);
  const { userId, label } = who;
  if (!allow(`mcp:${userId}`, 60, 60_000)) return fail(first.id, -32002, "Too many requests. Wait a minute, then try again.", 429);

  // Notifications get no answer; with nothing to answer, the reply is an empty 202.
  const answers = (await Promise.all(msgs.map((m) => answer(m, userId, label)))).filter((a) => a !== null);
  if (!answers.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? answers : answers[0]);
}

async function answer(msg: Rpc, userId: string, label: string): Promise<object | null> {
  if (msg.id === undefined || msg.method?.startsWith("notifications/")) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "gloss", title: "Gloss library", version: "1.0.0", websiteUrl: SITE },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        if (name === "save_articles") return ok(await saveArticles(userId, args, label));
        if (name === "save_text") return ok(await saveText(userId, args, label));
        if (name === "search_library") return ok(await searchLibrary(userId, args));
        if (name === "list_topics") return ok(await listTopics(userId));
        return err(-32602, `Unknown tool: ${name}`);
      } catch (e) {
        return ok(toolError(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    default:
      return err(-32601, `Method not found: ${msg.method}`);
  }
}

const toolError = (text: string) => ({ content: [{ type: "text", text }], isError: true });
const toolResult = (text: string, structured: Record<string, unknown>) => ({ content: [{ type: "text", text }], structuredContent: structured });

/* ---------- save_articles ---------- */

type Saved = { url: string; status: "saved" | "already_saved" | "failed"; title?: string; topic?: string; reason?: string; bookmark?: boolean };


async function saveArticles(userId: string, args: Record<string, unknown>, via: string) {
  const raw = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0) : [];
  if (!raw.length) return toolError("Send at least one URL in `urls`.");
  if (raw.length > PER_CALL) return toolError(`At most ${PER_CALL} URLs per call. Send the rest in another call.`);

  const shelf = await shelfOf(userId);
  const have = new Map<string, ShelfRow>();
  for (const r of shelf) if (typeof r.data.sourceUrl === "string") have.set(normalizeUrl(r.data.sourceUrl), r);
  let budget = savesLeft(shelf);

  const seen = new Set<string>();
  const queue = raw.map((url) => ({ url, key: normalizeUrl(url) })).filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
  const results: Saved[] = [];

  const one = async ({ url, key }: { url: string; key: string }): Promise<Saved> => {
    const kind = notAnArticle(url);
    if (kind === "social") return { url, status: "failed", reason: "This is a social post, not an article. Send the link the post points to, or, if the post is the piece, read it and send its text with save_text." };
    if (kind === "video") return { url, status: "failed", reason: "This is a video, not an article. Gloss reads text: send its transcript with save_text." };
    const known = have.get(key);
    if (known) return { url, status: "already_saved", title: String(known.data.title ?? ""), topic: shelfDef(typeof known.data.topic === "string" ? known.data.topic : "unsorted").name };
    if (budget <= 0) return { url, status: "failed", reason: `The daily limit of ${PER_DAY} saves is reached. Try again tomorrow.` };
    budget--;

    // An arXiv abstract page holds only the abstract, and an agent can't save the PDF: arXiv's HTML rendering is the whole paper.
    const html = arxivFullText(url, "html");
    let r = html ? await fetchArticle(html) : null;
    if (!r?.ok) r = await fetchArticle(url, { pdf: true });
    if (!r.ok) return { url, status: "failed", reason: r.error };
    if ("pdf" in r) return { url, status: "failed", reason: "This link is a PDF. Agents can't save PDFs yet; open it in Gloss to read it." };
    const a = r.article;
    if (have.has(normalizeUrl(a.sourceUrl ?? ""))) {
      const k = have.get(normalizeUrl(a.sourceUrl ?? ""))!;
      return { url, status: "already_saved", title: String(k.data.title ?? "") };
    }

    const { topic, tags, scene } = await sortOf(userId, a);
    const item = shelfItem(a, { topic, tags, scene, via });
    await shelveForUser(userId, item, a);
    have.set(key, { id: a.id, data: item as unknown as Record<string, unknown>, pct: 0 });
    return { url, status: "saved", title: a.title, topic: shelfDef(topic ?? "unsorted").name, bookmark: a.bookmark || undefined };
  };

  // A few at a time: pages are slow, and one bad link never holds up the rest.
  const next = async () => {
    for (let x = queue.shift(); x; x = queue.shift()) results.push(await one(x).catch((e) => ({ url: x.url, status: "failed" as const, reason: String(e) })));
  };
  await Promise.all([next(), next(), next(), next()]);
  const order = new Map(raw.map((u, i) => [u, i]));
  results.sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0));

  const count = (s: Saved["status"]) => results.filter((r) => r.status === s).length;
  const lines = results.map((r) =>
    r.status === "saved" ? (r.bookmark ? `Saved as a link (too little text to read here): ${r.title} (${r.topic})` : `Saved: ${r.title} (${r.topic})`) : r.status === "already_saved" ? `Already in the library: ${r.title || r.url}` : `Not saved: ${r.url}. ${r.reason}`
  );
  const head = `${count("saved")} saved, ${count("already_saved")} already in the library, ${count("failed")} not saved.`;
  return toolResult(`${head}\n${lines.join("\n")}\n\nThey'll be on the shelves at ${SITE}/library.`, { saved: count("saved"), alreadySaved: count("already_saved"), failed: count("failed"), results });
}

/** Saves an agent may still make today: PER_DAY across both save tools. */
function savesLeft(shelf: ShelfRow[]) {
  const dayAgo = Date.now() - 86_400_000;
  return PER_DAY - shelf.filter((r) => r.data.addedBy === "agent" && Number(r.data.addedAt) > dayAgo).length;
}

/** Sort it now, on the reader's own allowance. Out of allowance, it waits in Unsorted and the browser sorts it later. */
async function sortOf(userId: string, a: Article): Promise<{ topic?: string; tags?: string[]; scene?: string }> {
  const free = await checkFreeUser(userId);
  if (!free.ok) return {};
  const c = await classify({ title: a.title, author: a.author, source: a.source, dek: a.dek, excerpt: excerptOf(a.blocks) });
  if (!c.ok) return {};
  await chargeFree(free.subject, c.usd);
  return { topic: c.shelving.topic, scene: c.shelving.scene, tags: c.shelving.tags.length ? c.shelving.tags : undefined };
}

/* ---------- save_text ---------- */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

async function saveText(userId: string, args: Record<string, unknown>, via: string) {
  const text = str(args.text);
  if (!text) return toolError("Send the text in `text`.");
  if (text.length > MAX_TEXT) return toolError(`That text is too long: at most ${MAX_TEXT.toLocaleString("en-US")} characters.`);
  let url: string | undefined;
  if (str(args.url)) {
    try {
      const u = new URL(str(args.url)!);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      url = u.toString();
    } catch {
      return toolError("`url` must be a web address, starting with https://.");
    }
  }

  const shelf = await shelfOf(userId);
  if (url) {
    const known = shelf.find((r) => typeof r.data.sourceUrl === "string" && normalizeUrl(r.data.sourceUrl) === normalizeUrl(url));
    if (known) return toolResult(`Already in the library: ${String(known.data.title ?? url)}`, { status: "already_saved", title: String(known.data.title ?? "") });
  }
  if (savesLeft(shelf) <= 0) return toolError(`The daily limit of ${PER_DAY} saves is reached. Try again tomorrow.`);

  const title = str(args.title);
  const a = textToArticle(text, { title, origin: "paste" });
  // A text that opens with its own title as a heading shouldn't show it twice.
  if (title && a.blocks[0]?.type.startsWith("h") && blockText(a.blocks[0]).trim().toLowerCase() === title.toLowerCase()) a.blocks.shift();
  if (!a.blocks.length) return toolError("There was no readable text in that.");
  a.author = str(args.author);
  a.source = str(args.source) ?? (url ? new URL(url).hostname.replace(/^www\./, "") : undefined);
  a.sourceUrl = url;
  a.published = str(args.published);
  for (const k of ["author", "source", "sourceUrl", "published"] as const) if (a[k] === undefined) delete a[k];

  const item = shelfItem(a, { ...(await sortOf(userId, a)), via });
  await shelveForUser(userId, item, a);
  const topic = shelfDef(typeof item.topic === "string" ? item.topic : "unsorted").name;
  return toolResult(`Saved: ${a.title} (${topic}, ${item.words.toLocaleString("en-US")} words)\n\nIt'll be on the shelves at ${SITE}/library.`, {
    status: "saved",
    title: a.title,
    topic,
    words: item.words,
    readInGloss: `${SITE}/read/${a.id}`,
  });
}

function shelfItem(a: Article, s: { topic?: string; tags?: string[]; scene?: string; via?: string }): LibraryItem {
  const item: LibraryItem = {
    id: a.id,
    title: a.title,
    author: a.author,
    source: a.source,
    words: wordCount(a),
    origin: a.origin ?? "url",
    addedAt: Date.now(),
    dek: a.dek,
    year: yearOf(a.published),
    sourceUrl: a.sourceUrl,
    image: a.image,
    topic: s.topic,
    tags: s.tags,
    scene: s.scene,
    bookmark: a.bookmark || undefined,
    addedBy: "agent",
    // The connection's name, as the reader chose it ("Grok Bot", "Claude"), so the library can say who shelved it.
    addedVia: s.via || undefined,
  };
  for (const k of Object.keys(item) as (keyof LibraryItem)[]) if (item[k] === undefined) delete item[k];
  return item;
}

/* ---------- search_library, list_topics ---------- */

function describe(r: ShelfRow) {
  const d = r.data;
  const topic = typeof d.topic === "string" ? d.topic : "unsorted";
  return {
    title: String(d.title ?? ""),
    author: typeof d.author === "string" ? d.author : undefined,
    url: typeof d.sourceUrl === "string" ? d.sourceUrl : undefined,
    topic: shelfDef(topic).name,
    tags: Array.isArray(d.tags) ? d.tags : [],
    minutes: Math.max(1, Math.round(Number(d.words ?? 0) / 230)),
    status: r.pct >= 1 ? "finished" : r.pct > 0 ? "reading" : "unread",
    addedAt: new Date(Number(d.addedAt ?? 0)).toISOString().slice(0, 10),
    readInGloss: `${SITE}/read/${r.id}`,
  };
}

async function searchLibrary(userId: string, args: Record<string, unknown>) {
  const words = String(args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const topic = isTopic(args.topic) ? args.topic : null;
  const status = typeof args.status === "string" ? args.status : null;
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const shelf = (await shelfOf(userId)).filter((r) => r.data.origin !== "sample");
  const found = shelf
    .map(describe)
    .filter((b) => (!topic || b.topic === shelfDef(topic).name) && (!status || b.status === status))
    .filter((b) => words.every((w) => `${b.title} ${b.author ?? ""} ${b.url ?? ""} ${b.topic} ${b.tags.join(" ")}`.toLowerCase().includes(w)))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const shown = found.slice(0, limit);
  const text = shown.length
    ? `${found.length} found${found.length > shown.length ? `, showing ${shown.length}` : ""}:\n${shown.map((b) => `- ${b.title}${b.author ? `, ${b.author}` : ""} (${b.topic}, ${b.minutes} min, ${b.status})${b.url ? ` ${b.url}` : ""}`).join("\n")}`
    : "Nothing in the library matches.";
  return toolResult(text, { total: found.length, results: shown });
}

async function listTopics(userId: string) {
  const shelf = (await shelfOf(userId)).filter((r) => r.data.origin !== "sample");
  const counts = new Map<string, number>();
  for (const r of shelf) {
    const k = typeof r.data.topic === "string" ? r.data.topic : "unsorted";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const topics = [...TOPICS.map((t) => ({ key: t.key as string, name: t.name, count: counts.get(t.key) ?? 0 })), ...[...counts.keys()].filter((k) => !TOPICS.some((t) => t.key === k)).map((k) => ({ key: k, name: shelfDef(k).name, count: counts.get(k) ?? 0 }))];
  return toolResult(topics.filter((t) => t.count).map((t) => `${t.name} (${t.key}): ${t.count}`).join("\n") || "The library is empty.", { topics });
}
