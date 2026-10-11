"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { ChevronLeft, LayoutGrid, Library as LibraryIcon, Search, X } from "lucide-react";
import { TopBar } from "@/components/ui/TopBar";
import { readingMinutes, tidyTitle, wordCount } from "@/lib/article";
import { forgetCover, paintAll } from "@/lib/covers";
import { SAMPLE_SHELF } from "@/lib/classics";
import { SORTS, sortBooks, TAGS, TOPIC, TOPICS, topicOf, type Book, type Sort, type TagKey, type Topic, type TopicKey } from "@/lib/library";
import { useLibraryPrefs } from "@/lib/library-prefs";
import { SAMPLES } from "@/lib/samples";
import { applySettings } from "@/lib/settings";
import { backfill } from "@/lib/shelving";
import { useStore } from "@/lib/store";
import { watchShelf } from "@/lib/sync";
import { AddButton, AddPanel, type AddTab } from "./AddPanel";
import { Arrivals, type Wave } from "./Arrivals";
import { Glyph } from "./Book";
import { BookOpen, type Origin } from "./BookOpen";
import { Edition } from "./Edition";
import { EDITIONS_ON, EditionCard, editionMonth } from "./EditionCard";
import { Shelf } from "./Shelf";
import { Starter } from "./Starter";
import { TopicGrid, TopicPage } from "./Topics";

type View = "shelf" | "topics";

const SEEN_KEY = "gloss:library-seen";
/** Samples stay on the shelf until it has this many texts of your own, or for good once opened. */
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
  const [topic, setTopic] = useState<TopicKey | null>(null);
  const [only, setOnly] = useState<TopicKey | null>(null);
  const [tag, setTag] = useState<TagKey | null>(null);
  const [sort, setSort] = useState<Sort>("topic");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; origin: Origin } | null>(null);
  const [adding, setAdding] = useState<AddTab | null>(null);
  const [edition, setEdition] = useState<{ month: string; order?: string; session?: string | null } | null>(null);
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

  // Back from checkout (?edition=ed_...&session=...), or sent straight to this month's edition (?edition=open).
  useEffect(() => {
    if (!EDITIONS_ON || !hydrated) return;
    const q = new URLSearchParams(window.location.search);
    const e = q.get("edition");
    if (!e) return;
    const month = editionMonth(useStore.getState().library);
    if (e.startsWith("ed_") && !q.get("canceled")) setEdition({ month, order: e, session: q.get("session") });
    else setEdition({ month });
    window.history.replaceState(null, "", "/library");
  }, [hydrated]);

  // Signed in, the shelf is checked every few seconds while it's open, so an agent's saves arrive as you look.
  useEffect(() => watchShelf(), []);

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
    const mine: Book[] = library.map((x) => ({
      id: x.id,
      title: tidyTitle(x.title),
      author: bylineOf(x),
      year: x.year,
      url: x.sourceUrl,
      topic: topicOf(x.topic),
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
    }));
    const samples: Book[] = SAMPLES.filter((a) => own.length < SAMPLES_UNTIL || read(a.id) > 0).map((a) => ({
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
  }, [library, progress, highlights, hydrated]);

  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);

  const match = useCallback(
    (b: Book) => {
      const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const t = tag ? TAGS.find((x) => x.key === tag)! : null;
      return (!t || t.test(b)) && words.every((w) => `${b.title} ${b.author} ${TOPIC[b.topic].name} ${b.tags.join(" ")} ${b.year ?? ""}`.toLowerCase().includes(w));
    },
    [q, tag]
  );
  const shown = useMemo(() => new Set(sorted.filter((b) => (!only || b.topic === only) && match(b)).map((b) => b.id)), [sorted, only, match]);

  const topics = useMemo(
    () => TOPICS.map((t) => ({ topic: t, books: books.filter((b) => b.topic === t.key).sort((a, b) => b.added - a.added) })).filter((x) => x.books.length),
    [books]
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

  const go = useCallback((to: { view: View; topic?: TopicKey | null }) => {
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
      if (open || adding || edition || e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && topic) go({ view: "topics" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, adding, edition, topic, go]);

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
  const T = topic ? TOPIC[topic] : null;
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
          <Glyph k={t.key} size={19} /> {t.label} <span className="lib-n">{n}</span>
        </Chip>
      );
    });

  return (
    <div className={`library relative z-[1] min-h-dvh transition-[opacity,filter] duration-300 ${leaving ? "opacity-0 blur-[2px]" : ""}`}>
      <div className="lib-top">
        <TopBar here="library" onLibrary={() => go({ view: topic ? "topics" : view })} />
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 sm:px-8">
        {!T && (
          <section className="lib-hero">
            <div className="lib-hero-row">
            <div className="min-w-0">
            <p className="lib-eyebrow">
              <LibraryIcon size={14} /> Library
            </p>
            <h1 className="lib-title">{first ? `${first}'s library` : "Your library"}</h1>
            {hydrated && (
              <p className="lib-stats">
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
              </p>
            )}
            </div>
            <div className="lib-hero-actions">
              {EDITIONS_ON && hydrated && <EditionCard onOpen={(month, order) => setEdition({ month, order })} />}
              <AddButton onClick={() => setAdding("agent")} />
            </div>
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
          <div className="lib-chips no-scrollbar" role="group" aria-label="Filter">
            <Chip on={!only && !tag} onClick={() => (setOnly(null), setTag(null))}>
              All <span className="lib-n">{books.length}</span>
            </Chip>
            {topics.map(({ topic: t, books: bs }) => (
              <Chip key={t.key} on={only === t.key} color={t.shades[0]} onClick={() => setOnly(only === t.key ? null : t.key)}>
                <Glyph k={t.key} size={19} /> {t.name} <span className="lib-n">{bs.length}</span>
              </Chip>
            ))}
            {TAGS.some((t) => books.some(t.test)) && <span aria-hidden className="mx-1 h-5 w-px shrink-0 self-center bg-rule" />}
            {tagChips(books)}
          </div>
        )}

        <ViewTransition key={screen} enter="lib-enter" exit="lib-exit" default="none">
          <div className="lib-screen">
            {T ? (
              <TopicPage
                topic={T}
                books={topicBooks}
                tools={
                  <div className="lib-tools mt-8">
                    {searchBox}
                    <div className="lib-chips no-scrollbar">{tagChips(books.filter((b) => b.topic === T.key))}</div>
                  </div>
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
                    onLabel={sort === "topic" ? (k) => go({ view: "topics", topic: k as TopicKey }) : undefined}
                  />
                )}
                {hydrated && shown.size === 0 && books.length > 0 && (
                  <p className="py-6 text-center text-[14px] text-ink-3">Nothing on the shelves matches{q ? <> &ldquo;{q}&rdquo;</> : ""}.</p>
                )}
                {hydrated && own.length < SAMPLES_UNTIL ? (
                  <Starter count={own.length} signedIn={Boolean(isSignedIn)} onAdd={setAdding} />
                ) : (
                  hydrated && <p className="lib-hint">Click a spine to take it down. Arrow keys walk the shelf.</p>
                )}
              </>
            ) : (
              <TopicGrid topics={topics} onPick={(t: Topic) => go({ view: "topics", topic: t.key })} />
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
          onShelve={(b, patch) => shelveItem(b.id, patch)}
          onRemove={(b) => {
            setOpen(null);
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
        />
      )}
      {adding && <AddPanel tab={adding} onTab={setAdding} onClose={() => setAdding(null)} signedIn={Boolean(isSignedIn)} />}
      {edition && <Edition month={edition.month} orderId={edition.order} session={edition.session} owner={first ?? ""} onClose={() => setEdition(null)} />}
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
