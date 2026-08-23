import { AlertTriangle, CircleHelp } from "lucide-react";

import { unparsedState } from "@/lib/unparsed-display";
import { cn } from "@/lib/utils";

/**
 * B36 -- the count of rows **on this page** whose `confidence` could not be
 * classified, following `@/lib/unparsed-display`'s rule to the letter: the
 * three states stay three, and an unread count never renders as `0`.
 *
 * ## Why this is not `<ListingUnparsed>` and not the shell's `<UnparsedCount>`
 *
 * `@/components/unparsed-count` (FR-58) counts `work_item`, `defect` and
 * `test_result` -- it is silent on `open_question` entirely, so it cannot
 * stand in for this number. `@/app/work-items/_components/listing-unparsed`
 * is that screen's own per-page count and lives under a route this unit does
 * not own. Both would be the wrong badge showing the wrong number, so this is
 * a third, narrow component that borrows the *display rule* -- three states,
 * never a false zero -- and states plainly what it is counting.
 *
 * `confidence` reads `null` for two reasons the schema cannot tell apart: the
 * fleet never stated one, or it stated something (`"medium"`, a prose
 * sentence) that `toConfidence` in `@/lib/server/ingest/mapping.ts` correctly
 * refused to round to `low | med | high`. Both are "not classified", and this
 * badge names that fact rather than guessing which of the two applies to any
 * one row.
 */
export function UnclassifiedConfidence({ count }: { count: number | null }) {
  const state = unparsedState(count);

  return (
    <span
      data-verify-unit="unclassified-confidence"
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
        ? "confidence classification unavailable"
        : `${count as number} with unclassified confidence`}
    </span>
  );
}
