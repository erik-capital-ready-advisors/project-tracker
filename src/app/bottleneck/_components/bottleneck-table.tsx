import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Absent,
  DispositionChip,
  ExecutorChip,
} from "@/components/answer-chips";
import { EntityRef } from "@/components/entity-ref";
import { PlannedChip } from "@/components/planned-chip";
import { StateBadge } from "@/components/state-badge";
import { isoDay } from "@/lib/display-format";
import { cn } from "@/lib/utils";

import type { BottleneckAnswer } from "@/lib/server/answers/bottleneck";

/**
 * FR-56 — what Erik personally is holding up, biggest lever first.
 *
 * > Bottleneck lists work whose executor is Erik or an Erik-gate, ranked by
 * > downstream work unblocked and by the nearest milestone at risk.
 *
 * ## `unblocks` is transitive, and `direct` is printed beside it
 *
 * The rank is the size of what moves if Erik does this one thing, so an item
 * with two direct dependents that each have ten of their own unblocks twelve
 * pieces of work rather than two. That is the number worth ranking by and it is
 * also the number nobody can check by eye — so the direct edge count is rendered
 * beside it, small and muted. A ranking figure the reader cannot sanity-check is
 * one they either trust blindly or ignore.
 *
 * ## Why the executor column exists on a screen that is only ever Erik
 *
 * FR-40 makes `erik_gate` a first-class executor kind, distinct from `erik`, and
 * the distinction changes what Erik does about the row. `erik` is work he is
 * doing; `erik_gate` is work **blocked because no agent exists for its stack** —
 * a check constraint in the schema, not a heuristic. The first is a queue, the
 * second is an automation gap, and FR-29's reason says which.
 *
 * ## Disposition is here because FR-30's distinction bites hardest on this screen
 *
 * `carried` means Erik still owns the gap. `closed` means it was decided
 * against. A row that reads `closed` is not a bottleneck he needs to clear, and
 * merging the two would put settled decisions at the top of his own to-do list.
 */
export function BottleneckTable({
  answer,
  asOf,
}: {
  answer: BottleneckAnswer;
  /** `YYYY-MM-DD`. FR-91's reference date, read once at the page. */
  asOf: string;
}) {
  const ranked = answer.ranking === "unblocks-then-milestone";

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table
        data-verify-unit="bottleneck-table"
        data-verify-ranking={answer.ranking}
        data-verify-rows={answer.items.length}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">unit</TableHead>
            <TableHead className="whitespace-nowrap">engagement</TableHead>
            <TableHead className="whitespace-nowrap">type</TableHead>
            <TableHead className="whitespace-nowrap">executor</TableHead>
            <TableHead className="whitespace-nowrap">why not automated</TableHead>
            <TableHead className="whitespace-nowrap">status</TableHead>
            <TableHead className="whitespace-nowrap">
              milestone at risk
              {ranked ? (
                <span
                  className="text-muted-foreground ml-1 text-xs"
                  title="FR-56: within an equal number of downstream items, the nearest dated milestone ranks first."
                >
                  ↑
                </span>
              ) : null}
            </TableHead>
            <TableHead
              className="whitespace-nowrap text-right"
              aria-sort="descending"
            >
              unblocks
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {answer.items.map((item) => (
            <TableRow
              key={item.id}
              data-verify-unit="bottleneck-item"
              data-verify-id={item.id}
              data-verify-executor-kind={item.executorKind}
              data-verify-status={item.status}
              data-verify-unblocks={item.unblocks}
              data-verify-direct={item.directDependents}
              data-verify-also-held={item.alsoHeld ? "true" : "false"}
              data-verify-disposition={item.disposition ?? "not-recorded"}
            >
              <TableCell className="align-top font-medium">
                {/* FR-80. Every reference on this screen is uuid-backed —
                    `item.id` is the work item's row id and
                    `nearestMilestone.id` the milestone's — so this screen
                    resolves nothing and costs no extra read. */}
                <span className="ident whitespace-nowrap">
                  {item.unit === null ? (
                    <Absent title="No unit key was recorded." />
                  ) : (
                    <EntityRef kind="work_item" label={item.unit} id={item.id} />
                  )}
                </span>
                {/*
                  FR-56. What Erik is the bottleneck ON, not merely which unit
                  carries his name.
                */}
                {item.description === null ? null : (
                  <p
                    data-verify-unit="bottleneck-description"
                    className="text-muted-foreground mt-1 max-w-[52ch] text-xs font-normal whitespace-normal"
                  >
                    {item.description}
                  </p>
                )}
              </TableCell>

              <TableCell className="ident text-muted-foreground whitespace-nowrap">
                {/* FR-80's engagement slug. `engagement` is not one of FR-81's
                    eight kinds, so this is an ordinary anchor to the detail
                    view that already exists at `/registry/[slug]`. */}
                <Link
                  href={`/registry/${item.engagement}`}
                  data-verify-unit="engagement-link"
                  data-verify-slug={item.engagement}
                  className="rounded-sm underline-offset-2 hover:underline"
                >
                  {item.engagement}
                </Link>
              </TableCell>

              <TableCell className="text-muted-foreground whitespace-nowrap">
                {item.workType ?? <Absent title="No work type was recorded." />}
              </TableCell>

              <TableCell>
                <ExecutorChip kind={item.executorKind} executor={item.executor} />
              </TableCell>

              <TableCell className="max-w-xs">
                {/* FR-29 read together with FR-41: the recorded reason is what
                    makes an `erik_gate` legible rather than mysterious. The
                    stored enum member is rendered verbatim in mono — it is an
                    identifier, and inventing a friendlier phrase for it here
                    would put a second vocabulary next to the database's. */}
                <span className="flex flex-wrap items-center gap-1.5">
                  {item.unautomatedReason === null ? (
                    <Absent title="No reason was recorded for why this is not automated." />
                  ) : (
                    <span className="ident text-muted-foreground text-xs">
                      {item.unautomatedReason}
                    </span>
                  )}
                  <DispositionChip disposition={item.disposition} />
                </span>
              </TableCell>

              <TableCell>
                <span className="flex flex-wrap items-center gap-1">
                  {item.status === "blocked" ? (
                    <StateBadge state="blocked" />
                  ) : (
                    <span className="ident text-muted-foreground text-xs">
                      {item.status}
                    </span>
                  )}
                  {/* FR-91. "What is Erik the bottleneck on" reads a planned row
                      and a dispatched one as the same kind of urgent, and they
                      are not: nobody has claimed the planned one. */}
                  <PlannedChip item={item} asOf={asOf} />
                  {/* An item that is both Erik's and held by something else is
                      not one he can simply start, and the ranking does not know
                      that — so the row says it. */}
                  {item.alsoHeld ? (
                    <span
                      data-verify-unit="also-held"
                      className="ident border-state-blocked/40 text-state-blocked inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none"
                      title="An open blocker or external wait also holds this item. Erik being free is not sufficient to start it."
                    >
                      also held
                    </span>
                  ) : null}
                </span>
              </TableCell>

              <TableCell className="whitespace-nowrap">
                {item.nearestMilestone === null ? (
                  <Absent title="No milestone's acceptance criteria name any requirement this item implements." />
                ) : (
                  <span className="inline-flex flex-col items-start">
                    <EntityRef
                      kind="contract_milestone"
                      label={item.nearestMilestone.name}
                      id={item.nearestMilestone.id}
                    />
                    <span className="ident text-muted-foreground text-xs">
                      {isoDay(item.nearestMilestone.due) ?? "no due date"}
                    </span>
                  </span>
                )}
              </TableCell>

              <TableCell className="ident text-right whitespace-nowrap">
                {/* Both figures carry their own contract. Asserting only the
                    row's `data-verify-unblocks` would not notice the two being
                    swapped in the cell — a mutation proved exactly that, and
                    the number Erik ranks by is the one that is painted. */}
                <span className="inline-flex flex-col items-end">
                  <span
                    data-verify-unit="unblocks-figure"
                    className={cn(
                      "tabular-nums",
                      item.unblocks > 0
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground/85",
                    )}
                    title="Every work item transitively waiting on this one."
                  >
                    {item.unblocks}
                  </span>
                  <span
                    data-verify-unit="direct-figure"
                    className="text-muted-foreground/85 text-xs tabular-nums"
                    title="Direct dependency edges, printed so the transitive figure beside it can be checked rather than trusted."
                  >
                    {item.directDependents} direct
                  </span>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
