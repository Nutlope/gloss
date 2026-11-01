import { slugify, tidyTitle, undash, type Article, type Block } from "./article";
import { htmlToBlocks } from "./html-to-blocks";

/**
 * EPUB to Gloss blocks, in the browser, with no dependency.
 *
 * An EPUB is a zip of XHTML chapters plus an OPF manifest that says what
 * order they go in. We already have the hard half: html-to-blocks turns any
 * DOM-shaped tree into blocks, and it is what links go through on the server.
 * The other half is a zip reader, and that is small: walk the central
 * directory, inflate the handful of text entries we care about through
 * DecompressionStream, and never touch the fonts and pictures.
 *
 * Pictures are dropped on purpose. The reader shows figures by URL, and these
 * live inside the zip; unpacking them into blob URLs that survive a reload is
 * its own feature. The text is what matters, same as the PDF path.
 */

/** Past this an EPUB is a scanned book or a picture album, and inflating it in a tab is a bad time. */
export const EPUB_MAX_BYTES = 60 * 1024 * 1024;
/** A chapter bigger than this (uncompressed) is a zip bomb or a data dump, not prose. */
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
/**
 * Everything one import is allowed to inflate, across every entry it opens. The
 * per-entry cap alone is not enough: a 60 MB file can list one deflate stream
 * under a thousand names, or the same chapter a thousand times in the spine,
 * and read it to the cap each time. Longer than any real book by a wide margin.
 */
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export class EpubError extends Error {}

/** The sliver of DOM that html-to-blocks reads, plus the few lookups the manifest needs. */
type El = {
  nodeType: number;
  tagName?: string;
  localName?: string;
  childNodes: ArrayLike<El>;
  textContent: string | null;
  getAttribute?: (n: string) => string | null;
};

/**
 * How markup becomes a tree is the caller's business: the browser hands us
 * DOMParser, a test hands us linkedom. Keeping that out of here is what lets
 * the parser run under node --test without a DOM global.
 */
export type ParseMarkup = (markup: string, type: "text/xml" | "application/xhtml+xml" | "text/html") => El | null;

export type EpubProgress = (pct: number, label?: string) => void;

const failed = (msg: string) => new EpubError(msg);

// ---------- zip ----------

type ZipEntry = { flags: number; method: number; offset: number; compressed: number; size: number };

/**
 * Reads the central directory only. Local headers are consulted per entry when
 * we actually inflate something, so a 40 MB EPUB costs one pass over a few KB
 * of directory plus the chapters we open. The end-of-central-directory record
 * sits at the very end, behind an optional comment, so we scan backwards for
 * its signature instead of trusting a fixed offset.
 */
function readDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw failed("That file is not an EPUB (no zip directory inside it).");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  // 0xffff / 0xffffffff mean "see the zip64 record". Books that big are not something we read in a tab.
  if (count === 0xffff || at === 0xffffffff) throw failed("That EPUB is too large to open here.");

  const entries = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw failed("That EPUB's zip directory is damaged.");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    // Normalised so that "OEBPS/./ch1.xhtml" and "OEBPS/ch1.xhtml" are the same entry; a name that climbs out of the archive is junk and is not indexed.
    const key = normalizePath(name);
    if (key) entries.set(key, { flags, method, offset, compressed, size });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Inflates one entry, stopping the moment the output passes `limit`. The size
 * in the directory is whatever the file says it is, so the cap has to be on
 * what actually comes out; a few KB of deflate can claim to be 1 byte and
 * expand to gigabytes, and a tab has no swap to fall back on.
 */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw failed("That EPUB has a chapter too large to open here.");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof EpubError) throw e;
    // A truncated download or a bad disk shows up as a stream error with a message like "incorrect header check";
    // the landing page shows our errors verbatim, so it gets a sentence instead.
    throw failed("That EPUB is damaged and could not be unpacked.");
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** One entry's bytes, capped at `limit` once unpacked. Two methods exist in practice: stored (covers, fonts) and deflate (everything else). */
async function readEntry(bytes: Uint8Array, e: ZipEntry, limit: number): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034b50) throw failed("That EPUB's zip directory is damaged.");
  // Only the entry we are opening matters here: a DRM'd font in the same archive should not stop the text from reading.
  if (e.flags & 0x1) throw failed("That EPUB is encrypted, and Gloss cannot open protected books.");
  // The local header repeats the name and may carry a different extra field than the central one, so read its own lengths.
  const nameLen = view.getUint16(e.offset + 26, true);
  const extraLen = view.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  // subarray clamps quietly, which would hand a cut-off download to the inflater as if it were whole.
  if (start + e.compressed > bytes.length) throw failed("That EPUB is cut short. Download it again and retry.");
  const data = bytes.subarray(start, start + e.compressed);
  if (e.method === 0) {
    if (data.length > limit) throw failed("That EPUB has a chapter too large to open here.");
    return data;
  }
  if (e.method === 8) return inflateRaw(data, limit);
  throw failed("That EPUB uses a compression Gloss cannot read.");
}

// ---------- paths ----------

/**
 * Collapses "." and "..". These strings only ever index the entry map, never a
 * filesystem, so this is not the classic zip-slip defence; it is about not
 * being fooled. A path that climbs above the archive root is not a file in the
 * book, whatever a dishonest manifest says, so it resolves to nothing.
 */
function normalizePath(p: string): string | null {
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

/** A manifest href, relative to the file that mentions it, as a key into the zip. Fragments and queries belong to the link, not the file. */
function resolveHref(fromFile: string, href: string): string | null {
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/") + 1) : "";
  let clean = href.split("#")[0].split("?")[0];
  try {
    // decodeURIComponent, not decodeURI: the latter leaves %26, %2C and the other reserved characters
    // encoded, and "Tom %26 Jerry.xhtml" matches nothing in the archive.
    clean = decodeURIComponent(clean);
  } catch {
    // A stray percent sign is still a filename to some tools; use it as written.
  }
  return normalizePath(clean.startsWith("/") ? clean.slice(1) : dir + clean);
}

// ---------- the sliver of DOM we need ----------

const localName = (el: El) => (el.localName ?? el.tagName ?? "").replace(/^.*:/, "").toLowerCase();

/** Descendants by local name, so "dc:title", "opf:item" and plain "item" all resolve regardless of how the book prefixed its namespaces. */
function find(node: El, name: string, out: El[] = []): El[] {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType !== 1) continue;
    if (localName(c) === name) out.push(c);
    find(c, name, out);
  }
  return out;
}

const attr = (el: El, name: string) => el.getAttribute?.(name) ?? null;
const text = (el: El | undefined) => undash((el?.textContent ?? "").replace(/\s+/g, " ").trim());

/**
 * Parses an entry's markup, strict first. Chapters are supposed to be XHTML,
 * and most are, but enough books carry an unclosed <br> or a bare & that the
 * XML parser gives up; those read fine as HTML, so we fall through rather than
 * lose the chapter. A DOMParser never throws on bad XML; it hands back a tree
 * whose root is <parsererror>, which is what we look for.
 */
function parseDocument(parse: ParseMarkup, markup: string, type: "text/xml" | "application/xhtml+xml"): El | null {
  const root = parse(markup, type);
  if (root && localName(root) !== "parsererror" && !find(root, "parsererror").length) return root;
  return type === "text/xml" ? null : parse(markup, "text/html");
}

// ---------- the book ----------

type Manifest = Map<string, { href: string; type: string; props: string }>;

/** Label by chapter file, from the EPUB 3 nav document or an EPUB 2 NCX. Both just map "this file" to "this title"; the shape around it differs. */
function tocLabels(parse: ParseMarkup, docs: { path: string; markup: string; ncx: boolean }[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const d of docs) {
    const root = parseDocument(parse, d.markup, d.ncx ? "text/xml" : "application/xhtml+xml");
    if (!root) continue;
    if (d.ncx) {
      for (const point of find(root, "navpoint")) {
        const src = attr(find(point, "content")[0] ?? point, "src");
        const label = text(find(point, "text")[0]);
        const key = src ? resolveHref(d.path, src) : null;
        if (key && label && !labels.has(key)) labels.set(key, label);
      }
    } else {
      for (const a of find(root, "a")) {
        const href = attr(a, "href");
        const label = text(a);
        const key = href ? resolveHref(d.path, href) : null;
        if (key && label && !labels.has(key)) labels.set(key, label);
      }
    }
  }
  return labels;
}

export async function epubToArticle(file: File, parse: ParseMarkup, onProgress?: EpubProgress): Promise<Article> {
  if (file.size > EPUB_MAX_BYTES) throw failed("That EPUB is too large to open here. Books under 60 MB work.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readDirectory(bytes);
  const dec = new TextDecoder();
  let budget = MAX_TOTAL_BYTES;
  const read = async (path: string) => {
    const e = entries.get(path);
    if (!e) return null;
    // The declared size is a cheap early out for honest files; the real cap is applied to what inflates.
    if (e.size > MAX_ENTRY_BYTES) return null;
    const data = await readEntry(bytes, e, Math.min(MAX_ENTRY_BYTES, budget));
    budget -= data.byteLength;
    return dec.decode(data);
  };

  // container.xml is the one fixed address in the format; everything else is found from it.
  const container = await read("META-INF/container.xml");
  if (!container) throw failed("That file is not an EPUB (no META-INF/container.xml inside it).");
  const containerRoot = parseDocument(parse, container, "text/xml");
  const declared = containerRoot ? find(containerRoot, "rootfile").map((r) => attr(r, "full-path")).find(Boolean) : null;
  const opfFile = declared ? normalizePath(declared) : null;
  const opf = opfFile ? await read(opfFile) : null;
  const pkg = opf ? parseDocument(parse, opf, "text/xml") : null;
  if (!pkg || !opfFile) throw failed("That EPUB has no package file, so its chapters cannot be found.");

  const meta = find(pkg, "metadata")[0] ?? pkg;
  const title = text(find(meta, "title")[0]);
  const creators = find(meta, "creator").map(text).filter(Boolean);
  // dc:date is free-form in the wild (a year, an ISO stamp, "2019-03"); the first ten characters cover the common shapes.
  const published = text(find(meta, "date")[0]).slice(0, 10) || undefined;

  const manifest: Manifest = new Map();
  for (const item of find(pkg, "item")) {
    const id = attr(item, "id");
    const href = attr(item, "href");
    const path = href ? resolveHref(opfFile, href) : null;
    if (id && path) manifest.set(id, { href: path, type: attr(item, "media-type") ?? "", props: attr(item, "properties") ?? "" });
  }

  const spineEl = find(pkg, "spine")[0];
  const seen = new Set<string>();
  const spine = spineEl
    ? find(spineEl, "itemref")
        // linear="no" marks covers, ads and other things the author wanted out of the reading flow.
        .filter((ref) => attr(ref, "linear") !== "no")
        .map((ref) => manifest.get(attr(ref, "idref") ?? ""))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        // A file listed twice (two manifest ids, one href) is one chapter, and should cost one read.
        .filter((m) => !seen.has(m.href) && seen.add(m.href))
    : [];
  if (!spine.length) throw failed("That EPUB lists no chapters to read.");

  // Chapter titles come from the table of contents when the chapter itself opens without a heading.
  const tocDocs: { path: string; markup: string; ncx: boolean }[] = [];
  const nav = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
  const navMarkup = nav ? await read(nav.href) : null;
  if (nav && navMarkup) tocDocs.push({ path: nav.href, markup: navMarkup, ncx: false });
  const ncx = spineEl ? manifest.get(attr(spineEl, "toc") ?? "") : undefined;
  const ncxMarkup = ncx ? await read(ncx.href) : null;
  if (ncx && ncxMarkup) tocDocs.push({ path: ncx.href, markup: ncxMarkup, ncx: true });
  const labels = tocLabels(parse, tocDocs);

  const blocks: Block[] = [];
  let n = 0;
  for (const [i, item] of spine.entries()) {
    onProgress?.(i / spine.length, `Reading chapter ${i + 1} of ${spine.length}`);
    // EPUB 3 lets SVG pages and even images sit in the spine; only markup goes through the block walker.
    if (item.type && !/html/i.test(item.type)) continue;
    const markup = await read(item.href);
    if (!markup) continue; // listed but missing, or too big to be prose; the book still reads without it
    const root = parseDocument(parse, markup, "application/xhtml+xml");
    if (!root) continue;
    const body = find(root, "body")[0] ?? root;
    // The web-article trimming would cut a chapter at a heading called "Notes" and drop a closing list; a book gets read whole.
    const chapter = htmlToBlocks(body as never, undefined, { keepApparatus: true }).filter((b) => b.type !== "figure");
    if (!chapter.length) continue;
    const label = labels.get(item.href);
    if (label && chapter[0].type !== "h2" && chapter[0].type !== "h3" && label !== title) {
      chapter.unshift({ id: "", type: "h2", runs: [{ text: label }] });
    }
    // Every chapter numbered its own blocks from b1; the reader needs one address space for the whole book.
    for (const b of chapter) blocks.push({ ...b, id: `b${++n}` });
  }
  onProgress?.(1);

  if (!blocks.some((b) => b.type === "p" || b.type === "quote" || b.type === "li")) {
    throw failed("There was no readable text in that EPUB. Fixed-layout and picture books are not supported.");
  }

  const name = title || file.name.replace(/\.epub$/i, "").replace(/[_-]+/g, " ");
  return {
    id: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
    title: tidyTitle(name),
    ...(creators.length ? { author: creators.join(", ") } : {}),
    ...(published ? { published } : {}),
    source: file.name,
    blocks,
    origin: "file",
    addedAt: Date.now(),
  };
}
