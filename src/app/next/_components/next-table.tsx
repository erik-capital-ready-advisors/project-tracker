import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Absent, ExecutorChip } from "@/components/answer-chips";
import { EntityRef, EntityRefList } from "@/components/entity-ref";
import { PlannedChip } from "@/components/planned-chip";
import { StateBadge } from "@/components/state-badge";
import type { RefEntry, RefLookup } from "@/lib/answer-screen-refs";
import { isoDay } from "@/lib/display-format";
import { cn } from "@/lib/utils";

import type { NextAnswer } from "@/lib/server/answers/next";

/**
 * FR-80 — the text references on this table, which is `implements` and nothing
 * else.
 *
 * `NextItem.id` is the work item's row id and `nearestMilestone.id` is the
 * `contract_milestone` row id, so those two are navigable with no round trip.
 * `implements` is a list of `FR-nn` strings read off `work_item_requirement`,
 * and only a lookup can say whether the engagement has ingested a requirement
 * carrying that ref.
 */
export function nextTableRefEntries(answer: NextAnswer): RefEntry[] {
  return answer.items.flatMap((item) =>
    item.implements.map((ref) => ({
      kind: "requirement" as const,
      engagement: item.engagement,
      ref,
    })),
  );
}

/**
 * FR-53 — the work that can be started right now, nearest milestone first.
 *
 * ## The order is a claim, so the table states which one it is making
 *
 * FR-53's ordering is "the nearest dated milestone they serve". When that could
 * not be computed the payload says `ordering: "fallback"` and the screen shows
 * the degradation notice above this table — but the *column* still has to be
 * honest, so the milestone header carries the ordering marker only when the
 * ordering is actually FR-53's. A sort arrow on a column the list is not sorted
 * by is a small lie that Erik would reasonably act on.
 *
 * ## `unblocks` is beside the milestone rather than instead of it
 *
 * Within one milestone date the tiebreak is how much other work each item
 * releases, and that number is worth reading on its own — two items due the same
 * week are not equally worth starting if one of them frees four others. It is
 * right-aligned and tabular so the column compares down the page.
 *
 * ## An undated milestone is not "no milestone"
 *
 * `nearestMilestoneFor` never lets an undated milestone displace a dated one,
 * and the cell keeps that distinction visible: a named milestone with no due
 * date renders its name with the date absent, which is different from an item
 * that serves no milestone at all.
 */
export function NextTable({
  answer,
  refs,
  asOf,
}: {
  answer: NextAnswer;
  refs: RefLookup;
  /** `YYYY-MM-DD`. FR-91's reference date, read once at the page. */
  asOf: string;
}) {
  const ordered = answer.ordering === "milestone-due-date";

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table
        data-verify-unit="next-table"
        data-verify-ordering={answer.ordering}
        data-verify-rows={answer.items.length}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">unit</TableHead>
            <TableHead className="whitespace-nowrap">engagement</TableHead>
            <TableHead className="whitespace-nowrap">type</TableHead>
            <TableHead className="whitespace-nowrap">executor</TableHead>
            <TableHead className="whitespace-nowrap">implements</TableHead>
            <TableHead className="whitespace-nowrap">status</TableHead>
            <TableHead
              className="whitespace-nowrap"
              aria-sort={ordered ? "ascending" : "none"}
            >
              nearest milestone
              {ordered ? (
                <span
                  className="text-muted-foreground ml-1 text-xs"
                  title="FR-53: this list is ordered by the nearest dated milestone each item serves."
                >
                  ↑
                </span>
              ) : null}
            </TableHead>
            <TableHead className="whitespace-nowrap text-right">
              unblocks
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {answer.items.map((item) => (
            <TableRow
              key={item.id}
              data-verify-unit="next-item"
              data-verify-id={item.id}
              data-verify-status={item.status}
              data-verify-unblocks={item.unblocks}
              data-verify-milestone={
                item.nearestMilestone === null ? "none" : item.nearestMilestone.id
              }
            >
              <TableCell className="align-top font-medium">
                <span className="ident whitespace-nowrap">
                {/* FR-80. `item.id` IS the work item's row id — no resolution. */}
                {item.unit === null ? (
                  <Absent title="No unit key was recorded." />
                ) : (
                  <EntityRef kind="work_item" label={item.unit} id={item.id} />
                )}
                {item.phase === null ? null : (
                  <span className="text-muted-foreground/70 ml-1.5 text-xs">
                    p{item.phase}
                  </span>
                )}
                </span>
                {/*
                  FR-53. A unit id and a work type do not tell Erik what he
                  would be starting, which is the question this screen exists
                  to answer.
                */}
                {item.description === null ? null : (
                  <p
                    data-verify-unit="next-description"
                    className="text-muted-foreground mt-1 max-w-[52ch] text-xs font-normal whitespace-normal"
                  >
                    {item.description}
                  </p>
                )}
              </TableCell>

              <TableCell className="ident text-muted-foreground whitespace-nowrap">
                {/* FR-80's engagement slug. `/registry/[slug]` is its detail
                    view and `engagement` is not one of FR-81's eight kinds, so
                    this is an ordinary anchor and not an `<EntityRef>`. */}
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
                {/* §7a: joined and reported by `FR-nn`, never by requirement
                    text. There is no requirement prose on this screen. */}
                <EntityRefList
                  refs={item.implements.map((ref) => ({
                    kind: "requirement" as const,
                    label: ref,
                    id: refs("requirement", item.engagement, ref),
                  }))}
                  empty="This item names no requirement."
                />
              </TableCell>

              {/* FR-91. A planned row IS a Next candidate — `pending` is a
                  ready status — so this screen is precisely where "nobody has
                  started this" could read as "this is in flight". The chip goes
                  beside the status, which is the word it qualifies. */}
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  {item.status === "unparsed" ? (
                    <StateBadge state="unparsed" />
                  ) : (
                    <span className="ident text-muted-foreground text-xs">
                      {item.status}
                    </span>
                  )}
                  <PlannedChip item={item} asOf={asOf} />
                </div>
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
                      {isoDay(item.nearestMilestone.due) ?? (
                        <span title="This milestone has no due date. It is not nearer than a dated one and not further away — it is unordered.">
                          no due date
                        </span>
                      )}
                    </span>
                  </span>
                )}
              </TableCell>

              <TableCell className="ident text-right tabular-nums whitespace-nowrap">
                <span
                  className={cn(
                    item.unblocks > 0
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/60",
                  )}
                  title="How many other work items depend directly on this one."
                >
                  {item.unblocks}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
