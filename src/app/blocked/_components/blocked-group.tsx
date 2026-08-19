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
  HeldByChips,
  RefList,
} from "@/components/answer-chips";
import { StateBadge } from "@/components/state-badge";
import { elapsedDays, isoDay } from "@/lib/display-format";
import { cn } from "@/lib/utils";

import type {
  BlockedGroup as BlockedGroupData,
} from "@/lib/server/answers/blocked";

/**
 * FR-52 — one owner, everything of theirs that is stopped.
 *
 * ## Why the grouping is the layout and not a sort
 *
 * *"Blocked lists every blocked work item and open external wait, **grouped by
 * owner**."* The grouping is the requirement, and it is load-bearing for the
 * reason `blocker.owner` defaults to `"erik"` rather than to a client:
 * separating Erik's rows from a client's is what turns this screen from a list
 * of problems into a list of *whose* problems. A sorted flat table would put the
 * same rows on screen and lose that.
 *
 * ## Why two tables inside one group rather than one merged table
 *
 * A blocked work item and an open external wait are different records with
 * different columns — a wait has an owner type, an expected-by date and the
 * items it blocks; a work item has a status, a disposition and the thing holding
 * it. Merging them means a table where half the cells are empty in every row,
 * which reads as missing data rather than as a different kind of record.
 *
 * They share the group because they share the *answer*: both are "this owner is
 * why something is stopped".
 *
 * ## The elapsed number is the one Erik acts on
 *
 * So it is right-aligned, tabular, and the longest in the group is repeated in
 * the header. A `null` renders absent rather than `0` — "nobody recorded when
 * this started" and "this started today" are different facts and only one of
 * them is good news.
 */
/**
 * The label that makes the two tables in a group read as two.
 *
 * `sticky left-0` so it stays visible while the table beside it is scrolled
 * sideways — at 375px these tables are two to three viewports wide, and a
 * heading that scrolls away with the columns stops being a heading.
 */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground sticky left-0 px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wide uppercase">
      {children}
    </h3>
  );
}

export function BlockedGroup({ group }: { group: BlockedGroupData }) {
  return (
    <section
      data-verify-unit="blocked-group"
      data-verify-owner={group.owner}
      data-verify-items={group.items.length}
      data-verify-waits={group.waits.length}
      {...(group.longestDays === null
        ? {}
        : { "data-verify-longest-days": group.longestDays })}
      className="border-border overflow-hidden rounded-lg border"
    >
      <header className="border-border bg-muted/40 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 className="ident text-sm font-semibold">{group.owner}</h2>
        <span className="text-muted-foreground ident text-xs">
          {group.items.length} blocked · {group.waits.length} waiting
        </span>
        {group.longestDays === null ? null : (
          <span
            className="text-state-blocked ident ml-auto text-xs font-medium"
            title="The longest any one of this owner's rows has been stopped."
          >
            longest {elapsedDays(group.longestDays)}
          </span>
        )}
      </header>

      {group.items.length > 0 ? (
        <div className="overflow-x-auto">
          {/* The two tables below hold different records with different columns
              and their headers do not align. Observed on the running app at
              375px and at 1440px: stacked with no label they read as one table
              that has gone wrong, rather than as two. The labels are what make
              them two. */}
          <SubHeading>
            Blocked work items
          </SubHeading>
          <Table data-verify-unit="blocked-items">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">unit</TableHead>
                <TableHead className="whitespace-nowrap">engagement</TableHead>
                <TableHead className="whitespace-nowrap">type</TableHead>
                <TableHead className="whitespace-nowrap">held by</TableHead>
                <TableHead className="whitespace-nowrap">status</TableHead>
                <TableHead className="whitespace-nowrap">disposition</TableHead>
                <TableHead className="whitespace-nowrap">started</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  elapsed
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <TableRow
                  key={item.id}
                  data-verify-unit="blocked-item"
                  data-verify-id={item.id}
                  data-verify-status={item.status}
                  data-verify-disposition={item.disposition ?? "not-recorded"}
                  data-verify-held={item.heldBy.join(",")}
                >
                  <TableCell className="ident font-medium whitespace-nowrap">
                    {item.unit ?? <Absent title="No unit key was recorded." />}
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {item.engagement}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {item.workType ?? (
                      <Absent title="No work type was recorded." />
                    )}
                  </TableCell>
                  <TableCell>
                    <HeldByChips heldBy={item.heldBy} />
                  </TableCell>
                  <TableCell>
                    {item.status === "blocked" || item.status === "unparsed" ? (
                      <StateBadge
                        state={item.status === "blocked" ? "blocked" : "unparsed"}
                      />
                    ) : (
                      <span className="ident text-muted-foreground text-xs">
                        {item.status}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DispositionChip disposition={item.disposition} />
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoDay(item.startedOn) ?? (
                      <Absent title="No start date was recorded." />
                    )}
                  </TableCell>
                  <TableCell className="ident text-right tabular-nums whitespace-nowrap">
                    {item.daysElapsed === null ? (
                      <Absent title="No start date was recorded, so nothing here has been counted." />
                    ) : (
                      <span
                        className={cn(
                          item.daysElapsed >= 14
                            ? "text-state-blocked font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {elapsedDays(item.daysElapsed)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {group.waits.length > 0 ? (
        <div className="border-border overflow-x-auto border-t">
          <SubHeading>
            Open external waits
          </SubHeading>
          <Table data-verify-unit="blocked-waits">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">wait</TableHead>
                <TableHead className="whitespace-nowrap">owner type</TableHead>
                <TableHead className="whitespace-nowrap">started</TableHead>
                <TableHead className="whitespace-nowrap">expected by</TableHead>
                <TableHead className="whitespace-nowrap">blocks</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  waiting
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.waits.map((wait) => (
                <TableRow
                  key={wait.id}
                  data-verify-unit="blocked-wait"
                  data-verify-id={wait.id}
                  data-verify-overdue={wait.overdue ? "true" : "false"}
                  data-verify-blocks={wait.blocks.length}
                >
                  <TableCell className="max-w-xs">
                    <span className="font-medium">{wait.label}</span>
                    {/* §7a names `external_wait.reason` as readable on this
                        screen explicitly, so it is shown. It is the only prose
                        column anywhere in this unit. */}
                    {wait.reason === null ? null : (
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {wait.reason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {/* Free text by spec: `external_wait.owner_type` has no enum
                        and none is invented here. */}
                    {wait.ownerType ?? (
                      <Absent title="No owner type was recorded." />
                    )}
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoDay(wait.startedOn) ?? (
                      <Absent title="No start date was recorded." />
                    )}
                  </TableCell>
                  <TableCell className="ident whitespace-nowrap">
                    {isoDay(wait.expectedBy) === null ? (
                      <Absent title="No date was expected for this wait." />
                    ) : (
                      <span
                        className={cn(
                          wait.overdue
                            ? "text-state-blocked font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {isoDay(wait.expectedBy)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RefList
                      refs={wait.blocks}
                      empty="This wait blocks nothing that is recorded."
                    />
                  </TableCell>
                  <TableCell className="ident text-right tabular-nums whitespace-nowrap">
                    {wait.daysWaiting === null ? (
                      <Absent title="No start date was recorded, so nothing here has been counted." />
                    ) : (
                      <span
                        className={cn(
                          wait.overdue
                            ? "text-state-blocked font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {elapsedDays(wait.daysWaiting)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
