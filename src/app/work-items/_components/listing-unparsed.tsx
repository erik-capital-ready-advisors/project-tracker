import { AlertTriangle, CircleHelp } from "lucide-react";

import { unparsedState } from "@/lib/unparsed-display";
import { cn } from "@/lib/utils";

/**
 * The unparsed count **for the page of rows on screen**, which is a different
 * fact from the shell's badge and is deliberately shaped so nobody mistakes one
 * for the other.
 *
 * ## Why this is not a second `UnparsedCount`
 *
 * `@/components/unparsed-count` is FR-58's global badge, mounted once in the app
 * shell so that every screen reports the ledger's count without each screen
 * having to remember. Rendering a second one here would put two identical
 * fuchsia badges in one viewport showing two different numbers -- the
 * miniature of the failure this whole product exists to end, which is Erik
 * merging two lists in his head. It also breaks the shell's own state contract,
 * which assumes one element per page.
 *
 * So this borrows the *rule* and not the component: the display semantics come
 * from `@/lib/unparsed-display`, so the three states stay three, and it carries
 * its own `data-verify-unit` because it is answering a narrower question.
 *
 * ## The three states, again, because this is where they are easiest to lose
 *
 *   unknown  nothing was read. Says so. Never renders as `0`.
 *   zero     every row on this page classified. A claim, stated deliberately.
 *   nonzero  fuchsia, because fuchsia means `unparsed` and nothing else.
 */
export function ListingUnparsed({ count }: { count: number | null }) {
  const state = unparsedState(count);

  return (
    <span
      data-verify-unit="listing-unparsed"
      data-verify-state={state}
      {...(state === "unknown" ? {} : { "data-verify-count": count as number })}
      className={cn(
        "ident inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none whitespace-nowrap",
        state === "zero" && "border-border text-muted-foreground",
        state === "nonzero" &&
          "border-state-unparsed/40 bg-state-unparsed/10 text-state-unparsed font-semibold",
        state === "unknown" &&
          "border-state-blocked/40 bg-state-blocked/10 text-state-blocked border-dashed",
      )}
    >
      {state === "nonzero" ? (
        <AlertTriangle aria-hidden className="size-3.5" />
      ) : null}
      {state === "unknown" ? (
        <CircleHelp aria-hidden className="size-3.5" />
      ) : null}
      {state === "unknown"
        ? "unparsed count unavailable for this page"
        : `${count as number} unparsed on this page`}
    </span>
  );
}
