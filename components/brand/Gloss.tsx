import Link from "next/link";
import { TogetherLink } from "./Together";

/** Lines of text with a note in the margin: the whole idea in 24px. */
export function GlossMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M3 6.5h10.5M3 11.5h10.5M3 16.5h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 3v18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.32" />
      <circle cx="18.5" cy="11.5" r="2.9" fill="var(--rubric)" />
    </svg>
  );
}

/**
 * The wordmark. The serif's line box is set to its own size and nudged so
 * the word's cap height is centered on the mark and the Together logo.
 */
export function GlossWordmark() {
  return (
    <span className="flex h-9 items-center gap-[7px] text-ink">
      <GlossMark className="size-[21px] shrink-0" />
      <span className="block translate-y-[2px] font-serif text-[21px] font-[440] leading-[21px] tracking-[-0.018em] [font-variation-settings:'opsz'_36]">
        Gloss
      </span>
    </span>
  );
}

/** The app's mark, a hairline, then Together as the maker. */
export function Lockup({ href = "/" }: { href?: string }) {
  return (
    <div className="flex h-9 items-center gap-3.5 max-[380px]:gap-2.5">
      <Link href={href} aria-label="Gloss، كۈتۈپخانىڭىزغا قايتىش" className="rounded-md">
        <GlossWordmark />
      </Link>
      <span aria-hidden className="h-[18px] w-px bg-rule-strong" />
      <TogetherLink />
    </div>
  );
}
