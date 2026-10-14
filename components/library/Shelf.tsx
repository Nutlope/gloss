"use client";

import { useLayoutEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { fmtMinutes, groupOf, lookOf, type Book, type Sort, type TagKey, type TopicKey } from "@/lib/library";
import { Glyph, Spine } from "./Book";

const PAD = 28;
const GAP = 3;
const GROUP_GAP = 36;
/** The least room between one label and the next run's, on the same shelf. */
const LABEL_GAP = 18;
const AREA = 268; // the space a book stands in
const PLANK = 16;
const PITCH = AREA + PLANK + 52;

/** Fetch a book's picture as it is reached for, so its cover is there when it comes off the shelf. */
const warm = (b: Book) => {
  const src = b.cover?.startsWith("/") ? b.cover : b.image;
  if (src) new Image().src = src;
};

type Pos = { x: number; y: number; row: number };

/** Text widths in the label's face (12.5px, medium), measured once each. */
const widths = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null = null;
function textWidth(s: string) {
  const hit = widths.get(s);
  if (hit !== undefined) return hit;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return s.length * 6.8;
  ctx.font = `500 12.5px ${getComputedStyle(document.body).fontFamily}`;
  const w = ctx.measureText(s).width;
  widths.set(s, w);
  return w;
}

/** How wide a shelf label is, as drawn: its icon, its words, its count, and its padding. */
const labelWidth = (l: { label: string; icon?: string; count: number }) => (l.icon ? 21 : 0) + textWidth(l.label) + 6 + textWidth(String(l.count)) + 17;

type Label = { key: string; label: string; icon?: TopicKey | TagKey; x: number; row: number; count: number };

/**
 * Where every book stands: left to right along a plank, a gap between runs
 * of a topic (or a month, or a length), a new shelf when one is full. Each
 * run's label is centred under it, and runs stand far enough apart for their
 * labels never to meet. The books are placed absolutely, so a new sort or
 * filter slides each one to its new spot instead of re-flowing.
 */
function shelve(books: Book[], width: number, sort: Sort) {
  const pos = new Map<string, Pos>();
  const labels: Label[] = [];
  const ends: number[] = [];
  const inner = Math.max(200, width);
  const right = inner - PAD;

  // Consecutive books of one group make a run.
  const runs: { g: ReturnType<typeof groupOf>; books: Book[] }[] = [];
  for (const b of books) {
    const g = groupOf(b, sort);
    const last = runs[runs.length - 1];
    if (last && (last.g?.key ?? null) === (g?.key ?? null)) last.books.push(b);
    else runs.push({ g, books: [b] });
  }

  let row = 0;
  let edge = PAD; // the right edge of the last book on this shelf
  let labelEdge = -Infinity; // the right edge of the last label on this shelf
  let used = false;
  const wrap = () => {
    ends[row] = edge;
    row++;
    edge = PAD;
    labelEdge = -Infinity;
    used = false;
  };

  for (const run of runs) {
    const ws = run.books.map((b) => lookOf(b).w);
    const runW = ws.reduce((n, w) => n + w, 0) + GAP * (ws.length - 1);
    const lw = run.g ? labelWidth({ label: run.g.label, icon: run.g.icon, count: run.books.length }) : 0;
    let x = PAD;
    if (used) {
      x = edge + GROUP_GAP;
      if (run.g) x = Math.max(x, labelEdge + LABEL_GAP + lw / 2 - Math.min(runW, right - x) / 2);
      if (x + ws[0] > right) {
        wrap();
        x = PAD;
      }
    }
    // The label goes under the part of the run on its first shelf.
    const segRow = row;
    const segStart = x;
    let segEnd = -1;
    run.books.forEach((b, i) => {
      if (used && x + ws[i] > right) {
        if (segEnd < 0) segEnd = edge;
        wrap();
        x = PAD;
      }
      pos.set(b.id, { x, y: row * PITCH + AREA - lookOf(b).h, row });
      edge = x + ws[i];
      x = edge + GAP;
      used = true;
    });
    if (segEnd < 0) segEnd = edge;
    if (run.g) {
      const before = labels.length && labels[labels.length - 1].row === segRow ? labels[labels.length - 1] : null;
      let left = (segStart + segEnd) / 2 - lw / 2;
      if (before) left = Math.max(left, before.x + labelWidth(before) + LABEL_GAP);
      left = Math.max(2, Math.min(inner - lw, left));
      labels.push({ key: run.g.key, label: run.g.label, icon: run.g.icon, x: left, row: segRow, count: run.books.length });
      if (row === segRow) labelEdge = left + lw;
    }
  }
  ends[row] = edge;
  return { pos, labels, rows: row + 1, ends };
}

export function Shelf({
  books,
  shown,
  sort,
  openId,
  fresh,
  onOpen,
  onLabel,
}: {
  /** Every book that could be on the shelf, in order. */
  books: Book[];
  /** The ids that pass the filter. */
  shown: Set<string>;
  sort: Sort;
  openId: string | null;
  /** Books just added, here or by an agent: they drop in. */
  fresh: Set<string>;
  onOpen: (b: Book, el: HTMLElement) => void;
  /** A shelf label, clicked: that topic's own page. */
  onLabel?: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [entering, setEntering] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const t = setTimeout(() => setEntering(false), 1800);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const visible = useMemo(() => books.filter((b) => shown.has(b.id)), [books, shown]);
  const { pos, labels, rows, ends } = useMemo(() => shelve(visible, width, sort), [visible, width, sort]);

  // A book taken off the shelf stays where it last stood while it fades; one
  // coming back appears at its new place without sliding across the room.
  const last = useRef(new Map<string, Pos>());
  const wasOut = useRef(new Set<string>());
  const placed = books.map((b) => {
    const p = pos.get(b.id);
    const out = !p;
    const at = p ?? last.current.get(b.id) ?? { x: PAD, y: AREA - lookOf(b).h, row: 0 };
    const jump = !out && (wasOut.current.has(b.id) || !last.current.has(b.id));
    return { b, at, out, jump };
  });
  useLayoutEffect(() => {
    for (const p of placed) if (!p.out) last.current.set(p.b.id, p.at);
    wasOut.current = new Set(placed.filter((p) => p.out).map((p) => p.b.id));
  });

  // Order of first appearance, for the stagger when the shelf fills.
  const order = new Map(visible.map((b, i) => [b.id, i]));

  // Arrow keys walk along the shelf.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = visible.map((b) => ref.current?.querySelector<HTMLElement>(`[data-book="${b.id}"]`)).filter(Boolean) as HTMLElement[];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  };

  const lastRow = rows - 1;
  const free = width - PAD - (ends[lastRow] ?? PAD);

  return (
    <div ref={ref} className={`bookcase ${entering ? "is-entering" : ""}`} style={{ height: rows * PITCH - 20 }} onKeyDown={onKeyDown}>
      {Array.from({ length: Math.max(rows, 1) }, (_, r) => (
        <div key={r} className="plank" style={{ transform: `translateY(${r * PITCH + AREA}px)`, ["--i" as string]: r }} aria-hidden />
      ))}

      {labels.map((l) => {
        const style = { transform: `translate(${l.x}px, ${l.row * PITCH + AREA + PLANK + 8}px)` };
        const body = (
          <>
            {l.icon && <Glyph k={l.icon} size={16} className="me-[5px]" />}
            {l.label}
            <span className="plank-n">{l.count}</span>
          </>
        );
        return onLabel ? (
          <button key={`${sort}-${l.key}`} type="button" className="plank-label" style={style} onClick={() => onLabel(l.key)} data-tip={`Open ${l.label}`}>
            {body}
          </button>
        ) : (
          <div key={`${sort}-${l.key}`} className="plank-label" style={style} aria-hidden>
            {body}
          </div>
        );
      })}

      {/* A bookend at the end of every shelf, and something growing on the last. */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={`end-${r}`} className="bookend" style={{ transform: `translate(${(ends[r] ?? PAD) + 2}px, ${r * PITCH + AREA - 64}px)` }} aria-hidden>
          <svg viewBox="0 0 30 64" width="30" height="64">
            <defs>
              <linearGradient id="bookend-shade" x1="0" x2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".22" />
                <stop offset=".5" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity=".18" />
              </linearGradient>
            </defs>
            <path d="M3 64V24C3 12 11 3 23 3h3v61z" fill="currentColor" />
            <path d="M3 64V24C3 12 11 3 23 3h3v61z" fill="url(#bookend-shade)" />
          </svg>
        </div>
      ))}
      <div className="shelf-plant" data-hidden={free < 140 || undefined} style={{ transform: `translate(${width - PAD - 92}px, ${lastRow * PITCH + AREA - 132}px)` }} aria-hidden>
        <Plant />
      </div>
      <div className="shelf-pile" data-hidden={free < 330 || undefined} style={{ transform: `translate(${width - PAD - 92 - 170}px, ${lastRow * PITCH + AREA - 46}px)` }} aria-hidden>
        <span style={{ background: "#3b2f6e", width: 146, marginLeft: 8 }} />
        <span style={{ background: "#e5c97a", width: 136, marginLeft: 0 }} />
        <span style={{ background: "#a43848", width: 156, marginLeft: 3 }} />
      </div>

      {width > 0 && placed.map(({ b, at, out, jump }) => {
        const look = lookOf(b);
        const i = order.get(b.id) ?? 0;
        return (
          <div
            key={b.id}
            className="bk-x"
            data-jump={jump || undefined}
            style={{ transform: `translateX(${at.x}px)`, transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 9}ms` }}
          >
            <div className="bk-y" data-jump={jump || undefined} style={{ transform: `translateY(${at.y}px)`, transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 9}ms` }}>
              <div
                className="bk-in"
                data-out={out || undefined}
                data-fresh={fresh.has(b.id) || undefined}
                style={{ ["--i" as string]: i, transitionDelay: out ? "0ms" : `${80 + Math.min(i, 30) * 14}ms` }}
              >
                <button
                  type="button"
                  data-book={b.id}
                  className="bk"
                  data-open={openId === b.id || undefined}
                  tabIndex={out ? -1 : 0}
                  aria-hidden={out || undefined}
                  aria-label={`${b.title}, ${b.author}`}
                  data-tip={b.title}
                  data-tip-hint={`${b.author} · ${fmtMinutes(b.minutes)}${b.pct > 0 && b.pct < 1 ? ` · ${Math.round(b.pct * 100)}% read` : b.pct >= 1 ? " · read" : ""}`}
                  onClick={(e) => onOpen(b, e.currentTarget.querySelector(".spine") as HTMLElement)}
                  onPointerEnter={() => warm(b)}
                  onFocus={() => warm(b)}
                >
                  <ViewTransition name={`book-${b.id}`} share="lib-morph" default="none">
                    <Spine book={b} look={look} />
                  </ViewTransition>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Plant() {
  return (
    <svg viewBox="0 0 92 132" width="92" height="132">
      <g className="plant-leaves">
        <path d="M46 84C44 60 30 44 12 40c4 20 16 36 34 44z" fill="#5f8a55" />
        <path d="M46 84c2-26 14-46 34-52-2 24-14 42-34 52z" fill="#4b7444" />
        <path d="M46 86C40 56 44 26 58 6c8 26 2 56-12 80z" fill="#6f9b62" />
        <path d="M46 86C36 66 22 60 6 64c10 14 24 22 40 22z" fill="#55804c" />
        <path d="M46 86c10-16 26-22 42-18-8 14-24 20-42 18z" fill="#6a9560" />
      </g>
      <path d="M22 84h48l-6 46H28z" fill="#c4704b" />
      <path d="M19 80h54v9H19z" fill="#d4825c" />
      <path d="M28 130h36" stroke="rgb(0 0 0 / .18)" strokeWidth="2" />
    </svg>
  );
}
