"use client";

import { useState } from "react";
import { ArrowRight, Link2, Loader2 } from "lucide-react";
import { normalizeUrl } from "@/lib/links";
import { CLASSICS, classicCover } from "@/lib/classics";
import { importFromUrl, keep } from "@/lib/import";
import { useStore } from "@/lib/store";
import type { AddTab } from "./AddPanel";
import { MarkStack } from "./AgentMarks";

/**
 * Under a shelf that is still nearly empty: three ways to fill it. A dozen
 * classics in one click, links of your own, or an agent that shelves for you.
 */
export function Starter({ count, signedIn, onAdd }: { count: number; signedIn: boolean; onAdd: (tab: AddTab) => void }) {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);

  const shelveClassics = async () => {
    const have = new Set(useStore.getState().library.map((x) => (x.sourceUrl ? normalizeUrl(x.sourceUrl) : "")));
    const todo = CLASSICS.filter((c) => !have.has(normalizeUrl(c.url)));
    if (!todo.length) return;
    setBusy({ done: 0, total: todo.length });
    setFailed(0);
    const next = async () => {
      for (let c = todo.shift(); c; c = todo.shift()) {
        const r = await importFromUrl(c.url);
        const err = r.ok ? await keep({ ...r.article, title: c.title, author: c.author, published: String(c.year) }, undefined, { topic: c.topic, cover: classicCover(c) }) : r.error;
        if (err) setFailed((n) => n + 1);
        setBusy((b) => b && { ...b, done: b.done + 1 });
      }
    };
    await Promise.all([next(), next(), next()]);
    setBusy(null);
  };

  return (
    <section className="starter" aria-label="كۈتۈپخانىڭىزنى تولدۇرۇڭ">
      <div className="starter-card is-classics">
        <div className="starter-fan" aria-hidden>
          {CLASSICS.slice(0, 5).map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={c.key} src={classicCover(c)} alt="" style={{ ["--i" as string]: i }} />
          ))}
        </div>
        <div className="min-w-0">
          <p className="starter-title">{count ? "بىر قانچە كلاسسىك ئەسەر قوشۇش" : "بىر قانچە كلاسسىك ئەسەردىن باشلاڭ"}</p>
          <p className="starter-body">كىشىلەر قايتا-قايتا ئوقۇيدىغان ئون نەچچە ماقالە: Hamming، Feynman، Orwell، Graham، Wallace قاتارلىقلار.</p>
          <button type="button" onClick={shelveClassics} disabled={Boolean(busy)} className="starter-btn">
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> جاۋىغا قويۇۋاتىدۇ {busy.total} دىن {busy.done}
              </>
            ) : (
              <>
                جاۋىغا قويۇش <ArrowRight size={15} />
              </>
            )}
          </button>
          {failed > 0 && !busy && <p className="mt-2 text-[12.5px] text-ink-3">{failed} ھازىرچە ئوقۇلمىدى. كېيىن قايتا سىناڭ.</p>}
        </div>
      </div>
      <button type="button" className="starter-card" onClick={() => onAdd("links")}>
        <span className="starter-icon">
          <Link2 size={20} />
        </span>
        <span className="starter-title">ئۆز ئۇلانمىلىرىڭىزنى ساقلاڭ</span>
        <span className="starter-body">بىر ياكى كۆپنى چاپلاڭ. Gloss ھەربىرىنى ئوقۇپ، تېمىغا ئايرىيدۇ.</span>
      </button>
      <button type="button" className="starter-card" onClick={() => onAdd("agent")}>
        <span className="starter-icon is-agent">
          <MarkStack size={24} />
        </span>
        <span className="starter-title">ۋاكالەتچىڭىز سىز ئۈچۈن جاۋىغا قويسۇن</span>
        <span className="starter-body">
          كۈتۈپخانىڭىزنى Grok Bot، Claude ياكى ChatGPT غا بېرىپ، خەتكۈچلىرىڭىزدىكى ياخشى ماقالىلەرنى ساقلاشنى سوراڭ.{!signedIn && " ھېسابات كېرەك."}
        </span>
      </button>
    </section>
  );
}
