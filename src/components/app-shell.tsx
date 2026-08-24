import Link from "next/link";
import type { ReactNode } from "react";

import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/command-palette";
import { EngagementScope } from "@/components/engagement-scope";
import { MainNav } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
// `import type` and not a value import, deliberately. `@/lib/engagement-roster`
// is `server-only` and pulls the service-role client and the `'use server'`
// registry module into whatever imports it; this file has a test, and that test
// should not drag a database client into its module graph to render a header.
import type { EngagementRoster } from "@/lib/engagement-roster";

/**
 * The app shell. Spec 5a asks for an instrument panel read in ten-second
 * glances, so the chrome is deliberately thin: a fixed rail of destinations, a
 * header that always states the unparsed count, and nothing else competing for
 * the eye.
 *
 * The `UnparsedCount` lives HERE rather than on each screen. FR-58 requires it
 * on every surface, and mounting it in the shell is what makes that structural
 * instead of a rule six screens have to remember.
 *
 * FR-96b makes the same argument for the engagement picker and reaches the same
 * place: one picker in the chrome rather than eleven copies on eleven screens.
 * Both now render through `<EngagementScope>`, which is one client boundary
 * reading one fact — whether a filter is active — so the control and the badge
 * cannot disagree about it.
 */
export function AppShell({
  children,
  unparsedCount,
  // Defaulted inline rather than to `ROSTER_GATED`, so this file keeps a
  // type-only dependency on the server module. Same meaning: no roster was
  // supplied, so offer no picker — which is what a caller who did not read one
  // is entitled to, and is NOT the claim that a read failed.
  roster = { status: "gated" },
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
  /**
   * FR-96b. The active engagements the shell picker offers, read once per
   * request in the root layout by `readEngagementRoster()`.
   *
   * Three states, and the distinctions are load-bearing. `gated` is a caller
   * who may not read the ledger and gets no picker; `unavailable` is an
   * operator whose read FAILED, which still renders so a filter already in the
   * URL can be cleared; `ok` with an empty list states that Erik has registered
   * no engagements. Collapsing a failed read into the last one would make it
   * look like an empty ledger, which is the same move as rendering `0` for an
   * unread unparsed count.
   */
  roster?: EngagementRoster;
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
          {/* `flex-wrap` rather than overflow. The header now carries the
              picker as well as the badge, and at 375px the badge alone once
              pushed the header 46px past the viewport on every route (see
              `unparsedShortLabel`). Wrapping to a second line is the honest
              failure mode for a control that must reach mobile; a horizontal
              scrollbar on a ten-second-glance dashboard is not. */}
          <header className="border-border bg-background/80 sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 backdrop-blur">
            <MobileNav />
            <CommandPaletteTrigger />
            {/* `flex-wrap` here as well as on the header, and it was earned by
                measurement rather than caution. At 375px with the picker
                mounted and FR-96a's "3 unparsed (whole ledger)" label showing,
                the badge -- which is `min-w-0 whitespace-nowrap`, so it shrinks
                below its content and does not reflow -- had its last word
                running underneath the theme toggle. Wrapping the cluster gives
                the badge its own line instead. Truncating it was the smaller
                change and is the one `unparsedShortLabel` already rejects: the
                clipped words are the ones carrying the meaning. */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {/* FR-58 + FR-96a + FR-96b. See EngagementScope for why the
                  picker and the count are one client boundary. */}
              <EngagementScope
                unparsedCount={unparsedCount ?? null}
                roster={roster}
              />
              <ThemeToggle />
              {/* B40: the header renders on every route and breakpoint (the
                  sidebar rail is desktop-only, `hidden md:block`; this is
                  not), so mounting the control here is what makes it reach
                  mobile without a second copy in MobileNav. */}
              <SignOutButton />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
