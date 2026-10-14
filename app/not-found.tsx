import Link from "next/link";
import { GlossMark } from "@/components/brand/Gloss";

export default function NotFound() {
  return (
    <main className="relative z-[1] grid min-h-dvh place-items-center px-6 text-center">
      <div className="rise">
        <GlossMark className="mx-auto size-10 text-ink-4" />
        <h1 className="mt-6 font-serif text-[clamp(2rem,5vw,3rem)] font-[380] leading-tight tracking-[-0.02em] text-ink">بۇ يەرگە ھېچنېمە يېزىلمىغان.</h1>
        <p className="mt-3 text-[15px] text-ink-3">بۇ بەت ھەممە نەشرىدە بوش.</p>
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-transform active:scale-[0.97]">
          Gloss غا قايتىش
        </Link>
      </div>
    </main>
  );
}
