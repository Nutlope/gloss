"use client";

import { Fragment, memo, type ReactNode } from "react";
import { undash } from "@/lib/article";
import type { Source } from "@/lib/models";
import { useReader } from "./context";

/**
 * A deliberately small Markdown subset for glosses: paragraphs, lists, bold,
 * italic, code, paragraph citations ([¶12], [¶3-5], ¶7) as live chips, web
 * citations ([1], [2, 3]) as links when the answer came with sources, and
 * the ==key answer==, which the model marks once so a skimmer can stop there.
 * Small enough to re-parse on every streamed token without a dependency.
 */

/** The answer without its key-answer marks, for copying and exporting. */
export const unmark = (s: string) => s.replace(/==/g, "");

/**
 * One line that stands for the whole answer: the marked key answer, or else
 * the first sentence. Citations and Markdown are dropped.
 */
export function keyLine(s: string): string {
  const marked = s.match(/==([^=]+?)==/)?.[1];
  const src = marked ?? s.replace(/^\s*([-*•]|\d+[.)])\s+/gm, "").split(/\n+/).find((l) => l.trim()) ?? "";
  // A citation that is part of the sentence ("[¶1] and [¶4] agree") stays as plain ¶1; trailing ones go.
  const clean = undash(src)
    .replace(/==/g, "")
    .replace(/(^|\b(?:and|or|to|in|with)\s|,\s)\[\s*¶\s?([\d\s-]+)\]/g, "$1¶$2")
    .replace(/\s?\[\s*¶[^\]]{0,60}\]/g, "")
    .replace(/\s?\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (marked) return clean;
  // Whole sentences until there is enough to stand on ("No." alone says little).
  let out = "";
  for (const sentence of clean.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []) {
    out += sentence;
    if (out.trim().length >= 40) break;
  }
  return out.trim();
}

type Part = { kind: "p" | "ul" | "ol"; lines: string[] };

function parseBlocks(text: string): Part[] {
  const parts: Part[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    const isUl = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isUl || isOl) {
      parts.push({ kind: isUl ? "ul" : "ol", lines: lines.map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) });
      continue;
    }
    // Mixed chunk: a lead line followed by list items.
    const firstItem = lines.findIndex((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (firstItem > 0 && lines.slice(firstItem).every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      parts.push({ kind: "p", lines: [lines.slice(0, firstItem).join(" ")] });
      parts.push({ kind: "ul", lines: lines.slice(firstItem).map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) });
      continue;
    }
    parts.push({ kind: "p", lines: [lines.join(" ")] });
  }
  return parts;
}

const TOKEN = /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)|(\[\s*¶[^\]]{0,60}\])|(¶\s?\d+(?:\s?-\s?\d+)?)|(\[\d{1,2}(?:\s*,\s*\d{1,2})*\])/g;

/** A web citation: a small numbered link to the source, its title on hover. */
function WebCite({ s }: { s: Source }) {
  return (
    <a className="cite cite-web" href={s.url} target="_blank" rel="noopener noreferrer" data-tip={s.title} data-tip-hint={s.site} onClick={(e) => e.stopPropagation()}>
      {s.n}
    </a>
  );
}

function Cite({ n, label }: { n: number; label: string }) {
  const { jumpTo, peek, ix } = useReader();
  const exists = ix.byNumber.has(n);
  return (
    <button
      type="button"
      className="cite"
      disabled={!exists}
      onClick={(e) => {
        e.stopPropagation();
        peek(null);
        jumpTo(n);
      }}
      onMouseEnter={(e) => exists && peek(n, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => peek(null)}
      onFocus={(e) => exists && peek(n, e.currentTarget.getBoundingClientRect())}
      onBlur={() => peek(null)}
      aria-label={`${n}-ئابزاسقا ئاتلاش`}
    >
      ¶{label}
    </button>
  );
}

function citesFrom(raw: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\d+)(?:\s*-\s*¶?\s*(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const a = Number(m[1]);
    const label = m[2] ? `${m[1]}-${m[2]}` : m[1];
    out.push(<Cite key={`${m.index}`} n={a} label={label} />);
  }
  return out;
}

/** Splits out the ==key answer==; an unclosed mark runs to the end while it streams in. */
function inline(text: string, plain = false, sources?: Source[]): ReactNode[] {
  if (!text.includes("==")) return tokens(text, plain, sources);
  const out: ReactNode[] = [];
  const re = /==([^=]*?)(?:==|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`t${last}`}>{tokens(text.slice(last, m.index), plain, sources)}</Fragment>);
    if (m[1].trim())
      out.push(
        <mark key={`k${m.index}`} className="key">
          {tokens(m[1], plain, sources)}
        </mark>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{tokens(text.slice(last), plain, sources)}</Fragment>);
  return out;
}

function tokens(text: string, plain = false, sources?: Source[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = String(m.index);
    if (m[1]) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (m[2]) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (m[3]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[6]) {
      // Only numbers that match a result become links; anything else stays as written.
      const found = (tok.match(/\d+/g) ?? []).map((d) => sources?.find((x) => x.n === Number(d)));
      if (found.length && found.every(Boolean)) out.push(<Fragment key={k}>{found.map((x) => <WebCite key={x!.n} s={x!} />)}</Fragment>);
      else out.push(tok);
    } else if (!plain) out.push(<Fragment key={k}>{citesFrom(tok)}</Fragment>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `plain` drops paragraph citations, for answers that live outside a reader. */
function AnswerImpl({ text, streaming, plain = false, sources }: { text: string; streaming?: boolean; plain?: boolean; sources?: Source[] }) {
  const parts = parseBlocks(undash(plain ? text.replace(/\s?\[\s*¶[^\]]{0,60}\]/g, "") : text));
  const caret = streaming ? <span className="caret" aria-hidden /> : null;
  if (!parts.length) return streaming ? <p>{caret}</p> : null;
  return (
    <>
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        if (p.kind === "p")
          return (
            <p key={i}>
              {inline(p.lines[0], plain, sources)}
              {isLast && caret}
            </p>
          );
        const L = p.kind === "ul" ? "ul" : "ol";
        return (
          <L key={i}>
            {p.lines.map((l, j) => (
              <li key={j}>
                {inline(l, plain, sources)}
                {isLast && j === p.lines.length - 1 && caret}
              </li>
            ))}
          </L>
        );
      })}
    </>
  );
}

export const Answer = memo(AnswerImpl);

/** The web results under an answer that used them, numbered as the answer cites them. */
export function Sources({ sources }: { sources: Source[] }) {
  return (
    <ol className="sources mt-3 space-y-1 border-t border-rule pt-2.5" aria-label="تور مەنبەلىرى">
      {sources.map((s) => (
        <li key={s.n}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group flex items-baseline gap-2 text-[12.5px] leading-snug text-ink-3 transition-colors hover:text-ink"
          >
            <span className="w-3 shrink-0 text-end tabular-nums text-ink-4">{s.n}</span>
            <span className="min-w-0 truncate">{s.title}</span>
            {s.title !== s.site && <span className="shrink-0 text-ink-4">{s.site}</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}
