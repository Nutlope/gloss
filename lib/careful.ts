"use client";

/**
 * "Read it more carefully": the PDF behind a text, read again by LlamaParse
 * through /api/pdf-careful, for layouts the free reader gets wrong (columns,
 * tables, maths, scans). Needs the reader's own Together key.
 */

import { markdownBlocks, wordCount, type Article } from "./article";
import { readApiKey } from "./ask";
import { htmlTablesToMarkdown, stitchBlocks } from "./pdf";
import { loadDoc, loadPdf, useStore } from "./store";

export type CarefulResult = { ok: true; article: Article } | { ok: false; error: string; needKey?: boolean };

const same = (a: string, b: string) => a.replace(/\W+/g, "").toLowerCase() === b.replace(/\W+/g, "").toLowerCase();

export async function readCarefully(shown: Article, signal?: AbortSignal): Promise<CarefulResult> {
  // The reader shows a display copy; the new reading builds on the stored original.
  const article = (await loadDoc(shown.id)) ?? shown;
  const pdf = await loadPdf(article.id);
  if (!pdf) return { ok: false, error: "بۇ PDF بۇ ئۈسكۈنىدە يوق. ئەستايىدىل ئوقۇش ئۈچۈن ھۆججەتتىن قايتا ئېچىڭ." };
  const key = readApiKey();
  if (!key) return { ok: false, error: "ئەستايىدىل ئوقۇشقا Together ئاچقۇچىڭىز كېرەك.", needKey: true };

  const form = new FormData();
  form.append("file", pdf, "document.pdf");
  let j: { pages?: string[]; truncated?: boolean; error?: string; code?: string };
  let status = 0;
  try {
    const res = await fetch("/api/pdf-careful", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal });
    status = res.status;
    j = await res.json();
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: "توختىتىلدى." };
    return { ok: false, error: `ئۇلىنىش ئۈزۈلدى: ${String(e)}` };
  }
  if (status !== 200 || !j.pages) return { ok: false, error: j.error ?? `Request failed (${status}).`, needKey: j.code === "need_key" };
  // A partial reading would drop the rest of the text, so it does not replace anything.
  if (j.truncated) return { ok: false, error: "بۇ PDF بىر قېتىمدا ئەستايىدىل ئوقۇشقا بەك ئۇزۇن (60 بەتتىن ئارتۇق)." };

  let blocks = stitchBlocks(j.pages.flatMap((md) => markdownBlocks(htmlTablesToMarkdown(md))));
  // The title is already shown above the text.
  if (blocks[0] && (blocks[0].type === "h2" || blocks[0].type === "h3") && same(blocks[0].runs.map((r) => r.text).join(""), article.title)) blocks = blocks.slice(1);
  if (!blocks.some((b) => b.type === "p")) return { ok: false, error: "ئەستايىدىل ئوقۇش نەتىجىسى بوش. تېكىست ئۆزگەرمىدى." };
  // Ids from separate pages would collide; number them again in reading order.
  blocks = blocks.map((b, i) => ({ ...b, id: `b${i + 1}` }));

  const next: Article = { ...article, blocks };
  if (!(await useStore.getState().replaceText(next, wordCount(next)))) return { ok: false, error: "بۇ توركۆرگۈنىڭ ساقلىغۇچى تولدى. تېكىست ئۆزگەرمىدى." };
  window.dispatchEvent(new CustomEvent("gloss:text-replaced", { detail: next }));
  return { ok: true, article: next };
}
