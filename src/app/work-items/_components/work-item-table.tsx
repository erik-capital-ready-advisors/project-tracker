import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { ListedWorkItem } from "@/lib/server/workitems/list";
import type { WorkItemSortColumn } from "@/lib/server/workitems/rules";

import {
  DispositionChip,
  EvidenceScopeChip,
  ExecutionModeChip,
  ExecutorChip,
  WorkStatusChip,
} from "./chips";
import { isoDay } from "@/lib/display-format";
import { UNAUTOMATED_REASON_LABELS } from "../_lib/labels";
import { nextDirection, withParams } from "../_lib/query";
import type { WorkItemQuery } from "../_lib/query";

/**
 * FR-44 -- one table, every engagement, all three execution modes.
 *
 * ## The column set is inherited, not invented
 *
 * Spec 5a: *"The closest existing artifact is the manifest work-unit table, and
 * its column set -- id, type, executor, depends-on, status -- is worth
 * preserving as the shape of a work-item row, because it is already the mental
 * model."* Those five are the first five columns here, in that order. The
 * columns after them exist because a requirement names them and the manifest has
 * no equivalent: disposition (FR-30), evidence scope (FR-43), and the dates.
 *
 * `depends-on` is rendered as **"blocked by"**, and that is a deviation worth
 * reading rather than glossing: the listing `i6` exposes carries
 * `external_wait_id` and `blocker_id`, not the resolved dependency edges from
 * `work_item_dependency`. So the column answers "what is holding this up" and
 * not "which units precede it". Noted in the report.
 *
 * ## Nothing here decrypts
 *
 * `description` is a pgcrypto column and `listWorkItems` leaves it `null` unless
 * a caller opts in and accepts a per-row round trip. This table never opts in,
 * so no client prose is rendered, held in memory, or put in a `data-verify-*`
 * attribute. The unit key and the engagement slug are the display keys.
 */

/** Columns whose header sorts. The set is `WORK_ITEM_SORT_COLUMNS`, which §7a bounds. */
function SortableHead({
  column,
  label,
  query,
  className,
}: {
  column: WorkItemSortColumn;
  label: string;
  query: WorkItemQuery;
  className?: string;
}) {
  const active = query.sort === column;
  const direction = nextDirection(query, column);
  const Arrow = query.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={cn("whitespace-nowrap", className)}>
      <Link
        href={withParams(query, { sort: column, dir: direction, page: null })}
        data-verify-unit="sort-link"
        data-verify-column={column}
        data-verify-active={active ? "true" : "false"}
        aria-sort={
          active
            ? query.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 rounded-sm",
          active ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? <Arrow aria-hidden className="size-3" /> : null}
      </Link>
    </TableHead>
  );
}

function Absent({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground/50" title={title}>
      &mdash;
    </span>
  );
}

export function WorkItemTable({
  items,
  query,
}: {
  items: readonly ListedWorkItem[];
  query: WorkItemQuery;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table data-verify-unit="work-item-table">
        <TableHeader>
          <TableRow>
            <SortableHead column="unit" label="unit" query={query} />
            <TableHead className="whitespace-nowrap">engagement</TableHead>
            <TableHead className="whitespace-nowrap">type</TableHead>
            <SortableHead column="execution_mode" label="mode" query={query} />
            <SortableHead column="executor_kind" label="executor" query={query} />
            <TableHead className="whitespace-nowrap">blocked by</TableHead>
            <SortableHead column="status" label="status" query={query} />
            <TableHead className="whitespace-nowrap">disposition</TableHead>
            <TableHead className="whitespace-nowrap">evidence</TableHead>
            <SortableHead
              column="not_verified_count"
              label="not verified"
              query={query}
            />
            <SortableHead column="started_at" label="started" query={query} />
            <SortableHead column="ended_at" label="ended" query={query} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const started = isoDay(item.startedAt);
            const ended = isoDay(item.endedAt);

            return (
              <TableRow
                key={item.id}
                data-verify-unit="work-item-row"
                data-verify-id={item.id}
                data-verify-status={item.status}
                data-verify-mode={item.executionMode}
                data-verify-executor-kind={item.executorKind}
                data-verify-evidence={item.evidenceScope ?? "not-recorded"}
                data-verify-disposition={item.disposition ?? "not-recorded"}
              >
                <TableCell className="ident font-medium whitespace-nowrap">
                  {item.unit ?? <Absent title="No unit key was recorded." />}
                  {item.phase === null ? null : (
                    <span className="text-muted-foreground/70 ml-1.5 text-xs">
                      p{item.phase}
                    </span>
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {item.engagementSlug ?? (
                    <Absent title="This item's engagement could not be read." />
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {item.workType ?? <Absent title="No work type was recorded." />}
                  {item.stackName === null ? null : (
                    <span className="ident text-muted-foreground/70 ml-1.5 text-xs">
                      {item.stackName}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <ExecutionModeChip mode={item.executionMode} />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <ExecutorChip
                      kind={item.executorKind}
                      executor={item.executor}
                    />
                    {/* FR-29 read together with FR-41: the reason an item is not
                        automated is what makes an `erik_gate` legible rather
                        than mysterious, so it rides with the executor. */}
                    {item.unautomatedReason === null ? null : (
                      <span className="text-muted-foreground/70 text-xs">
                        {UNAUTOMATED_REASON_LABELS[item.unautomatedReason]}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {item.externalWaitId === null && item.blockerId === null ? (
                    <Absent title="Nothing recorded as holding this item up." />
                  ) : (
                    <span className="ident text-muted-foreground text-xs">
                      {item.externalWaitId === null ? null : (
                        <Link
                          href="/waits"
                          data-verify-unit="blocked-by-wait"
                          className="hover:text-foreground underline underline-offset-2"
                        >
                          external wait
                        </Link>
                      )}
                      {item.externalWaitId !== null && item.blockerId !== null
                        ? " · "
                        : null}
                      {item.blockerId === null ? null : (
                        <Link
                          href="/blocked"
                          data-verify-unit="blocked-by-blocker"
                          className="hover:text-foreground underline underline-offset-2"
                        >
                          blocker
                        </Link>
                      )}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <WorkStatusChip status={item.status} />
                </TableCell>

                <TableCell>
                  <DispositionChip disposition={item.disposition} />
                </TableCell>

                <TableCell>
                  <EvidenceScopeChip scope={item.evidenceScope} />
                </TableCell>

                <TableCell className="ident text-right tabular-nums">
                  {item.notVerifiedCount === 0 ? (
                    <span className="text-muted-foreground/60">0</span>
                  ) : (
                    <span className="text-state-not-verified font-medium">
                      {item.notVerifiedCount}
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
