"use client";

/**
 * Painted covers in the browser: kept in their own IndexedDB store, fetched
 * from the account when they were painted on another device, and painted on
 * request when the reader has turned painted covers on (off by default; each
 * one is a call to an image model).
 */

import { readApiKey } from "./ask";
import { isCustomKey, isTopic } from "./library";
import { useStore, type LibraryItem } from "./store";

const DB = "gloss-covers";
const STORE = "covers";

let opening: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  return (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await idb();
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

const urls = new Map<string, string>();

/** A painted cover's picture, as an object URL: this device first, then the account. */
export async function paintedUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return hit;
  let blob = (await tx<Blob>("readonly", (s) => s.get(id))) ?? null;
  if (!blob) {
    try {
      const res = await fetch(`/api/covers/${encodeURIComponent(id)}`);
      if (res.ok) {
        blob = await res.blob();
        await tx("readwrite", (s) => s.put(blob, id));
      }
    } catch {}
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export const forgetCover = (id: string) => tx("readwrite", (s) => s.delete(id));

/** Paint one text's cover. "rest" means the free allowance is spent, so the queue should stop. */
export async function paint(item: LibraryItem): Promise<"ok" | "rest" | "error"> {
  if (!item.scene || !(isTopic(item.topic) || isCustomKey(item.topic))) return "error";
  try {
    const res = await fetch("/api/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, scene: item.scene, topic: item.topic, apiKey: readApiKey() || undefined }),
    });
    if (res.status === 429 || res.status === 401) return "rest";
    if (!res.ok) return "error";
    const blob = await res.blob();
    await tx("readwrite", (s) => s.put(blob, item.id));
    urls.delete(item.id);
    useStore.getState().shelve(item.id, { cover: "painted" });
    return "ok";
  } catch {
    return "error";
  }
}

let painting = false;

/** Paint every sorted text that has no cover yet, until the allowance runs out. */
export async function paintAll(items: LibraryItem[]): Promise<void> {
  if (painting) return;
  painting = true;
  try {
    // Two at a time: a picture can take from a few seconds to most of a minute.
    const taken = new Set<string>();
    let rest = false;
    const worker = async () => {
      for (;;) {
        const next = useStore.getState().library.find((x) => !x.cover && x.scene && !taken.has(x.id) && items.some((i) => i.id === x.id));
        if (!next || rest) return;
        taken.add(next.id);
        if ((await paint(next)) === "rest") rest = true;
      }
    };
    await Promise.all([worker(), worker()]);
  } finally {
    painting = false;
  }
}
