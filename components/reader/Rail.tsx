"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGlosses, useHighlights, useStore } from "@/lib/store";
import { useReader } from "./context";

type Geo = { docTop: number; docH: number; blocks: { id: string; top: number; h: number; heading: boolean; fill: number }[] };

/**
 * A minimap of the whole text. Paragraphs are bars, your highlights are
 * yellow, glosses are vermilion dots, and the brief's sections are ticks.
 * Click or drag anywhere to travel.
 */
export function Rail({ articleEl }: { articleEl: HTMLElement | null }) {
  const { ix } = useReader();
  const glosses = useGlosses(ix.article.id);
  const highlights = useHighlights(ix.article.id);
  const brief = useStore((s) => s.briefs[ix.article.id]);
  const size = useStore((s) => s.settings.size);
  const railRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [railH, setRailH] = useState(0);
  const [view, setView] = useState({ top: 0, h: 0 });
  const [hoverY, setHoverY] = useState<number | null>(null);
  const drag = useRef(false);

  const measure = useCallback(() => {
    if (!articleEl || !railRef.current) return;
    const r = articleEl.getBoundingClientRect();
    const docTop = r.top + window.scrollY;
    const blocks = Array.from(articleEl.querySelectorAll<HTMLElement>("[data-block]")).map((el) => {
      const br = el.getBoundingClientRect();
      const len = (el.textContent ?? "").length;
      return {
        id: el.dataset.block!,
        top: br.top - r.top,
        h: br.height,
        heading: el.dataset.type === "h2" || el.dataset.type === "h3",
        fill: Math.min(1, 0.45 + len / 1400),
      };
    });
    setGeo({ docTop, docH: r.height, blocks });
    setRailH(railRef.current.clientHeight);
  }, [articleEl]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    if (articleEl) {
      ro.observe(articleEl);
      if (articleEl.parentElement) ro.observe(articleEl.parentElement);
    }
    if (railRef.current) ro.observe(railRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure, articleEl, size]);

  useEffect(() => {
    if (!geo) return;
    const on = () => setView({ top: window.scrollY - geo.docTop, h: window.innerHeight });
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [geo]);

  if (!geo || geo.docH <= 0) return <div ref={railRef} className="h-full" />;
  const k = railH / geo.docH;
  const posOf = (blockId: string) => {
    const b = geo.blocks.find((x) => x.id === blockId);
    return b ? b.top * k : null;
  };

  const travel = (clientY: number) => {
    const rr = railRef.current?.getBoundingClientRect();
    if (!rr) return;
    const y = Math.max(0, Math.min(railH, clientY - rr.top));
    window.scrollTo({ top: geo.docTop + y / k - window.innerHeight * 0.3, behavior: drag.current ? "instant" : "smooth" });
  };

  const sections = brief?.status === "ready" ? brief.data.sections : [];
  const hoverSection = (() => {
    if (hoverY === null || !sections.length) return null;
    let found: { title: string; start: number; y: number } | null = null;
    for (const s of sections) {
      const id = ix.byNumber.get(s.start);
      const y = id ? posOf(id) : null;
      if (y !== null && y <= hoverY + 2) found = { ...s, y };
    }
    return found;
  })();

  const vTop = Math.max(0, view.top * k);
  const vH = Math.max(14, Math.min(railH - vTop, view.h * k));

  return (
    <div
      ref={railRef}
      role="slider"
      aria-label="تېكىستتىكى ئورنى"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, (view.top + view.h * 0.3) / geo.docH)) * 100)}
      tabIndex={-1}
      className="group relative h-full cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        drag.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        travel(e.clientY);
        drag.current = true;
      }}
      onPointerMove={(e) => {
        const rr = railRef.current?.getBoundingClientRect();
        if (rr) setHoverY(e.clientY - rr.top);
        if (drag.current && e.buttons) travel(e.clientY);
      }}
      onPointerUp={() => (drag.current = false)}
      onPointerLeave={() => setHoverY(null)}
    >
      {geo.blocks.map((b) => (
        <span
          key={b.id}
          className="absolute left-[6px]"
          style={{
            top: b.top * k,
            height: Math.max(1, b.h * k - 2),
            width: b.heading ? 18 : 18 * b.fill,
            background: b.heading
              ? "var(--ink-2)"
              : "repeating-linear-gradient(to bottom, var(--ink-4) 0 1px, transparent 1px 3px)",
            opacity: b.heading ? 0.8 : 0.75,
          }}
        />
      ))}

      {sections.map((s) => {
        const id = ix.byNumber.get(s.start);
        const y = id ? posOf(id) : null;
        return y === null ? null : <span key={s.start} className="absolute left-0 h-px w-[5px] bg-ink-3" style={{ top: y }} />;
      })}

      {highlights.map((h) => {
        const y = posOf(h.anchor.start.b);
        return y === null ? null : <span key={h.id} className="absolute left-[4px] w-[22px] rounded-[1px] bg-[var(--hl-strong)]" style={{ top: y, height: 4 }} />;
      })}

      {glosses.map((g) => {
        const id = g.anchor?.start.b ?? g.at;
        const y = id ? posOf(id) : null;
        return y === null ? null : <span key={g.id} className="absolute left-[25px] size-[5px] rounded-full bg-[var(--rubric)]" style={{ top: y }} />;
      })}

      <span
        className="pointer-events-none absolute -left-[2px] w-[34px] rounded-[6px] border border-ink-3/35 bg-ink/[0.035] transition-[border-color] group-hover:border-ink-3/70"
        style={{ top: vTop, height: vH }}
        aria-hidden
      />

      {hoverSection && (
        <span
          className="pointer-events-none absolute left-[40px] z-10 whitespace-nowrap rounded-md bg-lens px-2 py-1 text-[11.5px] text-lens-fg shadow-pop"
          style={{ top: Math.max(0, hoverSection.y - 4), animation: "fade 0.15s" }}
        >
          {hoverSection.title}
          <span className="ms-2 text-[11px] tabular-nums text-lens-mute">¶{hoverSection.start}</span>
        </span>
      )}
    </div>
  );
}

