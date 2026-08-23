import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A value the ledger does not hold, stated in words rather than drawn as one.
 *
 * ## Why this is not `<Absent>`
 *
 * `answer-chips`' `Absent` is a quiet em dash carrying its reason on hover, and
 * it is right for a nullable column on one row: no evidence scope was recorded,
 * no answerer was named. Three values on this screen are a different fact and
 * must not borrow that treatment:
 *
 *   * `dispatch_cap` / `dispatches_used` — **no producer anywhere in the
 *     product** writes either column, so `unknown` is not a degraded branch, it
 *     is the only branch that will ever run and it would look correct forever.
 *   * the test triple — the artifact stated no counts. `0 / 0 / 0` would assert
 *     that a suite ran and found nothing.
 *   * a run's defects — see `run-defects.tsx`. Nothing in the ledger can say
 *     which run opened one.
 *
 * All three are the same shape: **a reader would otherwise read the absence as
 * a finding.** An em dash beside "dispatches" reads as "none used"; this reads
 * as "nobody recorded it", which is what is true.
 *
 * ## The treatment is borrowed, not invented
 *
 * Dashed, `state-blocked` family, `CircleHelp` glyph — exactly
 * `@/components/unparsed-breakdown`'s `unknown` state and
 * `@/components/entity-detail`'s `unreadable` identifier. §5a's palette is
 * approved and this unit adds no token to it. Deliberately **not**
 * `state-unparsed`: fuchsia means "the system could not classify this", and a
 * column nobody ever wrote parsed nothing to fail at.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-gap"
 *   data-verify-field   which value is missing
 */
export function Gap({
  field,
  headline,
  detail,
  inline,
}: {
  /** Machine key for the missing value. Never prose. */
  field: string;
  /** The short statement, read at a glance. */
  headline: string;
  /** Why, in one or two sentences. Always says what the absence is NOT. */
  detail: string;
  /** Renders as a single line for a `DetailField` cell rather than a block. */
  inline?: boolean;
}) {
  if (inline === true) {
    return (
      <span
        data-verify-unit="run-gap"
        data-verify-field={field}
        title={detail}
        className="text-state-blocked ident inline-flex items-center gap-1.5 text-xs"
      >
        <CircleHelp aria-hidden className="size-3.5 shrink-0" />
        {headline}
      </span>
    );
  }

  return (
    <div
      data-verify-unit="run-gap"
      data-verify-field={field}
      className={cn(
        "border-state-blocked/40 bg-state-blocked/5 text-state-blocked",
        "flex flex-col gap-1 rounded-lg border border-dashed px-3 py-2.5 text-xs",
      )}
    >
      <span className="ident inline-flex items-center gap-1.5 font-semibold">
        <CircleHelp aria-hidden className="size-3.5 shrink-0" />
        {headline}
      </span>
      <span className="text-muted-foreground max-w-2xl">{detail}</span>
    </div>
  );
}
