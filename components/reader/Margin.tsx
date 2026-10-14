"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { anchorToRange, blockEl } from "@/lib/anchor";
import { MARKERS } from "@/lib/settings";
import { useStore, type Gloss, type Highlight } from "@/lib/store";
import { GlossCard, marginStyle } from "./GlossCard";

/** Room between notes; one-line notes in a crowded stretch sit close, like a list. */
const GAP = 16;
const GAP_MINI = 4;
/** Notes whose passages start closer than this are a crowd. */
const CROWD = 88;

type Item = { id: string; desired: number; anchorY: number; h: number; created: number; mini: boolean };
type Layout = { tops: Record<string, number>; anchors: Record<string, number>; mini: Record<string, boolean>; height: number; hintTop: number };

const gapAfter = (a: Item, b: Item) => (a.mini && b.mini ? GAP_MINI : GAP);

/**
 * Places glosses beside their passages. The active gloss sits exactly at its
 * anchor; the rest stack away from it in both directions without overlapping,
 * the way comments settle in a well-made editor.
 */
function place(items: Item[], activeId: string | null): Record<string, number> {
  const tops: number[] = items.map((it) => it.desired);
  const ai = activeId ? items.findIndex((it) => it.id === activeId) : -1;
  const forward = (from: number) => {
    for (let i = Math.max(1, from); i < items.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + items[i - 1].h + gapAfter(items[i - 1], items[i]));
  };
  if (ai < 0) {
    tops[0] = Math.max(0, tops[0] ?? 0);
    forward(1);
  } else {
    forward(ai + 1);
    for (let i = ai - 1; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - gapAfter(items[i], items[i + 1]) - items[i].h);
    if (tops[0] < 0) {
      tops[0] = 0;
      forward(1);
    }
  }
  const out: Record<string, number> = {};
  items.forEach((it, i) => (out[it.id] = tops[i]));
  return out;
}

/**
 * Glosses and the reader's own notes share the margin and one layout, so
 * neither ever covers the other.
 */
export function Margin({
  glosses,
  notes,
  articleEl,
  gutter,
  onOpenNote,
}: {
  glosses: Gloss[];
  notes: Highlight[];
  articleEl: HTMLElement | null;
  gutter: number;
  onOpenNote: (h: Highlight) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const activeGloss = useStore((s) => s.activeGloss);
  const activeHighlight = useStore((s) => s.activeHighlight);
  const active = activeGloss ?? (activeHighlight && notes.some((h) => h.id === activeHighlight) ? activeHighlight : null);
  const hover = useStore((s) => s.hoverGloss);
  const entering = useStore((s) => s.enteringGloss);
  const setUI = useStore((s) => s.setUI);
  const size = useStore((s) => s.settings.size);
  const [layout, setLayout] = useState<Layout>({ tops: {}, anchors: {}, mini: {}, height: 0, hintTop: 0 });
  const raf = useRef(0);
  // Cards already shown in their place. Until then a card has no transition,
  // so on load it appears beside its passage instead of sliding down from the top.
  const placed = useRef(new Set<string>());
  useLayoutEffect(() => {
    for (const id of Object.keys(layout.tops)) placed.current.add(id);
  }, [layout]);

  const compute = useCallback(() => {
    const col = colRef.current;
    if (!col) return;
    const base = col.getBoundingClientRect().top;
    const items: Item[] = [];
    for (const g of glosses) {
      let desired = 0;
      let anchorY = 0;
      if (g.anchor) {
        const rects = anchorToRange(g.anchor)?.getClientRects();
        const r = rects && rects.length ? rects[0] : null;
        if (!r) continue;
        desired = r.top - base - 6;
        anchorY = r.top - base + r.height / 2;
      } else if (g.at) {
        const r = blockEl(g.at)?.getBoundingClientRect();
        if (!r) continue;
        desired = r.top - base;
        anchorY = r.top - base + 14;
      }
      items.push({ id: g.id, desired, anchorY, h: cards.current.get(g.id)?.offsetHeight ?? 64, created: g.createdAt, mini: false });
    }
    for (const h of notes) {
      const rects = anchorToRange(h.anchor)?.getClientRects();
      const r = rects && rects.length ? rects[0] : null;
      if (!r) continue;
      items.push({ id: h.id, desired: r.top - base - 6, anchorY: r.top - base + r.height / 2, h: cards.current.get(h.id)?.offsetHeight ?? 48, created: h.createdAt, mini: false });
    }
    items.sort((a, b) => a.desired - b.desired || a.created - b.created);
    // Crowding is read from where the passages are, not from card sizes, so it never oscillates.
    const mini: Record<string, boolean> = {};
    const isNote = new Set(notes.map((h) => h.id));
    items.forEach((it, i) => {
      const near = (j: number) => j >= 0 && j < items.length && Math.abs(items[j].desired - it.desired) < CROWD;
      it.mini = it.id !== active && !isNote.has(it.id) && (near(i - 1) || near(i + 1));
      mini[it.id] = it.mini;
    });
    const tops = place(items, active);
    const anchors: Record<string, number> = {};
    let height = 0;
    for (const it of items) {
      anchors[it.id] = it.anchorY;
      height = Math.max(height, tops[it.id] + it.h);
    }
    const firstPara = articleEl?.querySelector("[data-n]")?.getBoundingClientRect();
    const hintTop = firstPara ? Math.max(0, firstPara.top - base) : 0;
    setLayout((prev) => {
      const same =
        prev.height === height &&
        Math.abs(prev.hintTop - hintTop) < 0.5 &&
        Object.keys(tops).length === Object.keys(prev.tops).length &&
        Object.entries(tops).every(([k, v]) => Math.abs((prev.tops[k] ?? -1e9) - v) < 0.5 && Math.abs((prev.anchors[k] ?? -1e9) - anchors[k]) < 0.5);
      const sameMini = Object.keys(mini).length === Object.keys(prev.mini).length && Object.entries(mini).every(([k, v]) => prev.mini[k] === v);
      return same && sameMini ? prev : { tops, anchors, mini, height, hintTop };
    });
  }, [glosses, notes, active, articleEl]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(compute);
  }, [compute]);

  useLayoutEffect(() => {
    compute();
  }, [compute, size]);

  useEffect(() => {
    const ro = new ResizeObserver(schedule);
    if (articleEl) {
      ro.observe(articleEl);
      if (articleEl.parentElement) ro.observe(articleEl.parentElement);
    }
    for (const el of cards.current.values()) ro.observe(el);
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf.current);
    };
  }, [schedule, articleEl, glosses, notes]);

  const lead = [active, hover && hover !== active ? hover : null].filter((x): x is string => Boolean(x && layout.tops[x] !== undefined));

  return (
    <div ref={colRef} className="relative" style={{ minHeight: layout.height + 40 }}>
      {glosses.length === 0 && notes.length === 0 && <EmptyMargin top={layout.hintTop} />}

      <svg className="pointer-events-none absolute top-0 overflow-visible" style={{ left: -gutter, width: gutter, height: Math.max(1, layout.height) }} aria-hidden>
        {lead.map((id) => {
          const y0 = layout.anchors[id];
          const y1 = layout.tops[id] + 17;
          const x0 = 10;
          const x1 = gutter - 1;
          const d = `M ${x0} ${y0} C ${x0 + gutter * 0.5} ${y0}, ${x1 - gutter * 0.5} ${y1}, ${x1} ${y1}`;
          return (
            <g key={`${id}:${Math.round(y0)}:${Math.round(y1)}`} opacity={id === active ? 1 : 0.6}>
              <path d={d} className="leader" />
              <circle cx={x0} cy={y0} r={2.4} fill="var(--rubric)" />
            </g>
          );
        })}
      </svg>

      {glosses.map((g) => (
        <GlossCard
          key={g.id}
          ref={(el) => {
            if (el) cards.current.set(g.id, el);
            else cards.current.delete(g.id);
          }}
          gloss={g}
          variant="margin"
          top={layout.tops[g.id]}
          fresh={!placed.current.has(g.id)}
          active={active === g.id}
          mini={layout.mini[g.id] ?? false}
          hover={hover === g.id}
          entering={entering === g.id}
          onActivate={() => setUI({ activeGloss: g.id, activeHighlight: null })}
        />
      ))}

      {notes.map((h) => (
        <button
          key={h.id}
          ref={(el) => {
            if (el) cards.current.set(h.id, el);
            else cards.current.delete(h.id);
          }}
          type="button"
          onClick={() => onOpenNote(h)}
          className={`mnote${active === h.id ? " is-active" : ""}`}
          style={{ ...marginStyle(layout.tops[h.id], !placed.current.has(h.id)), ["--note-c" as string]: MARKERS.find((m) => m.key === (h.color ?? "yellow"))?.color }}
          aria-label={`خاتىرىڭىز: ${h.note}. خاتىرىنى تەھرىرلەش.`}
        >
          <span className="line-clamp-4 whitespace-pre-line">{h.note}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyMargin({ top }: { top: number }) {
  return (
    <div
      className="rise absolute inset-x-0 border-l-[1.5px] border-rule-strong py-1 ps-[15px] text-[13px] leading-relaxed text-ink-3"
      style={{ top, animationDelay: "500ms" }}
    >
      <p className="font-medium text-ink-2">بۇ رايون خاتىرە ئۈچۈن.</p>
      <p className="mt-1">خالىغان بۆلەكنى تاللاپ، سوراش ئۈچۈن يېزىشنى باشلاڭ.</p>
    </div>
  );
}
