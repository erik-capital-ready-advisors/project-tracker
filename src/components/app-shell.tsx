import Link from "next/link";
import type { ReactNode } from "react";

import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/command-palette";
import { MainNav } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UnparsedCount } from "@/components/unparsed-count";

/**
 * The app shell. Spec 5a asks for an instrument panel read in ten-second
 * glances, so the chrome is deliberately thin: a fixed rail of destinations, a
 * header that always states the unparsed count, and nothing else competing for
 * the eye.
 *
 * The `UnparsedCount` lives HERE rather than on each screen. FR-58 requires it
 * on every surface, and mounting it in the shell is what makes that structural
 * instead of a rule six screens have to remember.
 */
export function AppShell({
  children,
  unparsedCount,
}: {
  children: ReactNode;
  /**
   * `null` means the count has not been read. It renders as
   * "unparsed count unavailable", never as 0.
   *
   * DATA: wire to the live unparsed count once the ingest tables exist
   * (work-unit i1 for schema, i2 for the parsers). Until then the honest value
   * is unknown -- passing 0 here would assert that everything classified, which
   * is the one claim this product must never make without checking.
   */
  unparsedCount?: number | null;
}) {
  return (
    <div className="min-h-dvh">
      <CommandPalette />

      <div className="mx-auto flex min-h-dvh w-full max-w-[1400px]">
        <aside className="border-border hidden w-56 shrink-0 border-r px-3 py-4 md:block">
          <Link
            href="/"
            className="mb-6 flex items-baseline gap-2 px-2.5"
            data-verify-unit="app-home-link"
          >
            <span className="text-sm font-semibold tracking-tight">
              Delivery Ledger
            </span>
          </Link>
          <MainNav />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border bg-background/80 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
            <MobileNav />
            <CommandPaletteTrigger />
            <div className="ml-auto flex items-center gap-2">
              {/* FR-58: stated on every surface, because the shell wraps them all. */}
              <UnparsedCount count={unparsedCount ?? null} />
              <ThemeToggle />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
