"use client";

import { SignInButton } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, BookmarkPlus, Check, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import { importFromUrl, keep, looksLikeUrl } from "@/lib/import";
import { normalizeUrl } from "@/lib/links";
import { useStore } from "@/lib/store";
import { Mark, MarkStack, type AgentMark } from "./AgentMarks";
import { Glyph } from "./Book";

export type AddTab = "links" | "agent";

/**
 * Adding to the library: paste links (one or many), or connect an agent that
 * saves to it through the Gloss MCP server.
 */
export function AddPanel({ tab, onTab, onClose, signedIn }: { tab: AddTab; onTab: (t: AddTab) => void; onClose: () => void; signedIn: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" style={{ animation: "fade 0.2s both" }} onClick={onClose} />
      <section role="dialog" aria-modal aria-label="كۈتۈپخانىغا قوشۇش" className="add-panel">
        <header className="flex items-center justify-between gap-3">
          <div className="lib-sort !ml-0" role="tablist" aria-label="قوشۇش">
            <button type="button" role="tab" aria-selected={tab === "agent"} aria-checked={tab === "agent"} onClick={() => onTab("agent")}>
              ۋاكالەتچى ئۇلاش
            </button>
            <button type="button" role="tab" aria-selected={tab === "links"} aria-checked={tab === "links"} onClick={() => onTab("links")}>
              ئۇلانمىلارنى قولدا ساقلاش
            </button>
          </div>
          <button type="button" aria-label="تاقاش" data-tip="تاقاش" data-tip-kbd="Esc" onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <X size={17} />
          </button>
        </header>
        {tab === "links" ? <Links /> : <Agent signedIn={signedIn} />}
      </section>
    </div>,
    document.body
  );
}

/**
 * What opens the panel: plain about adding articles, with the agents that can
 * do it for you. On hover the marks fan out to the right from Grok, which
 * holds its place, and the plus turns.
 */
export function AddButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`lib-add${compact ? " is-compact" : ""}`}>
      <MarkStack size={compact ? 22 : 26} />
      <span className="min-w-0 text-start">
        <span className="lib-add-title">ماقالە قوشۇش</span>
        {!compact && <span className="lib-add-sub">ۋاكالەتچى ئۇلاڭ ياكى ئۇلانما چاپلاڭ</span>}
      </span>
      {!compact && (
        <span className="lib-add-plus" aria-hidden>
          <Plus size={15} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/* ---------- links ---------- */

type Row = { url: string; state: "waiting" | "reading" | "saved" | "already" | "failed"; title?: string; error?: string };

/** How many links one Save reads in. A Pocket export can hold thousands; the rest wait in the box for the next Save. */
const BATCH = 100;

/** Every web link in an export: Pocket, Instapaper and Raindrop CSVs, Pocket's HTML, or a plain list. */
function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>,]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).;\]]+$/, "")))];
}

function Links() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const urls = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(looksLikeUrl))];

  const fromExport = async (f: File) => {
    const found = linksIn(await f.text().catch(() => ""));
    if (!found.length) return setNote(`${f.name} دا ئۇلانما تېپىلمىدى.`);
    setText((cur) => [cur.trim(), ...found].filter(Boolean).join("\n"));
    setNote(`Found ${found.length} link${found.length === 1 ? "" : "s"} in ${f.name}.`);
  };

  const save = async () => {
    if (!urls.length || busy) return;
    setBusy(true);
    const have = new Set(useStore.getState().library.flatMap((x) => (x.sourceUrl ? [normalizeUrl(x.sourceUrl)] : [])));
    const all: Row[] = urls.map((url) => ({ url, state: have.has(normalizeUrl(url)) ? "already" : "waiting" }));
    const fresh = all.filter((r) => r.state === "waiting");
    const known = all.length - fresh.length;
    const rest = fresh.slice(BATCH).map((r) => r.url);
    // A long export lists only what is being read now; a short paste shows every link, saved before or not.
    const list = all.length > BATCH ? fresh.slice(0, BATCH) : all;
    setRows(list);
    setText(rest.join("\n"));
    setNote(
      all.length > BATCH
        ? [rest.length ? `ھازىر ${BATCH} نى ساقلاۋاتىدۇ؛ يەنە ${rest.length} سى كېيىنكى ساقلاشنى كۈتۈۋاتىدۇ.` : `${fresh.length} نى ساقلاۋاتىدۇ.`, known ? `${known} ئاللىبۇرۇن كۈتۈپخانىڭىزدا.` : ""].filter(Boolean).join(" ")
        : null
    );
    const set = (i: number, r: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...r } : x)));
    const todo = list.map((r, i) => ({ r, i })).filter((x) => x.r.state === "waiting");
    const next = async () => {
      for (let x = todo.shift(); x; x = todo.shift()) {
        set(x.i, { state: "reading" });
        const r = await importFromUrl(x.r.url, (_, label) => label && set(x!.i, { title: label }));
        const err = r.ok ? await keep(r.article, r.file) : r.error;
        set(x.i, err ? { state: "failed", error: err, title: undefined } : { state: "saved", title: r.ok ? r.article.title : undefined });
      }
    };
    // A few at a time, so a slow site never holds the rest up.
    await Promise.all([next(), next(), next()]);
    setBusy(false);
  };

  return (
    <div className="mt-5">
      <p className="text-[19px] font-serif leading-tight text-ink">ئۇلانمىلارنى كۈتۈپخانىڭىزغا ساقلاڭ</p>
      <p className="mt-1 text-[13px] text-ink-3">
        بىر ياكى كۆپ، ھەر قۇرغا بىرى. Gloss ھەر بەتنى ئوقۇپ تېمىغا ئايرىيدۇ. PDF مۇ بولىدۇ. Pocket، Instapaper ياكى Raindrop دىن كېتىۋاتامسىز؟{" "}
        <button type="button" onClick={() => fileRef.current?.click()} className="text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink">
          چىقىرىلغان ھۆججىتىنى بۇ يەرگە تاشلاڭ
        </button>
        .
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.html,.htm,.txt,.json,text/csv,text/html,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void fromExport(f);
          e.target.value = "";
        }}
      />
      <textarea
        ref={ref}
        value={text}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          setOver(false);
          if (!f) return;
          e.preventDefault();
          void fromExport(f);
        }}
        style={over ? { borderColor: "var(--rubric)", borderStyle: "dashed" } : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={"https://paulgraham.com/greatwork.html\nhttps://..."}
        rows={4}
        className="add-text"
        aria-label="ساقلايدىغان ئۇلانمىلار"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink-4">{urls.length ? `${urls.length} link${urls.length === 1 ? "" : "s"}` : text.trim() ? "تېخى ئۇلانما تېپىلمىدى" : ""}</span>
        <button type="button" onClick={save} disabled={!urls.length || busy} className="add-btn">
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "ساقلاۋاتىدۇ" : urls.length > 1 ? `${Math.min(urls.length, BATCH)} نى ساقلاش` : "ساقلاش"}
        </button>
      </div>
      {note && <p className="mt-2 text-[12.5px] text-ink-3">{note}</p>}
      {rows.length > 0 && (
        <ul className="add-rows scroll-thin">
          {rows.map((r) => (
            <li key={r.url} data-state={r.state}>
              <span className="add-dot" aria-hidden>
                {r.state === "reading" ? <Loader2 size={13} className="animate-spin" /> : r.state === "saved" || r.state === "already" ? <Check size={13} /> : r.state === "failed" ? <X size={13} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{r.title ?? r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {r.state === "saved" ? "جاۋىدا" : r.state === "already" ? "ئاللىبۇرۇن كۈتۈپخانىڭىزدا" : r.state === "failed" ? r.error : r.state === "reading" ? "ئوقۇۋاتىدۇ" : "كۈتۈۋاتىدۇ"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Bookmarklets />
    </div>
  );
}

/**
 * Bookmarklets: one click on any page opens it in Gloss, in a new tab, to read now
 * or to shelve for later (`/?url=` and `/?save=` on the home page).
 */
function Bookmarklets() {
  const readRef = useRef<HTMLAnchorElement>(null);
  const saveRef = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState("https://usegloss.io");
  const code = (param: "url" | "save") => `javascript:void(window.open('${origin}/?${param}='+encodeURIComponent(location.href)))`;
  useEffect(() => setOrigin(window.location.origin), []);
  // React refuses javascript: links in JSX, so they are set by hand.
  useEffect(() => {
    readRef.current?.setAttribute("href", code("url"));
    saveRef.current?.setAttribute("href", code("save"));
  });
  const pill = "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-rule-strong bg-bg px-3 py-1.5 text-[13px] font-medium text-ink shadow-[var(--shadow-card)] active:cursor-grabbing";
  return (
    <div className="mt-6 border-t border-rule pt-5">
      <p className="lib-label">خالىغان بەتتىن</p>
      <p className="mt-1 text-[13px] text-ink-3">بىرىنى خەتكۈچ بالدىقىڭىزغا سۆرەپ، خالىغان ماقالىدە چېكىڭ.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a ref={readRef} onClick={(e) => e.preventDefault()} data-tip="مېنى خەتكۈچ بالدىقىڭىزغا سۆرەڭ" className={pill}>
          <BookOpen size={14} className="text-ink-3" /> Gloss تا ئوقۇش
        </a>
        <a ref={saveRef} onClick={(e) => e.preventDefault()} data-tip="مېنى خەتكۈچ بالدىقىڭىزغا سۆرەڭ" className={pill}>
          <BookmarkPlus size={14} className="text-ink-3" /> Gloss قا ساقلاش
        </a>
      </div>
      <details className="mt-3 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink-2">تېلېفوندا</summary>
        <div className="mt-2">
          <CopyBlock title="خالىغان بەتنى خەتكۈچكە قوشۇپ، ئاندىن خەتكۈچنى تەھرىرلەڭ" body="بۇنى ئادرېسى قىلىپ چاپلاپ، ئىسمىنى «Gloss قا ساقلاش» قىلىڭ." text={code("save")} />
        </div>
      </details>
    </div>
  );
}

/* ---------- an agent ---------- */

type Conn = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
const LABELS: { label: string; mark?: AgentMark }[] = [
  { label: "Grok Bot", mark: "grok" },
  { label: "Claude", mark: "claude" },
  { label: "ChatGPT", mark: "chatgpt" },
  { label: "باشقا" },
];

function Agent({ signedIn }: { signedIn: boolean }) {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [made, setMade] = useState<{ token: string; label: string } | null>(null);
  const [label, setLabel] = useState("Grok Bot");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://usegloss.io";

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/agent-tokens")
      .then((r) => r.json())
      .then((j: { tokens?: Conn[] }) => setConns(j.tokens ?? []))
      .catch(() => setConns([]));
  }, [signedIn]);

  if (!signedIn)
    return (
      <div className="mt-5">
        <AgentIntro />
        <p className="mt-4 text-[13.5px] text-ink-2">ۋاكالەتچى ھېساباتىڭىزدىكى كۈتۈپخانىغا ساقلايدۇ، شۇڭا كىرىشىڭىز كېرەك.</p>
        <SignInButton mode="modal">
          <button type="button" className="add-btn mt-4">
            ئۇلاش ئۈچۈن كىرىڭ
          </button>
        </SignInButton>
      </div>
    );

  const create = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/agent-tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const j = (await res.json().catch(() => ({}))) as { id?: string; token?: string; label?: string; error?: string };
    setBusy(false);
    if (!res.ok || !j.token || !j.id) return setErr(j.error ?? "ئۇلىنالمىدى. قايتا سىناڭ.");
    setMade({ token: j.token, label: j.label ?? label });
    setConns((c) => [{ id: j.id!, label: j.label ?? label, createdAt: new Date().toISOString(), lastUsedAt: null }, ...(c ?? [])]);
  };

  const revoke = async (id: string) => {
    setConns((c) => c?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/agent-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="mt-5">
      <AgentIntro />
      {made ? (
        <Setup token={made.token} label={made.label} origin={origin} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="lib-sort !ml-0" role="radiogroup" aria-label="قايسى ۋاكالەتچى">
            {LABELS.map((l) => (
              <button key={l.label} type="button" role="radio" aria-checked={label === l.label} onClick={() => setLabel(l.label)} className="inline-flex items-center gap-1.5">
                {l.mark && <Mark k={l.mark} size={14} />}
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={create} disabled={busy} className="add-btn">
            {busy && <Loader2 size={14} className="animate-spin" />}
            ئۇلىنىش قۇرۇش
          </button>
          {err && <p className="w-full text-[12.5px] text-rubric-text">{err}</p>}
        </div>
      )}
      {conns && conns.length > 0 && (
        <div className="mt-6">
          <p className="lib-label">ئۇلانغان</p>
          <ul className="mt-2 divide-y divide-rule">
            {conns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="ms-2 text-ink-3">
                    {c.lastUsedAt ? `ئاخىرقى ئىشلىتىلگەن ۋاقىت: ${new Date(c.lastUsedAt).toLocaleDateString("ug-CN", { day: "numeric", month: "short" })}` : "تېخى ئىشلىتىلمىگەن"}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(c.id)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                  <Trash2 size={13} /> بىكار قىلىش
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AgentIntro() {
  return (
    <div className="flex items-start gap-3.5">
      <Glyph k="agent" size={46} className="shrink-0" />
      <div>
        <p className="font-serif text-[19px] leading-tight text-ink">ۋاكالەتچىڭىز سىز ئۈچۈن جاۋىغا قويسۇن</p>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-3">
          Gloss نىڭ MCP مۇلازىمېتىرى بار. ئۇنى Grok Bot، Claude ياكى ChatGPT غا بېرىپ، مۇنداق سوراڭ: «بۇ ئايدىكى X خەتكۈچلىرىمنى كۆرۈپ چىقىپ، ماقالىلەرنى Gloss كۈتۈپخانامغا ساقلا.» ھەربىرى ئوقۇلۇپ، تېمىغا ئايرىلىپ، كېيىنكى قېتىم Gloss نى ئاچقىنىڭىزدا جاۋىلىرىڭىزدا بولىدۇ.
        </p>
      </div>
    </div>
  );
}

const PROMPT = "ئۆتكەن ئايدىكى X خەتكۈچلىرىمنى كۆرۈپ چىقىپ، ماقالە، ئەسەر ياكى ئىلمىي ماقالىلەرگە ئۇلانغانلىرىنى تېپىپ، شۇ ئۇلانمىلارنى Gloss كۈتۈپخانامغا ساقلا.";

function Setup({ token, label, origin }: { token: string; label: string; origin: string }) {
  const url = `${origin}/mcp`;
  const steps: { title: string; body: string; copy: string }[] =
    label === "Grok Bot" || label === "Grok"
      ? [
          { title: "Grok Bot: سۆھبەتتە بۇنى دەڭ", body: "ئۇ جەزملەشتۈرۈشنى سورايدۇ؛ ئاندىن Gloss قوراللىرى تەييار بولىدۇ.", copy: `Add a custom MCP server called Gloss at ${url} with the header Authorization set to Bearer ${token}` },
        ]
      : label === "Claude"
        ? [
            { title: "Claude Code: بۇنى ئىجرا قىلىڭ", body: "ئاندىن Claude دىن Gloss كۈتۈپخانىڭىزغا بىرەر نەرسە ساقلاشنى سوراڭ.", copy: `claude mcp add --transport http gloss ${url} --header "Authorization: Bearer ${token}"` },
            { title: "ياكى claude.ai: Settings ← Connectors ← Add custom connector", body: "بۇ ئۇلانمىدا توكېنىڭىز بار، شۇڭا مەخپىي ساقلاڭ.", copy: `${url}/${token}` },
          ]
        : [
            { title: "مۇلازىمېتىر URL ى ۋە بىر header", body: `URL: ${url}، ۋە بۇ header:`, copy: `Authorization: Bearer ${token}` },
            { title: "ياكى پەقەت URL قوبۇل قىلىدىغان ئەپلەر ئۈچۈن، توكېن بار URL", body: "مەخپىي ساقلاڭ: خاتىرىلەرگە چۈشۈپ قېلىشى مۇمكىن.", copy: `${url}/${token}` },
          ];
  return (
    <div className="mt-5 space-y-3">
      <p className="text-[13px] text-good">قۇرۇلدى. بۇ توكېن پەقەت بىرلا قېتىم كۆرسىتىلىدۇ: ھازىرلا كۆچۈرۈڭ.</p>
      {steps.map((s) => (
        <CopyBlock key={s.title} title={s.title} body={s.body} text={s.copy} />
      ))}
      <CopyBlock title="ئاندىن مۇنداق سوراڭ" body="ۋاكالەتچىلەر يازما ئۇلانغان ماقالىنى ساقلايدۇ. يازمىنىڭ ئۆزى ئەسەر بولسا، مەسىلەن X Article ياكى ئۇزۇن يازما، ئۇنىڭ تېكىستىنى ئەۋەتىدۇ." text={PROMPT} />
    </div>
  );
}

function CopyBlock({ title, body, text }: { title: string; body: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[14px] border border-rule bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <p className="text-[12px] text-ink-3">{body}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {}
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sunk px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {copied ? <Check size={12} className="text-good" /> : <Copy size={12} />}
          {copied ? "كۆچۈرۈلدى" : "كۆچۈرۈش"}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-sunk px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-2">{text}</pre>
    </div>
  );
}
