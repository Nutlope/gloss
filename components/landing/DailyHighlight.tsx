"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { tidyTitle } from "@/lib/article";
import { DAILY, keepInRotation, retire, todaysReview } from "@/lib/review";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";
import { Desk, DeskLink } from "./Desk";

/**
 * A few of your own highlights back on the desk each day, one at a time.
 * Keep one and it returns in a few days, then less and less often; mark it
 * done and it leaves the review. Nothing at all until you have highlights.
 */
export function DailyHighlight({ foot }: { foot?: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const highlights = useStore((s) => s.highlights);
  const library = useStore((s) => s.library);
  const updateHighlight = useStore((s) => s.updateHighlight);
  const setUI = useStore((s) => s.setUI);

  const titleOf = useMemo(() => {
    const m = new Map<string, { title: string; author?: string }>();
    for (const a of SAMPLES) m.set(a.id, { title: a.title, author: a.author });
    for (const x of library) m.set(x.id, { title: x.title, author: x.author });
    return m;
  }, [library]);

  const all = useMemo(() => Object.values(highlights).flat().filter((h) => titleOf.has(h.articleId)), [highlights, titleOf]);
  const { deck, done } = useMemo(() => todaysReview(all), [all]);

  const pick = deck[0];
  const src = pick ? titleOf.get(pick.articleId) : undefined;
  if (!hydrated || !pick || !src) return null;
  const total = Math.min(DAILY, done + deck.length);

  return (
    <Desk
      label={
        <>
          بۈگۈن، بەلگىلىرىڭىزدىن
          {total > 1 && <span className="ms-2 font-normal tabular-nums text-ink-4">{`${done + 1} of ${total}`}</span>}
        </>
      }
      aside={<DeskLink onClick={() => setUI({ shelf: "highlights" })}>بارلىق بەلگىلەر</DeskLink>}
      foot={foot}
    >
      <div key={pick.id} className="desk-tile is-review">
        <Link href={`/read/${pick.articleId}?hl=${pick.id}`} className="group flex min-w-0 flex-1 flex-col">
          <blockquote className="line-clamp-2 font-serif text-[18px] leading-[1.45] text-ink [font-variation-settings:'opsz'_24]">
            <span className="m-hl" data-c={pick.color && pick.color !== "yellow" ? pick.color : undefined}>
              {pick.anchor.quote.trim()}
            </span>
          </blockquote>
          {pick.note && <p className="mt-1.5 truncate text-[13.5px] text-ink-2">{pick.note}</p>}
          <p className="desk-source">
            <span className="truncate">
              {tidyTitle(src.title)}
              {src.author ? `, ${src.author}` : ""}
            </span>
            <ArrowRight size={13} className="desk-source-go" aria-hidden />
          </p>
        </Link>
        <div className="flex shrink-0 flex-col items-stretch justify-center gap-1.5 border-l border-rule ps-5 max-sm:flex-row max-sm:border-l-0 max-sm:border-t max-sm:ps-0 max-sm:pt-3">
          <button
            type="button"
            onClick={() => updateHighlight(pick.articleId, pick.id, { review: keepInRotation(pick) })}
            data-tip="قايتا كۆرسىتىپ تۇرۇش"
            data-tip-hint="بىر نەچچە كۈندىن كېيىن، ئاندىن ئازراق"
            className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-bg transition-transform active:scale-[0.97]"
          >
            كېيىنكى
          </button>
          <button
            type="button"
            onClick={() => updateHighlight(pick.articleId, pick.id, { review: retire(pick) })}
            data-tip="بۇنى تاماملىدىم"
            data-tip-hint="بەلگە بولۇپ قالىدۇ، ئەمما تەكرارلاشتىن چىقىدۇ"
            className="h-9 rounded-full px-4 text-[13px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
          >
            تاماملاندى
          </button>
        </div>
      </div>
    </Desk>
  );
}
