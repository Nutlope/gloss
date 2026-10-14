"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TOPIC, lookOf, type Book } from "@/lib/library";
import { MARK_NAMES, Mark, type AgentMark } from "./AgentMarks";
import { Glyph, Plate } from "./Book";

/** Which mark to show for a connection, from the name the reader gave it. */
function markFor(via?: string): AgentMark | null {
  if (!via) return null;
  if (/grok/i.test(via)) return "grok";
  if (/claude/i.test(via)) return "claude";
  if (/chatgpt|openai/i.test(via)) return "chatgpt";
  return null;
}

export type Wave = { ids: string[]; agent: boolean; via?: string; done: boolean; leaving?: boolean };

const SHOWN = 6;

/**
 * Texts landing on the shelf while you look, from your agent or your own
 * hands: a card at the bottom of the page that fills with their covers as
 * they arrive, with a burst of confetti in their topics' inks for each batch.
 * Once the run is over, the whole batch can come straight back off.
 */
export function Arrivals({
  wave,
  books,
  onShow,
  onRemove,
  onClose,
}: {
  wave: Wave;
  books: Book[];
  onShow: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  // Confetti for each new batch, in the colours of what arrived.
  useEffect(() => {
    const fresh = books.slice(seen.current);
    seen.current = books.length;
    const el = ref.current;
    if (!fresh.length || !el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = fresh.flatMap((b) => [TOPIC[b.topic].shades[1], TOPIC[b.topic].shades[3]]);
    burst(el, [...colors, "#e8b04a", "#f3d9a4"], Math.min(70, 28 + fresh.length * 8));
  }, [books]);

  const mark = markFor(wave.via);
  const who = wave.agent ? (mark ? MARK_NAMES[mark] : wave.via || "ۋاكالەتچىڭىز") : null;
  const n = books.length;
  const latest = books[n - 1];
  const shown = books.slice(-SHOWN);
  const more = n - shown.length;
  const noun = "ماقالە";

  return createPortal(
    <div ref={ref} className="arr" data-done={wave.done || undefined} data-leaving={wave.leaving || undefined} role="status" aria-live="polite">
      <div className="arr-head">
        <span className="arr-who" aria-hidden>
          {mark ? <Mark k={mark} size={17} /> : wave.agent ? <Glyph k="agent" size={26} /> : <Glyph k="favorite" size={24} />}
        </span>
        <p className="arr-line">
          {who ? (
            wave.done ? (
              <>
                <b>{who}</b> كۈتۈپخانىڭىزغا {n} {noun} قوشتى
              </>
            ) : (
              <>
                <b>{who}</b> كۈتۈپخانىڭىزغا ماقالە قوشۇۋاتىدۇ
              </>
            )
          ) : wave.done ? (
            <>
              جاۋىلىرىڭىزدا <b>{n}</b> يېڭى {noun}
            </>
          ) : (
            <>كۈتۈپخانىڭىزغا قوشۇۋاتىدۇ</>
          )}
        </p>
        {!wave.done && <span className="arr-count tabular-nums">{n}</span>}
        <button type="button" aria-label="يېپىش" onClick={onClose} className="arr-x">
          <X size={15} />
        </button>
      </div>

      <div className="arr-row">
        <div className="arr-books">
          {shown.map((b, i) => (
            <span key={b.id} className="arr-book" style={{ background: lookOf(b).color, ["--i" as string]: i }}>
              <Plate book={b} />
            </span>
          ))}
          {more > 0 && (
            <span key={`more-${more}`} className="arr-more tabular-nums">
              +{more}
            </span>
          )}
        </div>
        {latest && (
          <span key={latest.id} className="arr-latest">
            <span className="arr-title">{latest.title}</span>
            <span className="arr-topic">
              <Glyph k={latest.topic} size={15} /> {TOPIC[latest.topic].name}
            </span>
          </span>
        )}
      </div>

      {wave.done ? (
        <div className="arr-actions">
          <button type="button" onClick={onShow} className="arr-show">
            جاۋىدا كۆرسىتىش
          </button>
          <button type="button" onClick={onRemove} className="arr-undo">
            چىقىرىۋېتىش {n === 1 ? "it" : "them"}
          </button>
        </div>
      ) : (
        <span className="arr-bar" aria-hidden />
      )}
    </div>,
    document.body
  );
}

/** Paper confetti thrown up from the top edge of an element, falling away under gravity. */
function burst(from: HTMLElement, colors: string[], count: number) {
  const r = from.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "arr-confetti";
  document.body.appendChild(layer);
  let left = count;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const w = 6 + Math.random() * 6;
    p.style.cssText = `left:${r.left + r.width * (0.15 + Math.random() * 0.7)}px;top:${r.top + 8}px;width:${w}px;height:${w * (0.4 + Math.random() * 0.5)}px;background:${colors[i % colors.length]};border-radius:${Math.random() < 0.3 ? "50%" : "1px"}`;
    layer.appendChild(p);
    const dx = (Math.random() - 0.5) * Math.min(520, r.width * 1.1);
    const up = 120 + Math.random() * 220;
    const spin = (Math.random() - 0.5) * 900;
    const a = p.animate(
      [
        // Up fast and slowing, then falling faster: a throw, not a fade.
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
        { transform: `translate(${dx}px, ${-up + 300}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 700, delay: Math.random() * 120, fill: "forwards" }
    );
    a.onfinish = () => {
      if (--left === 0) layer.remove();
    };
  }
}
