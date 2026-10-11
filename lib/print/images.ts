/**
 * The pictures a book prints, fetched once before the press runs: each must
 * load, be a picture and stay a sensible size, and is then embedded, so the
 * press never reaches out mid-book. One that fails is left out rather than
 * printed as a broken box. Every hop is checked like a link import is.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { safeUrl } from "@/lib/fetch-article";
import { APP_UA } from "@/lib/together";

const TYPES = /^image\/(jpeg|png|gif|webp|avif|svg\+xml)$/;
const MAX_BYTES = 8_000_000;
const MAX_TOTAL = 90_000_000;

export type Picture = { type: string; data: Buffer };

async function fetchPicture(raw: string): Promise<Picture | null> {
  let target = await safeUrl(raw);
  if (typeof target === "string") return null;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": `Mozilla/5.0 (compatible; ${APP_UA}; +print)`, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (location) {
        const next = await safeUrl(new URL(location, target).toString());
        if (typeof next === "string") return null;
        target = next;
        continue;
      }
      if (!res.ok) return null;
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!TYPES.test(type) || Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
      const data = Buffer.from(await res.arrayBuffer());
      // Tracking pixels and spacers are not pictures.
      return data.byteLength > MAX_BYTES || data.byteLength < 400 ? null : { type, data };
    }
  } catch {}
  return null;
}

/** Every picture in the book, six at a time, within an overall budget. */
export async function fetchPictures(srcs: string[]): Promise<Map<string, Picture>> {
  const todo = [...new Set(srcs)].filter((s) => /^https?:\/\//i.test(s));
  const out = new Map<string, Picture>();
  let total = 0;
  const worker = async () => {
    for (let src = todo.shift(); src; src = todo.shift()) {
      const p = await fetchPicture(src);
      if (p && total + p.data.byteLength <= MAX_TOTAL) {
        out.set(src, p);
        total += p.data.byteLength;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

export const dataUri = (p: Picture) => `data:${p.type};base64,${p.data.toString("base64")}`;

/** A picture that ships with the app: a classic's cover or a topic's plate, from public/library. */
export async function bundled(src: string): Promise<Picture | null> {
  if (!/^\/library\/(covers|topics)\/[\w-]+\.webp$/.test(src)) return null;
  try {
    return { type: "image/webp", data: await readFile(path.join(process.cwd(), "public", src)) };
  } catch {
    return null;
  }
}
