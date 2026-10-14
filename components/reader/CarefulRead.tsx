"use client";

import { useEffect, useRef, useState } from "react";
import type { Article } from "@/lib/article";
import { openKeyMenu, readApiKey } from "@/lib/ask";
import { readCarefully } from "@/lib/careful";
import { startUpgrade, type UpgradeProgress } from "@/lib/upgrade";
import { loadPdf, useGlosses, useHighlights } from "@/lib/store";

type State = { kind: "idle" } | { kind: "confirm" } | { kind: "reading" } | { kind: "done" } | { kind: "error"; error: string; needKey?: boolean };

/**
 * A quiet line under the byline of an imported PDF: when columns, tables or
 * maths came out jumbled, the PDF can be read again, more carefully. Shown
 * only where this browser still has the file.
 */
export function CarefulRead({ article }: { article: Article }) {
  const [hasPdf, setHasPdf] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hasKey, setHasKey] = useState(false);
  const marks = useHighlights(article.id).length + useGlosses(article.id).length;
  const abort = useRef<AbortController | null>(null);
  const [upgrading, setUpgrading] = useState<UpgradeProgress | null>(null);

  // Hard pages listed at import are read again in the background, and swap in as they arrive.
  useEffect(() => {
    if (!hasPdf) return;
    return startUpgrade(article.id, setUpgrading);
  }, [article.id, hasPdf]);

  useEffect(() => {
    let live = true;
    if (article.origin === "file") void loadPdf(article.id).then((b) => live && setHasPdf(Boolean(b)));
    setHasKey(Boolean(readApiKey()));
    // The key can be added from the menu while this is on screen.
    const recheck = () => setHasKey(Boolean(readApiKey()));
    window.addEventListener("storage", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      live = false;
      window.removeEventListener("storage", recheck);
      window.removeEventListener("focus", recheck);
      abort.current?.abort();
    };
  }, [article.id, article.origin]);

  if (!hasPdf) return null;

  const run = async () => {
    abort.current = new AbortController();
    setState({ kind: "reading" });
    const r = await readCarefully(article, abort.current.signal);
    setState(r.ok ? { kind: "done" } : { kind: "error", error: r.error, needKey: r.needKey });
  };
  const start = () => {
    if (!readApiKey()) return openKeyMenu();
    if (marks > 0) setState({ kind: "confirm" });
    else void run();
  };

  const link = "font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink";
  return (
    <div className="focus-hide mt-3 text-[13px] leading-snug text-ink-3" aria-live="polite">
      {state.kind === "idle" && upgrading?.active && (
        <p className="animate-pulse">{`جەدۋەل ۋە ئىستونلارنى ياخشىلاۋاتىدۇ، ${upgrading.total} بەتتىن ${upgrading.done}…`}</p>
      )}
      {state.kind === "idle" && !upgrading?.active && (
        <p>
          ئىستون، جەدۋەل ياكى ماتېماتىكا قالايمىقانمۇ؟{" "}
          <button type="button" onClick={start} className={link}>
            تېخىمۇ ئەستايىدىل ئوقۇش
          </button>
          {!hasKey && <span className="text-ink-4"> · Together ئاچقۇچىڭىز كېرەك</span>}
        </p>
      )}
      {state.kind === "confirm" && (
        <p>
          {`بۇ تېكىستنى ئالماشتۇرىدۇ ۋە ئۇنىڭدىكى ${marks} بەلگىڭىزنى تازىلايدۇ. `}
          <button type="button" onClick={() => void run()} className={link}>
            قايتا ئوقۇش
          </button>
          {" · "}
          <button type="button" onClick={() => setState({ kind: "idle" })} className="underline-offset-4 hover:text-ink">
            بۇ تېكىستنى ساقلاپ قېلىش
          </button>
        </p>
      )}
      {state.kind === "reading" && (
        <p>
          <span className="inline-block animate-pulse">ئەستايىدىل ئوقۇۋاتىدۇ، ھەر بەتكە تەخمىنەن ئون سېكۇنت…</span>{" "}
          <button type="button" onClick={() => abort.current?.abort()} className="underline-offset-4 hover:text-ink hover:underline">
            توختىتىش
          </button>
        </p>
      )}
      {state.kind === "done" && <p>تېخىمۇ ئەستايىدىل قايتا ئوقۇش.</p>}
      {state.kind === "error" && (
        <p>
          <span className="text-rubric-text">{state.error}</span>{" "}
          {state.needKey ? (
            <button type="button" onClick={openKeyMenu} className={link}>
              Together ئاچقۇچىڭىزنى قوشۇڭ
            </button>
          ) : (
            <button type="button" onClick={() => setState({ kind: "idle" })} className={link}>
              قايتىش
            </button>
          )}
        </p>
      )}
    </div>
  );
}
