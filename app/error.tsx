"use client";

import Link from "next/link";
import { GlossMark } from "@/components/brand/Gloss";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="relative z-[1] grid min-h-dvh place-items-center px-6 text-center">
      <div className="rise">
        <GlossMark className="mx-auto size-10 text-ink-4" />
        <h1 className="mt-6 font-serif text-[clamp(2rem,5vw,3rem)] font-[380] leading-tight tracking-[-0.02em] text-ink">بەت سىيرىلىپ كەتتى.</h1>
        <p className="mt-3 text-[15px] text-ink-3">خاتىرىلىرىڭىز بۇ توركۆرگۈدە بىخەتەر. قايتا سىناڭ ياكى كۈتۈپخانىدىن باشلاڭ.</p>
        <div className="mt-8 flex justify-center gap-2">
          <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-transform active:scale-[0.97]">
            قايتا سىناش
          </button>
          <Link href="/" className="inline-flex h-11 items-center rounded-full border border-rule px-6 text-[14px] font-medium text-ink-2 hover:border-rule-strong hover:text-ink">
            كۈتۈپخانا
          </Link>
        </div>
      </div>
    </main>
  );
}
