"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { forwardRef, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, Check, ChevronsDownUp, Copy, CornerDownRight, RotateCcw, Square, Trash2 } from "lucide-react";
import { ACTIONS } from "@/lib/actions";
import { followUp, openKeyMenu, retry, stopGloss } from "@/lib/ask";
import { MODELS } from "@/lib/models";
import { useStore, type Gloss, type Turn } from "@/lib/store";
import { undash } from "@/lib/article";
import { Answer, keyLine, Sources, unmark } from "./Answer";
import { Writing } from "./Writing";
import { fmtCost, fmtTokens, useReader } from "./context";

type Props = {
  gloss: Gloss;
  active: boolean;
  hover: boolean;
  entering: boolean;
  /** In a crowded stretch of margin, a closed note is just its question. */
  mini?: boolean;
  /** "margin" cards are absolutely placed; "sheet" and "list" flow normally. */
  variant: "margin" | "sheet" | "list";
  /** Where a margin card stands; unknown until the margin is laid out, and hidden till then. */
  top?: number;
  /** A margin card's first placement: it appears in its place instead of gliding there from the top. */
  fresh?: boolean;
  onActivate: () => void;
};

function Receipt({ t }: { t: Turn }) {
  if (!t.usage) return <span>{t.model}</span>;
  const u = t.usage;
  return (
    <span data-tip={`${u.promptTokens.toLocaleString()} prompt tokens, ${u.cachedTokens.toLocaleString()} cached, ${u.completionTokens} written`}>
      {t.model}
      <span className="mx-1.5 text-ink-4/70">/</span>
      {fmtTokens(u.promptTokens)} in{u.cachedTokens > 0 ? ` (${Math.round((u.cachedTokens / Math.max(1, u.promptTokens)) * 100)}% cached)` : ""}, {u.completionTokens} out
      <span className="mx-1.5 text-ink-4/70">/</span>
      {fmtCost(u.costUsd)}
    </span>
  );
}


/** Free answers are spent: the way to keep going is the reader's own key, or, signed out, signing in for more. */
function KeyButton() {
  return (
    <span className="mt-2.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openKeyMenu}
        className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-bg transition-transform active:scale-[0.97]"
      >
        Together ئاچقۇچىڭىزنى قوشۇڭ
      </button>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className="inline-flex h-8 items-center rounded-full border border-rule px-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-rule-strong hover:text-ink">
            كىرىش
          </button>
        </SignInButton>
      </Show>
    </span>
  );
}

/**
 * A card in the margin column: moved to its place along the column, gliding
 * when the layout changes, but put straight in its place the first time.
 */
export function marginStyle(top: number | undefined, fresh: boolean): CSSProperties {
  return {
    transform: `translateY(${Math.round(top ?? 0)}px)`,
    ...(top === undefined ? { visibility: "hidden" } : null),
    ...(fresh ? { transition: "none" } : null),
  };
}

function TurnBody({ t }: { t: Turn }) {
  if (t.error && !t.content)
    return (
      <>
        <p className="text-[13.5px] text-rubric-text">{t.error}</p>
        {t.needKey && <KeyButton />}
      </>
    );
  if (t.streaming && !t.content)
    return (
      <>
        {t.searching && <p className="mb-2 text-[12.5px] text-ink-3">توردىن ئىزدەۋاتىدۇ</p>}
        <Writing />
      </>
    );
  return (
    <>
      <Answer text={t.content} streaming={t.streaming} sources={t.sources} />
      {t.error && <p className="mt-2 text-[12.5px] text-rubric-text">{t.error}</p>}
      {!t.streaming && t.sources?.length ? <Sources sources={t.sources} /> : null}
    </>
  );
}

export const GlossCard = forwardRef<HTMLElement, Props>(function GlossCard({ gloss, active, hover, entering, mini = false, variant, top, fresh = false, onActivate }, ref) {
  const { ix, jumpToBlock } = useReader();
  const removeGloss = useStore((s) => s.removeGloss);
  const setUI = useStore((s) => s.setUI);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const first = gloss.turns[0];
  const last = gloss.turns[gloss.turns.length - 1];
  const busy = gloss.turns.some((t) => t.streaming);
  const collapsed = variant === "margin" && !active;
  const blockId = gloss.anchor?.start.b ?? gloss.at;
  const n = blockId ? ix.numbers.get(blockId) : undefined;
  const nEnd = gloss.anchor ? ix.numbers.get(gloss.anchor.end.b) : undefined;
  const label = gloss.anchor ? ACTIONS[gloss.action].label : "پۈتۈن تېكىست";

  useEffect(() => {
    if (entering) {
      const t = setTimeout(() => setUI({ enteringGloss: null }), 600);
      return () => clearTimeout(t);
    }
  }, [entering, setUI]);

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    followUp(ix, gloss.id, q);
    setDraft("");
  };

  const copy = async () => {
    const text = gloss.turns
      .filter((t) => t.content)
      .map((t) => (t.role === "user" ? `Q: ${t.content}` : undash(unmark(t.content))))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(gloss.anchor ? `“${gloss.anchor.quote}”\n\n${text}` : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const style = variant === "margin" ? marginStyle(top, fresh) : undefined;
  const follow = Math.floor((gloss.turns.length - 1) / 2);
  const where = n !== undefined ? `\u00b6${n}${nEnd && nEnd !== n ? `-${nEnd}` : ""}` : null;

  // Closed: the question, and under it the one line that answers it.
  if (collapsed) {
    return (
      <article
        ref={ref}
        data-gloss={gloss.id}
        aria-label={`${gloss.question ?? label}${n ? `، ${n}-ئابزاس` : ""}. خاتىرىنى ئېچىش.`}
        role="button"
        tabIndex={0}
        className={["gloss is-collapsed", mini ? "is-mini" : "", hover ? "is-hover" : "", entering ? "is-entering" : ""].join(" ")}
        style={style}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
        onMouseEnter={() => setUI({ hoverGloss: gloss.id })}
        onMouseLeave={() => setUI({ hoverGloss: null })}
      >
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-[1.4] text-ink">
            {gloss.question ?? (
              <>
                <span className="text-rubric-text">{label}</span>
                {gloss.anchor && <span className="font-normal text-ink-2">{` \u201c${gloss.anchor.quote}\u201d`}</span>}
              </>
            )}
          </p>
          {follow > 0 && (
            <span className="shrink-0 text-[11px] tabular-nums text-ink-4" data-tip={`${follow} follow-up${follow > 1 ? "s" : ""}`}>
              +{follow}
            </span>
          )}
          {where && <span className="shrink-0 text-[11px] tabular-nums text-ink-4">{where}</span>}
        </div>
        {!mini && <Gist t={first} />}
      </article>
    );
  }

  return (
    <article
      ref={ref}
      data-gloss={gloss.id}
      aria-label={`${label} خاتىرىسى${n ? `، ${n}-ئابزاس` : ""}`}
      className={[
        variant === "margin" ? "gloss" : "gloss !relative !transform-none",
        active ? "is-active" : "",
        hover ? "is-hover" : "",
        entering ? "is-entering" : "",
      ].join(" ")}
      style={style}
      onMouseEnter={() => setUI({ hoverGloss: gloss.id })}
      onMouseLeave={() => setUI({ hoverGloss: null })}
    >
      <header className="mb-2 flex h-5 items-center gap-2 text-[12px] leading-none">
        <span className="font-semibold text-rubric-text">{label}</span>
        {where && (
          <button
            type="button"
            className="cite !text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              if (blockId) jumpToBlock(blockId);
            }}
            aria-label={`${n}-ئابزاسقا بېرىش`}
            data-tip="تېكىستتە كۆرسىتىش"
          >
            {where}
          </button>
        )}
        {follow > 0 && <span className="text-ink-4">{`${follow} follow-up${follow > 1 ? "s" : ""}`}</span>}
        {variant === "margin" && (
          <button
            type="button"
            aria-label="خاتىرىنى يىغىش"
            data-tip="يىغىش"
            data-tip-kbd="Esc"
            onClick={(e) => {
              e.stopPropagation();
              setUI({ activeGloss: null });
            }}
            className="-me-1.5 ms-auto grid size-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink"
          >
            <ChevronsDownUp size={14} />
          </button>
        )}
      </header>

      {gloss.anchor && gloss.action !== "ask" && (
        <p className="mb-2.5 line-clamp-2 border-l-2 border-[var(--rubric-line)] ps-2.5 font-serif text-[15px] leading-snug text-ink-3">{gloss.anchor.quote}</p>
      )}
      {gloss.question && <p className="mb-1.5 text-[14px] font-medium leading-snug text-ink">{gloss.question}</p>}

      <div className="gloss-body">
        <TurnBody t={first} />
      </div>

      {gloss.turns.slice(1).map((t, i) =>
        t.role === "user" ? (
          <p key={i} className="mt-3.5 flex gap-1.5 border-t border-rule pt-3 text-[13.5px] font-medium leading-snug text-ink">
            <CornerDownRight size={14} className="mt-[2px] shrink-0 text-ink-4" aria-hidden />
            {t.content}
          </p>
        ) : (
          <div key={i} className="gloss-body mt-1.5">
            <TurnBody t={t} />
          </div>
        )
      )}

      {active && variant !== "list" && (
        <>
          <footer className="mt-3 flex items-center gap-0.5 text-ink-3">
            <span className="min-w-0 flex-1 truncate text-[11.5px] tabular-nums text-ink-4">
              <Receipt t={last.role === "assistant" ? last : first} />
            </span>
            {busy ? (
              <IconBtn label="توختىتىش" onClick={() => stopGloss(gloss.id)}>
                <Square size={12} fill="currentColor" />
              </IconBtn>
            ) : (
              <>
                <IconBtn label="قايتا سىناش" onClick={() => retry(ix, gloss.id)}>
                  <RotateCcw size={14} />
                </IconBtn>
                <IconBtn label={copied ? "كۆچۈرۈلدى" : "كۆچۈرۈش"} onClick={copy}>
                  {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
                </IconBtn>
                <IconBtn
                  label="ئۆچۈرۈش"
                  onClick={() => {
                    stopGloss(gloss.id);
                    removeGloss(gloss.articleId, gloss.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconBtn>
              </>
            )}
          </footer>
          <form
            className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-rule bg-bg px-2.5 transition-colors focus-within:border-rule-strong"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  inputRef.current?.blur();
                }
              }}
              placeholder="داۋاملىق سوراش"
              aria-label="داۋاملىق سوراش"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-4"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="داۋاملىق سوئال ئەۋەتىش"
              data-tip="ئەۋەتىش"
              data-tip-kbd={"\u21b5"}
              className="grid size-6 place-items-center rounded-md bg-ink text-bg transition-opacity disabled:opacity-20"
            >
              <ArrowUp size={14} strokeWidth={2.4} />
            </button>
          </form>
        </>
      )}
    </article>
  );
});

/** The closed note's second line: the key answer, or the pen still writing. */
function Gist({ t }: { t: Turn }) {
  if (t.error && !t.content) return <p className="mt-1 line-clamp-1 text-[13px] leading-[1.45] text-rubric-text">{t.error}</p>;
  if (t.streaming && !t.content) return <span className="writing-line mt-2 block" aria-label="يېزىۋاتىدۇ" role="status" />;
  const line = keyLine(t.content);
  return line ? <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-ink-3">{line}</p> : null;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
    >
      {children}
    </button>
  );
}
