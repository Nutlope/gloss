"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { SignInButton } from "@clerk/nextjs";
import { tidyTitle } from "@/lib/article";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";
import { todaysReview } from "@/lib/review";
import { DailyHighlight } from "./DailyHighlight";
import { Desk, DeskLink } from "./Desk";

const RECENT = 3;

const STEPS = [
  { title: "ئۇلانما چاپلاڭ", body: "ماقالە، باب ياكى PDF." },
  { title: "خالىغان قۇرنى تاللاڭ", body: "بىر سۆز، بىر جۈملە، بىر بۆلەك." },
  { title: "خالىغاننى سوراڭ", body: "جاۋاب تېكىستنى نەقىل قىلىپ ھاشىيەدە پەيدا بولىدۇ." },
];

function SignInLine({ children }: { children: string }) {
  return (
    <>
      {children}{" "}
      <SignInButton mode="modal">
        <button type="button" className="font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
          كىرىش
        </button>
      </SignInButton>
    </>
  );
}

/**
 * What lies on the desk. With highlights, they are yours: today's review while
 * one is due, otherwise the lines you marked last. Before that, how it works.
 */
export function HomeBelow({ signedIn }: { signedIn: boolean }) {
  const hydrated = useStore((s) => s.hydrated);
  const highlights = useStore((s) => s.highlights);
  const library = useStore((s) => s.library);
  const setUI = useStore((s) => s.setUI);

  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of SAMPLES) m.set(a.id, a.title);
    for (const x of library) m.set(x.id, x.title);
    return m;
  }, [library]);

  const all = useMemo(
    () =>
      Object.values(highlights)
        .flat()
        .filter((h) => titleOf.has(h.articleId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [highlights, titleOf]
  );

  // Held open at its full size until the shelf is read, so nothing shifts when it fills.
  if (!hydrated) return <div className="desk is-holding" aria-hidden />;

  const foot = signedIn ? null : <SignInLine>{all.length ? "بۇلار پەقەت بۇ توركۆرگۈدە ساقلىنىدۇ." : "بەلگىلىرىڭىزنى ھەممە ئۈسكۈنىدە ساقلاڭ."}</SignInLine>;

  // Before any highlights: Hassan's three steps, for first-timers and anyone signed out.
  if (!all.length)
    return (
      <Desk label="قانداق ئىشلەيدۇ" foot={foot}>
        <ol className="desk-tiles">
          {STEPS.map((s, i) => (
            <li key={s.title} className="desk-tile is-step" style={{ ["--i" as string]: i }}>
              <span className="desk-step-n">{i + 1}</span>
              <p className="mt-3 text-[14.5px] font-medium text-ink">{s.title}</p>
              <p className="mt-1 text-[13.5px] leading-[1.42] text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </Desk>
    );

  if (todaysReview(all).deck.length > 0) return <DailyHighlight foot={foot} />;

  return (
    <Desk label="ئەڭ يېڭى بەلگىلىرىڭىز" aside={<DeskLink onClick={() => setUI({ shelf: "highlights" })}>{`All ${all.length}`}</DeskLink>} foot={foot}>
      <ol className="desk-tiles">
        {all.slice(0, RECENT).map((h, i) => (
          <li key={h.id} style={{ ["--i" as string]: i }}>
            <Link href={`/read/${h.articleId}?hl=${h.id}`} className="desk-tile is-quote">
              <p className="line-clamp-3 font-serif text-[15.5px] leading-[1.5] text-ink [font-variation-settings:'opsz'_20]">
                <span className="m-hl" data-c={h.color && h.color !== "yellow" ? h.color : undefined}>
                  {h.anchor.quote.trim()}
                </span>
              </p>
              <p className="desk-source">
                <span className="truncate">{tidyTitle(titleOf.get(h.articleId)!)}</span>
                <ArrowRight size={13} className="desk-source-go" aria-hidden />
              </p>
            </Link>
          </li>
        ))}
        {/* Fewer than three: the room left keeps the row's shape. */}
        {all.length < RECENT && (
          <li className="desk-tile is-room" style={{ ["--i" as string]: all.length, gridColumn: `span ${RECENT - all.length}` }}>
            ئوقۇغان ھەرقانداق نەرسىدە بىر قۇرنى تاللاڭ، ئۇ بۇ يەردە سىزنى كۈتىدۇ.
          </li>
        )}
      </ol>
    </Desk>
  );
}
