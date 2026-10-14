"use client";

import Link from "next/link";
import { Library } from "lucide-react";
import { Account } from "@/components/account/Account";
import { Lockup } from "@/components/brand/Gloss";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { SettingsMenu } from "@/components/ui/SettingsMenu";

/**
 * The bar across the top of the home page and the library: the same pieces in
 * the same places on both, so moving between them never shifts anything.
 */
export function TopBar({ here, onLibrary }: { here?: "library"; onLibrary?: () => void }) {
  return (
    <header className="relative z-20 mx-auto flex h-[var(--topbar-h)] w-full max-w-[1400px] shrink-0 items-center justify-between px-5 max-[380px]:px-4 sm:px-8">
      <Lockup />
      <nav aria-label="ئاساسىي" className="flex items-center gap-1 max-[380px]:gap-0">
        <Link
          href="/library"
          aria-current={here === "library" ? "page" : undefined}
          onClick={(e) => {
            if (!onLibrary) return;
            e.preventDefault();
            onLibrary();
          }}
          className="me-1 inline-flex h-9 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink max-sm:w-9 max-sm:justify-center max-sm:px-0"
        >
          <Library size={17} />
          <span className="max-sm:hidden">كۈتۈپخانا</span>
        </Link>
        <SettingsMenu compact />
        <KeyMenu />
        <Account />
      </nav>
    </header>
  );
}
