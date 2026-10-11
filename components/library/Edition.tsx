"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { tidyTitle } from "@/lib/article";
import {
  arrange,
  editionTitle,
  estimatePages,
  monthName,
  price,
  PRINT,
  shiftMonth,
  textPages,
  WORDS_PER_PAGE,
  type CoverCopy,
  type EditionOrder,
  type EditionStatus,
  type PrintText,
} from "@/lib/edition";
import { fetchOrder, fetchOrders, gather, keptCover, monthsOf, paintCover, placeOrder, plainCopy, type KeptCover, type Pick } from "@/lib/editions";
import { TOPIC, topicArtSrc, topicOf } from "@/lib/library";
import { BOOK_CSS, COVER_CSS, MATTER_CSS, bodyHTML, frontHTML, MARK_SVG, minutesOf, openerHTML } from "@/lib/print/html";
import { useStore } from "@/lib/store";
import { Glyph } from "./Book";
import { EditionBook, type Spread } from "./EditionBook";
import { EditionPodcast } from "./EditionPodcast";

/** At least this many pieces make an edition worth binding. */
const MIN_PIECES = 3;

const PRINT_STYLES = `${COVER_CSS}${BOOK_CSS}${MATTER_CSS}`;

/** A page of the book: the press's markup at the preview's size. */
function Page({ html, side, folio, children, className = "" }: { html?: string; side: "recto" | "verso"; folio?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={`ep gb is-${side} ${className}`}>
      {html !== undefined ? <div dangerouslySetInnerHTML={{ __html: html }} /> : children}
      {folio !== undefined && <span className="ep-folio">{folio}</span>}
    </div>
  );
}

/** The last words of a text, as its last page shows them. */
function tailOf(t: PrintText, words = 150) {
  let n = 0, i = t.blocks.length;
  while (i > 0 && n < words) n += t.blocks[--i].runs.map((r) => r.text).join("").split(/\s+/).length;
  return { blocks: t.blocks.slice(i), marks: t.marks };
}

/** Where each piece opens, page by page, as the press will set it: for the contents and the folios. */
function plan(texts: { text: PrintText; pick: Pick }[]): number[] {
  const contents = Math.max(1, Math.ceil(texts.length / 16));
  let p = 5 + contents;
  return texts.map(({ text, pick }) => {
    const plate = Boolean(text.plate);
    if (plate && p % 2 === 1) p++;
    if (plate) p++;
    else if (p % 2 === 0) p++;
    const start = p;
    p = start + Math.max(1, Math.ceil(textPages(pick.size) - (plate ? 1.5 : 0.5)));
    return start;
  });
}

const STEPS: { key: EditionStatus[]; title: string; body: (o: EditionOrder) => string }[] = [
  { key: ["paid", "setting", "sent", "printing", "shipped", "delivered", "failed", "canceled"], title: "Paid", body: (o) => (o.status === "failed" && !o.test ? "Refunded in full" : `${price()}, shipping included`) },
  { key: ["sent", "printing", "shipped", "delivered"], title: "Set in type", body: (o) => (o.pages ? `${o.pages} pages, with your highlights and notes` : "Every page, with your highlights and notes") },
  { key: ["printing", "shipped", "delivered"], title: "At the printer", body: (o) => (o.test ? "A test order stops here: the files are ready, and nothing was sent" : "Lulu prints and binds it on demand") },
  { key: ["shipped", "delivered"], title: "Posted", body: (o) => (o.tracking?.carrier ? `With ${o.tracking.carrier}` : "Tracked, to the address you gave") },
  { key: ["delivered"], title: "Delivered", body: () => "In your hands" },
];

const HEADLINE: Record<EditionStatus, string> = {
  draft: "Waiting for payment",
  paid: "Paid. Setting the type",
  setting: "Setting the type",
  sent: "With the printer",
  printing: "Being printed",
  shipped: "On its way to you",
  delivered: "Delivered",
  failed: "It could not be printed",
  canceled: "Cancelled",
};

/**
 * Your month, as a book: the texts you saved, your highlights and notes in
 * them, under a cover painted for the month. Leaf through it, leave out what
 * you'd rather not keep, and have it printed and posted. Coming back from
 * checkout, the same sheet follows the order from the press to your door.
 */
export function Edition({ month: initialMonth, orderId, session, owner, onClose }: { month: string; orderId?: string | null; session?: string | null; owner: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  return createPortal(
    <div className="ed-stage" data-closing={closing || undefined} role="dialog" aria-modal aria-label="Your edition">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div className="ed-backdrop" onClick={close} />
      <button type="button" className="ed-x" aria-label="Close" onClick={close}>
        <X size={18} />
      </button>
      {orderId ? <Order id={orderId} session={session} onClose={close} /> : <Draft initialMonth={initialMonth} owner={owner} />}
    </div>,
    document.body
  );
}

/* ---------- the book before it is ordered ---------- */

function Draft({ initialMonth, owner }: { initialMonth: string; owner: string }) {
  const library = useStore((s) => s.library);
  const months = useMemo(() => monthsOf(library), [library]);
  const [month, setMonth] = useState(initialMonth);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [out, setOut] = useState<Set<string>>(() => new Set());
  const [fit, setFit] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState(owner);
  const [cover, setCover] = useState<KeptCover | null>(null);
  const [painting, setPainting] = useState(false);
  const [coverNote, setCoverNote] = useState<string | null>(null);
  const [at, setAt] = useState(-1);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<{ text: string; soon?: boolean } | null>(null);
  const [printed, setPrinted] = useState<string | undefined>(undefined);
  const [talking, setTalking] = useState<string[]>([]);
  const live = useRef(month);

  const paint = useCallback(async (m: string, ps: Pick[], copy?: CoverCopy) => {
    if (!ps.length) return;
    setPainting(true);
    setCoverNote(null);
    const r = await paintCover(m, ps, copy);
    if (live.current !== m) return;
    setPainting(false);
    if (r.ok) {
      setCover(r.cover);
      if (r.error) setCoverNote("The painter is resting. The cover uses this month's plate for now.");
    } else setCoverNote(r.needKey ? "Painted covers need a Together key (the key icon, top right). For now, the month's plate." : r.error);
  }, []);

  // A month opens: gather its texts, keep it under the page limit, find or paint its cover.
  useEffect(() => {
    live.current = month;
    setPicks(null);
    setCover(null);
    setCoverNote(null);
    setPainting(false);
    setAt(-1);
    setTalking([]);
    setPrinted(undefined);
    let gone = false;
    // An edition of this month already printed pays for its podcast.
    void fetchOrders().then((os) => !gone && setPrinted(os.find((o) => o.month === month && !["draft", "failed", "canceled"].includes(o.status))?.id));
    void (async () => {
      const ps = await gather(month);
      if (gone) return;
      const ok = ps.filter((p) => p.text);
      const leaveOut = new Set<string>();
      const sized = () => estimatePages(ok.filter((p) => !leaveOut.has(p.item.id)).map((p) => p.size));
      for (const p of [...ok].sort((a, b) => b.size.words - a.size.words)) {
        if (sized() <= PRINT.maxPages) break;
        leaveOut.add(p.item.id);
      }
      setPicks(ps);
      setOut(new Set(leaveOut));
      setFit(leaveOut);
      const kept = await keptCover(month);
      if (gone) return;
      if (kept) setCover(kept);
      else void paint(month, ok);
    })();
    return () => {
      gone = true;
    };
  }, [month, paint]);

  const chosen = useMemo(() => (picks ?? []).filter((p) => p.text && !out.has(p.item.id)), [picks, out]);
  const ordered = useMemo(() => arrange(chosen.map((p) => ({ ...p.text!, pick: p }))), [chosen]);
  const pages = useMemo(() => estimatePages(chosen.map((p) => p.size)), [chosen]);
  const podTexts = useMemo(() => (picks ? ordered.map(({ pick: _p, ...t }) => t) : null), [picks, ordered]);
  // The podcast reaches a piece: the book turns to it, and its row in the list lights.
  const onChapter = useCallback(
    (ns: number[]) => {
      const ids = ns.map((n) => ordered[n - 1]?.id).filter(Boolean);
      setTalking(ids);
      if (ns[0]) setAt(ns[0] + 1);
    },
    [ordered]
  );
  const marks = chosen.reduce((n, p) => n + p.marks, 0);
  const copy = cover?.copy ?? plainCopy(chosen.length ? chosen : (picks ?? []));
  const view = { name, month, theme: copy.theme, lines: copy.lines, topic: copy.topic, art: cover?.art ? `data:image/jpeg;base64,${cover.art}` : null, count: chosen.length };
  const over = pages > PRINT.maxPages;
  const few = chosen.length < MIN_PIECES;

  const toggle = (id: string) =>
    setOut((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const order = async () => {
    if (!chosen.length || over || few) return;
    setPlacing(true);
    setError(null);
    const r = await placeOrder({ month, name, copy: { ...copy }, art: cover?.art ?? undefined, texts: ordered.map(({ pick: _p, ...t }) => t) });
    if (!r.ok) {
      setPlacing(false);
      setError({ text: r.error, soon: r.soon });
      return;
    }
    window.location.href = r.url;
  };

  const starts = useMemo(() => plan(ordered.map((t) => ({ text: t, pick: t.pick }))), [ordered]);
  const T = TOPIC[copy.topic];
  const spreads = useMemo<Spread[]>(() => {
    const title = editionTitle(name);
    const contents = (
      <Page side="recto" folio={5}>
        <section className="contents">
          <h2>Contents</h2>
          {ordered.map((t, i) => {
            const head = i === 0 || ordered[i - 1].topic !== t.topic;
            return (
              <div key={t.id}>
                {head && (
                  <p className="toc-topic" style={{ color: TOPIC[t.topic].shades[2] }}>
                    {t.topic === "unsorted" ? "Saved" : TOPIC[t.topic].name}
                  </p>
                )}
                <p className="toc-row">
                  <span className="toc-pg">{starts[i]}</span>
                  <span className="toc-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="toc-t">{t.title}</span>
                  {t.author && <span className="toc-by">&ensp;{t.author}</span>}
                </p>
              </div>
            );
          })}
        </section>
      </Page>
    );
    const list: Spread[] = [
      {
        label: "Title page",
        left: null,
        right: (
          <Page side="recto" folio={3}>
            <section className="titlepage" style={{ ["--ink" as string]: T.shades[2] }}>
              <p className="tp-month">{monthName(month)}</p>
              <p className="tp-word">Gloss</p>
              <p className="tp-ed">{title}</p>
              {copy.theme && <p className="tp-theme">{copy.theme}</p>}
              <p className="tp-foot">
                {ordered.length} {ordered.length === 1 ? "piece" : "pieces"} saved{name ? ` by ${name}` : ""} in {monthName(month)}
                {marks ? `, with ${marks === 1 ? "one highlight" : `${marks} highlights`}` : ""}.
              </p>
            </section>
          </Page>
        ),
      },
      {
        label: "Contents",
        left: (
          <Page side="verso" folio={4}>
            <section className="colophon">
              <span className="mark" dangerouslySetInnerHTML={{ __html: MARK_SVG("#1d1b18", "#c1401b") }} />
              <p>
                This edition gathers what {name || "you"} saved to Gloss in {monthName(month)}, arranged by subject, with every highlight and note left where it was made.
              </p>
              <p>Set in Newsreader and Schibsted Grotesk. Printed and bound on demand by Lulu.</p>
            </section>
          </Page>
        ),
        right: contents,
      },
    ];
    ordered.forEach((t, i) => {
      const prev = ordered[i - 1];
      const ink = { ["--ink" as string]: TOPIC[t.topic].shades[2] };
      const left = t.plate ? (
        <Page side="verso" className="is-plate">
          <section className="plate-page" style={ink}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.pick.thumb ?? t.plate} alt="" />
            <p className="plate-cap">
              {String(i + 1).padStart(2, "0")} · {t.topic === "unsorted" ? "Saved" : TOPIC[t.topic].name}
            </p>
          </section>
        </Page>
      ) : prev ? (
        <Page side="verso" folio={starts[i] - 1} html={`<div style="--ink:${TOPIC[prev.topic].shades[2]}">${bodyHTML(tailOf(prev), { lede: false })}<span class="fin"></span></div>`} className="is-tail" />
      ) : (
        <Page side="verso" />
      );
      list.push({
        label: tidyTitle(t.title),
        left,
        right: <Page side="recto" folio={starts[i]} html={`<div style="--ink:${TOPIC[t.topic].shades[2]}">${openerHTML(t, { no: i + 1, words: t.pick.size.words })}${bodyHTML(t, { words: 190 })}</div>`} />,
      });
    });
    list.push({
      label: "Notes",
      left: (
        <Page side="verso">
          <p className="np-head">Notes</p>
          <div className="np-lines" />
        </Page>
      ),
      right: <Page side="recto" className="is-end" />,
    });
    return list;
  }, [ordered, starts, name, month, copy.theme, T, marks]);

  const groups = useMemo(() => {
    const ps = (picks ?? []).slice().sort((a, b) => topicOf(a.item.topic).localeCompare(topicOf(b.item.topic)) || a.item.addedAt - b.item.addedAt);
    const by = new Map<string, Pick[]>();
    for (const p of arrange(ps.map((p) => ({ ...p, topic: topicOf(p.item.topic), addedAt: p.item.addedAt })))) by.set(topicOf(p.item.topic), [...(by.get(topicOf(p.item.topic)) ?? []), p]);
    return [...by.entries()];
  }, [picks]);

  const at0 = Math.min(at, spreads.length - 1);
  const i = months.indexOf(month);
  const older = months[i + 1] ?? (i === -1 ? months[0] : null);
  const newer = i > 0 ? months[i - 1] : null;

  return (
    <div className="ed-sheet">
      <div className="ed-book-col" style={{ ["--eb-ink" as string]: T.shades[2] }}>
        <EditionBook
          front={
            <div className="ed-front-host">
              <div dangerouslySetInnerHTML={{ __html: frontHTML(view, { plate: painting ? undefined : topicArtSrc(copy.topic) }) }} key={cover?.at ?? "plain"} />
              {painting && (
                <div className="ed-painting">
                  <span>
                    <Loader2 size={13} className="animate-spin" /> Painting your cover
                  </span>
                </div>
              )}
            </div>
          }
          spine={
            <div className="eb-spine-text" style={{ ["--ink" as string]: T.shades[2] }}>
              <span className="sp-word">Gloss</span>
              <span className="sp-sep" />
              <span className="sp-ed">{editionTitle(name)}</span>
              <span className="sp-sep" />
              <span className="sp-month">{monthName(month)}</span>
            </div>
          }
          endpaper={
            <div className="ed-endpaper" style={{ ["--c" as string]: T.shades[2], ["--c2" as string]: T.shades[3] }}>
              <div className="ex-libris">
                <p className="ex-head">This edition belongs to</p>
                <div className="ex-art">
                  <Glyph k={copy.topic} size={64} />
                </div>
                <p className="ex-name">{name || "You"}</p>
                <p className="ex-meta">{monthName(month)}</p>
              </div>
            </div>
          }
          spreads={spreads}
          pages={pages}
          at={at0}
          onAt={setAt}
        />
      </div>

      <aside className="ed-panel" aria-label="Your edition">
        <header className="ed-head">
          <div className="ed-month">
            <button type="button" aria-label="An earlier month" disabled={!older} onClick={() => older && setMonth(older)}>
              <ChevronLeft size={15} />
            </button>
            <span>{monthName(month)}</span>
            <button type="button" aria-label="A later month" disabled={!newer} onClick={() => newer && setMonth(newer)}>
              <ChevronRight size={15} />
            </button>
          </div>
          <h2 className="ed-title">
            The{" "}
            <input
              className="ed-name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{M}' -]/gu, "").slice(0, 22))}
              size={Math.max(3, name.length + 1)}
              placeholder="Name"
              aria-label="Whose edition"
              spellCheck={false}
            />{" "}
            Edition
          </h2>
          {copy.theme && <p className="ed-theme">{copy.theme}</p>}
          <div className="ed-cover-row">
            {painting ? (
              <span className="ed-busy">
                <Loader2 size={13} className="animate-spin" /> Painting the cover from this month&rsquo;s reading
              </span>
            ) : (
              <button type="button" className="ed-link" disabled={!chosen.length} onClick={() => void paint(month, chosen)}>
                <RefreshCw size={13} /> Paint another cover
              </button>
            )}
          </div>
          {coverNote && <p className="ed-note">{coverNote}</p>}
          <p className="ed-stats">
            <span>
              <b>{chosen.length}</b> {chosen.length === 1 ? "piece" : "pieces"}
            </span>
            <span>
              about <b>{pages}</b> pages
            </span>
            {marks > 0 && (
              <span>
                <b>{marks}</b> {marks === 1 ? "highlight" : "highlights"}
              </span>
            )}
          </p>
        </header>

        <EditionPodcast
          key={month}
          month={month}
          name={name}
          texts={podTexts}
          order={printed}
          art={cover?.art ? `data:image/jpeg;base64,${cover.art}` : null}
          onChapter={onChapter}
        />

        <div className="ed-list scroll-thin">
          {picks === null ? (
            <p className="ed-empty">
              <Loader2 size={15} className="animate-spin" /> Gathering {monthName(month, { year: false })}&rsquo;s reading
            </p>
          ) : !picks.length ? (
            <p className="ed-empty">Nothing was saved in {monthName(month)}. Save a few things to read, and they gather here.</p>
          ) : (
            <>
              <p className="ed-label">
                Inside <span>Untick anything to leave it out</span>
              </p>
              {groups.map(([topic, ps]) => (
                <div key={topic} className="ed-group">
                  <p className="ed-topic" style={{ color: TOPIC[topicOf(topic)].shades[2] }}>
                    <Glyph k={topicOf(topic)} size={16} /> {TOPIC[topicOf(topic)].name}
                  </p>
                  {ps.map((p) => {
                    const on = Boolean(p.text) && !out.has(p.item.id);
                    const n = ordered.findIndex((t) => t.id === p.item.id);
                    return (
                      <div key={p.item.id} className="ed-row" data-off={!on || undefined} data-talking={(on && talking.includes(p.item.id)) || undefined}>
                        <label className="ed-check">
                          <input type="checkbox" checked={on} disabled={!p.text} onChange={() => toggle(p.item.id)} aria-label={`Include ${p.item.title}`} />
                          <span aria-hidden>
                            <Check size={12} strokeWidth={3} />
                          </span>
                        </label>
                        <button type="button" className="ed-row-main" disabled={!on} onClick={() => n >= 0 && setAt(n + 2)} data-tip={on ? "Turn to it" : undefined}>
                          <span className="ed-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.thumb ?? topicArtSrc(topicOf(p.item.topic))} alt="" />
                          </span>
                          <span className="min-w-0">
                            <span className="ed-row-title">{tidyTitle(p.item.title)}</span>
                            <span className="ed-row-by">
                              {!p.text
                                ? "Open it once on this device to include it"
                                : fit.has(p.item.id) && !on
                                  ? "Left out to fit"
                                  : [p.item.author, `${minutesOf(p.size.words)} min`].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                        <span className="ed-row-meta">
                          {p.marks > 0 && (
                            <span className="ed-marks" data-tip={`${p.marks} ${p.marks === 1 ? "highlight" : "highlights"}${p.notes ? `, ${p.notes} with notes` : ""}`}>
                              {p.marks}
                            </span>
                          )}
                          <span className="ed-pp">{Math.max(1, Math.round(p.size.words / WORDS_PER_PAGE + p.size.figures * 0.42 + 0.4))} pp</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        <footer className="ed-foot">
          {over ? (
            <p className="ed-warn">
              About {pages} pages. An edition prints up to {PRINT.maxPages} for {price()}: leave out a long one.
            </p>
          ) : few && picks?.length ? (
            <p className="ed-warn is-quiet">An edition needs {MIN_PIECES} pieces or more. Save a few more this month, or look at an earlier one.</p>
          ) : null}
          {error && <p className={`ed-warn${error.soon ? " is-soon" : ""}`}>{error.soon ? "Printing opens soon. Your edition will be here, ready, when it does." : error.text}</p>}
          <div className="ed-buy">
            <div className="ed-price">
              <b>{price()}</b>
              <span>Shipping included, US only</span>
            </div>
            <button type="button" className="ed-print" disabled={placing || over || few || !picks} onClick={order}>
              {placing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Sending to press
                </>
              ) : (
                <>
                  Print and ship <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
          <p className="ed-fine">A 6 × 9 inch paperback in full colour, printed on demand by Lulu and posted to you. It arrives {PRINT.arrives}.</p>
        </footer>
      </aside>
    </div>
  );
}

/* ---------- an order, from the press to your door ---------- */

function Order({ id, session, onClose }: { id: string; session?: string | null; onClose: () => void }) {
  const [state, setState] = useState<{ order: EditionOrder; art: boolean; copy?: CoverCopy } | null | "missing">(null);
  const [texts, setTexts] = useState<PrintText[] | null>(null);
  const month = state && state !== "missing" ? state.order.month : null;

  // The month's pieces on this device, in the book's order, for the podcast that comes with it.
  useEffect(() => {
    if (!month) return;
    let gone = false;
    void gather(month).then((ps) => !gone && setTexts(arrange(ps.flatMap((p) => (p.text ? [p.text] : [])))));
    return () => {
      gone = true;
    };
  }, [month]);

  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    const tick = async () => {
      const r = await fetchOrder(id, first ? session : null);
      first = false;
      if (gone) return;
      setState(r ?? "missing");
      // While the press runs, look again every few seconds; after that, now and then.
      const busy = r && ["draft", "paid", "setting"].includes(r.order.status);
      timer = setTimeout(tick, busy ? 2500 : 60_000);
    };
    void tick();
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [id, session]);

  if (state === null)
    return (
      <div className="ed-sheet is-order">
        <p className="ed-empty">
          <Loader2 size={15} className="animate-spin" /> Finding your order
        </p>
      </div>
    );
  if (state === "missing")
    return (
      <div className="ed-sheet is-order">
        <div className="ed-panel">
          <p className="ed-empty">That order was not found.</p>
          <button type="button" className="ed-print" onClick={onClose}>
            Back to the library
          </button>
        </div>
      </div>
    );

  const { order, art, copy } = state;
  // A test order is set and kept here: its journey ends at the printer's door.
  const ready = order.test && order.status === "sent";
  const view = {
    name: order.name,
    month: order.month,
    theme: copy?.theme ?? "",
    lines: copy?.lines ?? [],
    topic: copy?.topic ?? "living",
    art: art ? `/api/editions/${order.id}/art` : null,
    count: order.texts,
  };
  const done = (s: EditionStatus[]) => s.includes(order.status) || (ready && s === STEPS[2].key);
  const active = ready ? -1 : STEPS.findIndex((s) => !done(s.key));

  return (
    <div className="ed-sheet is-order">
      <div className="ed-book-col">
        <div className="ed-held" style={{ ["--fs" as string]: "1px" }}>
          <div className="ed-held-book" style={{ ["--c" as string]: TOPIC[view.topic].shades[2] }}>
            <div className="ed-held-front" dangerouslySetInnerHTML={{ __html: frontHTML(view, { plate: topicArtSrc(view.topic) }) }} />
            <span className="ed-held-spine" />
          </div>
          <span className="ed-held-shadow" />
        </div>
      </div>
      <aside className="ed-panel is-order" aria-label="Your order">
        <header className="ed-head">
          <p className="ed-eyebrow">
            {order.test && <span className="ed-test">Test order</span>}
            {monthName(order.month)} · {editionTitle(order.name)}
          </p>
          <h2 className="ed-title is-status">{ready ? "Ready for the printer" : HEADLINE[order.status]}</h2>
          {order.status === "failed" || order.status === "canceled" ? (
            <p className="ed-note">{order.error ?? "This order will not be printed."}</p>
          ) : (
            <p className="ed-theme">
              {order.arrival?.max && !done(["shipped", "delivered"])
                ? `Expected by ${new Date(order.arrival.max).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
                : order.test
                  ? "Paid with no card, and kept here: nothing is sent to a printer."
                  : `It arrives ${PRINT.arrives}.`}
            </p>
          )}
        </header>
        {texts && texts.length > 0 && !["failed", "canceled", "draft"].includes(order.status) && (
          <EditionPodcast key={order.month} month={order.month} name={order.name} texts={texts} order={order.id} art={view.art} fixed />
        )}
        <ol className="ed-steps">
          {STEPS.map((s, n) => {
            const ok = done(s.key);
            const now = n === active && !["failed", "canceled"].includes(order.status);
            return (
              <li key={s.title} data-state={ok ? "done" : now ? "now" : "next"}>
                <span className="ed-dot">{ok ? <Check size={11} strokeWidth={3} /> : now ? <Loader2 size={11} className="animate-spin" /> : null}</span>
                <span>
                  <b>{s.title}</b>
                  <span>{s.body(order)}</span>
                  {s.title === "Posted" && order.tracking?.url && ok && (
                    <a href={order.tracking.url} target="_blank" rel="noreferrer" className="ed-link">
                      Track it <ArrowUpRight size={13} />
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        {order.files?.interior && (
          <div className="ed-files">
            <p className="ed-label">What the printer {order.test ? "would get" : "was sent"}</p>
            <a href={order.files.interior} target="_blank" rel="noreferrer" className="ed-file">
              <FileText size={15} /> The book{order.pages ? `, ${order.pages} pages` : ""} <ArrowUpRight size={13} />
            </a>
            {order.files.cover && (
              <a href={order.files.cover} target="_blank" rel="noreferrer" className="ed-file">
                <FileText size={15} /> The cover, spine and back <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        )}
        <footer className="ed-foot">
          <button type="button" className="ed-print is-quiet" onClick={onClose}>
            Back to the library
          </button>
        </footer>
      </aside>
    </div>
  );
}

