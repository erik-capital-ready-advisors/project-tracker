import { EntityRefList } from "@/components/entity-ref";
import type { RunDefects } from "@/lib/runs-load";

import { Gap } from "./gap";

/**
 * FR-93's *"the defects it opened"*, answered honestly.
 *
 * ## The distinction this section exists to draw
 *
 * *"This run opened no defects"* and *"nothing in this ledger records which run
 * opened a defect"* are different statements, and only the second is true. The
 * first is a wrong `done` — a sentence nothing checked, rendered as a finding —
 * which is the single output this product exists to prevent. An `<EmptyState>`
 * here would produce it, and would look like a finished screen while doing so.
 *
 * `i1` typed the field `opened: null` rather than `DetailRef[]` for exactly this
 * reason: a UI handed `[]` writes the first sentence without having to decide
 * to. There is no array to map, so the only thing this component can render is
 * the second sentence, and the type is what guarantees it.
 *
 * ## The measured reason, which is what the copy states
 *
 * `defect` carries no run column at all. Its only path to a `fleet_run` is
 * `fixing_work_item_id -> work_item -> fleet_run`, and that edge says a run
 * **fixed** a defect — a different claim from **opened**. Measured 2026-08-23:
 * `fixing_work_item_id` is NULL on all 13 defect rows, so even the edge that
 * does exist carries nothing today.
 *
 * The edge was not inferred from `reported_by`, `source_key`, `ref` prefixes or
 * timestamp proximity to the run window. Any of those would be the
 * regex-widening failure under a different name: a number that went up because
 * the pattern got looser, not because the ledger learned anything.
 *
 * ## `fixed` is a real empty state, and is drawn as one
 *
 * The two halves of this section are deliberately not the same treatment. The
 * `fixed` list was genuinely queried against an edge the schema models, and it
 * genuinely came back empty — so it renders as `<Absent>` with a stated reason,
 * the ordinary treatment for a list this product looked at and found nothing
 * in. `opened` renders as a `Gap`, which is what the product uses when it could
 * not look. Giving both the same treatment would erase the only fact this
 * section has to offer.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-defects"
 *   data-verify-opened-available  "false" on every run, today and structurally
 *   data-verify-opened-reason     the typed code from i1's `RunDefects`
 *   data-verify-fixed             how many defects this run's work items fixed
 */

/** Written once, from the typed code. The UI owns the sentence; `i1` owns the code. */
const OPENED_UNAVAILABLE: Record<RunDefects["openedUnavailable"], string> = {
  no_opened_by_edge:
    "Nothing in this ledger records which run opened a defect. The `defect` table carries no run column, and the one edge that does exist — a work item named as a defect's fix — says a run repaired something, which is a different claim. An empty list here would state that this run opened none; nothing checked that, so nothing states it.",
};

export function RunDefects({ defects }: { defects: RunDefects }) {
  return (
    <div
      data-verify-unit="run-defects"
      data-verify-opened-available="false"
      data-verify-opened-reason={defects.openedUnavailable}
      data-verify-fixed={defects.fixed.length}
      className="flex flex-col gap-3 px-4 py-3"
    >
      <Gap
        field="defects-opened"
        headline="which defects this run opened is not recorded"
        detail={OPENED_UNAVAILABLE[defects.openedUnavailable]}
      />

      <div className="flex flex-col gap-1.5">
        <h3 className="text-muted-foreground text-xs font-semibold">
          Fixed by this run&rsquo;s work
        </h3>
        <div className="text-xs">
          <EntityRefList
            refs={defects.fixed}
            empty="No defect in the ledger names one of this run's work items as its fix. This edge is modelled and was queried; it is empty."
          />
        </div>
        <p className="text-muted-foreground max-w-2xl text-xs">
          Defects whose recorded fix is one of this run&rsquo;s work items. This
          is the only run-to-defect edge the schema holds, and it answers a
          different question from the one above.
        </p>
      </div>
    </div>
  );
}
