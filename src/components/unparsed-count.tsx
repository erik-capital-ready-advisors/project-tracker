import { AlertTriangle, CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  unparsedLabel,
  unparsedState,
  unparsedVerifyCount,
} from "@/lib/unparsed-display";

/**
 * FR-58 -- every screen and every endpoint reports the current `unparsed` count.
 *
 * This is the component through which the system says out loud that it could
 * not classify something. It is mounted in the app shell rather than on the
 * individual screens, so no screen can be built without it.
 *
 * Three visual states, deliberately never two:
 *
 *   zero     quiet, muted, outlined -- "0 unparsed". Rendered, never hidden, so
 *            the absence of a warning is itself a positive statement rather
 *            than an ambiguous blank.
 *   nonzero  loud, fuchsia, filled, with a warning glyph. Fuchsia appears
 *            nowhere else in the product, so this reads as "the system failed
 *            to classify" and never as "this item failed".
 *   unknown  the count could not be read. Rendered in the blocked treatment,
 *            NOT as zero -- see src/lib/unparsed-display.ts for why that
 *            distinction is the whole point.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="unparsed-count"
 *   data-verify-state="zero" | "nonzero" | "unknown"
 *   data-verify-count="<n>"   (absent when the state is unknown)
 */
export function UnparsedCount({
  count,
  className,
}: {
  /** `null` means "not read yet". It is NOT the same as 0 and never renders as 0. */
  count: number | null | undefined;
  className?: string;
}) {
  const state = unparsedState(count);
  const label = unparsedLabel(count);
  const verifyCount = unparsedVerifyCount(count);

  return (
    // <output> carries an implicit ARIA role of `status`, so this announces to
    // a screen reader without an explicit role attribute.
    <output
      aria-live="polite"
      title={
        state === "unknown"
          ? "The number of records the system could not classify is not available."
          : "Records the system could not classify. Every screen reports this."
      }
      data-verify-unit="unparsed-count"
      data-verify-state={state}
      {...(verifyCount === null ? {} : { "data-verify-count": verifyCount })}
      className={cn(
        "ident inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none whitespace-nowrap transition-colors",
        state === "zero" &&
          "border-border text-muted-foreground bg-transparent",
        state === "nonzero" &&
          "border-state-unparsed/40 bg-state-unparsed/10 text-state-unparsed font-semibold",
        state === "unknown" &&
          "border-state-blocked/40 bg-state-blocked/10 text-state-blocked border-dashed",
        className,
      )}
    >
      {state === "nonzero" ? (
        <AlertTriangle aria-hidden className="size-3.5" />
      ) : null}
      {state === "unknown" ? (
        <CircleHelp aria-hidden className="size-3.5" />
      ) : null}
      {label}
    </output>
  );
}
