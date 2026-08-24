import { TriangleAlert } from "lucide-react";

import { UnknownEngagementNotice } from "@/components/answer-notices";
import type { EngagementResolution } from "@/lib/engagement-filter";

/**
 * FR-96c, as one element a screen renders instead of a branch it writes.
 *
 * ## Why the two unresolvable states are one component
 *
 * A screen has to do two things when the engagement filter cannot be applied:
 * say which of the two happened, and **show no rows**. Those are easy to get
 * half right — `unresolved` is the memorable one, and a screen that branched on
 * it alone falls back to the unfiltered list the moment the engagement read
 * fails. Pairing them here means a screen renders `<EngagementScopeNotice>` and
 * guards its rows with `engagementScopeBlocksRows`, and the two cannot drift
 * apart into a screen that looks scoped while showing everything.
 *
 * ## Why `unavailable` does not reuse FR-96c's wording
 *
 * "No engagement has the slug `acmee`" is a positive claim about the ledger. On
 * a request where the engagement read **failed**, nothing established it — the
 * same move as rendering `0` for an unread unparsed count, which
 * `@/lib/unparsed-display` already refuses for a number. So the two states get
 * two sentences, and only one of them is FR-96c's.
 *
 * `UnknownEngagementNotice` is not re-worded here: the six answer screens have
 * rendered it since M2.7 and a second wording for one requirement is how two
 * screens start disagreeing about what a filter did.
 *
 * ## State contract for qa-reviewer
 *
 *   data-verify-unit="unknown-engagement"      (FR-96c — from `UnknownEngagementNotice`)
 *   data-verify-slug="<slug>"
 *   data-verify-unit="engagement-scope-unavailable"
 *   data-verify-slug="<slug>"
 *
 * Neither element carries a row, a count, or anything from a `sensitive`
 * column. The slug is `engagement`'s clear grouping key under §7a's stated
 * exception, and it is the value the reader typed into the URL themselves.
 */
export function EngagementScopeNotice({
  resolution,
}: {
  resolution: EngagementResolution;
}) {
  if (resolution.kind === "unresolved") {
    return <UnknownEngagementNotice slug={resolution.slug} />;
  }

  if (resolution.kind === "unavailable") {
    return (
      <output
        data-verify-unit="engagement-scope-unavailable"
        data-verify-slug={resolution.slug}
        className="border-state-blocked/40 bg-state-blocked/5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
      >
        <TriangleAlert
          aria-hidden
          className="text-state-blocked mt-0.5 size-4 shrink-0"
        />
        <div className="min-w-0">
          {/* COPY: FR-96c's sibling — the engagement read failed, so the filter
              could not be applied and no rows are shown */}
          <p className="text-foreground font-medium">
            The engagement <span className="ident">{resolution.slug}</span>{" "}
            could not be looked up, so this list is not shown.
          </p>
          <p className="text-muted-foreground mt-0.5">
            This is not the claim that no such engagement exists — nothing
            checked. Retry; the unfiltered list is one click away by clearing the
            filter.
          </p>
        </div>
      </output>
    );
  }

  return null;
}
