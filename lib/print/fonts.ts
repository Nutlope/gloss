/**
 * The book's two faces, embedded: Newsreader for reading, Schibsted Grotesk
 * for the small print. Read from their packages and inlined, so the press
 * needs no network and the PDF carries every glyph it sets. Chrome gets WOFF2;
 * Prince, at DocRaptor, the older WOFF it has always read.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const FACES: { pkg: string; css: string[] }[] = [
  { pkg: "@fontsource/newsreader", css: ["400", "400-italic", "500", "500-italic", "600", "600-italic"] },
  { pkg: "@fontsource/schibsted-grotesk", css: ["400", "500", "600", "700"] },
];

const cache = new Map<string, Promise<string>>();

/** Every @font-face the book uses, with its files as data URIs. */
export function fontFaces(format: "woff2" | "woff"): Promise<string> {
  let hit = cache.get(format);
  if (!hit) {
    hit = load(format);
    hit.catch(() => cache.delete(format));
    cache.set(format, hit);
  }
  return hit;
}

async function load(format: "woff2" | "woff"): Promise<string> {
  const out: string[] = [];
  for (const face of FACES) {
    const dir = path.join(process.cwd(), "node_modules", face.pkg);
    for (const name of face.css) {
      const css = await readFile(path.join(dir, `${name}.css`), "utf8");
      for (const rule of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
        // Latin and Latin Extended cover what the shelf holds; other scripts fall back, still embedded.
        if (/vietnamese|cyrillic|greek/.test(rule)) continue;
        const file = rule.match(/url\(\.\/files\/([^)]+?)\.woff2\)/)?.[1];
        if (!file) continue;
        const data = (await readFile(path.join(dir, "files", `${file}.${format}`))).toString("base64");
        out.push(
          rule
            .replace(/src:[^;]+;/, `src: url(data:font/${format};base64,${data}) format('${format}');`)
            .replace(/font-display:[^;]+;\s*/, "")
        );
      }
    }
  }
  return out.join("\n");
}
