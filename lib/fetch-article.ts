/**
 * Reading a web page into an Article, on the server: the link import, and
 * anything an agent saves. Every redirect hop is checked against private,
 * loopback and link-local addresses before it is fetched.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { imageStem, leadImage, prepareImages } from "@/lib/images";
import { Readability } from "@mozilla/readability";
import { htmlToBlocks } from "@/lib/html-to-blocks";
import { slugify, tidyTitle, undash, type Article, type Block } from "@/lib/article";
import { bookmarkBlocks, isTooLittle } from "@/lib/bookmark";
import { APP_UA } from "@/lib/together";

const MAX_BYTES = 6_000_000;
const MAX_PDF_BYTES = 25_000_000;
/** Fewer words than this is a page whose article never reached the HTML. The shortest real one on a tested shelf had 220. */
const MIN_WORDS = 80;

/** Refuse anything that resolves to a private, loopback or link-local address. */
function isPrivate(ip: string): boolean {
  if (ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const p = v4.split(".").map(Number);
  if (p.length !== 4) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  );
}

async function safeUrl(raw: string): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return "That does not look like a link.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Only http and https links can be imported.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "That address is not reachable from here.";
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (ips.some(isPrivate)) return "That address is not reachable from here.";
  } catch {
    return "Could not find that site. Check the link.";
  }
  return url;
}

/** Readability's excerpt is often just the first paragraph; only keep it when it adds something. */
function dekFrom(excerpt: string | null | undefined, blocks: Block[]): string | undefined {
  const dek = undash((excerpt ?? "").trim());
  if (dek.length < 20) return undefined;
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const first = norm(blocks.find((b) => b.type === "p")?.runs.map((r) => r.text).join("") ?? "");
  if (first.startsWith(norm(dek).slice(0, 60))) return undefined;
  return dek.length > 280 ? `${dek.slice(0, 277).replace(/\s+\S*$/, "")}...` : dek;
}

/**
 * React streaming (Next.js App Router, Suspense) sends a skeleton first:
 * `<!--$?--><template id="B:6"></template>...fallback...<!--/$-->`, and the real
 * content later in `<div hidden id="S:6">`, which a script ($RC) moves into
 * place. Readability drops hidden nodes, so the article went with it. This does
 * the script's work: the content replaces its placeholder and the fallback goes.
 * A segment for `<template id="P:9">` ($RS) replaces that template.
 */
function revealStreamed(doc: Document) {
  for (const seg of Array.from(doc.querySelectorAll("div[hidden]"))) {
    const m = /^S:(\d+)$/.exec(seg.id);
    if (!m) continue;
    const boundary = doc.getElementById(`B:${m[1]}`);
    const slot = boundary ?? doc.getElementById(`P:${m[1]}`);
    if (!slot?.parentNode) {
      seg.removeAttribute("hidden");
      continue;
    }
    if (boundary) {
      // The fallback runs from the template to the comment that closes its boundary.
      let depth = 0;
      for (let n = boundary.nextSibling; n; ) {
        const next = n.nextSibling;
        if (n.nodeType === 8) {
          const data = (n as Comment).data;
          if (data === "/$") {
            if (depth === 0) break;
            depth--;
          } else if (data === "$" || data === "$?" || data === "$!") depth++;
        }
        n.parentNode?.removeChild(n);
        n = next;
      }
    }
    while (seg.firstChild) slot.parentNode.insertBefore(seg.firstChild, slot);
    slot.parentNode.removeChild(slot);
    seg.parentNode?.removeChild(seg);
  }
}

const SOCIAL = /^(x\.com|twitter\.com|mobile\.twitter\.com|threads\.net|bsky\.app|instagram\.com|facebook\.com|linkedin\.com\/posts)/;
const VIDEO = /^(youtube\.com|m\.youtube\.com|music\.youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)\//;

/** Links that are a post or a video rather than an article: their pages are script shells with nothing to read. */
export function notAnArticle(url: string): "social" | "video" | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const at = `${u.hostname.replace(/^www\./, "")}${u.pathname}`;
  return SOCIAL.test(at) ? "social" : VIDEO.test(at) ? "video" : null;
}

/** arXiv ids: new style (2610.07469v2) and old style (cs/9605103, math.GT/0309136). */
const ARXIV = /^(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)(?:\.pdf)?\/?$/;

/**
 * The full text of an arXiv paper, for a link to its abstract page: that page
 * holds only the abstract, so a reader that can take a PDF gets the PDF, and
 * one that can't (an agent) gets arXiv's HTML rendering of the paper.
 */
export function arxivFullText(url: string, as: "pdf" | "html"): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const m = ARXIV.exec(`${u.hostname}${u.pathname}`);
  if (!m) return null;
  if (as === "pdf") return u.pathname.startsWith("/abs/") ? `https://arxiv.org/pdf/${m[1]}` : null;
  return `https://arxiv.org/html/${m[1]}`;
}

export type FetchResult =
  | { ok: true; article: Article }
  | { ok: true; pdf: ArrayBuffer; name: string }
  | { ok: false; error: string; status: number };

/** A page with too little text, as a saved link: a placeholder article that points back to the original. */
function toBookmark(opts: { url: string; title: string; dek?: string; source?: string; image?: string }): Article {
  const host = (() => {
    try { return new URL(opts.url).hostname.replace(/^www\./, ""); } catch { return opts.source ?? ""; }
  })();
  const title = tidyTitle(undash((opts.title || host || "Saved link").trim())) || "Saved link";
  const dek = opts.dek?.trim() ? undash(opts.dek.trim()).slice(0, 280) : undefined;
  return {
    id: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    dek,
    source: opts.source ?? host,
    sourceUrl: opts.url,
    blocks: bookmarkBlocks({ dek, url: opts.url }),
    origin: "url",
    bookmark: true,
    image: opts.image,
    addedAt: Date.now(),
  };
}

/** A page's own description of itself, from its meta tags. */
function pageMeta(document: Document): { title?: string; dek?: string; site?: string } {
  const meta = (names: string[]) => {
    for (const el of Array.from(document.querySelectorAll("meta"))) {
      const k = (el.getAttribute("property") ?? el.getAttribute("name") ?? "").toLowerCase();
      if (names.includes(k)) {
        const v = el.getAttribute("content")?.trim();
        if (v) return v;
      }
    }
    return undefined;
  };
  const title = meta(["og:title", "twitter:title"]) ?? document.querySelector("title")?.textContent?.trim() ?? undefined;
  return { title, dek: meta(["og:description", "twitter:description", "description"]), site: meta(["og:site_name"]) };
}

/** `pdf`: the caller can read a PDF itself, so a PDF link comes back as the file instead of an error. */
export async function fetchArticle(raw: string, opts: { pdf?: boolean } = {}): Promise<FetchResult> {
  const checked = await safeUrl((opts.pdf && arxivFullText(raw, "pdf")) || raw.trim());
  if (typeof checked === "string") return { ok: false, error: checked, status: 400 };
  const kind = notAnArticle(checked.toString());
  if (kind === "social") return { ok: false, error: "That's a post, not an article. Open the link it shares, or copy the post and use Paste text.", status: 422 };
  if (kind === "video") return { ok: false, error: "That's a video, and Gloss reads text. Copy its transcript and use Paste text.", status: 422 };

  // Follow redirects by hand so every hop gets the same private-address check.
  let res: Response | null = null;
  let target: URL = checked;
  try {
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent": `Mozilla/5.0 (compatible; ${APP_UA}; +reader)`,
          Accept: opts.pdf ? "text/html,application/xhtml+xml,application/pdf" : "text/html,application/xhtml+xml",
        },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      const next = await safeUrl(new URL(location, target).toString());
      if (typeof next === "string") return { ok: false, error: next, status: 400 };
      target = next;
    }
  } catch {
    return { ok: false, error: "The site did not answer in time.", status: 502 };
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const msg =
      status === 401 || status === 403 || status === 429
        ? "That site does not let readers like this one in. Copy the text and use Paste text instead."
        : status === 404
          ? "That page was not found. Check the link."
          : `The site answered ${status || "nothing"}. Try again, or paste the text instead.`;
    return { ok: false, error: msg, status: 502 };
  }

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/pdf") && opts.pdf) {
    const pdf = await res.arrayBuffer();
    if (pdf.byteLength > MAX_PDF_BYTES) return { ok: false, error: "That PDF is too large to import.", status: 413 };
    const name = decodeURIComponent(target.pathname.split("/").pop() || "document.pdf");
    return { ok: true, pdf, name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf` };
  }
  if (type.includes("application/pdf")) {
    return { ok: false, error: "That link is a PDF. Download it, then drop the file here.", status: 415 };
  }
  if (!type.includes("html")) return { ok: false, error: "That link is not a web page.", status: 415 };

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return { ok: false, error: "That page is too large to import.", status: 413 };
  const html = new TextDecoder().decode(buf);

  const { document } = parseHTML(html);
  const meta = pageMeta(document as unknown as Document);
  // Readability resolves relative links against the document URL.
  try {
    const base = document.createElement("base");
    base.setAttribute("href", target.toString());
    document.head?.appendChild(base);
  } catch {}

  // Pages streamed by React arrive with their content hidden, to be swapped in by a script.
  try {
    revealStreamed(document as unknown as Document);
  } catch {}

  // Data tables (header cells or a caption) often carry classes like "sticky-header"
  // that Readability reads as page furniture and strips. Their classes go, so they stay.
  for (const t of Array.from(document.querySelectorAll("table"))) {
    const role = t.getAttribute("role");
    if (role === "presentation" || role === "navigation") continue;
    if (t.querySelector("th, thead, caption")) t.removeAttribute("class");
  }

  // Read before Readability, which rewrites the document it is given.
  let lead: string | null = null;
  try {
    lead = leadImage(document as unknown as Document, target.toString());
  } catch {}

  // Pictures resolved to one real URL each and rewrapped as plain figures, so Readability keeps them.
  try {
    prepareImages(document as unknown as Document, target.toString());
  } catch {
    // Pictures are a bonus; never lose the article over them.
  }

  let parsed: ReturnType<Readability["parse"]> = null;
  try {
    parsed = new Readability(document as unknown as Document, { charThreshold: 400 }).parse();
  } catch {
    // Some unusual markup trips Readability up; that reads the same as no article found.
  }
  if (!parsed?.content) {
    // No article on the page is not a dead end: save the link itself, to look at later.
    return { ok: true, article: toBookmark({ url: target.toString(), title: meta.title || target.hostname, dek: meta.dek, source: meta.site ?? target.hostname.replace(/^www\./, ""), image: lead ?? undefined }) };
  }

  const { document: clean } = parseHTML(`<!doctype html><html><body><div id="r">${parsed.content}</div></body></html>`);
  const root = clean.getElementById("r");
  if (!root) return { ok: true, article: toBookmark({ url: target.toString(), title: meta.title || parsed.title || target.hostname, dek: meta.dek, source: meta.site ?? target.hostname.replace(/^www\./, ""), image: lead ?? undefined }) };
  let blocks = htmlToBlocks(root as never, target.toString());
  const title = tidyTitle(undash((parsed.title || target.hostname).trim()));
  if (blocks[0] && blocks[0].type !== "p" && blocks[0].runs.map((r) => r.text).join("").trim() === title) blocks = blocks.slice(1);
  // The lead picture goes first, unless the article already opens with a picture or shows this one.
  const leadStem = lead ? imageStem(lead) : null;
  const shownAlready = (src?: string) => {
    if (!src || !leadStem) return false;
    try {
      return decodeURIComponent(src).includes(leadStem);
    } catch {
      return src.includes(leadStem);
    }
  };
  if (lead && !blocks.slice(0, 4).some((b) => b.type === "figure") && !blocks.some((b) => b.type === "figure" && shownAlready(b.src))) {
    blocks = [{ id: "b0", type: "figure", runs: [], src: lead }, ...blocks];
  }
  // A page drawn by scripts (a Google Doc, an app shell) leaves only its newsletter box and footer.
  // Too little to read is not a failure: the reader meant to keep the link, so keep it as one.
  if (isTooLittle(blocks, MIN_WORDS)) {
    return { ok: true, article: toBookmark({ url: target.toString(), title: meta.title || title, dek: meta.dek ?? dekFrom(parsed.excerpt, blocks), source: parsed.siteName ?? meta.site ?? target.hostname.replace(/^www\./, ""), image: lead ?? undefined }) };
  }

  const article: Article = {
    id: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    author: parsed.byline ? undash(parsed.byline.replace(/^by\s+/i, "").trim()).slice(0, 120) : undefined,
    published: parsed.publishedTime ? new Date(parsed.publishedTime).getFullYear().toString() : undefined,
    dek: dekFrom(parsed.excerpt, blocks),
    source: parsed.siteName ?? target.hostname.replace(/^www\./, ""),
    sourceUrl: target.toString(),
    blocks,
    origin: "url",
    image: lead ?? undefined,
    addedAt: Date.now(),
  };
  return { ok: true, article };
}
