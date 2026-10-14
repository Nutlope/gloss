"use client";

import { forwardRef } from "react";
import { ArrowRight, BookmarkPlus, FileUp, Link2, TextCursorInput } from "lucide-react";
import { openKeyMenu } from "@/lib/ask";

export type Busy = null | { label: string; pct?: number };

type Props = {
  url: string;
  setUrl: (v: string) => void;
  busy: Busy;
  error: string | null;
  /** The error is fixed by the reader's own Together key: offer the key menu. */
  errorNeedsKey?: boolean;
  onSubmit: (url: string) => void;
  /** Keep it in the library for later, instead of reading it now. */
  onSave: (url: string) => void;
  onPickFile: () => void;
  onPasteText: () => void;
};

/** The one thing to do on the landing page: give it something to read. */
export const ImportBar = forwardRef<HTMLInputElement, Props>(function ImportBar({ url, setUrl, busy, error, errorNeedsKey, onSubmit, onSave, onPickFile, onPasteText }, ref) {
  return (
    <div className="mt-10 w-full max-w-[600px] text-start sm:mt-12">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(url);
        }}
        className={`import-bar relative flex items-center gap-2 overflow-hidden rounded-[18px] border bg-raised p-1.5 ps-[18px] shadow-card transition-[border-color,box-shadow] duration-300 focus-within:border-rule-strong focus-within:shadow-pop ${
          busy ? "border-rule-strong" : "border-rule"
        }`}
      >
        <Link2 size={18} className="shrink-0 text-ink-3" aria-hidden />
        <input
          ref={ref}
          value={busy ? busy.label + (busy.pct !== undefined ? ` ${Math.round(busy.pct * 100)}%` : "") : url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!busy}
          placeholder="خالىغان ماقالىنىڭ ئۇلانمىسىنى چاپلاڭ"
          aria-label="ماقالە ئۇلانمىسى"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:text-ink-2"
        />
        {url.trim() && !busy && (
          <button
            type="button"
            onClick={() => onSave(url)}
            aria-label="كۈتۈپخانىڭىزغا ساقلاش"
            data-tip="كېيىن ئوقۇش ئۈچۈن ساقلاش"
            data-tip-hint="كۈتۈپخانىڭىزغا، تېما بويىچە تەرتىپلىنىدۇ"
            className="grid size-12 shrink-0 place-items-center rounded-[13px] text-ink-2 transition-[background-color,color,transform] hover:bg-sunk hover:text-ink active:scale-[0.95]"
            style={{ animation: "fade 0.2s both" }}
          >
            <BookmarkPlus size={18} />
          </button>
        )}
        <button
          type="submit"
          disabled={!url.trim() || !!busy}
          aria-label="ئوقۇش"
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-[13px] bg-ink px-4 text-[14.5px] font-medium text-bg transition-[opacity,transform] focus-visible:outline-offset-[-4px] focus-visible:outline-bg active:scale-[0.97] disabled:opacity-30 sm:px-5"
        >
          <span className="hidden sm:inline">ئوقۇش</span> <ArrowRight size={16} />
        </button>
        {busy && <span aria-hidden className="import-progress" style={busy.pct !== undefined ? { ["--p" as string]: busy.pct } : undefined} />}
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13.5px] text-ink-3">
        <button type="button" onClick={onPickFile} disabled={!!busy} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
          <FileUp size={15} /> PDF ئېچىش
        </button>
        <button type="button" onClick={onPasteText} disabled={!!busy} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
          <TextCursorInput size={15} /> تېكىست چاپلاش
        </button>
        <span className="hidden items-center gap-1.5 text-ink-4 sm:inline-flex">
          ياكى خالىغان يەردە <kbd>⌘</kbd>
          <kbd>V</kbd> نى بېسىڭ
        </span>
      </div>

      {error && (
        <p className="mx-auto mt-4 max-w-[34rem] text-center text-[13.5px] leading-snug text-rubric-text" role="alert">
          {error}
          {errorNeedsKey && (
            <>
              {" "}
              <button type="button" onClick={openKeyMenu} className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
                Together ئاچقۇچىڭىزنى قوشۇڭ
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
});
