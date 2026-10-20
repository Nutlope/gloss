"use client";

import { memo, useEffect, useState } from "react";
import { paintedUrl } from "@/lib/covers";
import { hasIcon, iconSrc, isCustomKey, lookOf, shadesFor, shelfDef, shelfNameFromKey, topicArtSrc, type Book, type Look } from "@/lib/library";

/** One of the library's own emoji: a small clay figure for a topic or a tag. A custom shelf draws its initial instead. */
export function Glyph({ k, size = 18, className = "", label }: { k: string; size?: number; className?: string; label?: string }) {
  if (!hasIcon(k)) {
    const name = label ?? (isCustomKey(k) ? shelfNameFromKey(k) : k);
    return (
      <span aria-hidden className={`glyph glyph-custom ${className}`} style={{ width: size, height: size, background: shadesFor(k)[0], fontSize: Math.max(9, size * 0.52) }}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={iconSrc(k)} alt="" width={size} height={size} draggable={false} decoding="async" className={`glyph ${className}`} />;
}

const lastName = (a: string) => a.split(/&|,| and /)[0].trim().split(/\s+/).slice(-1)[0] || a;

/** A book seen end-on: cloth, a title running down it, the author at the foot. */
export const Spine = memo(function Spine({ book, look = lookOf(book) }: { book: Book; look?: Look }) {
  const { w, h, color, fg, style } = look;
  const t = shelfDef(book.topic);
  const wide = w >= 52;
  const by = lastName(book.author);
  // The author across the foot, as large as fits; on a spine too slim for the
  // whole name, it runs down after the title instead of being cut off.
  const bySize = Math.min(11, w * 0.22, (w - 12) / Math.max(1, by.length * 0.56));
  const narrow = w < 44 || bySize < 8;
  // Fit the title down the spine: shrink a long one, within reason, before it is cut short.
  const per = style === "sans" ? 0.54 : 0.5;
  const room = h - (style === "label" ? 92 : style === "bands" ? 96 : 70);
  const chars = book.title.length + (narrow ? by.length * 0.8 + 2 : 0);
  const base = Math.max(10.5, Math.min(15.5, w * 0.36)) * (style === "sans" ? 0.86 : 1);
  const size = Math.max(9, Math.min(base, (room * (wide ? 2 : 1)) / (chars * per)));
  const reading = book.pct > 0 && book.pct < 1;
  return (
    <div
      className={`spine ${narrow ? "is-narrow" : ""} ${wide ? "is-wide" : ""}`}
      data-style={style}
      data-light={look.light || undefined}
      style={{ width: w, height: h, background: color, color: fg, ["--fg" as string]: fg }}
    >
      {reading && <span className="spine-ribbon" aria-hidden />}
      {style === "bands" && (
        <>
          <span className="spine-bands top" />
          <span className="spine-bands bottom" />
        </>
      )}
      {style === "foil" && <span className="spine-orn">{book.favorite ? "★" : "◆"}</span>}
      {style === "sans" && <Glyph k={t.key} size={15} className="spine-emoji" />}
      <span className={`spine-title-wrap ${style === "label" ? "is-label" : ""}`}>
        <span className="spine-title" style={{ fontSize: size }}>
          {book.title}
          {narrow && <span className="spine-by">{by}</span>}
        </span>
      </span>
      {!narrow && (
        <span className="spine-author" style={{ fontSize: bySize }}>
          {by}
        </span>
      )}
    </div>
  );
});

/**
 * The picture on a cover, best first: a painted cover (bundled, or painted for
 * this text), then the page's own picture printed in the topic's ink, then the
 * topic's plate.
 */
export function Plate({ book, reveal = false }: { book: Book; reveal?: boolean }) {
  const [painted, setPainted] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (book.cover !== "painted") return;
    let live = true;
    void paintedUrl(book.id).then((u) => live && setPainted(u));
    return () => {
      live = false;
    };
  }, [book.id, book.cover]);

  const cls = reveal ? "is-revealing" : "";
  if (book.cover?.startsWith("/") || painted) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={painted ?? book.cover} alt="" decoding="async" draggable={false} className={cls} />;
  }
  if (book.image && !broken) {
    const t = shelfDef(book.topic);
    return (
      <span className="duotone" style={{ ["--ink-c" as string]: t.shades[2] }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={book.image} alt="" decoding="async" loading="lazy" draggable={false} referrerPolicy="no-referrer" className={cls} onError={() => setBroken(true)} />
      </span>
    );
  }
  if (isCustomKey(book.topic)) {
    const t = shelfDef(book.topic);
    return (
      <span className={`topic-custom-art ${cls}`} style={{ background: `linear-gradient(150deg, ${t.shades[1]}, ${t.shades[0]} 55%, ${t.shades[2]})` }} aria-hidden>
        <span>{(book.topicName ?? t.name).charAt(0).toUpperCase()}</span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={topicArtSrc(book.topic)} alt="" decoding="async" draggable={false} className={cls} />;
}

/**
 * The front of a book, for face-out display and for the book in your hands.
 * Sized by its container, so the same cover works at any scale.
 */
export const Cover = memo(function Cover({ book, look = lookOf(book), draw = false }: { book: Book; look?: Look; draw?: boolean }) {
  const t = shelfDef(book.topic);
  return (
    <div className="cover" data-light={look.light || undefined} style={{ background: look.color, color: look.fg }}>
      <div className="cover-plate">
        <Plate book={book} reveal={draw} />
      </div>
      <div className="cover-type">
        <p className="cover-kicker">
          <Glyph k={t.key} size={14} className="cover-glyph" label={book.topicName} />
          <span>{book.topicName ?? t.name}</span>
          {book.bookmark && <span>· Saved link</span>}
          {book.year && <span className="tabular-nums">{book.year}</span>}
        </p>
        <p className="cover-title">{book.title}</p>
        <p className="cover-author">{book.author}</p>
      </div>
      <span className="cover-hinge" aria-hidden />
    </div>
  );
});
