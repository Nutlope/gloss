"use client";

import { create } from "zustand";
import type { Action } from "./actions";
import type { Article, BriefData } from "./article";
import { modelOf, type ModelKey, type Source, type Usage } from "./models";
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Marker, type Settings } from "./settings";

/** A point in the text: block id and a character offset into its plain text. */
export type Point = { b: string; o: number };
export type Anchor = { start: Point; end: Point; quote: string };

export type Turn = {
  role: "user" | "assistant";
  content: string;
  usage?: Usage;
  model?: string;
  modelKey?: ModelKey;
  /** The reader needs their own key to continue: free answers are spent, or there is no shared key. */
  needKey?: boolean;
  /** Looking things up on the web before the answer starts. */
  searching?: boolean;
  /** The web results this answer may cite as [1], [2]. */
  sources?: Source[];
  error?: string;
  streaming?: boolean;
};

export type Gloss = {
  id: string;
  articleId: string;
  /** Anchored to a selection... */
  anchor?: Anchor;
  /** ...or asked about the whole text from a reading position (a block id). */
  at?: string;
  action: Action;
  question?: string;
  turns: Turn[];
  createdAt: number;
};

/**
 * Where a highlight stands in the daily review: when it is next due, how many
 * times it has come round, when it was last seen, and whether it was retired.
 */
export type Review = { due: number; step: number; last: number; off?: boolean };

export type Highlight = { id: string; articleId: string; anchor: Anchor; createdAt: number; color?: Marker; note?: string; review?: Review };

export type BriefState =
  | { status: "loading" }
  | { status: "ready"; data: BriefData; usage?: Usage; modelKey?: ModelKey; at: number }
  | { status: "error"; error: string; needKey?: boolean };

export type { Settings } from "./settings";

export type LibraryItem = {
  id: string;
  title: string;
  author?: string;
  source?: string;
  words: number;
  origin: Article["origin"];
  addedAt: number;
  /** Bumped when the text itself is replaced (read more carefully), so sync sends it again. */
  rev?: number;
  /* The library: where it is shelved, and what it looks like there. */
  /** One of the library's topics (lib/library.ts); missing until it has been sorted. */
  topic?: string;
  tags?: string[];
  /** What the painted cover shows, written when the text is sorted. */
  scene?: string;
  dek?: string;
  year?: number;
  sourceUrl?: string;
  /** The page's own lead picture. */
  image?: string;
  /** A painted cover: a bundled one by path, or "painted" for one made for this text. */
  cover?: string;
  favorite?: boolean;
  /** When it was first read to the end. */
  finishedAt?: number;
  /** Saved as a link to look at later, because the page had too little text to read here. */
  bookmark?: boolean;
  /** Shelved by an agent, through the Gloss MCP server. */
  addedBy?: "agent";
  /** Which connection an agent saved it through, by the name the reader gave it. */
  addedVia?: string;
};

export type Progress = { block: string; pct: number; at: number };

/** A row from the account, as the sync route sends it. `data` is null on a tombstone. */
export type RemoteRow<T> = { id: string; articleId: string; data: T | null; deleted: boolean };
export type RemoteChanges = {
  articles?: RemoteRow<LibraryItem>[];
  highlights?: RemoteRow<Highlight>[];
  glosses?: RemoteRow<Gloss>[];
  briefs?: RemoteRow<BriefState>[];
  progress?: RemoteRow<Progress>[];
};

type Persisted = {
  glosses: Record<string, Gloss[]>;
  highlights: Record<string, Highlight[]>;
  briefs: Record<string, BriefState>;
  progress: Record<string, Progress>;
  library: LibraryItem[];
};

type UI = {
  hydrated: boolean;
  activeGloss: string | null;
  hoverGloss: string | null;
  enteringGloss: string | null;
  activeHighlight: string | null;
  /** Just created: its mark is drawn on rather than appearing. */
  enteringHighlight: string | null;
  notebookOpen: boolean;
  shortcutsOpen: boolean;
  focusMode: boolean;
  cursor: string | null;
  briefOpen: boolean;
  /** The passage a question is being typed about, shown while the native selection is gone. */
  pending: Anchor | null;
  /** The whole shelf, pulled up over the desk: its texts, or every highlight across them. */
  shelf: null | "texts" | "highlights";
};

type State = Persisted &
  UI & {
    settings: Settings;
    hydrate: () => void;
    setSettings: (s: Partial<Settings>) => void;
    setUI: (u: Partial<UI>) => void;
    addGloss: (g: Gloss) => void;
    updateGloss: (articleId: string, id: string, fn: (g: Gloss) => Gloss) => void;
    removeGloss: (articleId: string, id: string) => void;
    addHighlight: (h: Highlight) => void;
    updateHighlight: (articleId: string, id: string, patch: Partial<Highlight>) => void;
    removeHighlight: (articleId: string, id: string) => void;
    setBrief: (articleId: string, b: BriefState | null) => void;
    setProgress: (articleId: string, p: Progress) => void;
    addToLibrary: (a: Article, words: number, extra?: Partial<LibraryItem>) => void;
    /** Change a shelf entry's library fields: its topic, tags, cover, favourite. */
    shelve: (id: string, patch: Partial<LibraryItem>) => void;
    removeFromLibrary: (id: string) => void;
    replaceText: (a: Article, words: number) => Promise<boolean>;
    updateText: (a: Article, words: number) => Promise<boolean>;
    applyRemote: (c: RemoteChanges) => void;
  };

const KEY = "gloss:v1";
const DOC_PREFIX = "gloss:doc:";


export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const useStore = create<State>((set, get) => ({
  glosses: {},
  highlights: {},
  briefs: {},
  progress: {},
  library: [],
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  activeGloss: null,
  hoverGloss: null,
  enteringGloss: null,
  activeHighlight: null,
  enteringHighlight: null,
  notebookOpen: false,
  shortcutsOpen: false,
  focusMode: false,
  cursor: null,
  briefOpen: true,
  pending: null,
  shelf: null,

  hydrate: () => {
    if (get().hydrated) return;
    let data: Partial<Persisted> = {};
    let settings: Partial<Settings> = {};
    try {
      data = JSON.parse(localStorage.getItem(KEY) || "{}");
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {}
    // A reload mid-answer leaves a dangling stream: mark it, never spin forever.
    const glosses = data.glosses ?? {};
    for (const list of Object.values(glosses)) {
      for (const g of list) {
        for (const t of g.turns) {
          if (t.streaming) {
            t.streaming = false;
            if (!t.content) t.error = "Interrupted. Ask again to retry.";
          }
        }
      }
    }
    const briefs = data.briefs ?? {};
    for (const [k, b] of Object.entries(briefs)) if (b.status !== "ready") delete briefs[k];
    set({
      glosses,
      highlights: data.highlights ?? {},
      briefs,
      progress: data.progress ?? {},
      library: data.library ?? [],
      settings: { ...DEFAULT_SETTINGS, ...settings, model: modelOf(settings.model) },
      hydrated: true,
    });
    void migrateDocs();
  },

  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  },

  setUI: (u) => set(u),

  addGloss: (g) =>
    set((st) => ({
      glosses: { ...st.glosses, [g.articleId]: [...(st.glosses[g.articleId] ?? []), g] },
      activeGloss: g.id,
      enteringGloss: g.id,
    })),

  updateGloss: (articleId, id, fn) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).map((g) => (g.id === id ? fn(g) : g)) },
    })),

  removeGloss: (articleId, id) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).filter((g) => g.id !== id) },
      activeGloss: st.activeGloss === id ? null : st.activeGloss,
      hoverGloss: st.hoverGloss === id ? null : st.hoverGloss,
    })),

  addHighlight: (h) => {
    set((st) => ({ highlights: { ...st.highlights, [h.articleId]: [...(st.highlights[h.articleId] ?? []), h] }, enteringHighlight: h.id }));
    setTimeout(() => get().enteringHighlight === h.id && set({ enteringHighlight: null }), 700);
  },

  updateHighlight: (articleId, id, patch) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) },
    })),

  removeHighlight: (articleId, id) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).filter((h) => h.id !== id) },
      activeHighlight: st.activeHighlight === id ? null : st.activeHighlight,
    })),

  setBrief: (articleId, b) =>
    set((st) => {
      const briefs = { ...st.briefs };
      if (b) briefs[articleId] = b;
      else delete briefs[articleId];
      return { briefs };
    }),

  setProgress: (articleId, p) =>
    set((st) => {
      // The first time a text is read to the end, the library notes when.
      const done = p.pct >= 1 && st.library.some((x) => x.id === articleId && !x.finishedAt);
      return {
        progress: { ...st.progress, [articleId]: p },
        ...(done ? { library: st.library.map((x) => (x.id === articleId ? { ...x, finishedAt: p.at } : x)) } : {}),
      };
    }),

  addToLibrary: (a, words, extra) =>
    set((st) => {
      const year = Number(a.published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]) || undefined;
      const item: LibraryItem = {
        id: a.id,
        title: a.title,
        author: a.author,
        source: a.source,
        words,
        origin: a.origin,
        addedAt: a.addedAt ?? Date.now(),
        dek: a.dek,
        year,
        sourceUrl: a.sourceUrl,
        image: a.image,
        bookmark: a.bookmark || undefined,
        ...extra,
      };
      // Undefined fields are left out, so a shelf entry's JSON stays as small as it was.
      for (const k of Object.keys(item) as (keyof LibraryItem)[]) if (item[k] === undefined) delete item[k];
      return { library: [item, ...st.library.filter((x) => x.id !== a.id)] };
    }),

  shelve: (id, patch) => set((st) => ({ library: st.library.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

  removeFromLibrary: (id) => {
    void dropDoc(id);
    set((st) => ({ library: st.library.filter((x) => x.id !== id) }));
  },

  // Part of a text read again (a page swapped in by lib/upgrade.ts) where no mark is anchored:
  // the marks stay. The rev bump makes sync send the text again.
  updateText: async (a, words) => {
    if (!(await saveDoc(a))) return false;
    set((st) => ({ library: st.library.map((x) => (x.id === a.id ? { ...x, words, rev: (x.rev ?? 0) + 1 } : x)) }));
    return true;
  },

  // A new reading of the same text. Every mark is anchored to a block id and offset in the old
  // text, so highlights, glosses and the whole-text gloss go with it; the caller asks first.
  replaceText: async (a, words) => {
    if (!(await saveDoc(a))) return false;
    set((st) => {
      const rest = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== a.id)) as Record<string, T>;
      return {
        library: st.library.map((x) => (x.id === a.id ? { ...x, words, rev: (x.rev ?? 0) + 1 } : x)),
        highlights: rest(st.highlights),
        glosses: rest(st.glosses),
        briefs: rest(st.briefs),
        progress: rest(st.progress),
      };
    });
    return true;
  },

  // Changes from another device. The server's copy replaces the local one,
  // except a gloss that is still being written here.
  applyRemote: (c) =>
    set((st) => {
      let library = st.library;
      for (const r of c.articles ?? []) {
        library = library.filter((x) => x.id !== r.id);
        if (r.deleted || !r.data) void dropDoc(r.id);
        else library = [r.data, ...library];
      }

      const merge = <T extends { id: string; createdAt: number }>(cur: Record<string, T[]>, rows: RemoteRow<T>[] = [], keep?: (t: T) => boolean) => {
        if (!rows.length) return cur;
        const next = { ...cur };
        for (const r of rows) {
          const list = next[r.articleId] ?? [];
          const local = list.find((x) => x.id === r.id);
          if (local && keep?.(local)) continue;
          next[r.articleId] = list.filter((x) => x.id !== r.id);
          if (!r.deleted && r.data) next[r.articleId] = [...next[r.articleId], r.data].sort((a, b) => a.createdAt - b.createdAt);
        }
        return next;
      };

      const byArticle = <T,>(cur: Record<string, T>, rows: RemoteRow<T>[] = []) => {
        if (!rows.length) return cur;
        const next = { ...cur };
        for (const r of rows) {
          if (r.deleted || !r.data) delete next[r.id];
          else next[r.id] = r.data;
        }
        return next;
      };

      return {
        library,
        highlights: merge(st.highlights, c.highlights),
        glosses: merge(st.glosses, c.glosses, (g) => g.turns.some((t) => t.streaming)),
        briefs: byArticle(st.briefs, c.briefs),
        progress: byArticle(st.progress, c.progress),
      };
    }),
}));

/* Debounced persistence. Streaming updates land many times a second, so the
   write waits for a pause rather than serializing on every token. */
if (typeof window !== "undefined") {
  let t: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe((st, prev) => {
    if (!st.hydrated) return;
    if (
      st.glosses === prev.glosses &&
      st.highlights === prev.highlights &&
      st.briefs === prev.briefs &&
      st.progress === prev.progress &&
      st.library === prev.library
    )
      return;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const { glosses, highlights, briefs, progress, library } = useStore.getState();
      try {
        localStorage.setItem(KEY, JSON.stringify({ glosses, highlights, briefs, progress, library }));
      } catch {}
    }, 400);
  });
}

/* Texts live in IndexedDB, which holds far more than localStorage's few
   megabytes. Older builds kept them in localStorage; they move over on first read. */

const DB_NAME = "gloss";
const DOCS = "docs";
/** The original files of imported PDFs, for reading them again more carefully. Local only; never synced. */
const FILES = "files";
let dbp: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      for (const name of [DOCS, FILES]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = DOCS): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDoc(a: Article): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(a, a.id));
    return true;
  } catch {}
  // No IndexedDB (some private windows): the old, smaller home still works.
  try {
    localStorage.setItem(DOC_PREFIX + a.id, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export async function loadDoc(id: string): Promise<Article | null> {
  try {
    const a = await tx<Article | undefined>("readonly", (s) => s.get(id));
    if (a) return a;
  } catch {}
  let legacy: Article | null = null;
  try {
    const raw = localStorage.getItem(DOC_PREFIX + id);
    legacy = raw ? (JSON.parse(raw) as Article) : null;
  } catch {}
  if (legacy) {
    try {
      await tx("readwrite", (s) => s.put(legacy, id));
      localStorage.removeItem(DOC_PREFIX + id);
    } catch {}
  }
  return legacy;
}

/** Moves every text an older build left in localStorage into IndexedDB, freeing room for notes. */
async function migrateDocs() {
  let ids: string[] = [];
  try {
    ids = Object.keys(localStorage).filter((k) => k.startsWith(DOC_PREFIX)).map((k) => k.slice(DOC_PREFIX.length));
  } catch {}
  for (const id of ids) await loadDoc(id);
}

/** Keep an imported PDF's original file, by its article id. */
export async function savePdf(id: string, file: Blob): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(file, id), FILES);
    return true;
  } catch {
    return false;
  }
}

/** The original PDF behind an article, when this browser imported it. */
export async function loadPdf(id: string): Promise<Blob | null> {
  try {
    return (await tx<Blob | undefined>("readonly", (s) => s.get(id), FILES)) ?? null;
  } catch {
    return null;
  }
}

/** Forget this device's copy of a text (not its PDF): it changed elsewhere and is fetched again on open. */
export async function forgetDoc(id: string) {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {}
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {}
}

async function dropDoc(id: string) {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {}
  try {
    await tx("readwrite", (s) => s.delete(id));
    await tx("readwrite", (s) => s.delete(id), FILES);
  } catch {}
}

const EMPTY: never[] = [];
export const useGlosses = (articleId: string) => useStore((s) => s.glosses[articleId] ?? EMPTY);
export const useHighlights = (articleId: string) => useStore((s) => s.highlights[articleId] ?? EMPTY);
