"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, ChevronDown, PencilLine, Star, Trash2 } from "lucide-react";
import { allShelves, fmtMinutes, hash, hostOf, lookOf, shelfDef, tagsOf, type Book, type CustomShelf } from "@/lib/library";
import { Cover, Glyph, Spine } from "./Book";

export type Origin = { el: HTMLElement; kind: "spine" | "cover" };

const ASPECT = 1.42;
const ease = "cubic-bezier(0.22, 1, 0.36, 1)"; // --ease-out
const easeInOut = "cubic-bezier(0.77, 0, 0.175, 1)";

type Geo = { W: number; H: number; D: number; wide: boolean; vw: number; vh: number };

function measure(book: Book): Geo {
  const vw = window.innerWidth, vh = window.innerHeight;
  const wide = vw >= 820;
  const W = Math.round(wide ? Math.min(340, (vw - 140) / 2, (vh - 96) / ASPECT) : Math.min(vw - 40, 360, (vh - 110) / ASPECT));
  const H = Math.round(W * ASPECT);
  const look = lookOf(book);
  return { W, H, D: Math.max(18, Math.round((look.w * H) / look.h)), wide, vw, vh };
}

const T = (x: number, y: number, s: number, z: number, ry: number, rx = 0, rz = 0) =>
  `translate3d(${x}px, ${y}px, 0) scale3d(${s}, ${s}, ${s}) translateZ(${z}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg)`;

/** The flight from the shelf (or the display) to your hands, as keyframes. */
function flight(g: Geo, o: Origin) {
  const r = o.el.getBoundingClientRect();
  const dx = r.left + r.width / 2 - g.vw / 2;
  const dy = r.top + r.height / 2 - g.vh / 2;
  const end = T(0, 0, 1, -g.D / 2, 0);
  if (o.kind === "spine") {
    const k = r.height / g.H;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return [
      { offset: 0, transform: T(dx, dy, k, -g.W / 2, 90), easing: ease },
      // Tipped out from the top, toward you, as you would take it off a shelf.
      { offset: 0.2, transform: T(dx, dy - 22, k, -g.W / 2 + 70, 90, -7), easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
      { offset: 0.62, transform: T(dx * 0.22, dy * 0.22 - 14, lerp(k, 1, 0.8), lerp(-g.W / 2, -g.D / 2, 0.6) + 40, 34, -5, -1.5), easing: ease },
      { offset: 1, transform: end },
    ];
  }
  const k = r.width / g.W;
  return [
    { offset: 0, transform: T(dx, dy, k, -g.D / 2, 0), easing: ease },
    { offset: 0.35, transform: T(dx * 0.6, dy * 0.6 - 30, k * 1.12, -g.D / 2 + 60, -16, 8, -2), easing: ease },
    { offset: 1, transform: end },
  ];
}

/**
 * A book, taken off the shelf. It comes out spine first, turns to show its
 * cover as it reaches you, and opens: a bookplate on the left, and on the
 * right what it is, how far you are, and the way in. From here it can be
 * renamed, moved to another topic, starred, or taken off the shelf. Esc puts it back.
 */
export function BookOpen({
  book,
  origin,
  owner,
  onClose,
  onRead,
  onShelve,
  onRemove,
  shelves = [],
  onCreateShelf,
}: {
  book: Book;
  origin: Origin;
  owner: string;
  onClose: () => void;
  onRead: (b: Book) => void;
  onShelve: (b: Book, patch: { topic?: string; favorite?: boolean; title?: string }) => void;
  onRemove: (b: Book) => void;
  shelves?: CustomShelf[];
  onCreateShelf?: (name: string) => CustomShelf | null;
}) {
  const [g] = useState(() => measure(book));
  const [phase, setPhase] = useState<"in" | "open" | "out" | "leaving">("in");
  const [renaming, setRenaming] = useState(false);
  const [newShelf, setNewShelf] = useState<string | null>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const look = lookOf(book);
  const t = shelfDef(book.topic, shelves);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shift = g.wide ? g.W / 2 : 0;
  const coverZ = `translateZ(${g.D / 2}px)`;

  // The book is out of its place while it's in your hands.
  useLayoutEffect(() => {
    const el = origin.el;
    el.style.visibility = "hidden";
    return () => {
      el.style.visibility = "";
    };
  }, [origin.el]);

  useLayoutEffect(() => {
    const b = bookRef.current!, c = coverRef.current!, s = shiftRef.current!;
    if (reduce) {
      b.style.transform = T(0, 0, 1, -g.D / 2, 0);
      c.style.transform = `${coverZ} rotateY(-180deg)`;
      s.style.transform = `translateX(${shift}px)`;
      setPhase("open");
      return;
    }
    const fly = b.animate(flight(g, origin), { duration: origin.kind === "spine" ? 840 : 660, fill: "forwards" });
    // The cover starts to open just before the book lands, so the two read as one movement.
    const delay = origin.kind === "spine" ? 700 : 500;
    const opts: KeyframeAnimationOptions = { duration: 780, delay, easing: easeInOut, fill: "forwards" };
    c.animate([{ transform: `${coverZ} rotateY(0deg)` }, { transform: `${coverZ} rotateY(-180deg)` }], opts);
    s.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${shift}px)` }], opts);
    const t1 = setTimeout(() => setPhase("open"), delay + 300);
    return () => {
      clearTimeout(t1);
      fly.cancel();
    };
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    setPhase("out");
    const b = bookRef.current!, c = coverRef.current!, s = shiftRef.current!;
    if (reduce) return onClose();
    const opts: KeyframeAnimationOptions = { duration: 540, easing: easeInOut, fill: "forwards" };
    c.getAnimations().forEach((a) => a.commitStyles?.());
    c.animate([{ transform: `${coverZ} rotateY(-180deg)` }, { transform: `${coverZ} rotateY(0deg)` }], opts);
    s.animate([{ transform: `translateX(${shift}px)` }, { transform: "translateX(0px)" }], opts);
    // Back to wherever it came from, measured again in case the shelf moved.
    const back = flight(measure(book), origin)
      .map((k) => ({ ...k, offset: 1 - k.offset }))
      .reverse()
      .map((k, i, all) => ({ ...k, easing: i < all.length - 1 ? ease : undefined }));
    const fly = b.animate(back, { duration: origin.kind === "spine" ? 760 : 600, delay: 360, fill: "forwards" });
    await fly.finished.catch(() => {});
    onClose();
  }, [book, coverZ, onClose, origin, reduce, shift]);

  useEffect(() => {
    if (phase === "open") readRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const read = () => {
    setPhase("leaving");
    setTimeout(() => onRead(book), reduce ? 0 : 360);
  };

  const reading = book.pct > 0 && book.pct < 1;
  const host = hostOf(book.url);
  const plateNo = String((hash(book.id) % 900) + 100);
  const shelved = new Date(book.added).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return createPortal(
    <div className="ob-stage" data-phase={phase} role="dialog" aria-modal aria-label={book.title}>
      <div className="ob-backdrop" onClick={close} />
      <div className="ob-world">
        <div ref={shiftRef} className="ob-shift">
          <div
            ref={bookRef}
            className="ob-book"
            style={{ width: g.W, height: g.H, marginLeft: -g.W / 2, marginTop: -g.H / 2, transform: flight(g, origin)[0].transform, ["--c" as string]: look.color }}
          >
            {/* The back board, the spine, and the edges of the pages. */}
            <div className="ob-face ob-back" style={{ transform: `rotateY(180deg) translateZ(${g.D / 2}px)`, background: look.color }} />
            <div className="ob-face ob-spine" style={{ width: g.D, left: (g.W - g.D) / 2, transform: `rotateY(-90deg) translateZ(${g.W / 2}px)` }}>
              <div style={{ transform: `scale(${g.H / look.h})`, transformOrigin: "0 0", width: look.w, height: look.h }}>
                <Spine book={book} look={look} />
              </div>
            </div>
            <div className="ob-face ob-edge" style={{ width: g.D - 6, height: g.H - 8, top: 4, left: (g.W - g.D + 6) / 2, transform: `rotateY(90deg) translateZ(${g.W / 2 - 4}px)` }} />
            <div className="ob-face ob-edge is-top" style={{ width: g.W - 6, height: g.D - 6, left: 2, top: (g.H - g.D + 6) / 2, transform: `rotateX(90deg) translateZ(${g.H / 2 - 4}px)` }} />
            <div className="ob-face ob-edge is-top" style={{ width: g.W - 6, height: g.D - 6, left: 2, top: (g.H - g.D + 6) / 2, transform: `rotateX(-90deg) translateZ(${g.H / 2 - 4}px)` }} />

            {/* The inside of the back board, a little larger than the pages. */}
            <div className="ob-face ob-board" style={{ transform: `translateZ(${g.D / 2 - 6}px)`, background: look.color }} />
            {/* The first page. */}
            <div className="ob-face ob-page" style={{ width: g.W - 9, height: g.H - 12, top: 6, left: 1, transform: `translateZ(${g.D / 2 - 2}px)` }}>
              <div className="ob-page-in scroll-thin">
                <div className="ob-kicker">
                  {/* The topic it is shelved under, and the way to move it: one chip. */}
                  <label className="ob-chip" style={{ ["--c" as string]: t.shades[0] }} data-tip="Move to another shelf">
                    <Glyph k={t.key} size={15} label={book.topicName ?? t.name} />
                    <span>{book.topicName ?? t.name}</span>
                    <ChevronDown size={13} strokeWidth={2.2} className="ob-chip-caret" aria-hidden />
                    <select
                      value={book.topic}
                      onChange={(e) => {
                        if (e.target.value === "__new__") return setNewShelf("");
                        onShelve(book, { topic: e.target.value });
                      }}
                      aria-label="Shelf"
                    >
                      {allShelves(shelves).map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.custom ? `${x.name} (your shelf)` : x.name}
                        </option>
                      ))}
                      {onCreateShelf && <option value="__new__">+ New shelf…</option>}
                    </select>
                  </label>
                  <span className="ob-tools">
                    <button
                      type="button"
                      className="ob-icon"
                      aria-pressed={book.favorite}
                      aria-label={book.favorite ? "Remove from favourites" : "Add to favourites"}
                      data-tip={book.favorite ? "Favourite" : "Add to favourites"}
                      onClick={() => onShelve(book, { favorite: !book.favorite })}
                    >
                      <Star size={15} fill={book.favorite ? "currentColor" : "none"} />
                    </button>
                    {!book.sample && (
                      <button type="button" className="ob-icon" aria-label="Rename" data-tip="Rename" onClick={() => setRenaming(true)}>
                        <PencilLine size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="ob-icon"
                      aria-label={book.sample ? "Remove this sample" : "Remove from the library"}
                      data-tip={book.sample ? "Remove this sample" : "Remove from the library"}
                      onClick={() => onRemove(book)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {newShelf !== null && (
                  <form
                    className="shelf-new-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const made = onCreateShelf?.(newShelf);
                      setNewShelf(null);
                      if (made) onShelve(book, { topic: made.key });
                    }}
                  >
                    <input autoFocus value={newShelf} onChange={(e) => setNewShelf(e.target.value)} placeholder="Name your shelf" aria-label="New shelf name" className="shelf-new-input" maxLength={40} />
                    <button type="submit" className="add-btn" disabled={!newShelf.trim()}>
                      Create &amp; move
                    </button>
                    <button type="button" className="ob-link" onClick={() => setNewShelf(null)}>
                      Cancel
                    </button>
                  </form>
                )}
                {renaming ? (
                  <TitleField
                    title={book.title}
                    onDone={(title) => {
                      setRenaming(false);
                      if (title && title !== book.title) onShelve(book, { title });
                    }}
                  />
                ) : book.sample ? (
                  <h2 className="ob-title">{book.title}</h2>
                ) : (
                  <h2 className="ob-title">
                    <button type="button" className="ob-title-btn" data-tip="Rename" onClick={() => setRenaming(true)}>
                      {book.title}
                    </button>
                  </h2>
                )}
                <p className="ob-author">
                  {book.author}
                  <span className="ob-meta">
                    {book.year ? `${book.year} · ` : ""}
                    {book.bookmark ? "Saved link" : fmtMinutes(book.minutes)}
                  </span>
                </p>
                {book.bookmark && <p className="ob-dek">Saved as a link: this page has too little text to read here. Open the original any time.</p>}
                {book.dek && <p className="ob-dek">{book.dek}</p>}
                {(tagsOf(book).length > 0 || book.tags.length > 0 || book.agent || book.sample) && (
                  <p className="ob-tags">
                    {tagsOf(book).map((x) => (
                      <span key={x.key}>
                        <Glyph k={x.key} size={15} /> {x.label}
                      </span>
                    ))}
                    {book.agent && (
                      <span>
                        <Glyph k="agent" size={15} /> Shelved by your agent
                      </span>
                    )}
                    {book.sample && <span className="is-word">a sample from Gloss</span>}
                    {book.tags.map((x) => (
                      <span key={x} className="is-word">
                        {x}
                      </span>
                    ))}
                  </p>
                )}
                <div className="ob-progress">
                  <span className="ob-bar" aria-hidden>
                    <span style={{ width: `${Math.round(book.pct * 100)}%` }} />
                  </span>
                  <span>
                    {book.pct >= 1 ? "Read" : reading ? `${Math.round(book.pct * 100)}% read` : "Not started"}
                    {book.highlights > 0 && ` · ${book.highlights} highlight${book.highlights === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="ob-actions">
                  {book.bookmark && book.url ? (
                    <a ref={readRef as never} href={book.url} target="_blank" rel="noreferrer" className="ob-read">
                      Open the original page
                      <ArrowUpRight size={16} />
                    </a>
                  ) : (
                    <button ref={readRef} type="button" onClick={read} className="ob-read">
                      {book.pct >= 1 ? "Read again" : reading ? "Continue reading" : "Start reading"}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {book.bookmark && (
                    <button type="button" onClick={read} className="ob-link mt-2">
                      View the saved link note
                    </button>
                  )}
                  <div className="ob-sub">
                    {book.url ? (
                      <a href={book.url} target="_blank" rel="noreferrer" className="ob-link">
                        {host} <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      <span />
                    )}
                    <button type="button" onClick={close} className="ob-link">
                      Put it back <kbd>Esc</kbd>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* The front board: the cover outside, a bookplate inside. */}
            <div ref={coverRef} className="ob-cover" style={{ transform: `${coverZ} rotateY(0deg)` }}>
              <div className="ob-face ob-cover-front">
                <Cover book={book} look={look} draw />
              </div>
              <div className="ob-face ob-cover-inside" style={{ ["--c" as string]: look.color, ["--c2" as string]: t.shades[3] }}>
                {/* A bookplate pasted inside the cover: whose it is, and when it was shelved. */}
                <div className="ex-libris">
                  <div className="ex-art">
                    <Glyph k={t.key} size={60} label={book.topicName ?? t.name} />
                  </div>
                  <p className="ex-head">From the library of</p>
                  <p className="ex-name">{owner}</p>
                  <span className="ex-rule" aria-hidden />
                  <p className="ex-meta">
                    No. {plateNo}
                    {book.added ? ` · ${shelved}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** The title, as a field: Enter or leaving it keeps the new name, Esc keeps the old one. */
function TitleField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v === null ? null : v.replace(/\s+/g, " ").trim().slice(0, 300));
  };

  useLayoutEffect(() => {
    const el = ref.current!;
    el.focus({ preventScroll: true });
    el.select();
  }, []);

  return (
    <textarea
      ref={ref}
      className="ob-title ob-title-field"
      defaultValue={title}
      rows={1}
      aria-label="Title"
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          // Esc here puts the name back, not the book.
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
