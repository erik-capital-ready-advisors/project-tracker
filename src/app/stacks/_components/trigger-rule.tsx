import { StateBadge } from "@/components/state-badge";
import type { TriggerThresholds, UnevaluatedClause } from "@/lib/stacks-load";

/**
 * FR-106 — the trigger rule, **stated on the screen** rather than left for the
 * reader to compute, and Q27's second clause carried as visibly unevaluated.
 *
 * ## Where the numbers come from
 *
 * `thresholds` is `TRIGGER_THRESHOLDS`, the same constant `evaluateTrigger()`
 * compares against. Two copies of `8` — one in a conditional and one in a
 * paragraph — are two copies that can disagree, and the one a reader trusts is
 * the paragraph. So the sentence below is built from the register's own
 * thresholds and there is no literal `2` or `8` in this file.
 *
 * ## Q27 RULED — limb two is unmet in public
 *
 * "Ship limb one, record limb two as visibly UNMET." So the second clause is
 * rendered as a notice on the screen, in the same block as the clause it
 * belongs to, carrying `blockingMilestone.reason` **verbatim** from
 * `rule.ts`. It is not built, not silently dropped, and not worked around.
 *
 * This is the treatment M2.8's three unmet clauses got: listed, not allowed to
 * pass quietly. A reader who has read this block knows the rule they are looking
 * at is one clause of two.
 *
 * ## The badge is an existing scale token, not a new one
 *
 * `not-verified` is one of FR-43's four evidence scopes: zinc, dashed outline,
 * already meaning "nothing observed this". A clause nothing evaluated is the
 * same claim in a different frame, so it takes the same token rather than a new
 * colour. Spec 5a's scale carries one meaning per token across every surface,
 * and the way to keep that true is to spend an existing token on a matching
 * meaning instead of minting a seventeenth.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="trigger-rule"        data-verify-min-engagements,
 *                                           data-verify-min-hours
 *   data-verify-unit="trigger-clause"      data-verify-clause="1" | "2"
 *                                           data-verify-evaluated="true" | "false"
 *   data-verify-unit="limb-two-unmet"      (the Q27 notice)
 */
export function TriggerRule({
  thresholds,
  blockingMilestone,
}: {
  thresholds: TriggerThresholds;
  blockingMilestone: UnevaluatedClause;
}) {
  return (
    <section
      data-verify-unit="trigger-rule"
      data-verify-min-engagements={thresholds.minEngagements}
      data-verify-min-hours={thresholds.minHours}
      aria-labelledby="trigger-rule-heading"
      className="border-border flex flex-col gap-2 rounded-lg border px-4 py-3"
    >
      <h2
        id="trigger-rule-heading"
        className="text-foreground text-sm font-semibold"
      >
        When a stack has earned a specialist
      </h2>

      <p
        data-verify-unit="trigger-clause"
        data-verify-clause="1"
        data-verify-evaluated="true"
        className="text-foreground text-sm"
      >
        <span className="text-muted-foreground ident text-xs">clause 1</span>{" "}
        A stack has earned a specialist when it appears in{" "}
        <strong className="ident font-semibold">
          {thresholds.minEngagements} or more engagements
        </strong>{" "}
        and carries{" "}
        <strong className="ident font-semibold">
          {thresholds.minHours} or more of Erik&rsquo;s hours
        </strong>
        . Every row below states where it sits against both halves.
      </p>

      <div
        data-verify-unit="trigger-clause"
        data-verify-clause="2"
        data-verify-evaluated={blockingMilestone.evaluated}
        className="border-state-not-verified/50 bg-state-not-verified/5 flex flex-col gap-1.5 rounded-md border border-dashed px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground ident text-xs">clause 2</span>
          <StateBadge state="not-verified" />
          <span className="text-foreground text-sm">
            &hellip;or when one engagement&rsquo;s missing agent blocks a dated
            contract milestone.
          </span>
        </div>

        {/*
          The reason is `rule.ts`'s own sentence, rendered verbatim. It is the
          single place this product says why the clause cannot be evaluated, and
          restating it here in different words would be a second copy that can
          drift from the one the data layer holds.
        */}
        <p
          data-verify-unit="limb-two-unmet"
          className="text-muted-foreground text-xs"
        >
          {blockingMilestone.reason}
        </p>

        <p className="text-muted-foreground text-xs">
          So a stack shown as{" "}
          <span className="ident text-foreground">undetermined</span> is not a
          stack this product has established did <em>not</em> earn a specialist.
          It is a stack that failed clause 1, on a screen where clause 2 has
          never run.
        </p>
      </div>
    </section>
  );
}
