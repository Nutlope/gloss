"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import { Check, Copy, Download, Trash2, X } from "lucide-react";
import { GlossMark } from "@/components/brand/Gloss";
import { cmp } from "@/lib/anchor";
import { undash } from "@/lib/article";
import { stopGloss } from "@/lib/ask";
import { useGlosses, useHighlights, useStore, type Gloss, type Highlight, type Turn } from "@/lib/store";
import { ACTIONS } from "@/lib/actions";
import { notesMarkdown, pairsOf } from "@/lib/export";
import { Answer, Sources } from "./Answer";
import { Writing } from "./Writing";
import { useReader } from "./context";

type Entry = { kind: "gloss"; g: Gloss; key: string } | { kind: "hl"; h: Highlight; key: string };

/** Below this width the notebook covers the margin, so it steps aside when you jump to a passage. */
const covers = () => window.innerWidth < 1900;
type Filter = "all" | "q" | "hl";

/** Everything you marked and asked, in reading order, as questions and answers you can scan. */
export function Notebook() {
  const { ix } = useReader();
  const open = useStore((s) => s.notebookOpen);
  const setUI = useStore((s) => s.setUI);
  const glosses = useGlosses(ix.article.id);
  const highlights = useHighlights(ix.article.id);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [scrolled, setScrolled] = useState(false);

  const entries = useMemo(() => {
    const pos = (e: Entry) => {
      if (e.kind === "hl") return e.h.anchor.start;
      return e.g.anchor?.start ?? { b: e.g.at ?? ix.article.blocks[0].id, o: 0 };
    };
    const all: Entry[] = [...glosses.map((g) => ({ kind: "gloss" as const, g, key: g.id })), ...highlights.map((h) => ({ kind: "hl" as const, h, key: h.id }))];
    return all.sort((a, b) => cmp(pos(a), pos(b), ix.order));
  }, [glosses, highlights, ix]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input")) setUI({ notebookOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUI]);

  if (!open) return null;

  const both = glosses.length > 0 && highlights.length > 0;
  const shown = entries.filter((e) => !both || filter === "all" || (filter === "q" ? e.kind === "gloss" : e.kind === "hl"));
  const markdown = () =>
    notesMarkdown({ title: ix.article.title, author: ix.article.author, published: ix.article.published, url: ix.article.sourceUrl }, glosses, highlights, ix);
  const summary = [
    glosses.length ? `${glosses.length} question${glosses.length === 1 ? "" : "s"}` : "",
    highlights.length ? `${highlights.length} بەلگە` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <aside
      aria-label="خاتىرە دەپتىرى"
      className="fixed bottom-2.5 left-2.5 right-2.5 top-[calc(var(--topbar-h)+6px)] z-[45] flex flex-col overflow-hidden rounded-[18px] border border-rule bg-raised shadow-pop sm:left-auto sm:w-[420px]"
      style={{ animation: "sheet-in 0.38s var(--ease-out)" }}
    >
      <header className={`shrink-0 border-b px-5 pb-3.5 pt-4 transition-colors duration-200 ${scrolled ? "border-rule" : "border-transparent"}`}>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[23px] font-[420] leading-none tracking-[-0.015em] text-ink [font-variation-settings:'opsz'_36]">خاتىرە دەپتىرى</h2>
            <p className="mt-1.5 text-[12.5px] leading-none text-ink-3">{summary || "ھازىرچە بوش"}</p>
          </div>
          <HeadBtn
            label={copied ? "كۆچۈرۈلدى" : "Markdown قىلىپ كۆچۈرۈش"}
            disabled={!entries.length}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(markdown());
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              } catch {}
            }}
          >
            {copied ? <Check size={16} className="text-good" /> : <Copy size={16} />}
          </HeadBtn>
          <HeadBtn
            label="Markdown چۈشۈرۈش"
            disabled={!entries.length}
            onClick={() => {
              const blob = new Blob([markdown()], { type: "text/markdown" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${ix.article.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "notes"}-notes.md`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download size={16} />
          </HeadBtn>
          <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
          <HeadBtn label="خاتىرە دەپتىرىنى تاقاش" onClick={() => setUI({ notebookOpen: false })}>
            <X size={17} />
          </HeadBtn>
        </div>

        {both && (
          <div role="tablist" aria-label="كۆرسىتىش" className="mt-4 grid grid-cols-3 rounded-[10px] bg-sunk p-[3px]">
            {(
              [
                ["all", "ھەممىسى", entries.length],
                ["q", "سوئاللار", glosses.length],
                ["hl", "بەلگىلەر", highlights.length],
              ] as const
            ).map(([k, label, count]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={`flex h-7 items-center justify-center gap-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors ${
                  filter === k ? "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-ink-3 hover:text-ink"
                }`}
              >
                {label}
                <span className="tabular-nums text-ink-4">{count}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {!entries.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
          <GlossMark className="size-11 text-ink-4" />
          <p className="mt-5 font-serif text-[20px] leading-tight text-ink">بۇ يەردە تېخى ھېچنېمە يوق</p>
          <p className="mt-2 max-w-[270px] text-[13.5px] leading-relaxed text-ink-3">
            بىر قۇرنى تاللاپ سوئال يېزىڭ ياكى بەلگىلەڭ. ھەربىر سوئال-جاۋاب ئوقۇش تەرتىپى بويىچە بۇ يەرگە كېلىدۇ.
          </p>
        </div>
      ) : (
        <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)} className="scroll-thin flex-1 overflow-y-auto px-3.5 pb-4 pt-0.5">
          <ol className="space-y-2.5">
            {shown.map((e, i) => (
              <li key={e.key} className="rise" style={{ animationDuration: "0.45s", animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                {e.kind === "hl" ? <HighlightEntry h={e.h} /> : <GlossEntry g={e.g} />}
              </li>
            ))}
          </ol>
          <Show when="signed-out">
            <p className="px-1 pb-1 pt-4 text-center text-[12.5px] leading-relaxed text-ink-3">
              بۇلار پەقەت بۇ توركۆرگۈدە ساقلىنىدۇ.{" "}
              <SignInButton mode="modal">
                <button type="button" className="font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
                  كىرىش
                </button>
              </SignInButton>{" "}
              ، ھەممە ئۈسكۈنىدە ساقلاش ئۈچۈن.
            </p>
          </Show>
        </div>
      )}
    </aside>
  );
}

function HeadBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} مىنۇت ئىلگىرى`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Meta({ n, label, at }: { n?: number; label?: string; at: number }) {
  return (
    <span className="flex items-center gap-2 text-[11.5px] leading-none text-ink-3">
      {n !== undefined && <span className="cite pointer-events-none !m-0 !text-[11px]">¶{n}</span>}
      {label && <span className="font-medium text-ink-2">{label}</span>}
      <span className="text-ink-4">{ago(at)}</span>
    </span>
  );
}

function GlossEntry({ g }: { g: Gloss }) {
  const { ix, jumpToBlock } = useReader();
  const setUI = useStore((s) => s.setUI);
  const removeGloss = useStore((s) => s.removeGloss);
  const blockId = g.anchor?.start.b ?? g.at;
  const n = blockId ? ix.numbers.get(blockId) : undefined;
  const label = !g.anchor ? "پۈتۈن تېكىست" : g.action === "ask" ? undefined : ACTIONS[g.action].label;
  const go = () => {
    setUI({ activeGloss: g.id, ...(covers() ? { notebookOpen: false } : {}) });
    if (blockId) jumpToBlock(blockId);
  };

  return (
    <article className="group relative rounded-[14px] border border-rule bg-bg px-4 pb-4 pt-3.5 transition-colors hover:border-rule-strong">
      <button type="button" onClick={go} className="block w-full pe-7 text-start">
        <Meta n={n} label={label} at={g.createdAt} />
        {g.anchor && (
          <span className="mt-2.5 line-clamp-2 border-l-2 border-[var(--rubric-line)] ps-3 font-serif text-[15px] leading-[1.45] text-ink-3 transition-colors group-hover:text-ink-2">
            {g.anchor.quote}
          </span>
        )}
      </button>

      <div className="mt-3.5 space-y-4">
        {pairsOf(g).map((p, i) => (
          <div key={i} className={i > 0 ? "border-t border-rule pt-3.5" : ""}>
            <div className="grid grid-cols-[16px_minmax(0,1fr)] items-baseline gap-x-2">
              <span aria-hidden className="text-[11.5px] font-semibold leading-none text-rubric-text">Q</span>
              <p className="font-serif text-[16.5px] leading-[1.35] text-ink [font-variation-settings:'opsz'_24]">{p.q}</p>
            </div>
            <div className="mt-2 grid grid-cols-[16px_minmax(0,1fr)] items-baseline gap-x-2">
              <span aria-hidden className="text-[11.5px] font-semibold leading-none text-ink-4">A</span>
              <div className="min-w-0">
                <AnswerBody t={p.a} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="بۇ سوئالنى ئۆچۈرۈش"
        data-tip="ئۆچۈرۈش"
        onClick={() => {
          stopGloss(g.id);
          removeGloss(g.articleId, g.id);
        }}
        className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full text-ink-4 opacity-0 transition-opacity hover:bg-sunk hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </article>
  );
}

function AnswerBody({ t }: { t?: Turn }) {
  if (!t || (t.streaming && !t.content)) {
    return <Writing />;
  }
  if (t.error && !t.content) return <p className="text-[13.5px] text-rubric-text">{t.error}</p>;
  return (
    <Clamp watch={t.content}>
      <Answer text={t.content} streaming={t.streaming} sources={t.sources} />
      {!t.streaming && t.sources?.length ? <Sources sources={t.sources} /> : null}
    </Clamp>
  );
}

/** Long answers fold to five lines; one click opens the rest. */
function Clamp({ watch, children }: { watch: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOver(el.scrollHeight > el.clientHeight + 2);
  }, [watch, open]);
  return (
    <>
      <div ref={ref} className={`gloss-body !text-[14px] !leading-[1.55] text-ink-2 ${open ? "" : "nb-clamp"} ${!open && over ? "is-over" : ""}`}>
        {children}
      </div>
      {(over || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
          {open ? "ئازراق كۆرسىتىش" : "پۈتۈن جاۋابنى ئوقۇش"}
        </button>
      )}
    </>
  );
}

function HighlightEntry({ h }: { h: Highlight }) {
  const { ix, jumpToBlock } = useReader();
  const removeHighlight = useStore((s) => s.removeHighlight);
  const setUI = useStore((s) => s.setUI);
  return (
    <article className="group relative rounded-[14px] border border-rule bg-bg px-4 pb-3.5 pt-3.5 transition-colors hover:border-rule-strong">
      <button
        type="button"
        onClick={() => {
          if (covers()) setUI({ notebookOpen: false });
          jumpToBlock(h.anchor.start.b);
        }}
        className="block w-full pe-7 text-start"
      >
        <Meta n={ix.numbers.get(h.anchor.start.b)} label={h.note ? "خاتىرە" : "بەلگىلەش"} at={h.createdAt} />
        <span className="mt-2.5 block font-serif text-[15.5px] leading-[1.5] text-ink">
          <mark className="m-hl text-inherit" data-c={h.color && h.color !== "yellow" ? h.color : undefined}>
            {h.anchor.quote}
          </mark>
        </span>
        {h.note && <span className="mt-2.5 block whitespace-pre-line text-[14px] leading-[1.55] text-ink-2">{h.note}</span>}
      </button>
      <button
        type="button"
        aria-label="بەلگىنى ئۆچۈرۈش"
        data-tip="چىقىرىۋېتىش"
        onClick={() => removeHighlight(ix.article.id, h.id)}
        className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full text-ink-4 opacity-0 transition-opacity hover:bg-sunk hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </article>
  );
}
