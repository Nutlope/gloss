"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, PencilLine, Search, X } from "lucide-react";
import { readingMinutes, tidyTitle } from "@/lib/article";
import { exportAll } from "@/lib/export";
import { useStore, type Highlight } from "@/lib/store";
/** One text in the sheet: a shelf entry or a sample, with how far it has been read. */
export type ShelfItem = {
  id: string;
  title: string;
  byline: string;
  dek?: string;
  words: number;
  pct: number;
  glosses: number;
  sample: boolean;
  /** When it was last read, or added. */
  touched: number;
};

type Filter = "all" | "reading" | "unread" | "done";

const FILTERS: { key: Filter; label: string; test: (it: ShelfItem) => boolean }[] = [
  { key: "all", label: "ھەممىسى", test: () => true },
  { key: "reading", label: "ئوقۇۋاتىدۇ", test: (it) => it.pct > 0 && it.pct < 1 },
  { key: "unread", label: "باشلانمىغان", test: (it) => it.pct === 0 },
  { key: "done", label: "تۈگىگەن", test: (it) => it.pct >= 1 },
];

/** How far along, as a ring: empty, a pen-coloured arc, or closed with a tick. */
function Ring({ pct }: { pct: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  if (pct >= 1)
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--rubric)] text-bg" aria-hidden>
        <Check size={13} strokeWidth={2.6} />
      </span>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--rule-strong)" strokeWidth="2" />
      {pct > 0 && <circle cx="12" cy="12" r={r} fill="none" stroke="var(--rubric)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${Math.max(0.06, pct) * c} ${c}`} />}
    </svg>
  );
}

/**
 * The whole shelf, pulled up over the desk: every text, newest reading first,
 * found by typing. Arrow keys walk the list; S opens it from the desk. The
 * same sheet turns to every highlight and note across the shelf, and exports
 * all of them as Markdown. Any text can be renamed or taken off the shelf.
 */
export function ShelfSheet({
  items,
  onOpen,
  onRename,
  onRemove,
}: {
  items: ShelfItem[];
  onOpen: (id: string, hl?: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (it: ShelfItem) => void;
}) {
  const view = useStore((s) => s.shelf);
  const setUI = useStore((s) => s.setUI);
  const open = view !== null;
  const onOpenChange = (v: boolean) => setUI({ shelf: v ? "texts" : null });
  const highlights = useStore((s) => s.highlights);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [exported, setExported] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // S opens the shelf from the desk.
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUI]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setFilter("all");
    setExported(null);
    setRenaming(null);
    // Ready to type with a keyboard; on a phone, no keyboard leaping over the list.
    if (window.matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // The caret moves in a title being renamed.
      if (e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target !== inputRef.current)) return;
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
      if (!rows.length) return;
      e.preventDefault();
      const i = rows.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(rows.length - 1, i + 1)) : i <= 0 ? -1 : i - 1;
      if (next < 0) inputRef.current?.focus();
      else rows[next].focus();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setUI]);

  // Every highlight on a text that is still on the shelf, newest first.
  const titles = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const allHighlights = useMemo(
    () =>
      Object.values(highlights)
        .flat()
        .filter((h) => titles.has(h.articleId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [highlights, titles]
  );
  const shownHighlights = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return allHighlights;
    return allHighlights.filter((h) => {
      const hay = `${h.anchor.quote} ${h.note ?? ""} ${titles.get(h.articleId)?.title ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [allHighlights, q, titles]);
  const anyNotes = items.some((it) => it.glosses > 0) || allHighlights.length > 0;

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter(f.test).length])) as Record<Filter, number>, [items]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return items.filter((it) => test(it) && words.every((w) => `${it.title} ${it.byline}`.toLowerCase().includes(w)));
  }, [items, q, filter]);

  if (!open) return null;

  // Portalled, so it sits over everything on the page.
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" style={{ animation: "fade 0.25s both" }} onClick={() => onOpenChange(false)} />
      <section role="dialog" aria-modal aria-label="جاۋىنىڭىز" className="shelf-sheet">
        <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-5 sm:px-10">
          <header className="flex flex-wrap items-center gap-x-6 gap-y-4 pb-5 pt-7">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-baseline gap-3 font-serif text-[30px] leading-none tracking-[-0.015em] text-ink">
                جاۋىنىڭىز
                <Link href="/library" className="font-sans text-[13px] tracking-normal text-ink-3 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
                  كۈتۈپخانىنى ئېچىش
                </Link>
              </h2>
              <p className="mt-2 text-[13px] text-ink-3">
                {view === "highlights"
                  ? `${allHighlights.length} بەلگە، بارلىق تېكىستلىرىڭىزدە`
                  : `${items.length} تېكىست${counts.reading ? ` · ${counts.reading} ئوقۇلۇۋاتىدۇ` : ""}`}
              </p>
            </div>
            <label className="flex h-10 w-full items-center gap-2 rounded-full border border-rule bg-bg px-3.5 transition-colors focus-within:border-rule-strong sm:w-[300px]">
              <Search size={15} className="shrink-0 text-ink-4" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={view === "highlights" ? "بەلگە ۋە خاتىرىلەرنى ئىزدەش" : "ماۋزۇ ياكى ئاپتور ئىزدەش"}
                aria-label={view === "highlights" ? "بەلگە ۋە خاتىرىلەرنى ئىزدەش" : "ماۋزۇ ياكى ئاپتور ئىزدەش"}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
              />
            </label>
            <div className="-me-2 flex items-center max-sm:absolute max-sm:right-5 max-sm:top-6">
              {anyNotes && (
                <button
                  type="button"
                  aria-label="بارلىق خاتىرىلەرنى چىقىرىش"
                  data-tip={exported !== null ? `Exported ${exported} text${exported === 1 ? "" : "s"}` : "بارلىق خاتىرىلەرنى چىقىرىش"}
                  data-tip-hint={exported !== null ? undefined : "Markdown ھۆججەتلىرى، Obsidian ئۈچۈن تەييار"}
                  onClick={async () => setExported(await exportAll())}
                  className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
                >
                  {exported !== null ? <Check size={16} className="text-good" /> : <Download size={16} />}
                </button>
              )}
              <button
                type="button"
                aria-label="تاقاش"
                data-tip="تاقاش"
                data-tip-kbd="Esc"
                onClick={() => onOpenChange(false)}
                className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          <div role="radiogroup" aria-label="كۆرسىتىش" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1 pb-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={view === "texts" && filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setUI({ shelf: "texts" });
                }}
                disabled={f.key !== "all" && !counts[f.key]}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-35 ${
                  view === "texts" && filter === f.key ? "bg-ink text-bg" : "text-ink-3 hover:bg-sunk hover:text-ink"
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${view === "texts" && filter === f.key ? "text-bg/60" : "text-ink-4"}`}>{counts[f.key]}</span>
              </button>
            ))}
            {allHighlights.length > 0 && (
              <>
                <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 self-center bg-rule" />
                <button
                  type="button"
                  role="radio"
                  aria-checked={view === "highlights"}
                  onClick={() => setUI({ shelf: "highlights" })}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                    view === "highlights" ? "bg-ink text-bg" : "text-ink-3 hover:bg-sunk hover:text-ink"
                  }`}
                >
                  بەلگىلەر
                  <span className={`tabular-nums ${view === "highlights" ? "text-bg/60" : "text-ink-4"}`}>{allHighlights.length}</span>
                </button>
              </>
            )}
          </div>

          {view === "highlights" ? (
            <ul ref={listRef} className="scroll-thin -mx-3 flex-1 content-start overflow-y-auto px-3 pb-10 pt-2">
              {shownHighlights.slice(0, 400).map((h, i) => (
                <HighlightRow
                  key={h.id}
                  h={h}
                  i={i}
                  title={titles.get(h.articleId)?.title ?? ""}
                  onOpen={() => {
                    onOpenChange(false);
                    onOpen(h.articleId, h.id);
                  }}
                />
              ))}
              {!shownHighlights.length && (
                <li className="py-16 text-center text-[14px] text-ink-3">
                  {q ? <>«{q}» غا ماس كېلىدىغان بەلگە ياكى خاتىرە يوق.</> : "تېخى بەلگە يوق."}
                </li>
              )}
            </ul>
          ) : (

          <ul ref={listRef} className="scroll-thin -mx-3 grid flex-1 content-start gap-x-6 overflow-y-auto px-3 pb-10 pt-2 md:grid-cols-2">
            {shown.map((it, i) => (
              <li key={it.id} className="shelf-row group relative" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
                {renaming === it.id ? (
                  <RenameRow
                    title={tidyTitle(it.title)}
                    onDone={(title) => {
                      setRenaming(null);
                      if (title && title !== tidyTitle(it.title)) onRename(it.id, title);
                    }}
                  />
                ) : (
                <>
                <Link
                  href={`/read/${it.id}`}
                  data-row
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    onOpenChange(false);
                    onOpen(it.id);
                  }}
                  className="flex items-start gap-3.5 rounded-[12px] px-3 py-3 pe-[4.5rem] transition-colors hover:bg-sunk/70 focus-visible:bg-sunk/70 focus-visible:outline-offset-[-2px]"
                >
                  <span className="mt-0.5">
                    <Ring pct={it.pct} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-serif text-[18px] leading-[1.2] tracking-[-0.01em] text-ink">{tidyTitle(it.title)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
                      {it.sample && <span className="rounded-full border border-dashed border-rule-strong px-1.5 text-[11.5px] leading-[17px] text-ink-3">ئۈلگە</span>}
                      <span className="max-w-[60%] truncate">{it.byline}</span>
                      <span aria-hidden className="text-ink-4">{"·"}</span>
                      <span className="tabular-nums">{it.pct > 0 && it.pct < 1 ? `${Math.round(it.pct * 100)}% read` : `${readingMinutes(it.words)} min`}</span>
                      {it.glosses > 0 && (
                        <>
                          <span aria-hidden className="text-ink-4">{"·"}</span>
                          <span className="text-rubric-text">
                            {it.glosses} note{it.glosses === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
                {!it.sample && (
                  <button
                    type="button"
                    aria-label={`Rename ${it.title}`}
                    data-tip="ئات ئۆزگەرتىش"
                    onClick={() => setRenaming(it.id)}
                    className="absolute right-10 top-3 grid size-7 place-items-center rounded-full text-ink-4 opacity-0 transition-[opacity,background-color] hover:bg-bg hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <PencilLine size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={it.sample ? `${it.title} ئۈلگىسىنى چىقىرىۋېتىش` : `${it.title} نى جاۋىدىن چىقىرىۋېتىش`}
                  data-tip={it.sample ? "بۇ ئۈلگىنى چىقىرىۋېتىش" : "جاۋىدىن چىقىرىۋېتىش"}
                  onClick={() => onRemove(it)}
                  className="absolute right-2 top-3 grid size-7 place-items-center rounded-full text-ink-4 opacity-0 transition-[opacity,background-color] hover:bg-bg hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X size={14} />
                </button>
                </>
                )}
              </li>
            ))}
            {!shown.length && (
              <li className="col-span-full py-16 text-center text-[14px] text-ink-3">
                {q ? <>جاۋىڭىزدا «{q}» غا ماس كېلىدىغىنى يوق.</> : "بۇ يەردە تېخى ھېچنېمە يوق."}
              </li>
            )}
          </ul>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

/** A title being renamed in place: Enter or leaving keeps it, Esc keeps the old one. */
function RenameRow({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v === null ? null : v.replace(/\s+/g, " ").trim().slice(0, 300));
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="flex items-start gap-3.5 rounded-[12px] bg-sunk/70 px-3 py-3">
      <span className="mt-0.5 size-6 shrink-0" aria-hidden />
      <input
        ref={ref}
        defaultValue={title}
        aria-label="ماۋزۇ"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(e.currentTarget.value);
          } else if (e.key === "Escape") {
            // Esc here puts the name back; the sheet stays open.
            e.preventDefault();
            e.stopPropagation();
            finish(null);
          }
        }}
        onBlur={(e) => finish(e.currentTarget.value)}
        className="min-w-0 flex-1 border-b-[1.5px] border-[var(--rubric)] bg-transparent pb-0.5 font-serif text-[18px] leading-[1.2] tracking-[-0.01em] text-ink outline-none focus-visible:outline-none"
      />
    </div>
  );
}

/** One highlight on the shelf: the marked words, the reader's note under them, and where they are from. */
function HighlightRow({ h, i, title, onOpen }: { h: Highlight; i: number; title: string; onOpen: () => void }) {
  return (
    <li className="shelf-row" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
      <a
        href={`/read/${h.articleId}`}
        data-row
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onOpen();
        }}
        className="block rounded-[12px] px-3 py-3.5 transition-colors hover:bg-sunk/70 focus-visible:bg-sunk/70 focus-visible:outline-offset-[-2px]"
      >
        <span className="line-clamp-4 max-w-[64ch] font-serif text-[17px] leading-[1.5] text-ink">
          <mark className="m-hl text-inherit" data-c={h.color && h.color !== "yellow" ? h.color : undefined}>
            {h.anchor.quote}
          </mark>
        </span>
        {h.note && <span className="mt-2 block max-w-[64ch] whitespace-pre-line text-[14px] leading-[1.55] text-ink-2">{h.note}</span>}
        <span className="mt-2 block truncate text-[12.5px] text-ink-3">{tidyTitle(title)}</span>
      </a>
    </li>
  );
}
