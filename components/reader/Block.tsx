"use client";

import { memo, useState, type ReactNode } from "react";
import { MessageCirclePlus } from "lucide-react";
import type { Block as BlockT, Run } from "@/lib/article";

/** `note`: a highlight with the reader's note, set only in the block where it ends. */
export type Mark = { from: number; to: number; kind: "gloss" | "hl" | "pending"; id: string; color?: string; note?: boolean };

type Props = {
  block: BlockT;
  n?: number;
  first?: boolean;
  marks: Mark[];
  activeGloss: string | null;
  hoverGloss: string | null;
  activeHighlight: string | null;
  /** A gloss or highlight created a moment ago, whose mark is drawn on. */
  fresh: string | null;
  cursor: boolean;
  /** A whole-text question was asked from here. */
  hasAt: boolean;
  onAsk: (blockId: string) => void;
};

function wrapRun(run: Run, text: string, key: string): ReactNode {
  let node: ReactNode = text;
  if (run.code) node = <code>{node}</code>;
  if (run.strong) node = <strong>{node}</strong>;
  if (run.em) node = <em>{node}</em>;
  if (run.href)
    node = (
      <a href={run.href} target="_blank" rel="noopener noreferrer">
        {node}
      </a>
    );
  return <span key={key}>{node}</span>;
}

/**
 * Splits a block's runs at every mark boundary and wraps each piece in the
 * marks that cover it. Offsets are over the block's plain text, the same
 * coordinates anchors use, so highlights never drift.
 */
function segments(block: BlockT, marks: Mark[], activeGloss: string | null, hoverGloss: string | null, activeHighlight: string | null, fresh: string | null) {
  const runs = block.runs;
  if (!marks.length) return runs.map((r, i) => wrapRun(r, r.text, String(i)));

  const bounds: number[] = [];
  let acc = 0;
  for (const r of runs) {
    bounds.push(acc);
    acc += r.text.length;
  }
  const len = acc;
  const cuts = new Set<number>([0, len, ...bounds]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(len, m.from)));
    cuts.add(Math.max(0, Math.min(len, m.to)));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  let ri = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b <= a) continue;
    while (ri < runs.length - 1 && bounds[ri + 1] <= a) ri++;
    const run = runs[ri];
    const text = run.text.slice(a - bounds[ri], b - bounds[ri]);
    const covering = marks.filter((m) => m.from <= a && m.to >= b);
    const key = `${a}`;
    if (!covering.length) {
      out.push(wrapRun(run, text, key));
      continue;
    }
    const g = covering.filter((m) => m.kind === "gloss").map((m) => m.id);
    const hls = covering.filter((m) => m.kind === "hl");
    const h = hls.map((m) => m.id);
    const color = hls[hls.length - 1]?.color;
    const pending = covering.some((m) => m.kind === "pending");
    const cls = [
      h.length ? "m-hl" : "",
      h.length && activeHighlight && h.includes(activeHighlight) ? "is-active" : "",
      fresh && (g.includes(fresh) || h.includes(fresh)) ? "is-new" : "",
      g.length ? "m-gloss" : "",
      g.length && activeGloss && g.includes(activeGloss) ? "is-active" : "",
      g.length && hoverGloss && g.includes(hoverGloss) ? "is-hover" : "",
      pending ? "m-pending" : "",
    ]
      .filter(Boolean)
      .join(" ");
    out.push(
      <span key={key} className={cls} data-g={g.length ? g.join(" ") : undefined} data-h={h.length ? h.join(" ") : undefined} data-c={color && color !== "yellow" ? color : undefined}>
        {wrapRun(run, text, "r")}
      </span>
    );
    // Empty and drawn by CSS, so it adds no characters and offsets stay true.
    const noted = hls.find((m) => m.note && m.to === b);
    if (noted) out.push(<span key={`${key}n`} className="note-dot" data-h={noted.id} aria-hidden />);
  }
  return out;
}

/** A picture from the source page, loaded from where it lives. One that fails to load folds away. */
/**
 * Texts imported before the srcset fix (2026-10-09) stored Substack images as
 * "https://site/p/fl_progressive:steep/https%3A%2F%2F...": the end of a CDN
 * URL that was cut at its commas. That end is the original image, URL-encoded,
 * so decoding it recovers a picture that loads. Older copies live in browsers
 * and in synced accounts, so they are repaired where they are shown.
 */
function repairSrc(src: string): string {
  const m = src.match(/\/[a-z_]+:[^/]*\/(https?%3A%2F%2F[^/?#\s]+)$/i);
  if (!m) return src;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return src;
  }
}

function Picture({ src, alt }: { src: string; alt?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");
  if (state === "gone") return null;
  return (
    <img
      src={repairSrc(src)}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className={`fig-img${state === "ok" ? " is-loaded" : ""}`}
      onLoad={(e) => (e.currentTarget.naturalWidth < 48 ? setState("gone") : setState("ok"))}
      onError={() => setState("gone")}
    />
  );
}

function Table({ rows, head }: { rows: string[][]; head?: boolean }) {
  const body = head ? rows.slice(1) : rows;
  return (
    <div className="tbl scroll-thin" tabIndex={0} role="region" aria-label="جەدۋەل">
      <table>
        {head && (
          <thead>
            <tr>
              {rows[0].map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockImpl({ block, n, first, marks, activeGloss, hoverGloss, activeHighlight, fresh, cursor, hasAt, onAsk }: Props) {
  const Tag = block.type === "h2" ? "h2" : block.type === "h3" ? "h3" : block.type === "figure" ? "figure" : "div";
  const content = segments(block, marks, activeGloss, hoverGloss, activeHighlight, fresh);
  return (
    <Tag
      className={`blk${first ? " is-first" : ""}${cursor ? " is-cursor" : ""}`}
      data-block={block.id}
      data-type={block.type}
      data-n={n}
    >
      {n !== undefined && (
        <button
          type="button"
          className="pnum"
          onClick={() => onAsk(block.id)}
          aria-label={`${n}-ئابزاس ھەققىدە سوراش`}
          data-tip={`\u00b6${n} ھەققىدە سوراش`}
          data-tip-side="left"
        >
          {hasAt && <span className="pnum-dot" aria-hidden />}
          <span className="pnum-ask" aria-hidden>
            <MessageCirclePlus size={12} strokeWidth={2} />
          </span>
          {n}
        </button>
      )}
      {block.type === "figure" && block.src && <Picture src={block.src} alt={block.alt} />}
      {block.type === "table" && block.rows ? (
        <Table rows={block.rows} head={block.head} />
      ) : block.type === "figure" ? (
        block.runs.length > 0 && <figcaption className="blk-text">{content}</figcaption>
      ) : (
        <span className="blk-text">{content}</span>
      )}
    </Tag>
  );
}

export const Block = memo(BlockImpl, (a, b) => {
  if (a.block !== b.block || a.n !== b.n || a.first !== b.first || a.cursor !== b.cursor || a.hasAt !== b.hasAt) return false;
  if (a.onAsk !== b.onAsk) return false;
  if (a.marks.length !== b.marks.length) return false;
  for (let i = 0; i < a.marks.length; i++) {
    const x = a.marks[i];
    const y = b.marks[i];
    if (x.from !== y.from || x.to !== y.to || x.id !== y.id || x.kind !== y.kind || x.color !== y.color || x.note !== y.note) return false;
  }
  if (!a.marks.length) return true;
  // Only re-render for active or hover changes that touch this block's marks.
  const ids = new Set(a.marks.map((m) => m.id));
  const touches = (p: string | null, q: string | null) => p !== q && ((p && ids.has(p)) || (q && ids.has(q)));
  return !(
    touches(a.activeGloss, b.activeGloss) ||
    touches(a.hoverGloss, b.hoverGloss) ||
    touches(a.activeHighlight, b.activeHighlight) ||
    touches(a.fresh, b.fresh)
  );
});
