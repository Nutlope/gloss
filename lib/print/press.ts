/**
 * Setting an edition: gather its pictures, set the interior, pad it to what
 * Lulu binds, then set the cover to fit the spine that page count makes.
 * Returns the two PDFs the printer is sent.
 */

import { hyphenateSync } from "hyphen/en";
import { arrange, evenPages, PRINT, type EditionInput } from "@/lib/edition";
import { topicArtSrc } from "@/lib/library";
import { coverSize } from "@/lib/lulu";
import { coverHTML, interiorHTML, type Press } from "./book";
import { fontFaces } from "./fonts";
import { bundled, dataUri, fetchPictures } from "./images";
import { engine, openPress } from "./render";

export type SetBook = { interior: Uint8Array; cover: Uint8Array; pages: number; engine: "prince" | "chrome"; width: number; height: number };

const PAINTED = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export async function setBook(ed: EditionInput): Promise<SetBook> {
  const kind = engine();
  const texts = arrange(ed.texts);
  const figures = texts.flatMap((t) => t.blocks.filter((b) => b.type === "figure" && b.src).map((b) => b.src!));
  const [fonts, pictures] = await Promise.all([fontFaces(kind === "prince" ? "woff" : "woff2"), fetchPictures(figures)]);

  const plates = new Map<string, string>();
  for (const t of texts) {
    if (!t.plate) continue;
    if (PAINTED.test(t.plate)) plates.set(t.id, t.plate);
    else {
      const p = await bundled(t.plate);
      if (p) plates.set(t.id, dataUri(p));
    }
  }
  const plate = await bundled(topicArtSrc(ed.copy.topic));
  const art = ed.art ? `data:image/jpeg;base64,${ed.art}` : plate ? dataUri(plate) : null;

  const press: Press = {
    engine: kind,
    fonts,
    picture: (src) => {
      const p = pictures.get(src);
      return p ? dataUri(p) : null;
    },
    plate: (t) => plates.get(t.id) ?? null,
    art,
    hyphenate: (s) => hyphenateSync(s, { minWordLength: 7 }),
  };

  const title = `Gloss, ${ed.name ? `The ${ed.name} Edition` : "Your Edition"}`;
  const session = await openPress();
  try {
    let notes = 0;
    let set = await session.render(interiorHTML(ed, press, { notes }), { paged: true, title });
    // Lulu binds thirty-two pages or more, in pairs: a short month ends in pages ruled for notes.
    for (let i = 0; i < 3 && (set.pages < PRINT.minPages || set.pages % 2); i++) {
      notes += evenPages(Math.max(PRINT.minPages, set.pages)) - set.pages;
      set = await session.render(interiorHTML(ed, press, { notes }), { paged: true, title });
    }
    const size = await coverSize(set.pages);
    const cover = await session.render(coverHTML(ed, press, { pages: set.pages, ...size }), { paged: false, title: `${title}, cover` });
    return { interior: set.pdf, cover: cover.pdf, pages: set.pages, engine: kind, ...size };
  } finally {
    await session.close();
  }
}
