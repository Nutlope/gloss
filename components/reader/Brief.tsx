"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, RotateCcw } from "lucide-react";
import { fetchBrief, openKeyMenu } from "@/lib/ask";
import type { DocIndex } from "@/lib/doc";
import { MODELS, modelOf } from "@/lib/models";
import { useStore } from "@/lib/store";
import { Answer } from "./Answer";
import { fmtCost, useReader } from "./context";

/**
 * The brief: a two-sentence gist, the load-bearing claims with citations,
 * what to keep in mind before relying on them, and a map of the text's movements. The map also labels the rail and the top bar.
 */
export function Brief() {
  const { ix, jumpTo } = useReader();
  const brief = useStore((s) => s.briefs[ix.article.id]);
  const open = useStore((s) => s.briefOpen);
  const setUI = useStore((s) => s.setUI);
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return <div className="mt-6 h-[72px]" />;

  if (!brief) {
    return (
      <button
        type="button"
        onClick={() => fetchBrief(ix)}
        className="group mt-6 flex w-full items-center gap-5 rounded-[16px] border border-rule bg-raised/60 py-4 ps-5 pe-4 text-start transition-[border-color,background-color,transform,box-shadow] duration-200 hover:border-rule-strong hover:bg-raised hover:shadow-card active:scale-[0.995]"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-serif text-[19px] leading-none tracking-[-0.01em] text-ink [font-variation-settings:'opsz'_24]">
            بۇ تېكىستنى ئىزاھلاش
            <ArrowRight size={15} strokeWidth={2} className="translate-y-px text-ink-4 transition-[transform,color] duration-300 ease-[var(--ease-out)] group-hover:translate-x-1 group-hover:text-rubric-text" aria-hidden />
          </span>
          <span className="mt-1.5 block truncate text-[13px] leading-snug text-ink-3">باشلاشتىن بۇرۇن: مەزمۇن خۇلاسىسى، ئاساسلىق قاراشلار ۋە خەرىتە</span>
        </span>
        <kbd className="hidden sm:inline">B</kbd>
      </button>
    );
  }

  if (brief.status === "loading") return <BriefLoading ix={ix} />;

  if (brief.status === "error") {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[16px] border border-rule px-4 py-3.5 text-[13.5px]">
        <p className="text-rubric-text">{brief.error}</p>
        {brief.needKey && (
          <>
            <button type="button" onClick={openKeyMenu} className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
              Together ئاچقۇچىڭىزنى قوشۇڭ
            </button>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button" className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
                  كىرىش
                </button>
              </SignInButton>
            </Show>
          </>
        )}
        <button type="button" onClick={() => fetchBrief(ix)} className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
          قايتا سىناش
        </button>
      </div>
    );
  }

  const { data, usage, modelKey } = brief;
  const caveats = data.caveats ?? [];
  return (
    <section aria-label="Gloss" className="mt-6 rounded-[16px] border border-rule bg-raised/60 px-5">
      <button
        type="button"
        onClick={() => setUI({ briefOpen: !open })}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 py-3.5 text-start"
      >
        <span className="text-[13.5px] font-medium text-ink">Gloss</span>
        <span className="text-[13px] text-ink-3">
          {data.sections.length} قىسىم {"\u00b7"} {data.claims.length} قاراش
          {caveats.length > 0 && ` \u00b7 ${caveats.length} ئەسكەرتىش`}
        </span>
        <ChevronDown size={16} className={`ms-auto text-ink-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="rise border-t border-rule pb-5 pt-4" style={{ animationDuration: "0.45s" }}>
          <div className="gloss-body !text-[16px] !leading-[1.6] text-pretty">
            <Answer text={data.gist} />
          </div>

          {data.claims.length > 0 && (
            <>
              <h3 className="mb-2.5 mt-6 text-[12.5px] font-medium text-ink-3">ئاساسلىق قاراشلار</h3>
              <ol className="space-y-2.5">
                {data.claims.map((c, i) => (
                  <li key={i} className="rise grid grid-cols-[1.4rem_minmax(0,1fr)] text-[14.5px] leading-[1.5] text-ink" style={{ animationDuration: "0.5s", animationDelay: `${120 + i * 60}ms` }}>
                    <span className="font-serif text-[14px] leading-[1.55] tabular-nums text-ink-4">{i + 1}</span>
                    <span className="gloss-body !text-[14.5px]">
                      <Answer text={c.cite ? `${c.text} [¶${c.cite}]` : c.text} />
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {caveats.length > 0 && (
            <>
              <h3 className="mb-2.5 mt-6 text-[12.5px] font-medium text-ink-3">ئېسىڭىزدە بولسۇن</h3>
              <ul className="space-y-2.5">
                {caveats.map((c, i) => (
                  <li key={i} className="rise grid grid-cols-[1.4rem_minmax(0,1fr)] text-[14.5px] leading-[1.5] text-ink-2" style={{ animationDuration: "0.5s", animationDelay: `${200 + i * 60}ms` }}>
                    <span aria-hidden className="mt-[0.6em] size-[5px] rounded-full bg-rubric/70" />
                    <span className="gloss-body !text-[14.5px]">
                      <Answer text={c.cite ? `${c.text} [¶${c.cite}]` : c.text} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.sections.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-[12.5px] font-medium text-ink-3">خەرىتە</h3>
              <ol className="grid gap-x-6 sm:grid-cols-2">
                {data.sections.map((s, i) => {
                  const next = data.sections[i + 1]?.start;
                  const end = next ? next - 1 : ix.byNumber.size;
                  return (
                    <li key={i} className="rise" style={{ animationDuration: "0.45s", animationDelay: `${260 + i * 40}ms` }}>
                      <button
                        type="button"
                        onClick={() => jumpTo(s.start)}
                        className="group flex w-full items-baseline gap-3 border-b border-rule py-2 text-start text-[14px] text-ink transition-colors hover:text-rubric-text"
                      >
                        <span className="w-4 shrink-0 font-serif text-[14px] tabular-nums text-ink-4">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-ink-4 group-hover:text-rubric-text">
                          ¶{s.start}
                          {end > s.start ? `-${end}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          <div className="mt-5 flex items-center gap-3 text-[11.5px] tabular-nums text-ink-4">
            <span>
              {modelKey ? MODELS[modelOf(modelKey)].label : ""}
              {usage ? ` / ${usage.promptTokens.toLocaleString()} in, ${usage.completionTokens} out / ${fmtCost(usage.costUsd)}` : ""}
            </span>
            <button type="button" onClick={() => fetchBrief(ix)} className="ms-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-sunk hover:text-ink">
              <RotateCcw size={11} /> قايتا قىلىش
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The text in miniature: a few lines, each as long as a stretch of its
 * paragraphs, so every text has its own shape. While the brief is written,
 * the pen runs down them.
 */
function TextShape({ ix, scanning = false, className = "" }: { ix: DocIndex; scanning?: boolean; className?: string }) {
  const lines = useMemo(() => {
    const lens = [...ix.byNumber.values()].map((id) => (ix.texts.get(id) ?? "").split(/\s+/).length);
    const n = Math.min(6, lens.length);
    if (!n) return [];
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i * lens.length) / n);
      const b = Math.max(a + 1, Math.floor(((i + 1) * lens.length) / n));
      let sum = 0;
      for (let j = a; j < b; j++) sum += lens[j];
      out.push(sum / (b - a));
    }
    const max = Math.max(...out, 1);
    return out.map((v) => 0.38 + 0.62 * Math.sqrt(v / max));
  }, [ix]);
  return (
    <span aria-hidden className={`text-shape ${scanning ? "is-scan" : ""} ${className}`}>
      {lines.map((w, i) => (
        <span key={i} style={{ width: `${Math.round(w * 100)}%`, ["--i" as string]: i }} />
      ))}
    </span>
  );
}

/** The brief takes a few seconds: say what is happening, and sketch the shape that is coming. */
function BriefLoading({ ix }: { ix: DocIndex }) {
  const steps = [`بارلىق ${ix.words.toLocaleString()} سۆزنى ئوقۇۋاتىدۇ`, "ئاساسلىق قاراشلارنى ئۆلچەۋاتىدۇ", "دەلىللەر بىلەن سېلىشتۇرۇۋاتىدۇ", "بۆلەكلەرنىڭ خەرىتىسىنى سىزىۋاتىدۇ"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((i) => Math.min(i + 1, steps.length - 1)), 2600);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <section aria-busy aria-live="polite" className="mt-6 rounded-[16px] border border-rule bg-raised/60 px-5 py-5">
      <div className="mb-5 flex items-center gap-3">
        <p key={step} className="text-[12.5px] font-medium text-rubric-text" style={{ animation: "rise 0.4s var(--ease-out) both" }}>
          {steps[step]}
        </p>
        <TextShape ix={ix} scanning className="ms-auto" />
      </div>
      <div className="space-y-2.5" aria-hidden>
        <div className="shimmer h-3.5 w-[94%]" />
        <div className="shimmer h-3.5 w-[86%]" />
        <div className="shimmer h-3.5 w-[52%]" />
      </div>
      <div className="mt-6 space-y-2.5" aria-hidden>
        {[78, 64, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="shimmer h-3 w-3 rounded-full" style={{ animationDelay: `${i * 0.1}s` }} />
            <div className="shimmer h-3" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
          </div>
        ))}
      </div>
    </section>
  );
}
