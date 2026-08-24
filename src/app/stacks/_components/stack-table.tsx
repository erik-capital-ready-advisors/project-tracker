import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { NOT_RECORDED, formatDate } from "@/lib/registry-display";
import type { StackRow, TriggerThresholds } from "@/lib/stacks-load";
import { cn } from "@/lib/utils";

import {
  NO_AGENT_RECORDED,
  TRIGGER_LABEL,
  formatHours,
  hoursUnderstatedNote,
  triggerPresentation,
  triggerRowSentence,
} from "../_lib/display";
import type { TriggerPresentation } from "../_lib/display";
import { AgentCoveringDialog } from "./agent-covering-dialog";

/**
 * FR-104 — every stack the ledger has ever observed, one row each.
 *
 * ## The order carries no claim, and it is not re-sorted here
 *
 * `loadStackRegister` returns the rows by name ascending and documents why:
 * sorting by hours would imply "most used first" on a ledger where every stack
 * holds zero minutes, and floating the actionable rows to the top would make
 * FR-107's distinction depend on **position** rather than on the treatment
 * FR-107 asks for. This component renders them in the order it is given. A
 * table that re-sorts to be helpful is a table whose order is an argument
 * nobody wrote down.
 *
 * ## FR-107 — the one actionable state, and how it is made distinct
 *
 * Earned **and** uncovered is the only row on this screen that asks Erik to do
 * something, and it is separated from the other two on three channels at once,
 * so it survives greyscale, colour blindness and a ten-second glance:
 *
 *   * **Hue** — a solid amber left rule down the row and an amber-filled chip.
 *     This is the single borrowed token on the screen and it means exactly one
 *     thing here (see below).
 *   * **Weight** — the chip is filled and semibold; the other two are a neutral
 *     outline and a dashed neutral outline respectively.
 *   * **Words** — the chip reads `earned · no agent`, which states the two facts
 *     that make the row actionable rather than relying on the colour to carry
 *     them.
 *
 * The other two rows are deliberately NOT on the scale. Earned-and-covered is
 * settled and rides the neutral ladder's `present` rung; undetermined is
 * information and rides the `faint`, dashed rung — the same treatment the scale
 * gives `not-verified` and `unproven`, because an undetermined row is an
 * absence of a finding rather than a finding.
 *
 * ## The borrow, flagged rather than hidden
 *
 * `state-carried` is amber and means "carried" on spec 5a's scale. It keeps its
 * hue and its valence here — open, needs attention, not broken — but "actionable
 * stack" is not one of the states 5a names, so this is a **borrow** and it is
 * reported as a decision Erik has not reviewed rather than as a mapping. It
 * follows the precedent `@/components/answer-chips.tsx` set for severity, and it
 * is the only hue this screen spends: fuchsia stays reserved for `unparsed`,
 * violet stays confined to interactive chrome, and no token was added.
 *
 * ## Never "unearned"
 *
 * No cell here writes that a stack has not earned a specialist. Q27 forbids
 * evaluating clause 2, so the product cannot make that claim — only that clause
 * 1 did not fire and clause 2 was never checked. `triggerRowSentence` is where
 * that is written, and `@/lib/server/stacks/types.ts` is why.
 *
 * ## No prose reaches this table
 *
 * `STACK_COLUMNS` selects no ciphertext column and `work_session.summary` is
 * named nowhere in the read layer, so there is nothing here to withhold. Every
 * value below is a §7a `internal` identifier, a count, or a date. No
 * `data-verify-*` attribute on this screen carries content of any kind —
 * including the agent name, which is a boolean in the contract and a value only
 * on screen.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="stack-table"
 *   data-verify-unit="stack-row"        data-verify-stack, data-verify-outcome,
 *                                        data-verify-actionable,
 *                                        data-verify-covered
 *   data-verify-unit="stack-trigger"    data-verify-presentation
 *   data-verify-unit="stack-hours"      data-verify-minutes,
 *                                        data-verify-understated
 *   data-verify-unit="stack-sessions"   data-verify-sessions
 *   data-verify-unit="stack-engagements" data-verify-engagements
 *   data-verify-unit="stack-agent"      data-verify-covered
 *   plus `agent-covering-dialog`'s own, documented in its file.
 */

/** Every utility this file can emit is written out literally: Tailwind cannot see a runtime string. */
const TRIGGER_CHIP: Record<TriggerPresentation, string> = {
  actionable:
    "border-state-carried/60 bg-state-carried/15 text-state-carried ring-1 ring-state-carried/40 font-semibold",
  settled: "border-foreground/25 text-foreground bg-muted",
  undetermined:
    "border-border/60 text-muted-foreground/85 bg-transparent border-dashed",
};

const CHIP_BASE =
  "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap";

function NotRecorded({ title }: { title: string }) {
  return (
    <span className="ident text-muted-foreground/85 text-xs" title={title}>
      {NOT_RECORDED}
    </span>
  );
}

export function StackTable({
  stacks,
  thresholds,
  onSetAgentCovering,
}: {
  stacks: readonly StackRow[];
  thresholds: TriggerThresholds;
  /** FR-109's one write. Passed down so no client module imports `@/lib/server/*`. */
  onSetAgentCovering: (
    stackId: string,
    agentCovering: string | null,
  ) => Promise<ActionResult<unknown>>;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table data-verify-unit="stack-table">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">stack</TableHead>
            <TableHead className="whitespace-nowrap">trigger</TableHead>
            <TableHead className="whitespace-nowrap">agent covering</TableHead>
            <TableHead className="whitespace-nowrap">hours</TableHead>
            <TableHead className="whitespace-nowrap">sessions</TableHead>
            <TableHead className="whitespace-nowrap">engagements</TableHead>
            <TableHead className="whitespace-nowrap">first seen</TableHead>
            <TableHead className="whitespace-nowrap">last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stacks.map((stack) => {
            const presentation = triggerPresentation(stack);
            const understated = hoursUnderstatedNote(stack);

            return (
              <TableRow
                key={stack.id}
                data-verify-unit="stack-row"
                data-verify-stack={stack.name}
                data-verify-outcome={stack.trigger.outcome}
                data-verify-actionable={stack.actionable}
                data-verify-covered={stack.agentCovering !== null}
                className={cn(stack.actionable ? "bg-state-carried/5" : null)}
              >
                {/*
                  The left rule lives on the first cell rather than the row: a
                  `<tr>` border depends on the table's collapse mode, and a cell
                  border does not. The transparent rule on every other row is
                  what keeps the columns aligned to the same pixel.
                */}
                <TableCell
                  className={cn(
                    "border-l-2 font-medium whitespace-nowrap",
                    stack.actionable
                      ? "border-l-state-carried"
                      : "border-l-transparent",
                  )}
                >
                  <span className="ident text-foreground">{stack.name}</span>
                </TableCell>

                <TableCell className="align-top">
                  <div
                    data-verify-unit="stack-trigger"
                    data-verify-presentation={presentation}
                    className="flex flex-col gap-1"
                  >
                    <span className={cn(CHIP_BASE, TRIGGER_CHIP[presentation])}>
                      {TRIGGER_LABEL[presentation]}
                    </span>
                    <span className="text-muted-foreground ident max-w-xs text-xs whitespace-normal">
                      {triggerRowSentence(stack, thresholds)}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="align-top">
                  <div
                    data-verify-unit="stack-agent"
                    data-verify-covered={stack.agentCovering !== null}
                    className="flex items-center gap-2"
                  >
                    {stack.agentCovering === null ? (
                      <span className="text-muted-foreground/85 text-xs italic">
                        {NO_AGENT_RECORDED}
                      </span>
                    ) : (
                      <span className="ident text-foreground text-xs">
                        {stack.agentCovering}
                      </span>
                    )}
                    <AgentCoveringDialog
                      stackId={stack.id}
                      stackName={stack.name}
                      current={stack.agentCovering}
                      onSave={onSetAgentCovering}
                    />
                  </div>
                </TableCell>

                <TableCell className="align-top">
                  <div
                    data-verify-unit="stack-hours"
                    data-verify-minutes={stack.minutes}
                    data-verify-understated={stack.sessionsWithoutDuration > 0}
                    className="flex flex-col gap-1"
                  >
                    <span className="ident text-foreground/90 text-xs tabular-nums">
                      {formatHours(stack.minutes)}
                    </span>
                    {understated === null ? null : (
                      <span className="text-state-blocked max-w-xs text-xs whitespace-normal">
                        {understated}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell
                  data-verify-unit="stack-sessions"
                  data-verify-sessions={stack.sessions}
                  className="ident text-foreground/90 align-top text-xs tabular-nums"
                >
                  {stack.sessions}
                </TableCell>

                <TableCell
                  data-verify-unit="stack-engagements"
                  data-verify-engagements={stack.engagements}
                  className="ident text-foreground/90 align-top text-xs tabular-nums"
                >
                  {stack.engagements}
                </TableCell>

                <TableCell className="ident text-muted-foreground align-top text-xs whitespace-nowrap">
                  {stack.firstSeenAt === null ? (
                    <NotRecorded title="This stack has no recorded first-seen timestamp." />
                  ) : (
                    formatDate(stack.firstSeenAt)
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground align-top text-xs whitespace-nowrap">
                  {stack.lastSeenAt === null ? (
                    <NotRecorded title="This stack has no recorded last-seen timestamp." />
                  ) : (
                    formatDate(stack.lastSeenAt)
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
