import { AlertTriangle, CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  unparsedLabel,
  unparsedShortLabel,
  unparsedState,
  unparsedVerifyCount,
  unparsedVerifyScope,
  type UnparsedScopeNote,
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
 * FR-96a adds a fourth thing it can say. The count is ledger-wide and stays
 * ledger-wide under an engagement filter; when one is active the label states
 * that -- "3 unparsed (whole ledger)". Scoping the number to the filter would
 * hang a silently-changed count over eleven screens; leaving it unlabelled
 * would let a ledger-wide number read as a scoped one, which is the M2.8
 * disagreement (badge 0, run `b0952e` 1) one layer up.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="unparsed-count"
 *   data-verify-state="zero" | "nonzero" | "unknown"
 *   data-verify-count="<n>"   (absent when the state is unknown)
 *   data-verify-scope="none" | "whole-ledger"   (FR-96a)
 */
export function UnparsedCount({
  count,
  scope = "none",
  className,
}: {
  /** `null` means "not read yet". It is NOT the same as 0 and never renders as 0. */
  count: number | null | undefined;
  /**
   * FR-96a. `"whole-ledger"` when an engagement filter is active on the screen
   * below, which makes the label say what the number counted. The count itself
   * is unchanged either way -- this prop labels a scope, it never narrows one.
   */
  scope?: UnparsedScopeNote;
  className?: string;
}) {
  const state = unparsedState(count);
  const label = unparsedLabel(count, scope);
  const shortLabel = unparsedShortLabel(count, scope);
  const verifyCount = unparsedVerifyCount(count);
  const verifyScope = unparsedVerifyScope(count, scope);

  return (
    // <output> carries an implicit ARIA role of `status`, so this announces to
    // a screen reader without an explicit role attribute.
    <output
      aria-live="polite"
      title={
        state === "unknown"
          ? "The number of records the system could not classify is not available."
          : verifyScope === "whole-ledger"
            ? "Records the system could not classify, across the whole ledger. This count is never narrowed by the engagement filter."
            : "Records the system could not classify. Every screen reports this."
      }
      data-verify-unit="unparsed-count"
      data-verify-state={state}
      data-verify-scope={verifyScope}
      {...(verifyCount === null ? {} : { "data-verify-count": verifyCount })}
      className={cn(
        "ident inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none whitespace-nowrap transition-colors",
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
      {/*
        Two spellings of the same statement, one per breakpoint. Only the
        `unknown` state actually differs between them — the other two are
        already short — so this costs nothing except at the width where the full
        sentence does not fit.

        `display: none` is not announced, so a screen reader reads exactly one
        of them at any width. The `data-verify-*` contract above is unchanged
        and unconditional, so no assertion depends on which one is showing.
      */}
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </output>
  );
}
