/**
 * The edition as the press sets it: two whole documents, the interior and the
 * cover spread. The interior runs half title, frontispiece, title page,
 * colophon and contents, then each piece opening on a right-hand page (facing
 * its plate, when it has one), then where the pieces came from, then ruled
 * pages for notes when the book needs to reach Lulu's thirty-two. Page size,
 * margins, running heads and folios are CSS paged media, which Prince reads
 * natively and Paged.js brings to Chrome.
 */

import { blockText } from "@/lib/article";
import { arrange, editionTitle, monthName, PRINT, SPINE_TEXT_PAGES, type EditionInput, type PrintText } from "@/lib/edition";
import { TOPIC } from "@/lib/library";
import { BOOK_CSS, COVER_CSS, MATTER_CSS, bodyHTML, coverVars, esc, frontHTML, MARK_SVG, openerHTML, PAPER, sourceLine, type Hyphenate } from "./html";

export type Press = {
  engine: "chrome" | "prince";
  /** @font-face rules with the faces inlined. */
  fonts: string;
  /** A figure's picture as the press embeds it; null leaves the figure out. */
  picture: (src: string) => string | null;
  /** A piece's plate, embedded; null when it has none. */
  plate: (t: PrintText) => string | null;
  /** The painted cover (or the topic's plate in its place), embedded. */
  art: string | null;
  hyphenate: Hyphenate;
};

const words = (t: PrintText) => t.blocks.reduce((n, b) => n + (b.type === "figure" || b.type === "table" ? 0 : blockText(b).split(/\s+/).filter(Boolean).length), 0);

/** A CSS string literal. */
const str = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function pageCSS(ed: EditionInput): string {
  const verso = `Gloss · ${editionTitle(ed.name)}`;
  const head = `font-family: "Schibsted Grotesk", sans-serif; font-size: 6.3pt; font-weight: 600; letter-spacing: 0.17em; text-transform: uppercase; color: #8a8378;`;
  const foot = `font-family: "Schibsted Grotesk", sans-serif; font-size: 7.5pt; font-weight: 500; letter-spacing: 0.04em; color: #6b655b;`;
  const none = `@top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; }`;
  return `
@page { size: ${PRINT.trim.w}in ${PRINT.trim.h}in; margin: 0.78in 0.7in 0.86in 0.82in; }
@page :left {
  margin-left: 0.7in; margin-right: 0.82in;
  @top-left { content: ${str(verso)}; ${head} vertical-align: bottom; padding-bottom: 0.2in; }
  @bottom-left { content: counter(page); ${foot} vertical-align: top; padding-top: 0.24in; }
}
@page :right {
  margin-left: 0.82in; margin-right: 0.7in;
  @top-right { content: string(title); ${head} vertical-align: bottom; padding-bottom: 0.2in; }
  @bottom-right { content: counter(page); ${foot} vertical-align: top; padding-top: 0.24in; }
}
@page front { ${none} }
@page plate { ${none} }
@page notes { @top-left { content: none; } @top-right { content: none; } }
@page piece:first { @top-left { content: none; } @top-right { content: none; } }
@page :blank { ${none} }
html { font-size: 10.5pt; }
body { margin: 0; }
.rh { string-set: title content(text); }
`;
}

/**
 * How the book flows from page to page: named pages and breaks. Unscoped, because
 * Paged.js matches these against the content before it is placed in the body.
 */
const FLOW_CSS = `
.fm, .sources { page: front; }
.fm + .fm { break-before: page; page-break-before: always; }
.titlepage, .contents, .sources { break-before: right; page-break-before: right; }
.plate-page { page: plate; break-before: left; page-break-before: left; }
.piece { page: piece; break-before: right; page-break-before: right; }
.plate-page + .piece { break-before: page; page-break-before: always; }
.notes-page { page: notes; break-before: page; page-break-before: always; }
figure, pre, table, .callout, .your-note, .toc-group, .sources li { break-inside: avoid; page-break-inside: avoid; }
h2, h3 { break-after: avoid; page-break-after: avoid; }
`;


/** The interior: every page between the covers. `notes` ruled pages close it. */
export function interiorHTML(ed: EditionInput, press: Press, opts: { notes: number }): string {
  const texts = arrange(ed.texts);
  const title = editionTitle(ed.name);
  const month = monthName(ed.month);
  const marks = texts.reduce((n, t) => n + t.marks.length, 0);
  const notes = texts.reduce((n, t) => n + t.marks.filter((m) => m.note?.trim()).length, 0);
  const ink = TOPIC[ed.copy.topic].shades[2];
  const hy = press.hyphenate;

  const front = [
    `<section class="fm half"><p class="half-word">Gloss</p><p class="half-ed">${esc(title)}</p></section>`,
    press.art
      ? `<section class="fm frontis"><img src="${press.art}" alt=""><p class="frontis-cap">The cover, painted for this edition from a month of reading${ed.copy.scene ? `: ${esc(ed.copy.scene.replace(/\.$/, ""))}.` : "."}</p></section>`
      : `<section class="fm frontis"></section>`,
    `<section class="fm titlepage">
  <p class="tp-month">${esc(month)}</p>
  <p class="tp-word">Gloss</p>
  <p class="tp-ed">${esc(title)}</p>
  ${ed.copy.theme ? `<p class="tp-theme">${esc(ed.copy.theme)}</p>` : ""}
  <p class="tp-foot">${texts.length} ${texts.length === 1 ? "piece" : "pieces"} saved${ed.name ? ` by ${esc(ed.name)}` : ""} in ${esc(month)}${marks ? `, with ${marks === 1 ? "one highlight" : `${marks} highlights`}${notes ? ` and ${notes === 1 ? "one note" : `${notes} notes`}` : ""}` : ""}.</p>
</section>`,
    `<section class="fm colophon">
  <span class="mark">${MARK_SVG("#1d1b18", "#c1401b")}</span>
  <p>This edition gathers what ${ed.name ? esc(ed.name) : "you"} saved to Gloss in ${esc(month)}, arranged by subject, with every highlight and note left where it was made.</p>
  <p>Set in Newsreader and Schibsted Grotesk. The cover was painted for this edition from the month's reading. Printed and bound on demand by Lulu.</p>
  <p>usegloss.io</p>
</section>`,
  ];

  // The contents, by subject. A subject's heading never ends a page alone: each group keeps together.
  const groups: string[][] = [];
  let topic = "";
  texts.forEach((t, i) => {
    if (t.topic !== topic) {
      topic = t.topic;
      const T = TOPIC[t.topic];
      groups.push([`<p class="toc-topic" style="color:${T.shades[2]}">${esc(T.key === "unsorted" ? "Saved" : T.name)}</p>`]);
    }
    groups.at(-1)!.push(`<p class="toc-row"><a class="toc-pg" href="#t-${i + 1}"></a><span class="toc-no">${String(i + 1).padStart(2, "0")}</span><a class="toc-t" href="#t-${i + 1}">${esc(hy(t.title))}</a>${t.author ? `<span class="toc-by">&ensp;${esc(t.author)}</span>` : ""}</p>`);
  });
  front.push(`<section class="fm contents"><h2>Contents</h2>${groups.map((g) => `<div class="toc-group">${g.join("")}</div>`).join("")}</section>`);

  const pieces = texts.map((t, i) => {
    const T = TOPIC[t.topic];
    const plate = press.plate(t);
    const style = `--ink:${T.shades[2]}`;
    return `${plate ? `<section class="plate-page" style="${style}"><img src="${plate}" alt=""><p class="plate-cap">${String(i + 1).padStart(2, "0")} · ${esc(T.key === "unsorted" ? "Saved" : T.name)}</p></section>` : ""}
<article class="piece" id="t-${i + 1}" style="${style}">
${openerHTML(t, { no: i + 1, words: words(t) })}
<div class="body">${bodyHTML(t, { hyphenate: hy, image: press.picture })}</div>
<span class="fin"></span>
</article>`;
  });

  const sources = texts
    .map((t, i) => {
      const src = sourceLine(t);
      return `<li><span class="s-no">${String(i + 1).padStart(2, "0")}</span>${esc(t.title)}${t.author ? `, ${esc(t.author)}` : ""}${t.sourceUrl ? `<span class="s-url">${esc(t.sourceUrl)}</span>` : src ? `<span class="s-url">${esc(src)}</span>` : ""}</li>`;
    })
    .join("");

  const ruled = Array.from({ length: opts.notes }, (_, i) => `<section class="notes-page">${i === 0 ? `<p class="np-head">Notes</p>` : ""}<div class="np-lines"></div></section>`);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(`Gloss, ${title}, ${month}`)}</title>
<style data-pagedjs-ignore>${press.fonts}</style>
<style>${pageCSS(ed)}${FLOW_CSS}${BOOK_CSS}${MATTER_CSS}</style>
</head><body class="gb" style="--ink:${ink}">
${front.join("\n")}
${pieces.join("\n")}
<section class="sources"><h2>Where these came from</h2><ol>${sources}</ol></section>
${ruled.join("\n")}
</body></html>`;
}

/* ---------- the cover ---------- */

const BACK_CSS = `
.spread { position: relative; overflow: hidden; background: var(--ink); color: ${PAPER}; }
.back { position: absolute; left: 0; top: 0; }
.bk { position: absolute; font-family: var(--gp-serif, "Newsreader"), serif; }
.bk-kicker { margin: 0 0 1.1em; padding-bottom: 0.65em; border-bottom: 0.06em solid rgba(243, 234, 216, 0.45); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; }
.bk-list { margin: 0; padding: 0; list-style: none; column-gap: 1.6em; }
.bk-list li { margin: 0 0 0.7em; break-inside: avoid; page-break-inside: avoid; line-height: 1.2; }
.bk-no { display: inline-block; width: 1.9em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 600; opacity: 0.6; }
.bk-t { font-size: 1em; }
.bk-a { display: block; padding-left: 1.37em; font-size: 0.82em; font-style: italic; opacity: 0.72; }
.bk-quote { margin: 0; }
.bk-quote p { margin: 0; font-size: 1.32em; font-style: italic; line-height: 1.32; }
.bk-quote cite { display: block; margin-top: 0.8em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; font-style: normal; letter-spacing: 0.04em; opacity: 0.7; }
.bk-foot { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; line-height: 1.45; }
.bk-foot svg { float: left; width: 2.6em; height: 2.6em; margin: -0.1em 0.8em 0 0; }
.bk-foot p { margin: 0; }
.bk-foot .bk-site { float: right; text-align: right; opacity: 0.7; }
.spine { position: absolute; top: 0; background: var(--ink); }
.sp-in { position: absolute; left: 50%; top: 50%; white-space: nowrap; text-align: center; }
.sp-word { font-family: var(--gp-serif, "Newsreader"), serif; font-weight: 600; letter-spacing: -0.01em; }
.sp-sep { display: inline-block; width: 0.32em; height: 0.32em; margin: 0 0.9em 0.18em; border-radius: 50%; background: var(--rubric); }
.sp-ed { font-family: var(--gp-serif, "Newsreader"), serif; font-style: italic; }
.sp-month { font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.74em; }
.front { position: absolute; top: 0; overflow: hidden; background: var(--paper); }
`;

/** One of your highlights for the back cover: a whole thought, not too long. */
function quoteOf(texts: PrintText[]): { text: string; from: PrintText } | null {
  let best: { text: string; from: PrintText; score: number } | null = null;
  for (const t of texts) {
    const at = new Map(t.blocks.map((b) => [b.id, b]));
    for (const m of t.marks) {
      if (m.start.b !== m.end.b) continue;
      const b = at.get(m.start.b);
      if (!b) continue;
      const text = blockText(b).slice(Math.min(m.start.o, m.end.o), Math.max(m.start.o, m.end.o)).replace(/\s+/g, " ").trim();
      if (text.length < 50 || text.length > 230) continue;
      const score = 1000 - Math.abs(text.length - 140) + (/[.!?]$/.test(text) ? 60 : 0) + (/^[A-Z]/.test(text) ? 40 : 0);
      if (!best || score > best.score) best = { text, from: t, score };
    }
  }
  return best && { text: best.text, from: best.from };
}

/**
 * The cover spread: back, spine and front, with the bleed around all of it.
 * `width` and `height` are the whole sheet in inches, as Lulu asks for it.
 */
export function coverHTML(ed: EditionInput, press: Press, opts: { pages: number; width: number; height: number }): string {
  const texts = arrange(ed.texts);
  const b = PRINT.bleed;
  const panel = PRINT.trim.w + b;
  const spine = Math.max(0, opts.width - panel * 2);
  const title = editionTitle(ed.name);
  const month = monthName(ed.month);
  const quote = quoteOf(texts);
  // The front is drawn at 36em to 6 inches: 1em is 12 points, and the bleed 0.75em.
  const em = (PRINT.trim.w * 72) / 36;
  const bleedEm = (b * 72) / em;
  const many = texts.length > 8;
  const listSize = texts.length > 16 ? 0.74 : texts.length > 12 ? 0.82 : many ? 0.9 : 1.05;
  const spineSize = Math.min(10.5, spine * 72 * 0.42);
  const front = frontHTML({ name: ed.name, month: ed.month, theme: ed.copy.theme, lines: ed.copy.lines, topic: ed.copy.topic, art: press.art, count: texts.length });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(`Gloss, ${title}, cover`)}</title>
<style>${press.fonts}</style>
<style>
@page { size: ${opts.width}in ${opts.height}in; margin: 0; }
html, body { margin: 0; padding: 0; }
${COVER_CSS}
${BACK_CSS}
.spread { width: ${opts.width}in; height: ${opts.height}in; }
.back { width: ${panel}in; height: ${opts.height}in; }
.bk { left: ${b + 0.55}in; right: 0.55in; top: ${b + 0.6}in; bottom: ${b + 0.55}in; font-size: 11pt; }
.bk-list { font-size: ${listSize}em; ${many ? "columns: 2;" : ""} }
.bk-quote { position: absolute; left: 0; right: 0.2in; bottom: 1.05in; }
.spine { left: ${panel}in; width: ${spine}in; height: ${opts.height}in; }
.sp-in { font-size: ${spineSize}pt; transform: translate(-50%, -50%) rotate(90deg); }
.front { left: ${panel + spine}in; width: ${panel}in; height: ${opts.height}in; }
.front .gc-front { position: absolute; left: 0; top: ${b}in; font-size: ${em}pt; overflow: visible; background: transparent; }
.front .gc-art:not(.is-plate) { top: -${bleedEm}em; bottom: -${bleedEm}em; right: -${bleedEm}em; }
.front .gc-fade { top: -${bleedEm}em; right: -${bleedEm}em; }
</style></head>
<body><div class="spread" style="${coverVars(ed.copy.topic)}">
<div class="back"><div class="bk">
  <p class="bk-kicker">In this edition</p>
  <ol class="bk-list">${texts.map((t, i) => `<li><span class="bk-no">${String(i + 1).padStart(2, "0")}</span><span class="bk-t">${esc(t.title)}</span>${t.author ? `<span class="bk-a">${esc(t.author)}</span>` : ""}</li>`).join("")}</ol>
  ${quote ? `<blockquote class="bk-quote"><p>&ldquo;${esc(quote.text)}&rdquo;</p><cite>Highlighted${ed.name ? ` by ${esc(ed.name)}` : ""} in &ldquo;${esc(quote.from.title)}&rdquo;</cite></blockquote>` : ""}
  <div class="bk-foot">${MARK_SVG(PAPER, "#e8794f")}<p class="bk-site">usegloss.io<br>${esc(month)}</p><p>Printed for ${ed.name ? esc(ed.name) : "you"}<br>by Gloss</p></div>
</div></div>
<div class="spine">${opts.pages >= SPINE_TEXT_PAGES ? `<div class="sp-in"><span class="sp-word">Gloss</span><span class="sp-sep"></span><span class="sp-ed">${esc(title)}</span><span class="sp-sep"></span><span class="sp-month">${esc(month)}</span></div>` : ""}</div>
<div class="front">${front}</div>
</div></body></html>`;
}
