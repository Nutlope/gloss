"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { spineInches } from "@/lib/edition";

export type Spread = { left: ReactNode; right: ReactNode; label: string };

const ease = "cubic-bezier(0.645, 0.045, 0.355, 1)";

/**
 * Measures the stage: a page as wide as fits two side by side, in the shape of
 * the trim, and how much larger the closed book can be held than that.
 */
function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, s: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(Math.max(130, Math.min(430, (r.width - 40) / 2, (r.height - 96) / 1.5)));
      setSize({ w, s: Math.max(1, Math.min(1.5, (r.height - 120) / (w * 1.5), (r.width - 60) / (w * 1.35))) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * The edition as a book you can hold before it exists: a 6 × 9 paperback,
 * its spine as thick as its page count, the painted cover on the front. It
 * opens, and its pages turn: the title, the contents, then each piece facing
 * its plate. Every page is the press's own markup at a smaller size.
 */
export function EditionBook({
  front,
  spine,
  endpaper,
  spreads,
  pages,
  at,
  onAt,
}: {
  front: ReactNode;
  spine: ReactNode;
  endpaper: ReactNode;
  spreads: Spread[];
  pages: number;
  /** -1 closed; otherwise the spread showing. */
  at: number;
  onAt: (n: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { w: W, s: held } = useSize(stageRef);
  const H = Math.round(W * 1.5);
  const D = Math.max(7, Math.round((spineInches(pages) * W) / 6));
  const open = at >= 0;
  const [flip, setFlip] = useState<{ from: number; to: number } | null>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = useCallback(
    (to: number) => {
      if (flip || to === at || to < -1 || to >= spreads.length) return;
      // Opening and closing are the cover's to do; between spreads, a leaf turns.
      if (at < 0 || to < 0 || reduce) return onAt(to);
      setFlip({ from: at, to });
    },
    [at, flip, onAt, reduce, spreads.length]
  );

  useLayoutEffect(() => {
    if (!flip || !leafRef.current) return;
    const forward = flip.to > flip.from;
    // The leaf lifts a little as it turns, and stays above every page.
    const z = (lift: number) => `translateZ(${D / 2 + 3 + lift}px)`;
    const a = leafRef.current.animate(
      forward
        ? [{ transform: `${z(0)} rotateY(0deg)` }, { transform: `${z(W * 0.08)} rotateY(-90deg)`, offset: 0.5 }, { transform: `${z(0)} rotateY(-180deg)` }]
        : [{ transform: `${z(0)} rotateY(-180deg)` }, { transform: `${z(W * 0.08)} rotateY(-90deg)`, offset: 0.5 }, { transform: `${z(0)} rotateY(0deg)` }],
      { duration: Math.abs(flip.to - flip.from) > 1 ? 820 : 700, easing: ease, fill: "forwards" }
    );
    a.onfinish = () => {
      onAt(flip.to);
      setFlip(null);
    };
    return () => a.cancel();
    // D and W are read once, when the leaf starts to turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flip, onAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(Math.min(at + 1, spreads.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(at - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, go, spreads.length]);

  // While it's closed, the book turns a little toward the pointer, as if picked up.
  const onMove = (e: React.PointerEvent) => {
    if (open || reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -6, y: ((e.clientX - r.left) / r.width - 0.5) * 10 });
  };

  const forward = flip ? flip.to > flip.from : true;
  const show = flip ? (forward ? { left: flip.from, right: flip.to } : { left: flip.to, right: flip.from }) : { left: at, right: at };
  const leaf = flip ? (forward ? { front: flip.from, back: flip.to } : { front: flip.to, back: flip.from }) : null;
  const rightNode = spreads[Math.max(0, show.right)]?.right;
  const leftNode = show.left > 0 ? spreads[show.left]?.left : null;
  const fontSize = (W * 10.5) / 432;
  const label = open ? spreads[at]?.label : "The cover";

  return (
    <div className="eb" ref={stageRef} onPointerMove={onMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })} data-open={open || undefined}>
      {W > 0 && (
        <>
          <div className="eb-world">
            <div className="eb-shadow" style={{ width: open ? W * 2.1 : W * 1.15 * held, height: Math.max(26, W * 0.16), marginTop: open ? H / 2 - 4 : (H / 2) * held - 4 }} />
            <div className="eb-shift" style={{ transform: open ? `translateX(${W / 2}px)` : `scale(${held})` }}>
              <div
                className="eb-book"
                style={{
                  width: W,
                  height: H,
                  marginLeft: -W / 2,
                  marginTop: -H / 2,
                  ["--d" as string]: `${D}px`,
                  ["--fs" as string]: `${fontSize}px`,
                  transform: open ? "rotateX(10deg)" : `rotateX(${6 + tilt.x}deg) rotateY(${26 + tilt.y}deg)`,
                }}
              >
                {/* Back board, spine and the edges of the pages. */}
                <div className="eb-face eb-back" style={{ transform: `rotateY(180deg) translateZ(${D / 2}px)` }} />
                <div className="eb-face eb-spine" style={{ width: D, left: (W - D) / 2, transform: `rotateY(-90deg) translateZ(${W / 2}px)` }}>
                  <div className="eb-spine-in" style={{ width: H, height: D, ["--sp" as string]: `${Math.min(D * 0.42, W / 32)}px` }}>
                    {D >= 12 && spine}
                  </div>
                </div>
                <div className="eb-face eb-edge" style={{ width: D - 4, height: H - 6, top: 3, left: (W - D + 4) / 2, transform: `rotateY(90deg) translateZ(${W / 2 - 3}px)` }} />
                <div className="eb-face eb-edge is-top" style={{ width: W - 5, height: D - 4, left: 1, top: (H - D + 4) / 2, transform: `rotateX(90deg) translateZ(${H / 2 - 3}px)` }} />
                <div className="eb-face eb-edge is-top" style={{ width: W - 5, height: D - 4, left: 1, top: (H - D + 4) / 2, transform: `rotateX(-90deg) translateZ(${H / 2 - 3}px)` }} />

                {/* The pages on the right, and the page facing them once the cover is open. */}
                <div className="eb-face eb-page is-recto" style={{ width: W - 4, height: H - 6, top: 3, transform: `translateZ(${D / 2 - 2}px)` }}>
                  {rightNode}
                </div>
                {leftNode && (
                  <div className="eb-face eb-page is-verso" style={{ width: W - 4, height: H - 6, top: 3, left: -W + 4, transform: `translateZ(${D / 2 + 1}px)` }}>
                    {leftNode}
                  </div>
                )}

                {leaf && (
                  <div ref={leafRef} className="eb-leaf" style={{ width: W - 4, height: H - 6, top: 3, transform: `translateZ(${D / 2 + 3}px) rotateY(${forward ? 0 : -180}deg)` }}>
                    <div className="eb-face eb-page is-recto">{spreads[leaf.front]?.right}</div>
                    <div className="eb-face eb-page is-verso eb-leaf-back">{leaf.back > 0 ? spreads[leaf.back]?.left : endpaper}</div>
                  </div>
                )}

                {/* The front board: the cover outside, the endpaper inside. */}
                <div className="eb-cover" style={{ transform: `translateZ(${D / 2}px) rotateY(${open ? -180 : 0}deg)` }}>
                  <div className="eb-face eb-front" style={{ fontSize: W / 36 }}>
                    {front}
                  </div>
                  <div className="eb-face eb-inside">{endpaper}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="eb-bar">
            {open ? (
              <>
                <button type="button" className="eb-turn" aria-label="Turn back" disabled={Boolean(flip)} onClick={() => go(at - 1)}>
                  <ChevronLeft size={17} />
                </button>
                <span className="eb-where" aria-live="polite">
                  {label}
                  <span className="eb-of">
                    {at + 1} of {spreads.length}
                  </span>
                </span>
                <button type="button" className="eb-turn" aria-label="Turn the page" disabled={Boolean(flip) || at >= spreads.length - 1} onClick={() => go(at + 1)}>
                  <ChevronRight size={17} />
                </button>
              </>
            ) : (
              <button type="button" className="eb-open" onClick={() => go(0)}>
                Look inside <ChevronRight size={15} />
              </button>
            )}
          </div>
          {!open && <button type="button" className="eb-hit" aria-label="Open the book" onClick={() => go(0)} style={{ width: W * held, height: H * held, marginLeft: (-W * held) / 2, marginTop: (-H * held) / 2 }} />}
        </>
      )}
    </div>
  );
}
