import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import { EntityRef } from "@/components/entity-ref";
import { PlannedChip } from "@/components/planned-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toRef } from "@/lib/detail-load";
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
 *
 * ## FR-80 — three references per row, and none of them costs a query
 *
 * Every row on this screen **is** a work item, and `listWorkItems` already
 * carries `id`, `blockerId` and `externalWaitId` as database uuids. So all three
 * references are constructed directly and **no resolution round trip happens on
 * this screen at all** — `readRefResolution` exists for a screen holding a
 * rendered `FR-nn` or `u4` and no uuid, which this one never is.
 *
 * Two consequences worth stating rather than discovering:
 *
 *   * A `hand` or `external` work item has no `unit`. `toRef` gives it
 *     `fallbackLabel`, so the cell reads `work item 3f2a1b8c` and is navigable,
 *     where it previously rendered an em dash. This screen is precisely the one
 *     that lists those rows, and a row you cannot open is the failure FR-80
 *     names.
 *   * A blocker and an external wait are held here as a uuid with **no label**.
 *     The listing does not carry `blocker.ref` or `external_wait.label`, and
 *     widening it is another unit's file, so both take `fallbackLabel` too.
 *     Queued as a question; the reference is navigable either way, which is what
 *     FR-80 asks for, and the previous rendering — the words "blocker" and
 *     "external wait" linking to the *listing* screens — named no row at all.
 *
 * The engagement is a plain `next/link` to `/registry/<slug>` and deliberately
 * **not** an `<EntityRef>`: `engagement` is not one of FR-81's eight kinds,
 * `ENTITY_KINDS` is asserted to be exactly those eight, and its detail view has
 * lived at `/registry/[slug]` since M1.3.
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

  // B55. `aria-sort` belongs on the element holding the `columnheader` role --
  // the `<th>` -- not on the link inside it. On an `<a>` it is an attribute the
  // platform is required to ignore, which axe grades `aria-allowed-attr` at
  // impact `critical`: the sort state looked handled in the markup and was
  // announced to nobody.
  const sort = active
    ? query.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <TableHead className={cn("whitespace-nowrap", className)} aria-sort={sort}>
      <Link
        href={withParams(query, { sort: column, dir: direction, page: null })}
        data-verify-unit="sort-link"
        data-verify-column={column}
        data-verify-active={active ? "true" : "false"}
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
    <span className="text-muted-foreground/85" title={title}>
      &mdash;
    </span>
  );
}

export function WorkItemTable({
  items,
  query,
  asOf,
}: {
  items: readonly ListedWorkItem[];
  query: WorkItemQuery;
  /** `YYYY-MM-DD`. FR-91's reference date, read once at the page. */
  asOf: string;
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
                data-verify-mode={item.executionMode ?? "none"}
                data-verify-planned={item.planned ? "true" : "false"}
                data-verify-executor-kind={item.executorKind}
                data-verify-evidence={item.evidenceScope ?? "not-recorded"}
                data-verify-disposition={item.disposition ?? "not-recorded"}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  <EntityRef {...toRef("work_item", item.id, item.unit)} />
                  {item.phase === null ? null : (
                    <span className="text-muted-foreground/85 ml-1.5 text-xs">
                      p{item.phase}
                    </span>
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {item.engagementSlug === null ? (
                    <Absent title="This item's engagement could not be read." />
                  ) : (
                    <Link
                      href={`/registry/${item.engagementSlug}`}
                      data-verify-unit="engagement-link"
                      data-verify-slug={item.engagementSlug}
                      className="hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {item.engagementSlug}
                    </Link>
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {item.workType ?? <Absent title="No work type was recorded." />}
                  {item.stackName === null ? null : (
                    <span className="ident text-muted-foreground/85 ml-1.5 text-xs">
                      {item.stackName}
                    </span>
                  )}
                </TableCell>

                {/* FR-87 defines planned work as `execution_mode IS NULL`, so
                    the chip that says the mode is absent and the chip that says
                    how long it has been absent belong in one cell. */}
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <ExecutionModeChip mode={item.executionMode} planned={item.planned} />
                    <PlannedChip item={item} asOf={asOf} />
                  </div>
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
                      <span className="text-muted-foreground/85 text-xs">
                        {UNAUTOMATED_REASON_LABELS[item.unautomatedReason]}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {item.externalWaitId === null && item.blockerId === null ? (
                    <Absent title="Nothing recorded as holding this item up." />
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {item.externalWaitId === null ? null : (
                        <span data-verify-unit="blocked-by-wait">
                          <EntityRef
                            {...toRef("external_wait", item.externalWaitId, null)}
                            title="The external wait holding this item up. This listing carries the wait's id but not its label, so it is named by its id."
                          />
                        </span>
                      )}
                      {item.blockerId === null ? null : (
                        <span data-verify-unit="blocked-by-blocker">
                          <EntityRef
                            {...toRef("blocker", item.blockerId, null)}
                            title="The blocker holding this item up. This listing carries the blocker's id but not its ref, so it is named by its id."
                          />
                        </span>
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
                    <span className="text-muted-foreground/85">0</span>
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
