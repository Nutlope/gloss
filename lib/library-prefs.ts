"use client";

import { useSyncExternalStore } from "react";
import { customKeyFor, type CustomShelf } from "./library";

export type { CustomShelf };

/**
 * The library's own preferences, kept apart from the reading settings.
 * `hiddenSamples`: the bundled samples taken off this device's shelf.
 * `customShelves`: shelves the reader made themselves, in the order they made them.
 */
export type LibraryPrefs = { paintedCovers: boolean; hiddenSamples: string[]; customShelves: CustomShelf[] };

const KEY = "gloss:library";
const DEFAULTS: LibraryPrefs = { paintedCovers: false, hiddenSamples: [], customShelves: [] };
const listeners = new Set<() => void>();
let cache: LibraryPrefs | null = null;

function read(): LibraryPrefs {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<LibraryPrefs>;
    cache = { ...DEFAULTS, ...parsed, customShelves: Array.isArray(parsed.customShelves) ? parsed.customShelves.filter((s) => s && typeof s.key === "string" && typeof s.name === "string") : [] };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

/** Your own shelves, as stored right now (for code outside React, like the shelving call). */
export const customShelvesSnapshot = (): CustomShelf[] => read().customShelves;

/** Make a shelf of your own. Returns the shelf, or the existing one with that name, or null for a blank name. */
export function createCustomShelf(name: string): CustomShelf | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return null;
  const shelves = read().customShelves;
  const same = shelves.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  const shelf: CustomShelf = { key: customKeyFor(clean, shelves.map((s) => s.key)), name: clean, createdAt: Date.now() };
  setLibraryPrefs({ customShelves: [...shelves, shelf] });
  return shelf;
}

export function renameCustomShelf(key: string, name: string): void {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return;
  setLibraryPrefs({ customShelves: read().customShelves.map((s) => (s.key === key ? { ...s, name: clean } : s)) });
}

export function deleteCustomShelf(key: string): void {
  setLibraryPrefs({ customShelves: read().customShelves.filter((s) => s.key !== key) });
}

export function setLibraryPrefs(p: Partial<LibraryPrefs>) {
  cache = { ...read(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

/** Take a bundled sample off the shelf. It can still be opened by its link. */
export function hideSample(id: string) {
  const hidden = read().hiddenSamples;
  if (!hidden.includes(id)) setLibraryPrefs({ hiddenSamples: [...hidden, id] });
}

export function useLibraryPrefs(): LibraryPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULTS
  );
}
