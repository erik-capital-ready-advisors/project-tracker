import { Absent } from "@/components/answer-chips";
import { EntityRef } from "@/components/entity-ref";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isoDay } from "@/lib/display-format";
import type { RunWorkUnit } from "@/lib/runs-load";
import type { StoredEvidenceScope } from "@/lib/server/workitems/rules";

import {
  DispositionChip,
  EvidenceScopeChip,
  ExecutionModeChip,
  ExecutorChip,
  WorkStatusChip,
} from "@/app/work-items/_components/chips";

/**
 * FR-93's *"its work units and their outcomes"* — 20 rows on the one run in the
 * ledger today.
 *
 * ## The column set is §5a's, and one column of it is missing
 *
 * §5a: *"the manifest work-unit table, and its column set — id, type, executor,
 * depends-on, status — is worth preserving as the shape of a work-item row,
 * because it is already the mental model."* Four of the five are the first four
 * columns here, in that order.
 *
 * **`depends-on` is absent and that is a deviation, not an omission by
 * oversight.** `i1`'s `RunWorkUnit` projection carries no dependency edge —
 * `work_item_dependency` is not joined and `blocker_id` / `external_wait_id` are
 * not selected — and widening that projection is another unit's file, which D6
 * and this unit's brief both put out of bounds. `/work-items` renders the same
 * column as "blocked by" from a listing that does carry those ids, so the fact
 * is one click away per row. Recorded in the build report rather than smoothed
 * over.
 *
 * The columns after the first four exist because a requirement names them and
 * the manifest has no equivalent: disposition (FR-30), evidence scope (FR-43),
 * the not-verified count (FR-43 again), and the dates.
 *
 * ## The chips are imported, not copied
 *
 * These five chips are `/work-items`' and they are imported across the route
 * boundary rather than re-declared here. That is the first cross-route component
 * import in this repository and it is deliberate: the alternative is a second
 * copy of `STATUS_CLASS`'s seven-rung ladder and of `EVIDENCE_STATE`'s four-scope
 * table, and a state scale duplicated per screen stops being a scale — the first
 * thing it stops being able to say is `unparsed`. §5a's instruction for this
 * unit was to reuse the hatched treatment rather than invent a second, and an
 * import is the only way to be sure of that. Named in the build report as a
 * structural decision for Erik.
 *
 * `RunWorkUnit`'s enums are `@/lib/ingest/types`' domain spellings and the chips
 * take the stored ones. Four of the five unions are spelled identically in both
 * and assign directly; `EvidenceScope` is the one that differs (hyphens against
 * underscores), so it goes through the same explicit `STORED_SCOPE` table
 * `work-item-detail-view.tsx` already uses. A `.replace("-", "_")` would produce
 * the right four strings today and a wrong one the moment a member with two
 * hyphens is added — and a wrong evidence scope is a collapsed evidence scope.
 *
 * ## No prose, and the listing is exhaustive
 *
 * `description` and `raw_status` are `bytea` under §7a and `i1`'s projection
 * never selects either, so there is nothing to withhold here. The table renders
 * every row `loadRunDetail` returned and applies no cap of its own: this
 * product's rule is that a listing is exhaustive or it says loudly that it is
 * not, and the count above the table is what states which.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-work-unit-table"  data-verify-count
 *   data-verify-unit="run-work-unit-row"
 *   data-verify-id, data-verify-key, data-verify-status, data-verify-mode,
 *   data-verify-executor-kind, data-verify-evidence, data-verify-disposition
 */

/** FR-43's four scopes, spelled the way Postgres spells them. Exhaustive on purpose. */
const STORED_SCOPE: Record<string, StoredEvidenceScope> = {
  "observed-live": "observed_live",
  "observed-elsewhere": "observed_elsewhere",
  asserted: "asserted",
  "not-verified": "not_verified",
};

export function RunWorkUnitTable({ units }: { units: readonly RunWorkUnit[] }) {
  return (
    <div className="border-border overflow-x-auto border-t">
      <Table
        data-verify-unit="run-work-unit-table"
        data-verify-count={units.length}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">unit</TableHead>
            <TableHead className="whitespace-nowrap">type</TableHead>
            <TableHead className="whitespace-nowrap">mode</TableHead>
            <TableHead className="whitespace-nowrap">executor</TableHead>
            <TableHead className="whitespace-nowrap">status</TableHead>
            <TableHead className="whitespace-nowrap">disposition</TableHead>
            <TableHead className="whitespace-nowrap">evidence</TableHead>
            <TableHead className="whitespace-nowrap">not verified</TableHead>
            <TableHead className="whitespace-nowrap">started</TableHead>
            <TableHead className="whitespace-nowrap">ended</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => {
            const started = isoDay(unit.startedAt);
            const ended = isoDay(unit.endedAt);

            return (
              <TableRow
                key={unit.ref.id ?? unit.ref.label}
                data-verify-unit="run-work-unit-row"
                {...(unit.ref.id === null
                  ? {}
                  : { "data-verify-id": unit.ref.id })}
                data-verify-key={unit.unit ?? "none"}
                data-verify-status={unit.status}
                data-verify-mode={unit.executionMode}
                data-verify-executor-kind={unit.executorKind}
                data-verify-evidence={unit.evidenceScope ?? "not-recorded"}
                data-verify-disposition={unit.disposition ?? "not-recorded"}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  <EntityRef {...unit.ref} />
                  {unit.phase === null ? null : (
                    <span className="text-muted-foreground/70 ml-1.5 text-xs">
                      p{unit.phase}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {unit.workType ?? (
                    <Absent title="No work type was recorded on this row." />
                  )}
                </TableCell>

                <TableCell>
                  <ExecutionModeChip mode={unit.executionMode} />
                </TableCell>

                <TableCell>
                  <ExecutorChip kind={unit.executorKind} executor={unit.executor} />
                </TableCell>

                <TableCell>
                  <WorkStatusChip status={unit.status} />
                </TableCell>

                <TableCell>
                  <DispositionChip disposition={unit.disposition} />
                </TableCell>

                <TableCell>
                  <EvidenceScopeChip
                    scope={
                      unit.evidenceScope === null
                        ? null
                        : (STORED_SCOPE[unit.evidenceScope] ?? null)
                    }
                  />
                </TableCell>

                <TableCell className="ident text-right tabular-nums">
                  {/* A real count, so `0` here is a measurement rather than an
                      unknown rendered as zero — `notVerifiedCount` is
                      non-nullable in i1's type, which is what makes that true. */}
                  {unit.notVerifiedCount === 0 ? (
                    <span className="text-muted-foreground/60">0</span>
                  ) : (
                    <span className="text-state-not-verified font-medium">
                      {unit.notVerifiedCount}
                    </span>
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {started ?? <Absent title="No start date was recorded." />}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {ended ?? <Absent title="No end date was recorded." />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
