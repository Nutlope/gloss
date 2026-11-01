import { undash, type Block, type BlockType, type Run } from "./article";

/**
 * Walks a cleaned article DOM (Readability output) into Gloss blocks.
 * Works with any DOM implementation: it only touches nodeType, tagName,
 * childNodes, textContent and getAttribute.
 */

type El = {
  nodeType: number;
  tagName?: string;
  childNodes: ArrayLike<El>;
  textContent: string | null;
  getAttribute?: (n: string) => string | null;
};

const BLOCK_TAGS: Record<string, BlockType> = {
  P: "p",
  H1: "h2",
  H2: "h2",
  H3: "h3",
  H4: "h3",
  H5: "h3",
  H6: "h3",
  BLOCKQUOTE: "quote",
  LI: "li",
  PRE: "pre",
  FIGCAPTION: "note",
  DT: "p",
  DD: "p",
};

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME", "FORM", "BUTTON", "NAV", "FOOTER", "TABLE", "IMG", "PICTURE", "VIDEO", "AUDIO"]);

/** Past this, a table is a page layout or a data dump, not something to read. */
const MAX_ROWS = 80;
const MAX_COLS = 12;

function descendants(node: El, tag: string, out: El[] = []): El[] {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType !== 1 || !c.tagName) continue;
    if (c.tagName.toUpperCase() === tag) out.push(c);
    else descendants(c, tag, out);
  }
  return out;
}

const clean = (s: string | null | undefined) => undash((s ?? "").replace(/\s+/g, " ").trim());

/**
 * The candidates in a srcset. URLs may contain commas (Substack's image CDN
 * puts its options in the path: ",w_1456,c_limit,..."), so a comma only
 * separates candidates after a URL's whitespace and descriptor, as the HTML
 * spec parses it. Splitting on every comma cuts those URLs into pieces.
 */
export function parseSrcset(s: string): { url: string; size: number }[] {
  const out: { url: string; size: number }[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j++;
    let url = s.slice(i, j);
    i = j;
    if (!url) break;
    let descriptor = "";
    if (url.endsWith(",")) url = url.replace(/,+$/, "");
    else {
      const k = s.indexOf(",", i);
      descriptor = s.slice(i, k < 0 ? s.length : k).trim();
      i = k < 0 ? s.length : k + 1;
    }
    out.push({ url, size: parseFloat(descriptor) || 0 });
  }
  return out;
}

/** An image worth showing: a real http(s) picture, not a spacer, tracking pixel or inline blob. */
function imageOf(img: El, base?: string): { src: string; alt?: string } | null {
  const attr = (n: string) => img.getAttribute?.(n) ?? null;
  const srcset = attr("srcset") ?? attr("data-srcset");
  // The largest candidate in a srcset reads best on a sharp screen.
  const fromSet = srcset ? parseSrcset(srcset).sort((a, b) => b.size - a.size)[0]?.url : undefined;
  const src0 = attr("src");
  const raw = fromSet ?? (src0 && !src0.startsWith("data:") ? src0 : attr("data-src"));
  if (!raw) return null;
  let src: string;
  try {
    src = new URL(raw, base).toString();
  } catch {
    return null;
  }
  if (!/^https?:/i.test(src)) return null;
  const w = Number(attr("width"));
  const h = Number(attr("height"));
  if ((w && w < 48) || (h && h < 48)) return null;
  const alt = clean(attr("alt"));
  return { src, alt: alt || undefined };
}

/** Rows of cell text, or null when the table is really layout. */
function tableOf(table: El): { rows: string[][]; head: boolean } | null {
  const trs = descendants(table, "TR");
  const rows: string[][] = [];
  let head = false;
  for (const tr of trs.slice(0, MAX_ROWS)) {
    const cells = Array.from(tr.childNodes).filter((c) => c.nodeType === 1 && /^T[HD]$/i.test(c.tagName ?? ""));
    if (rows.length === 0) head = cells.length > 0 && cells.every((c) => c.tagName!.toUpperCase() === "TH");
    // A merged cell is repeated across its columns, so a header over three columns still sits over each of them.
    const row = cells.flatMap((c) => Array(Math.min(MAX_COLS, Math.max(1, Number(c.getAttribute?.("colspan")) || 1))).fill(clean(c.textContent))).slice(0, MAX_COLS);
    if (row.some(Boolean)) rows.push(row);
  }
  const cols = Math.max(0, ...rows.map((r) => r.length));
  if (rows.length < 2 || cols < 2) return null;
  // Long prose in cells means the table is holding the page together, not data.
  const cells = rows.flat();
  if (cells.reduce((a, c) => a + c.length, 0) / cells.length > 220) return null;
  return { rows: rows.map((r) => [...r, ...Array(cols - r.length).fill("")]), head };
}

function inlineRuns(node: El, marks: Omit<Run, "text"> = {}, out: Run[] = []): Run[] {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const t = (child.textContent ?? "").replace(/\s+/g, " ");
      if (t) out.push({ text: t, ...marks });
      continue;
    }
    if (child.nodeType !== 1 || !child.tagName) continue;
    const tag = child.tagName.toUpperCase();
    if (SKIP.has(tag)) continue;
    if (tag === "BR") {
      out.push({ text: " ", ...marks });
      continue;
    }
    if (tag === "SUP" && /^\[?\d+\]?$/.test((child.textContent ?? "").trim())) continue; // footnote markers
    const next = { ...marks };
    if (tag === "EM" || tag === "I" || tag === "CITE") next.em = true;
    if (tag === "STRONG" || tag === "B") next.strong = true;
    if (tag === "CODE" || tag === "KBD") next.code = true;
    if (tag === "A") {
      const href = child.getAttribute?.("href");
      if (href && /^https?:/i.test(href)) next.href = href;
    }
    inlineRuns(child, next, out);
  }
  return out;
}

function tidyRuns(runs: Run[]): Run[] {
  // Merge neighbours with identical marks, collapse whitespace, trim the ends.
  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.em === r.em && prev.strong === r.strong && prev.code === r.code && prev.href === r.href) prev.text += r.text;
    else merged.push({ ...r });
  }
  // Typographic quotes, using the previous run's last character as context.
  let prev = " ";
  for (const r of merged) {
    let t = undash(r.text.replace(/\s+/g, " "));
    if (!r.code) {
      let out = "";
      for (const ch of t) {
        if (ch === '"') out += /[\s(\[{\u2014-]/.test(prev) ? "\u201C" : "\u201D";
        else if (ch === "'") out += /[\s(\[{\u2014-]/.test(prev) ? "\u2018" : "\u2019";
        else out += ch;
        prev = ch;
      }
      t = out;
    } else if (t) prev = t[t.length - 1];
    r.text = t;
  }
  if (merged[0]) merged[0].text = merged[0].text.trimStart();
  const last = merged[merged.length - 1];
  if (last) last.text = last.text.trimEnd();
  return merged.filter((r) => r.text.length > 0);
}

/** Query parameters that only resize or re-encode a picture. */
const SIZE_PARAMS = /^(w|h|width|height|q|quality|resize|fit|crop|auto|fm|format|dpr|strip|scale)$/i;

/**
 * One key for every size of a picture: a page often shows a photo resized and
 * links or repeats it full size (WordPress "?w=2048", "-1024x768.jpg"). Other
 * parameters stay, since an image proxy names the picture in its query
 * (Next.js serves every one from "/_next/image?url=...").
 */
export function sameImage(src: string): string {
  try {
    const u = new URL(src);
    const rest = [...u.searchParams].filter(([k]) => !SIZE_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
    return `${u.host}${u.pathname.replace(/-\d+x\d+(?=\.\w+$)/, "")}?${new URLSearchParams(rest)}`;
  } catch {
    return src;
  }
}

/**
 * `keepApparatus` turns off the end-of-article trimming below. It is for whole
 * documents we trust to be reading matter (a book chapter): there a heading
 * called "Notes" is the chapter, and a chapter that is nothing but a list (a
 * glossary, a chronology) is content, not a "see also" footer.
 */
export function htmlToBlocks(root: El, base?: string, opts: { keepApparatus?: boolean } = {}): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const seen = new Set<string>();
  const figure = (img: El, caption: Run[] = []) => {
    const im = imageOf(img, base);
    if (!im || seen.has(sameImage(im.src))) return;
    seen.add(sameImage(im.src));
    blocks.push({ id: `b${++i}`, type: "figure", runs: caption, src: im.src, ...(im.alt ? { alt: im.alt } : {}) });
  };

  const table = (el: El) => {
    const t = tableOf(el);
    if (t) blocks.push({ id: `b${++i}`, type: "table", runs: [], rows: t.rows, ...(t.head ? { head: true } : {}) });
    return Boolean(t);
  };

  const visit = (node: El) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1 || !child.tagName) {
        // Stray text directly in a container becomes its own paragraph.
        if (child.nodeType === 3 && (child.textContent ?? "").trim().length > 40) {
          blocks.push({ id: `b${++i}`, type: "p", runs: tidyRuns([{ text: child.textContent ?? "" }]) });
        }
        continue;
      }
      const tag = child.tagName.toUpperCase();
      if (tag === "IMG") {
        figure(child);
        continue;
      }
      if (tag === "FIGURE") {
        const img = descendants(child, "IMG")[0];
        if (img) {
          const cap = descendants(child, "FIGCAPTION")[0];
          figure(img, cap ? tidyRuns(inlineRuns(cap)) : []);
          continue;
        }
      }
      if (tag === "PICTURE") {
        visit(child);
        continue;
      }
      if (tag === "TABLE") {
        if (!table(child)) visit(child);
        continue;
      }
      if (SKIP.has(tag)) continue;
      const type = BLOCK_TAGS[tag];

      if (type === "pre") {
        const text = (child.textContent ?? "").replace(/\s+$/, "");
        if (text.trim()) blocks.push({ id: `b${++i}`, type, runs: [{ text, code: true }] });
        continue;
      }
      if (type === "quote" || type === "li") {
        // Containers that hold their own paragraphs: descend, tagging the leaves.
        const hasBlockChildren = Array.from(child.childNodes).some(
          (c) => c.nodeType === 1 && c.tagName && BLOCK_TAGS[c.tagName.toUpperCase()]
        );
        if (hasBlockChildren) {
          const before = blocks.length;
          visit(child);
          if (type === "quote") for (let k = before; k < blocks.length; k++) if (blocks[k].type === "p") blocks[k].type = "quote";
          continue;
        }
      }
      if (type) {
        const runs = tidyRuns(inlineRuns(child));
        const text = runs.map((r) => r.text).join("");
        if (text.trim().length > 0) blocks.push({ id: `b${++i}`, type, runs });
        // Images inside a paragraph (often its only content) stand on their own after it.
        for (const img of descendants(child, "IMG")) figure(img);
        // So do data tables: Readability turns a div that only wraps one (arXiv's HTML papers) into a paragraph.
        for (const t of descendants(child, "TABLE")) table(t);
        continue;
      }
      visit(child);
    }
  };

  visit(root);
  const textOf = (b: Block) => b.runs.map((r) => r.text).join("").trim();
  // Empties still go; everything else in a trusted document stays, in order.
  if (opts.keepApparatus) return blocks.filter((b) => b.type === "figure" || b.type === "table" || textOf(b).length > 1);
  // Reference apparatus at the end (Wikipedia and friends) is not reading matter.
  const TAIL = /^(references|notes|footnotes|citations|sources|bibliography|see also|external links|further reading)$/i;
  const tailAt = blocks.findIndex((b, idx) => idx > 3 && (b.type === "h2" || b.type === "h3") && TAIL.test(textOf(b)));
  const body = tailAt > 0 ? blocks.slice(0, tailAt) : blocks;
  const isCitation = (t: string) => /^(↑|\^)/.test(t) || /^\d+( \d+)+ /.test(t) || /(Retrieved|Archived from|ISBN|doi:)/.test(t);
  let cleaned = body.filter((b) => {
    const t = textOf(b);
    if (b.type === "figure" || b.type === "table") return true;
    return t.length > 1 && !/^\[?edit\]?$/i.test(t) && !/^From Wikipedia, the free encyclopedia$/i.test(t) && !(b.type === "li" && isCitation(t));
  });
  // A run of short list items after the last paragraph is a "see also" list.
  const lastProse = cleaned.reduce((at, b, idx) => (b.type === "p" || b.type === "quote" ? idx : at), -1);
  const tail = cleaned.slice(lastProse + 1);
  if (tail.length >= 8 || (tail.length >= 5 && tail.every((b) => textOf(b).length < 160))) cleaned = cleaned.slice(0, lastProse + 1);
  return cleaned;
}
