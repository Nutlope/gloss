"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Library as LibraryIcon, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { TopBar } from "@/components/ui/TopBar";
import { readingMinutes, tidyTitle, wordCount } from "@/lib/article";
import { forgetCover, paintAll } from "@/lib/covers";
import { SAMPLE_SHELF } from "@/lib/classics";
import { allShelves, shelfDef, SORTS, sortBooks, TAGS, topicOf, type Book, type ShelfDef, type Sort, type TagKey } from "@/lib/library";
import { createCustomShelf, deleteCustomShelf, hideSample, renameCustomShelf, useLibraryPrefs } from "@/lib/library-prefs";
import { SAMPLES } from "@/lib/samples";
import { applySettings } from "@/lib/settings";
import { backfill } from "@/lib/shelving";
import { useStore } from "@/lib/store";
import { watchShelf } from "@/lib/sync";
import { AddButton, AddPanel, type AddTab } from "./AddPanel";
import { Arrivals, type Wave } from "./Arrivals";
import { Glyph } from "./Book";
import { BookOpen, type Origin } from "./BookOpen";
import { Shelf } from "./Shelf";
import { Starter } from "./Starter";
import { TopicGrid, TopicPage } from "./Topics";

type View = "shelf" | "topics";

const SEEN_KEY = "gloss:library-seen";
/** Samples stay on the shelf until it has this many texts of your own, or for good once opened, unless taken off. */
const SAMPLES_UNTIL = 6;

/**
 * Your library: everything on your shelf, sorted onto topics. The bookcase
 * arranges by topic, recency, colour or length; the topics view opens each
 * subject into a display of covers. Any book comes off the shelf into your
 * hands, and from there into the reader. New texts, yours or your agent's,
 * drop onto the shelf as they arrive.
 */
export function Library() {
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.progress);
  const highlights = useStore((s) => s.highlights);
  const shelveItem = useStore((s) => s.shelve);
  const removeFromLibrary = useStore((s) => s.removeFromLibrary);
  const prefs = useLibraryPrefs();

  const [view, setView] = useState<View>("shelf");
  const [topic, setTopic] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [newShelfName, setNewShelfName] = useState<string | null>(null);
  const [renamingShelf, setRenamingShelf] = useState<string | null>(null);
  const [tag, setTag] = useState<TagKey | null>(null);
  const [sort, setSort] = useState<Sort>("topic");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; origin: Origin } | null>(null);
  const [adding, setAdding] = useState<AddTab | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const known = useRef<Set<string> | null>(null);
  const [lastSeen, setLastSeen] = useState(0);

  useEffect(() => {
    hydrate();
    applySettings(useStore.getState().settings);
    try {
      setLastSeen(Number(localStorage.getItem(SEEN_KEY)) || 0);
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {}
  }, [hydrate]);

  const [wave, setWave] = useState<Wave | null>(null);
  const waveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeWave = useCallback(() => {
    clearTimeout(waveTimer.current);
    setWave((w) => w && { ...w, leaving: true });
    waveTimer.current = setTimeout(() => setWave(null), 240);
  }, []);
  useEffect(() => () => clearTimeout(waveTimer.current), []);

  // Signed in, the shelf is checked every few seconds while it's open, so an agent's saves arrive as you look.
  useEffect(() => watchShelf(), []);

  // The top bar frosts over once the page moves under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 2);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Anything that lands on the shelf while you look (an import, a sync from your agent) drops in.
  useEffect(() => {
    if (!hydrated) return;
    const ids = new Set(library.map((x) => x.id));
    if (!known.current) {
      known.current = ids;
      return;
    }
    const added = [...ids].filter((id) => !known.current!.has(id));
    known.current = ids;
    if (!added.length) return;
    setFresh((f) => new Set([...f, ...added]));
    // Each arrival's own timer, so a quick run of imports never leaves the early ones marked.
    for (const id of added) setTimeout(() => setFresh((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f)), 2600);

    // And they gather on the arrivals card: one card per run, kept open while more keep coming.
    const items = library.filter((x) => added.includes(x.id) && x.origin !== "sample");
    if (!items.length) return;
    const byAgent = items.find((x) => x.addedBy === "agent");
    setWave((w) => {
      const cur = w && !w.done && !w.leaving ? w : null;
      return { ids: [...(cur?.ids ?? []), ...items.map((x) => x.id)], agent: Boolean(cur?.agent || byAgent), via: cur?.via ?? byAgent?.addedVia, done: false };
    });
    // An agent's saves come in batches a few seconds apart; the run is over once it goes quiet.
    clearTimeout(waveTimer.current);
    waveTimer.current = setTimeout(() => {
      setWave((w) => w && { ...w, done: true });
      waveTimer.current = setTimeout(closeWave, 9000);
    }, byAgent ? 14_000 : 6000);
  }, [hydrated, library, closeWave]);

  // Texts shelved before the library existed are sorted onto topics the first time it opens.
  useEffect(() => {
    if (hydrated) void backfill(useStore.getState().library);
  }, [hydrated, library.length]);

  // Painted covers, when they're turned on: one at a time, for every sorted text without one.
  useEffect(() => {
    if (hydrated && prefs.paintedCovers) void paintAll(useStore.getState().library);
  }, [hydrated, prefs.paintedCovers, library]);

  const own = library.filter((x) => x.origin !== "sample");
  const books = useMemo(() => {
    const read = (id: string) => (hydrated ? progress[id]?.pct ?? 0 : 0);
    const marks = (id: string) => (hydrated ? (highlights[id] ?? []).length : 0);
    const mine: Book[] = library.map((x) => {
      const topic = topicOf(x.topic, prefs.customShelves);
      return {
        id: x.id,
        title: tidyTitle(x.title),
        author: bylineOf(x),
        year: x.year,
        url: x.sourceUrl,
        topic,
        topicName: shelfDef(topic, prefs.customShelves).name,
        minutes: readingMinutes(x.words),
        dek: x.dek,
        tags: x.tags ?? [],
        favorite: Boolean(x.favorite),
        pct: read(x.id),
        highlights: marks(x.id),
        added: x.addedAt,
        finished: x.finishedAt,
        image: x.image,
        cover: x.cover,
        agent: x.addedBy === "agent",
        sample: false,
        bookmark: Boolean(x.bookmark),
      };
    });
    const samples: Book[] = SAMPLES.filter((a) => !prefs.hiddenSamples.includes(a.id) && (own.length < SAMPLES_UNTIL || read(a.id) > 0)).map((a) => ({
      id: a.id,
      title: a.title,
      author: a.author ?? "",
      year: Number(a.published?.match(/\d{4}/)?.[0]) || undefined,
      topic: SAMPLE_SHELF[a.id]?.topic ?? "unsorted",
      minutes: readingMinutes(wordCount(a)),
      dek: a.dek,
      tags: [],
      favorite: false,
      pct: read(a.id),
      highlights: marks(a.id),
      added: 0,
      cover: SAMPLE_SHELF[a.id]?.cover,
      agent: false,
      sample: true,
    }));
    return [...mine, ...samples];
    // `own.length` is derived from `library`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, progress, highlights, hydrated, prefs.hiddenSamples, prefs.customShelves]);

  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);

  const match = useCallback(
    (b: Book) => {
      const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const t = tag ? TAGS.find((x) => x.key === tag)! : null;
      return (!t || t.test(b)) && words.every((w) => `${b.title} ${b.author} ${b.topicName ?? shelfDef(b.topic).name} ${b.tags.join(" ")} ${b.year ?? ""} ${b.bookmark ? "saved link bookmark" : ""}`.toLowerCase().includes(w));
    },
    [q, tag]
  );
  const shown = useMemo(() => new Set(sorted.filter((b) => (!only || b.topic === only) && match(b)).map((b) => b.id)), [sorted, only, match]);

  const topics = useMemo(
    () =>
      allShelves(prefs.customShelves)
        .map((t) => ({ topic: t, books: books.filter((b) => b.topic === t.key).sort((a, b) => b.added - a.added) }))
        .filter((x) => x.books.length || x.topic.custom),
    [books, prefs.customShelves]
  );

  const stats = useMemo(() => {
    const mins = books.reduce((n, b) => n + b.minutes, 0);
    return {
      count: books.length,
      topics: topics.filter((t) => t.topic.key !== "unsorted").length,
      hours: Math.max(1, Math.round(mins / 60)),
      reading: books.filter((b) => b.pct > 0 && b.pct < 1).length,
      read: books.filter((b) => b.pct >= 1).length,
    };
  }, [books, topics]);

  const fromAgent = useMemo(() => (lastSeen ? books.filter((b) => b.agent && b.added > lastSeen) : []), [books, lastSeen]);

  const go = useCallback((to: { view: View; topic?: string | null }) => {
    startTransition(() => {
      setView(to.view);
      setTopic(to.topic ?? null);
      setQ("");
      if (to.view === "shelf") setTag(null);
    });
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  // "/" to search, wherever you are; Esc steps back out of a topic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || adding || e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && topic) go({ view: "topics" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, adding, topic, go]);

  const read = useCallback(
    (b: Book) => {
      setLeaving(true);
      router.push(`/read/${b.id}`);
    },
    [router]
  );

  const openBook = open ? books.find((b) => b.id === open.id) ?? null : null;
  const first = user?.firstName;
  const owner = user?.fullName || first || "A Gloss reader";
  const T = topic ? shelfDef(topic, prefs.customShelves) : null;
  const topicBooks = useMemo(() => (topic ? books.filter((b) => b.topic === topic).sort((a, b) => b.added - a.added).filter(match) : []), [topic, books, match]);
  const screen = topic ? `topic-${topic}` : view;

  const searchBox = (
    <label className="lib-search">
      <Search size={15} className="shrink-0 text-ink-4" aria-hidden />
      <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={T ? `Search ${T.name}` : "Search the library"} aria-label="Search the library" />
      {q ? (
        <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-sunk">
          <X size={13} />
        </button>
      ) : (
        <kbd className="max-sm:hidden">/</kbd>
      )}
    </label>
  );

  const tagChips = (pool: Book[]) =>
    TAGS.map((t) => {
      const n = pool.filter(t.test).length;
      if (!n) return null;
      return (
        <Chip key={t.key} on={tag === t.key} onClick={() => setTag(tag === t.key ? null : t.key)}>
          <Glyph k={t.key} size={18} /> {t.label} <span className="lib-n">{n}</span>
        </Chip>
      );
    });

  return (
    <div className={`library relative z-[1] min-h-dvh transition-[opacity,filter] duration-300 ${leaving ? "opacity-0 blur-[2px]" : ""}`}>
      <div className="lib-top" data-scrolled={scrolled || undefined}>
        <TopBar here="library" onLibrary={() => go({ view: topic ? "topics" : view })} />
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 sm:px-8">
        {!T && (
          <section className="lib-hero">
            <div className="lib-hero-row">
              <div className="min-w-0">
                <h1 className="lib-title">{first ? `${first}'s library` : "Your library"}</h1>
                {/* Its height is kept while the shelf is read, so the tools below never jump. */}
                <p className="lib-stats">
                  {hydrated && (
                    <>
                      <span>
                        <b>{stats.count}</b> {stats.count === 1 ? "text" : "texts"}
                      </span>
                      {stats.topics > 0 && (
                        <span>
                          <b>{stats.topics}</b> {stats.topics === 1 ? "topic" : "topics"}
                        </span>
                      )}
                      <span>
                        <b>{stats.hours}</b> {stats.hours === 1 ? "hour" : "hours"} of reading
                      </span>
                      {stats.reading > 0 && (
                        <span>
                          <b>{stats.reading}</b> in progress
                        </span>
                      )}
                      {stats.read > 0 && (
                        <span>
                          <b>{stats.read}</b> read
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <AddButton onClick={() => setAdding("agent")} />
            </div>
            {fromAgent.length > 0 && (
              <button type="button" className="lib-news" onClick={() => (setTag("agent"), setOnly(null), go({ view: "shelf" }))}>
                <Glyph k="agent" size={22} />
                {fromAgent.length} new from your agent since you last looked
              </button>
            )}
          </section>
        )}

        {T ? (
          <div className="lib-tools is-topic">
            <button type="button" onClick={() => go({ view: "topics" })} className="lib-back">
              <ChevronLeft size={16} /> All topics
            </button>
            <AddButton compact onClick={() => setAdding("agent")} />
          </div>
        ) : (
          <div className="lib-tools">
            <ViewSwitch view={view} onChange={(v) => go({ view: v })} />
            {searchBox}
            {view === "shelf" && (
              <div className="lib-sort" role="radiogroup" aria-label="Arrange by">
                <span className="px-2 text-[12.5px] text-ink-4 max-md:hidden">Arrange by</span>
                {SORTS.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} onClick={() => setSort(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "shelf" && !T && (
          <>
            <ChipRow label="Filter">
              <Chip on={!only && !tag} onClick={() => (setOnly(null), setTag(null))}>
                All <span className="lib-n">{books.length}</span>
              </Chip>
              {topics.map(({ topic: t, books: bs }) => (
                <Chip key={t.key} on={only === t.key} color={t.shades[0]} onClick={() => setOnly(only === t.key ? null : t.key)}>
                  <Glyph k={t.key} size={18} label={t.name} /> {t.name} <span className="lib-n">{bs.length}</span>
                </Chip>
              ))}
              <Chip on={false} onClick={() => setNewShelfName("")}>
                <Plus size={14} /> New shelf
              </Chip>
              {TAGS.some((t) => books.some(t.test)) && <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 self-center bg-rule-strong" />}
              {tagChips(books)}
            </ChipRow>
            {newShelfName !== null && (
              <form
                className="shelf-new-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const made = createCustomShelf(newShelfName);
                  setNewShelfName(null);
                  if (made) setOnly(made.key);
                }}
              >
                <input autoFocus value={newShelfName} onChange={(e) => setNewShelfName(e.target.value)} placeholder="Name your shelf, e.g. Research to revisit" aria-label="New shelf name" className="shelf-new-input" maxLength={40} />
                <button type="submit" className="add-btn" disabled={!newShelfName.trim()}>
                  Create shelf
                </button>
                <button type="button" className="lib-chip" onClick={() => setNewShelfName(null)}>
                  Cancel
                </button>
              </form>
            )}
          </>
        )}

        <ViewTransition key={screen} enter="lib-enter" exit="lib-exit" default="none">
          <div className="lib-screen">
            {T ? (
              <TopicPage
                topic={T}
                books={topicBooks}
                tools={
                  <>
                    <div className="lib-tools mt-8">
                      {searchBox}
                      <div className="lib-chips no-scrollbar">{tagChips(books.filter((b) => b.topic === T.key))}</div>
                    </div>
                    {T.custom && (
                      <div className="shelf-manage" aria-label="Manage your shelf">
                        {renamingShelf !== null ? (
                          <form
                            className="shelf-new-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              renameCustomShelf(T.key, renamingShelf);
                              setRenamingShelf(null);
                            }}
                          >
                            <input autoFocus value={renamingShelf} onChange={(e) => setRenamingShelf(e.target.value)} aria-label="Shelf name" className="shelf-new-input" maxLength={40} />
                            <button type="submit" className="add-btn" disabled={!renamingShelf.trim()}>
                              Rename
                            </button>
                            <button type="button" className="lib-chip" onClick={() => setRenamingShelf(null)}>
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <>
                            <button type="button" className="lib-chip" onClick={() => setRenamingShelf(T.name)}>
                              <PencilLine size={13} /> Rename shelf
                            </button>
                            <button
                              type="button"
                              className="lib-chip"
                              onClick={() => {
                                for (const b of books.filter((x) => x.topic === T.key && !x.sample)) shelveItem(b.id, { topic: "unsorted" });
                                deleteCustomShelf(T.key);
                                go({ view: "topics" });
                              }}
                            >
                              <Trash2 size={13} /> Delete shelf
                            </button>
                            <span className="self-center text-[12.5px] text-ink-3">Deleting moves its books to Unsorted.</span>
                          </>
                        )}
                      </div>
                    )}
                  </>
                }
                onOpen={(b, el) => setOpen({ id: b.id, origin: { el, kind: "cover" } })}
              />
            ) : view === "shelf" ? (
              <>
                {hydrated && (
                  <Shelf
                    books={sorted}
                    shown={shown}
                    sort={sort}
                    openId={open?.id ?? null}
                    fresh={fresh}
                    onOpen={(b, el) => setOpen({ id: b.id, origin: { el, kind: "spine" } })}
                    onLabel={sort === "topic" ? (k) => go({ view: "topics", topic: k }) : undefined}
                  />
                )}
                {hydrated && shown.size === 0 && books.length > 0 && (
                  <p className="py-6 text-center text-[14px] text-ink-3">
                    {only && shelfDef(only, prefs.customShelves).custom && !q ? <>This shelf is empty. Open a book and move it here, or pick &ldquo;+ New shelf…&rdquo; while a book is in your hands.</> : <>Nothing on the shelves matches{q ? <> &ldquo;{q}&rdquo;</> : ""}.</>}
                  </p>
                )}
                {hydrated && own.length < SAMPLES_UNTIL ? (
                  <Starter count={own.length} signedIn={Boolean(isSignedIn)} onAdd={setAdding} />
                ) : (
                  hydrated && <p className="lib-hint">Click a spine to take it down. Arrow keys walk the shelf.</p>
                )}
              </>
            ) : (
              <>
                <div className="mt-6 flex justify-end">
                  <button type="button" className="lib-chip" onClick={() => setNewShelfName("")}>
                    <Plus size={14} /> New shelf
                  </button>
                </div>
                {newShelfName !== null && (
                  <form
                    className="shelf-new-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const made = createCustomShelf(newShelfName);
                      setNewShelfName(null);
                      if (made) go({ view: "topics", topic: made.key });
                    }}
                  >
                    <input autoFocus value={newShelfName} onChange={(e) => setNewShelfName(e.target.value)} placeholder="Name your shelf, e.g. Research to revisit" aria-label="New shelf name" className="shelf-new-input" maxLength={40} />
                    <button type="submit" className="add-btn" disabled={!newShelfName.trim()}>
                      Create shelf
                    </button>
                    <button type="button" className="lib-chip" onClick={() => setNewShelfName(null)}>
                      Cancel
                    </button>
                  </form>
                )}
                <TopicGrid topics={topics} onPick={(t: ShelfDef) => go({ view: "topics", topic: t.key })} />
              </>
            )}
          </div>
        </ViewTransition>
      </main>

      {open && openBook && (
        <BookOpen
          key={open.id}
          book={openBook}
          origin={open.origin}
          owner={owner}
          onRead={read}
          shelves={prefs.customShelves}
          onCreateShelf={(name) => createCustomShelf(name)}
          onShelve={(b, patch) => shelveItem(b.id, patch)}
          onRemove={(b) => {
            setOpen(null);
            if (b.sample) return hideSample(b.id);
            removeFromLibrary(b.id);
            void forgetCover(b.id);
          }}
          onClose={() => {
            const id = open.id;
            setOpen(null);
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-book="${id}"]`)?.focus({ preventScroll: true }));
          }}
        />
      )}

      {wave && (
        <Arrivals
          wave={wave}
          books={wave.ids.flatMap((id) => books.find((b) => b.id === id) ?? [])}
          onClose={closeWave}
          onShow={() => {
            closeWave();
            setAdding(null);
            setTag(null);
            setOnly(null);
            setSort("recent");
            go({ view: "shelf" });
          }}
          onRemove={() => {
            closeWave();
            if (open && wave.ids.includes(open.id)) setOpen(null);
            for (const id of wave.ids) {
              removeFromLibrary(id);
              void forgetCover(id);
            }
          }}
        />
      )}
      {adding && <AddPanel tab={adding} onTab={setAdding} onClose={() => setAdding(null)} signedIn={Boolean(isSignedIn)} />}
    </div>
  );
}

/** Who wrote it, or failing that where it is from: a site's name without its domain ending, a file without its extension. */
function bylineOf(x: { author?: string; source?: string; origin?: string }): string {
  if (x.author) return x.author;
  const src = x.source?.split(",")[0].trim();
  if (src) return src.replace(/^www\./, "").replace(/\.(pdf|txt|md|markdown)$/i, "").replace(/\.(com|org|net|io|ai|dev|co|edu|blog|app)(\.[a-z]{2})?$/i, "");
  return x.origin === "paste" ? "Pasted text" : x.origin === "file" ? "A file" : "Saved";
}

/**
 * Filters on one line, however many topics there are: the row scrolls, fades
 * at an edge with more beyond it, and offers an arrow there to page along.
 */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () =>
      setEdges((e) => {
        const l = el.scrollLeft > 2;
        const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
        return e.l === l && e.r === r ? e : { l, r };
      });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", read, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", read);
    };
  }, []);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(200, ref.current.clientWidth * 0.6), behavior: "smooth" });
  return (
    <div className="lib-chip-row" data-l={edges.l || undefined} data-r={edges.r || undefined}>
      <div ref={ref} className="lib-chips no-scrollbar" role="group" aria-label={label}>
        {children}
      </div>
      <button type="button" className="lib-chip-page is-l" aria-label="Scroll filters left" tabIndex={-1} onClick={() => page(-1)}>
        <ChevronLeft size={15} />
      </button>
      <button type="button" className="lib-chip-page is-r" aria-label="Scroll filters right" tabIndex={-1} onClick={() => page(1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="lib-chip" style={color ? { ["--c" as string]: color } : undefined}>
      {children}
    </button>
  );
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="lib-switch" role="radiogroup" aria-label="View" data-view={view}>
      <span className="lib-switch-pill" aria-hidden />
      <button type="button" role="radio" aria-checked={view === "shelf"} onClick={() => onChange("shelf")}>
        <LibraryIcon size={15} /> Shelf
      </button>
      <button type="button" role="radio" aria-checked={view === "topics"} onClick={() => onChange("topics")}>
        <LayoutGrid size={15} /> Topics
      </button>
    </div>
  );
}
