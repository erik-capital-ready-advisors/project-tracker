import { AlertTriangle, Info } from "lucide-react";

import type { RejectedFilter } from "@/lib/answer-query";
import { cn } from "@/lib/utils";

/**
 * The three things an answer screen has to say when it is not saying the answer.
 *
 * Each of them exists because the silent alternative produces a wrong answer
 * that looks like a right one — the failure mode this whole product is built
 * against — and each is drawn in a colour that is deliberately **not** fuchsia.
 * `unparsed` owns fuchsia and nothing else does; u4 shipped a rejected-filter
 * panel in it, found it by running the app and looking, and fixed it. This unit
 * inherits that finding rather than repeating it.
 */

/* ---------------------------------------------------------------------- */

/**
 * Filter values the URL carried that no closed set recognises.
 *
 * The list below is **not** narrowed by them, so it is showing more rows than
 * were asked for. Saying so is the whole point: quietly dropping `?severity=crit`
 * renders every severity under a heading that claims to be filtered.
 *
 * Amber (`state-carried`), matching u4's panel on `/work-items`, so the two
 * surfaces say the same thing the same way.
 */
export function RejectedFilters({
  rejected,
}: {
  rejected: readonly RejectedFilter[];
}) {
  if (rejected.length === 0) return null;

  return (
    <output
      data-verify-unit="rejected-filters"
      data-verify-count={rejected.length}
      className="border-state-carried/40 bg-state-carried/5 block rounded-lg border px-3 py-2.5 text-sm"
    >
      {/* COPY: headline for filter values the system did not recognise */}
      <p className="text-foreground font-medium">
        Some filters were not applied.
      </p>
      <ul className="text-muted-foreground mt-1 space-y-0.5">
        {rejected.map((one) => (
          <li key={`${one.field}:${one.value}`} className="ident text-xs">
            {one.field}={one.value}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {/* COPY: explanation that an unrecognised filter is reported, not ignored */}
        The answer below is not narrowed by them. It is showing more than you
        asked for, which is why this says so rather than quietly dropping them.
      </p>
    </output>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * An answer whose **ordering or ranking** is not the one its requirement
 * specifies.
 *
 * FR-53 orders Next by the nearest dated milestone; FR-56 ranks Bottleneck by
 * that plus downstream work. Both need `contract_milestone.due_date`, and both
 * degrade rather than refuse when it cannot be read — the payload carries
 * `ordering` / `ranking` and a stated reason instead of a different order
 * wearing the requirement's name.
 *
 * **That degradation has to reach the screen.** Erik acts on the top row. A list
 * sorted by something else while presented as "what to do next" is a wrong
 * answer he cannot see is wrong, which is strictly worse than no list.
 */
export function DegradedOrderNotice({
  reason,
  what,
}: {
  /** The payload's own sentence, which names the requirement and the cause. */
  reason: string;
  /** `"ordering"` or `"ranking"`, so the notice names what degraded. */
  what: "ordering" | "ranking";
}) {
  return (
    <output
      data-verify-unit="degraded-order"
      data-verify-what={what}
      className="border-state-carried/40 bg-state-carried/5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
    >
      <AlertTriangle
        aria-hidden
        className="text-state-carried mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <p className="text-foreground font-medium">
          {/* COPY: headline for a degraded ordering or ranking */}
          {what === "ordering"
            ? "This list is not in the order the requirement specifies."
            : "This list is not ranked the way the requirement specifies."}
        </p>
        <p className="text-muted-foreground mt-0.5">{reason}</p>
      </div>
    </output>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * Named read failures that did not fail the whole answer.
 *
 * `committedAnswer` returns these when a release index could not be read: the
 * milestones are still computed, but their requirements are reported as *not
 * shipped*, and that may be wrong. An empty shipped set and an unreadable one
 * look identical on the row, so the difference is stated here instead.
 *
 * The same reasoning as the `null` unparsed count, one level up: a partial
 * answer is fine, a partial answer presented as complete is not.
 */
export function AnswerWarnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;

  return (
    <output
      data-verify-unit="answer-warnings"
      data-verify-count={warnings.length}
      className="border-state-blocked/40 bg-state-blocked/5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
    >
      <AlertTriangle
        aria-hidden
        className="text-state-blocked mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <p className="text-foreground font-medium">
          {/* COPY: headline for parts of the answer that could not be read */}
          Part of this answer could not be read.
        </p>
        <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    </output>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * "That engagement slug matches nothing in the ledger."
 *
 * `engagementUnknown` exists because an engagement with no rows and an
 * engagement that does not exist produce byte-identical empty answers, and only
 * one of them means Erik mistyped a slug. Rendering the ordinary empty state for
 * both would report a clean engagement that is not there.
 */
export function UnknownEngagementNotice({ slug }: { slug: string }) {
  return (
    <output
      data-verify-unit="unknown-engagement"
      data-verify-slug={slug}
      className="border-border bg-muted/40 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
    >
      <Info aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-foreground font-medium">
          {/* COPY: headline for an engagement slug that matches no record */}
          No engagement has the slug <span className="ident">{slug}</span>.
        </p>
        <p className="text-muted-foreground mt-0.5">
          {/* COPY: explanation that this is not the same as an engagement with no rows */}
          This is empty because nothing matched the name, not because that
          engagement has nothing in it.
        </p>
      </div>
    </output>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * A small strip of counts that explain a short list.
 *
 * Next and Bottleneck both set candidates aside for stated reasons — held by a
 * dependency, held by a blocker, status could not be classified — and a list of
 * three rows with no explanation reads as a quiet week rather than as a blocked
 * one. `unparsed` counts among these get the reserved colour, because that is
 * what they are.
 */
export function SetAsideCounts({
  counts,
  className,
}: {
  counts: readonly { label: string; value: number; unparsed?: boolean }[];
  className?: string;
}) {
  return (
    <div
      data-verify-unit="set-aside"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs",
        className,
      )}
    >
      {counts.map((one) => (
        <span
          key={one.label}
          data-verify-unit="set-aside-count"
          data-verify-label={one.label}
          data-verify-count={one.value}
          className={cn(
            "ident",
            one.unparsed === true && one.value > 0
              ? "text-state-unparsed font-semibold"
              : undefined,
          )}
        >
          {one.value} {one.label}
        </span>
      ))}
    </div>
  );
}
