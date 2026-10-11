/**
 * The edition's pages as HTML: a text with its highlights and notes, the
 * opening of each piece, and the front cover. One source for the book you
 * leaf through before ordering and for the press, so what you see is what
 * arrives. Every size is in em, so the same markup sets at any scale: the
 * press sets 10.5 point type on a 6 inch page, the preview whatever fits.
 *
 * Plain strings, no React: the server builds whole documents from these.
 */

import { blockText, isShouting, tidyTitle, titleCase, type Block, type Run } from "@/lib/article";
import { editionTitle, monthName, type PrintMark, type PrintText } from "@/lib/edition";
import { hostOf, TOPIC, type TopicKey } from "@/lib/library";
import { MARKERS, type Marker } from "@/lib/settings";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Marker inks as they print: a wash light enough to read through. */
export const MARK_WASH: Record<Marker, string> = {
  yellow: "rgba(242, 196, 56, 0.42)",
  green: "rgba(124, 198, 111, 0.36)",
  blue: "rgba(106, 168, 240, 0.32)",
  pink: "rgba(240, 132, 172, 0.34)",
};
export const markerColor = (m?: Marker) => MARKERS.find((x) => x.key === m)?.color ?? MARKERS[0].color;

/** The paper the cover is printed on, and the topic's inks for the type. */
export const PAPER = "#f3ead8";
export function inksOf(topic: TopicKey) {
  const [base, light, deep, pale] = TOPIC[topic].shades;
  return { base, light, deep, pale };
}

/* ---------- a text, with your marks ---------- */

type Range = { s: number; e: number; color: Marker };
type Note = { note: string; color: Marker };

/** Each block's highlighted ranges, and the notes that end in it. A mark can run across blocks. */
export function placeMarks(blocks: Block[], marks: PrintMark[]) {
  const at = new Map(blocks.map((b, i) => [b.id, i]));
  const ranges = new Map<string, Range[]>();
  const notes = new Map<string, Note[]>();
  for (const m of marks) {
    let si = at.get(m.start.b);
    let ei = at.get(m.end.b);
    if (si === undefined || ei === undefined) continue;
    let start = m.start, end = m.end;
    if (si > ei || (si === ei && start.o > end.o)) {
      [si, ei] = [ei, si];
      [start, end] = [end, start];
    }
    const color = m.color ?? "yellow";
    for (let i = si; i <= ei; i++) {
      const b = blocks[i];
      const len = blockText(b).length;
      const s = Math.max(0, i === si ? start.o : 0);
      const e = Math.min(len, i === ei ? end.o : len);
      if (e > s) ranges.set(b.id, [...(ranges.get(b.id) ?? []), { s, e, color }]);
    }
    const note = m.note?.trim();
    if (note) notes.set(blocks[ei].id, [...(notes.get(blocks[ei].id) ?? []), { note, color }]);
  }
  return { ranges, notes };
}

export type Hyphenate = (s: string) => string;
const same: Hyphenate = (s) => s;

/**
 * Typographer's quotes for straight ones, and for TeX's `` and '' that old
 * pages still carry. One entry per character, so marks keep their offsets.
 */
function curl(text: string): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(text.length);
  const opens = (i: number) => i === 0 || /[\s([{\u2014\u2013\u201C\u2018-]/.test(text[i - 1]);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "`" && text[i + 1] === "`") {
      out[i] = "\u201C";
      out[++i] = "";
    } else if (c === "'" && text[i + 1] === "'") {
      out[i] = "\u201D";
      out[++i] = "";
    } else if (c === '"') out[i] = opens(i) ? "\u201C" : "\u201D";
    else if (c === "'") out[i] = opens(i) && /\S/.test(text[i + 1] ?? "") ? "\u2018" : "\u2019";
    else if (c === "`") out[i] = "\u2018";
  }
  return out;
}

/** A block's runs as inline HTML, with highlights laid over them. */
function inline(runs: Run[], ranges: Range[] = [], hy: Hyphenate = same): string {
  const text = runs.map((r) => r.text).join("");
  const cuts = new Set([0, text.length]);
  let pos = 0;
  const starts: number[] = [];
  for (const r of runs) {
    starts.push(pos);
    pos += r.text.length;
    cuts.add(pos);
  }
  for (const r of ranges) cuts.add(r.s).add(r.e);
  const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  const typo = curl(text);
  let out = "";
  let ri = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (b <= a) continue;
    while (ri < runs.length - 1 && starts[ri + 1] <= a) ri++;
    const run = runs[ri];
    let piece = "";
    for (let j = a; j < b; j++) piece += run.code ? text[j] : (typo[j] ?? text[j]);
    let html = run.code ? esc(piece) : esc(hy(piece));
    if (run.code) html = `<code>${html}</code>`;
    if (run.strong) html = `<strong>${html}</strong>`;
    if (run.em) html = `<em>${html}</em>`;
    const on = ranges.filter((r) => r.s <= a && r.e >= b).at(-1);
    if (on) html = `<mark class="hl hl-${on.color}">${html}</mark>`;
    out += html;
  }
  return out;
}

/** Pictures that will print: the press passes a map of the ones it fetched. Unmapped, a picture keeps its address. */
export type ImageSource = (src: string) => string | null;
const asIs: ImageSource = (src) => src;

export type BodyOptions = {
  hyphenate?: Hyphenate;
  image?: ImageSource;
  /** Stop after about this many words: a page for the preview. */
  words?: number;
  /** False for a text's last page: no drop cap on what is not its first paragraph. */
  lede?: boolean;
};

/** A text's blocks as HTML: paragraphs, headings, lists, quotes, code, pictures and tables, with the reader's marks and notes. */
export function bodyHTML(t: Pick<PrintText, "blocks" | "marks">, opts: BodyOptions = {}): string {
  const { ranges, notes } = placeMarks(t.blocks, t.marks);
  const hy = opts.hyphenate ?? same;
  const image = opts.image ?? asIs;
  const out: string[] = [];
  let list: string[] = [];
  let first = opts.lede !== false;
  let words = 0;
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const b of t.blocks) {
    if (opts.words && words >= opts.words) break;
    const html = inline(b.runs, ranges.get(b.id), hy);
    const text = blockText(b);
    if (b.type !== "li") flush();
    switch (b.type) {
      case "p":
        if (!text.trim()) continue;
        // A drop cap opens a real paragraph, not a dateline or a one-line preface.
        out.push(first ? `<p class="${text.trim().length >= 160 && /^[A-Za-z]/.test(text.trim()) ? "lede" : "first"}">${html}</p>` : `<p>${html}</p>`);
        first = false;
        break;
      case "h2":
      case "h3":
        // Shouting headings come down to title case, which keeps their length, so marks stay put.
        out.push(`<${b.type}>${isShouting(text) ? inline(b.runs.map((r) => ({ ...r, text: titleCase(r.text) })), ranges.get(b.id)) : inline(b.runs, ranges.get(b.id))}</${b.type}>`);
        break;
      case "li":
        list.push(`<li>${html}</li>`);
        break;
      case "quote":
        out.push(`<blockquote><p>${html}</p></blockquote>`);
        break;
      case "pre":
        out.push(`<pre>${esc(text.replace(/\t/g, "  ").replace(/\n+$/, ""))}</pre>`);
        break;
      case "note":
        out.push(`<aside class="callout">${html}</aside>`);
        break;
      case "figure": {
        const src = b.src ? image(b.src) : null;
        if (!src) continue;
        out.push(`<figure><img src="${esc(src)}" alt="${esc(b.alt ?? "")}" referrerpolicy="no-referrer">${text.trim() ? `<figcaption>${html}</figcaption>` : ""}</figure>`);
        break;
      }
      case "table": {
        const rows = (b.rows ?? []).slice(0, 80);
        if (!rows.length) continue;
        const cells = (r: string[], tag: "th" | "td") => r.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("");
        const [head, ...rest] = b.head ? rows : [null, ...rows];
        out.push(`<table class="data">${head ? `<thead><tr>${cells(head, "th")}</tr></thead>` : ""}<tbody>${rest.map((r) => `<tr>${cells(r as string[], "td")}</tr>`).join("")}</tbody></table>`);
        break;
      }
    }
    for (const n of notes.get(b.id) ?? []) out.push(`<p class="your-note" style="--mk:${markerColor(n.color)}"><span class="pen">Your note</span> ${esc(hy(n.note))}</p>`);
    words += text.split(/\s+/).length;
  }
  flush();
  return out.join("\n");
}

/* ---------- the opening of a piece ---------- */

export const minutesOf = (words: number) => Math.max(1, Math.round(words / 230));

/** Where a text came from, for its byline: the site, and the year when there is one. */
export function sourceLine(t: Pick<PrintText, "source" | "sourceUrl" | "published">): string {
  const host = hostOf(t.sourceUrl) ?? t.source?.split(",")[0].trim();
  const year = t.published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1];
  return [host, year].filter(Boolean).join(" · ");
}

/** A short title for the running head. */
export function shortTitle(title: string, max = 52): string {
  const t = tidyTitle(title).replace(/\s*[:|–—-]\s+.*$/, (m) => (title.length > max ? "" : m));
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
}

export function openerHTML(t: PrintText, opts: { no: number; words: number }): string {
  const topic = TOPIC[t.topic];
  const by = t.author?.trim();
  const src = sourceLine(t);
  return `<header class="opener">
  <p class="kicker"><span class="topic">${esc(topic.key === "unsorted" ? "Saved" : topic.name)}</span><span class="no">${String(opts.no).padStart(2, "0")}</span></p>
  <h1 class="title">${esc(tidyTitle(t.title))}</h1>
  <span class="rh">${esc(shortTitle(t.title))}</span>
  ${by ? `<p class="byline">${esc(by)}</p>` : ""}
  <p class="meta">${[src && esc(src), `${minutesOf(opts.words)} min`].filter(Boolean).join(" · ")}</p>
</header>`;
}

/* ---------- the front cover ---------- */

export type CoverView = {
  name: string;
  month: string;
  theme: string;
  lines: string[];
  topic: TopicKey;
  /** The painting: a URL or a data URI. Without one, the topic's plate. */
  art?: string | null;
  count: number;
};

/** The Gloss mark: lines of text with a note in the margin. */
export const MARK_SVG = (ink: string, dot: string) =>
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6.5h10.5M3 11.5h10.5M3 16.5h6.5" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 3v18" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" opacity="0.32"/><circle cx="18.5" cy="11.5" r="2.9" fill="${dot}"/></svg>`;

const RUBRIC = "#c1401b";

export function coverVars(topic: TopicKey): string {
  const k = inksOf(topic);
  return `--ink:${k.deep};--ink-2:${k.base};--wash:${k.pale};--paper:${PAPER};--rubric:${RUBRIC}`;
}

/** The front: the painting full bleed, fading into paper at the top under the masthead. */
export function frontHTML(c: CoverView, opts: { plate?: string } = {}): string {
  const art = c.art || opts.plate || "";
  const lines = c.lines.filter(Boolean).slice(0, 3);
  return `<div class="gc-front" style="${coverVars(c.topic)}">
  ${art ? `<div class="gc-art${c.art ? "" : " is-plate"}"><img src="${esc(art)}" alt=""></div>` : ""}
  <div class="gc-fade"></div>
  <header class="gc-mast">
    <p class="gc-dateline"><span>${esc(monthName(c.month))}</span><span>${c.count} ${c.count === 1 ? "piece" : "pieces"}</span></p>
    <p class="gc-word">Gloss</p>
    <p class="gc-ed">${esc(editionTitle(c.name))}</p>
    ${c.theme ? `<p class="gc-theme">${esc(c.theme)}</p>` : ""}
  </header>
  ${lines.length ? `<ul class="gc-lines">${lines.map((l) => `<li><span>${esc(l)}</span></li>`).join("")}</ul>` : ""}
</div>`;
}

/**
 * The cover's type, in em of a 36em-wide front. Shared by the preview and the
 * press; colours come in as variables so each month prints in its own inks.
 */
export const COVER_CSS = `
.gc-front { position: relative; width: 36em; height: 54em; overflow: hidden; background: var(--paper); color: var(--ink); }
.gc-art { position: absolute; left: 0; right: 0; top: 0; bottom: 0; }
.gc-art img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 100%; }
.gc-art.is-plate { top: 19em; left: 3em; right: 3em; bottom: 9em; }
.gc-fade { position: absolute; left: 0; right: 0; top: 0; height: 27em; background: linear-gradient(to bottom, var(--paper) 0%, var(--paper) 46%, rgba(243, 234, 216, 0.82) 70%, rgba(243, 234, 216, 0) 100%); }
.gc-mast { position: absolute; left: 2.6em; right: 2.6em; top: 2.5em; }
.gc-dateline { display: block; margin: 0; padding-bottom: 0.7em; border-bottom: 0.08em solid var(--ink); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.95em; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; line-height: 1; overflow: hidden; }
.gc-dateline span:last-child { float: right; }
.gc-word { margin: 0.02em 0 0 -0.05em; font-family: var(--gp-serif, "Newsreader"), serif; font-weight: 500; font-size: 10.6em; line-height: 0.98; letter-spacing: -0.035em; }
.gc-ed { margin: 0.05em 0 0; font-family: var(--gp-serif, "Newsreader"), serif; font-style: italic; font-weight: 400; font-size: 2.35em; line-height: 1.05; letter-spacing: -0.01em; }
.gc-theme { margin: 0.55em 0 0; max-width: 17em; font-family: var(--gp-serif, "Newsreader"), serif; font-size: 1.45em; line-height: 1.22; color: var(--ink-2); }
.gc-lines { position: absolute; left: 2.6em; right: 6em; bottom: 2.8em; margin: 0; padding: 0; list-style: none; }
.gc-lines li { margin-top: 0.42em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-weight: 600; font-size: 1.12em; line-height: 1.55; }
.gc-lines li span { background: var(--paper); color: var(--ink); padding: 0.18em 0.5em 0.2em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
`;

/**
 * The interior's type, in em of the body size (10.5 point at the press). The
 * page itself, margins, running heads and folios, is the press's (lib/print/book.ts).
 */
export const BOOK_CSS = `
.gb { font-family: var(--gp-serif, "Newsreader"), Georgia, serif; font-size: 1em; line-height: 1.39; color: #1d1b18; font-kerning: normal; font-variant-ligatures: common-ligatures; font-variant-numeric: oldstyle-nums proportional-nums; -webkit-font-smoothing: antialiased; }
.gb p { margin: 0; text-align: justify; text-indent: 1.3em; hyphens: manual; -webkit-hyphens: manual; orphans: 2; widows: 2; }
.gb p.lede, .gb p.first, .gb h2 + p, .gb h3 + p, .gb blockquote + p, .gb figure + p, .gb ul + p, .gb pre + p, .gb table + p, .gb .callout + p { text-indent: 0; }
.gb p.lede::first-letter { float: left; margin: 0.07em 0.09em 0 0; font-size: 3.62em; line-height: 0.76; font-weight: 500; color: var(--ink, #1d1b18); }
.gb strong { font-weight: 600; }
.gb code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.86em; }
.gb h2 { margin: 1.5em 0 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.8em; font-weight: 700; line-height: 1.3; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink, #1d1b18); text-align: left; break-after: avoid; page-break-after: avoid; }
.gb h3 { margin: 1.2em 0 0.35em; font-size: 1.04em; font-style: italic; font-weight: 500; line-height: 1.25; text-align: left; break-after: avoid; page-break-after: avoid; }
.gb blockquote { margin: 0.75em 0 0.8em 1.3em; padding: 0; font-size: 0.94em; color: #3b3732; }
.gb blockquote p { text-indent: 0; }
.gb ul { margin: 0.5em 0 0.65em; padding-left: 1.3em; }
.gb li { margin: 0.18em 0; text-align: justify; hyphens: manual; }
.gb pre { margin: 0.7em 0 0.8em; padding: 0.6em 0.8em; background: #f2eee6; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.72em; line-height: 1.45; white-space: pre-wrap; word-break: break-word; break-inside: avoid; page-break-inside: avoid; }
.gb .callout { margin: 0.8em 0; padding: 0.55em 0.8em; border-left: 0.16em solid var(--ink, #1d1b18); background: #f5f1e9; font-size: 0.92em; }
.gb figure { margin: 1.1em 0 1em; padding: 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.gb figure img { display: block; margin: 0 auto; max-width: 100%; max-height: 27em; }
.gb figcaption { margin-top: 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.4; color: #6b655b; text-align: left; }
.gb table.data { width: 100%; margin: 0.9em 0; border-collapse: collapse; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.68em; line-height: 1.35; break-inside: avoid; page-break-inside: avoid; }
.gb table.data th, .gb table.data td { padding: 0.32em 0.45em; border-bottom: 0.06em solid #d3cab8; text-align: left; vertical-align: top; }
.gb table.data th { font-weight: 600; border-bottom-color: #857e72; }
.gb mark.hl { color: inherit; padding: 0.04em 0; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.gb mark.hl-yellow { background: ${MARK_WASH.yellow}; }
.gb mark.hl-green { background: ${MARK_WASH.green}; }
.gb mark.hl-blue { background: ${MARK_WASH.blue}; }
.gb mark.hl-pink { background: ${MARK_WASH.pink}; }
.gb p.your-note { margin: 0.55em 0 0.75em 1.3em; padding: 0.1em 0 0.1em 0.75em; border-left: 0.16em solid var(--mk); font-size: 0.9em; font-style: italic; line-height: 1.38; text-align: left; text-indent: 0; color: #4b463f; break-inside: avoid; page-break-inside: avoid; }
.gb .your-note .pen { margin-right: 0.45em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; font-style: normal; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #857e72; }
.gb .opener { padding-top: 4.6em; margin-bottom: 2.1em; text-align: left; }
.gb .kicker { margin: 0; padding-top: 0.8em; border-top: 0.14em solid var(--ink, #1d1b18); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; line-height: 1; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink, #1d1b18); text-indent: 0; overflow: hidden; }
.gb .kicker .no { float: right; font-variant-numeric: lining-nums tabular-nums; }
.gb .title { margin: 0.5em 0 0; font-size: 2.5em; font-weight: 500; line-height: 1.04; letter-spacing: -0.016em; color: #1d1b18; }
.gb .rh { display: block; height: 0; overflow: hidden; visibility: hidden; }
.gb .byline { margin-top: 0.75em; font-size: 1.2em; font-style: italic; line-height: 1.2; text-align: left; text-indent: 0; }
.gb .meta { margin-top: 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.3; letter-spacing: 0.02em; color: #857e72; text-align: left; text-indent: 0; }
.gb .fin { display: block; width: 0.45em; height: 0.45em; margin: 1.3em auto 0; background: var(--ink, #1d1b18); transform: rotate(45deg); }
`;

/** Front and back matter: everything that is not a piece. In em of the body size, like the rest. */
export const MATTER_CSS = `
.gb .half { padding-top: 15.086em; text-align: center; }
.gb .half-word { margin: 0; font-size: 2.3em; font-weight: 500; letter-spacing: -0.02em; text-indent: 0; text-align: center; }
.gb .half-ed { margin: 0.35em 0 0; font-size: 1.15em; font-style: italic; text-indent: 0; text-align: center; color: #4b463f; }
.gb .frontis { padding-top: 3.771em; text-align: center; }
.gb .frontis img { display: block; width: 24.686em; height: 37.029em; margin: 0 auto; object-fit: cover; }
.gb .frontis-cap { margin: 1.3em auto 0; max-width: 36.303em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.68em; line-height: 1.45; color: #6b655b; text-align: left; text-indent: 0; }
.gb .titlepage { padding-top: 7.886em; }
.gb .tp-month { margin: 0; padding-bottom: 0.7em; border-bottom: 0.08em solid var(--ink); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; color: var(--ink); text-indent: 0; text-align: left; }
.gb .tp-word { margin: 0.12em 0 0 -0.04em; font-size: 6.2em; font-weight: 500; line-height: 1; letter-spacing: -0.035em; color: var(--ink); text-indent: 0; text-align: left; }
.gb .tp-ed { margin: 0.1em 0 0; font-size: 1.75em; font-style: italic; line-height: 1.1; text-indent: 0; text-align: left; }
.gb .tp-theme { margin: 1.1em 0 0; max-width: 20em; font-size: 1.15em; line-height: 1.35; color: #4b463f; text-indent: 0; text-align: left; hyphens: none; }
.gb .tp-foot { margin: 31.347em 0 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.5; color: #6b655b; text-indent: 0; text-align: left; }
.gb .colophon { padding-top: 30.171em; }
.gb .colophon p { margin: 0 0 0.85em; font-size: 0.82em; line-height: 1.5; color: #4b463f; text-indent: 0; text-align: left; hyphens: none; }
.gb .colophon .mark { display: block; width: 1.6em; height: 1.6em; margin-bottom: 1em; }
.gb .contents h2, .gb .sources h2 { margin: 0.816em 0 1.1em; font-family: var(--gp-serif, "Newsreader"), serif; font-size: 2.1em; font-weight: 500; letter-spacing: -0.015em; text-transform: none; color: #1d1b18; }
.gb .toc-topic { margin: 1.25em 0 0.3em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.66em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; text-indent: 0; text-align: left; }
.gb .toc-row { margin: 0; padding: 0.22em 0 0.22em 2.3em; text-indent: -2.3em; text-align: left; line-height: 1.28; }
.gb .toc-no { display: inline-block; width: 2.3em; text-indent: 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 600; color: #8a8378; font-variant-numeric: lining-nums tabular-nums; }
.gb .toc-t { color: #1d1b18; text-decoration: none; }
.gb .toc-by { font-size: 0.9em; font-style: italic; color: #6b655b; }
.gb .toc-pg { float: right; margin-left: 1em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.8em; color: #1d1b18; text-decoration: none; font-variant-numeric: lining-nums tabular-nums; }
.toc-pg::after { content: target-counter(attr(href), page); }
.gb .plate-page { padding-top: 7.543em; text-align: center; }
.gb .plate-page img { display: block; width: 28.114em; height: 28.114em; margin: 0 auto; object-fit: cover; }
.gb .plate-cap { margin: 1.4em 0 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.66em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; color: var(--ink); text-indent: 0; text-align: center; }
.gb .sources ol { margin: 0; padding: 0; list-style: none; }
.gb .sources li { margin: 0 0 0.95em; font-size: 0.8em; line-height: 1.38; }
.gb .sources .s-no { display: inline-block; width: 2.2em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.85em; font-weight: 600; color: #8a8378; }
.gb .sources .s-url { display: block; padding-left: 2.2em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.82em; color: #6b655b; word-break: break-all; }
.gb .np-head { margin: 0.98em 0 1.2em; font-size: 2.1em; font-weight: 500; letter-spacing: -0.015em; text-indent: 0; text-align: left; }
.gb .np-lines { height: 42.171em; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 2.057em, #d9d1c1 2.057em, #d9d1c1 2.139em); }
.gb .np-head + .np-lines { height: 36.686em; }
`;
