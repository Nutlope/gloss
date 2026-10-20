"use client";

/**
 * The library's sorting, from the browser: each new text goes to /api/shelve
 * once, in the background, and comes back with a topic, tags and a scene for
 * its cover. Texts shelved before the library existed are sorted the first
 * time the library opens. Moving a book by hand always wins.
 */

import type { Article } from "./article";
import { readApiKey } from "./ask";
import type { Shelving } from "./library";
import { excerptOf } from "./excerpt";
import { customShelvesSnapshot } from "./library-prefs";
import { loadDoc, useStore, type LibraryItem } from "./store";

const inflight = new Set<string>();
/** The free allowance ran out: stop sorting quietly until the next visit. */
let resting = false;

type Text = Pick<Article, "id" | "title" | "author" | "source" | "dek"> & { blocks?: Article["blocks"] };

export async function shelveText(a: Text): Promise<void> {
  if (resting || inflight.has(a.id)) return;
  inflight.add(a.id);
  try {
    const res = await fetch("/api/shelve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: a.title, author: a.author, source: a.source, dek: a.dek, excerpt: a.blocks ? excerptOf(a.blocks) : undefined, shelves: customShelvesSnapshot(), apiKey: readApiKey() || undefined }),
    });
    if (res.status === 429 || res.status === 401) {
      const j = (await res.json().catch(() => ({}))) as { code?: string };
      // Spent for today, or no key at all: rest. A burst limit just means slow down.
      if (j.code === "need_key") resting = true;
      else await new Promise((r) => setTimeout(r, 15_000));
      return;
    }
    if (!res.ok) return;
    const s = (await res.json()) as Shelving;
    const st = useStore.getState();
    const cur = st.library.find((x) => x.id === a.id);
    if (!cur || cur.topic) return;
    st.shelve(a.id, { topic: s.topic, tags: s.tags.length ? s.tags : undefined, scene: s.scene });
  } catch {
    // Unsorted is a fine place to wait.
  } finally {
    inflight.delete(a.id);
  }
}

let backfilling = false;

/** Sort what was shelved before the library existed: two at a time, a few dozen a visit. */
export async function backfill(items: LibraryItem[], limit = 40): Promise<void> {
  if (backfilling || resting) return;
  const todo = items.filter((x) => !x.topic && x.origin !== "sample").slice(0, limit);
  if (!todo.length) return;
  backfilling = true;
  try {
    const next = async () => {
      for (let x = todo.shift(); x && !resting; x = todo.shift()) {
        const doc = await loadDoc(x.id).catch(() => null);
        await shelveText(doc ?? { id: x.id, title: x.title, author: x.author, source: x.source, dek: x.dek });
        await new Promise((r) => setTimeout(r, 400));
      }
    };
    await Promise.all([next(), next()]);
  } finally {
    backfilling = false;
  }
}
