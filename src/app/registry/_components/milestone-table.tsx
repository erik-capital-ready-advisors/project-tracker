import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount, formatDate, NOT_RECORDED } from "@/lib/registry-display";
import type { MilestoneRecord } from "@/lib/server/registry/types";
import { cn } from "@/lib/utils";

import { AcceptanceRefs } from "./acceptance-refs";
import { MilestoneDatesDialog } from "./milestone-dates-dialog";
import { MilestoneDialog } from "./milestone-dialog";

/**
 * FR-10, FR-11, FR-12 — the contract milestones on one engagement.
 *
 * Two cells carry the requirements with teeth:
 *
 *   * **Amount.** `null` means the stored ciphertext did not decrypt to a finite
 *     number. It renders "unreadable" in the blocked family, never `$0` and
 *     never blank. A silently-zero milestone understates what a client owes,
 *     and it does so in a way that looks exactly like a milestone worth nothing.
 *   * **Acceptance.** A reference naming a requirement this engagement has never
 *     ingested is marked in place, every time the row is read (FR-12). Not a
 *     toast at write time — a toast is gone by the time anyone looks.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="milestone-table", data-verify-total, data-verify-unreadable,
 *     data-verify-with-unknown-refs
 *   data-verify-unit="milestone-row", data-verify-milestone,
 *     data-verify-amount-readable, data-verify-submitted, data-verify-paid,
 *     data-verify-unknown-refs
 *
 * Counts and statuses only. No amount, no client prose, and no note text is ever
 * published into a `data-verify-*` attribute — those are §7a `sensitive`.
 */

function DateCell({ value }: { value: string | null }) {
  const text = formatDate(value);
  const set = text !== NOT_RECORDED;
  return (
    <span
      className={cn(
        "ident text-xs",
        set ? "text-foreground" : "text-muted-foreground/70 italic",
      )}
    >
      {set ? text : "—"}
    </span>
  );
}

export function MilestoneTable({
  milestones,
  engagementId,
  slug,
}: {
  milestones: readonly MilestoneRecord[];
  engagementId: string;
  slug: string;
}) {
  const unreadable = milestones.filter((m) => m.amount === null).length;
  const withUnknownRefs = milestones.filter(
    (m) => m.unknownAcceptanceRefs.length > 0,
  ).length;

  return (
    <div
      className="border-border overflow-hidden rounded-lg border"
      data-verify-unit="milestone-table"
      data-verify-total={milestones.length}
      data-verify-unreadable={unreadable}
      data-verify-with-unknown-refs={withUnknownRefs}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">Milestone &amp; acceptance</TableHead>
            <TableHead className="h-8 text-xs">Amount</TableHead>
            <TableHead className="h-8 text-xs">Due</TableHead>
            <TableHead className="h-8 text-xs">Submitted</TableHead>
            <TableHead className="h-8 text-xs">Paid</TableHead>
            <TableHead className="h-8 text-right text-xs">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.map((milestone) => {
            const amount = formatAmount(milestone.amount, milestone.currency);
            return (
              <TableRow
                key={milestone.id}
                data-verify-unit="milestone-row"
                data-verify-milestone={milestone.id}
                data-verify-amount-readable={amount.readable}
                data-verify-submitted={milestone.submittedAt !== null}
                data-verify-paid={milestone.paidAt !== null}
                data-verify-unknown-refs={milestone.unknownAcceptanceRefs.length}
              >
                <TableCell className="py-2 align-top">
                  <div className="text-sm font-medium">{milestone.name}</div>
                  {milestone.notes ? (
                    <div className="text-muted-foreground line-clamp-1 max-w-xs text-xs">
                      {milestone.notes}
                    </div>
                  ) : null}
                  {/* Acceptance sits under the name rather than in a column of
                      its own. Measured, not guessed: as a seventh column it was
                      clipped off the right edge of the detail page's main grid
                      track at 1280px — and the thing being clipped was FR-12's
                      dangling-reference finding, which exists to be seen. A
                      finding behind a horizontal scrollbar is a swallowed one. */}
                  <div className="mt-1.5">
                    <AcceptanceRefs
                      refs={milestone.acceptance}
                      unknown={milestone.unknownAcceptanceRefs}
                    />
                  </div>
                </TableCell>
                <TableCell className="py-2 align-top">
                  <span
                    className={cn(
                      "ident text-xs",
                      amount.readable
                        ? "font-medium"
                        : "text-state-blocked font-semibold",
                    )}
                    title={
                      amount.readable
                        ? undefined
                        : "The stored amount did not decrypt to a number. This is not zero."
                    }
                  >
                    {amount.text}
                  </span>
                </TableCell>
                <TableCell className="py-2 align-top">
                  <DateCell value={milestone.dueDate} />
                </TableCell>
                <TableCell className="py-2 align-top">
                  <DateCell value={milestone.submittedAt} />
                </TableCell>
                <TableCell className="py-2 align-top">
                  <DateCell value={milestone.paidAt} />
                </TableCell>
                <TableCell className="py-2 text-right align-top">
                  <div className="flex justify-end gap-1">
                    <MilestoneDatesDialog slug={slug} milestone={milestone} />
                    <MilestoneDialog
                      engagementId={engagementId}
                      slug={slug}
                      milestone={milestone}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
