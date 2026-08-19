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
  ContestedChip,
  CoverageChip,
  MilestoneStateChip,
  Ref,
  ShippedChip,
} from "@/components/answer-chips";
import { StateBadge } from "@/components/state-badge";
import { isoDay } from "@/lib/display-format";
import { money } from "@/lib/money-display";
import { cn } from "@/lib/utils";

import type { CommittedMilestone } from "@/lib/server/answers/committed";

/**
 * FR-54 and FR-75 — every milestone, and the four things about it that must not
 * be collapsed into one another.
 *
 * ## Covered and shipped are two columns, deliberately
 *
 * > **FR-75** Committed shows, per milestone, whether its acceptance
 * > requirements are **shipped**, distinctly from whether they are **covered**.
 * > *Built and deployed are different claims and the system never collapses
 * > them.*
 *
 * The tempting layout is one "done" column with a tick, and it is wrong in both
 * directions: a milestone covered by passing tests and never deployed would read
 * as delivered, and one deployed with no covering test would read as proven.
 * Both are invoices Erik would send that he should not.
 *
 * So: `covered n/m` and `shipped n/m` are adjacent columns, they use different
 * visual families (the coverage scale versus the neutral ladder), and the
 * expandable detail below each row lists **per acceptance requirement** which of
 * the two it has — because a milestone at `3/4` covered and `3/4` shipped may
 * well be missing a different requirement in each.
 *
 * ## Billable, claimed and contested are three states and a flag
 *
 * FR-51: a milestone covered only by self-certified tests is `claimed`, *"a
 * review request and not an invoice"*. FR-79: a milestone that is covered but
 * carries an open `critical` defect against one of its acceptance requirements
 * is `contested` — billable, **flagged**, and never presented as clean.
 *
 * The flag rides beside the state rather than replacing it, so neither fact is
 * lost. A `contested` chip that replaced `billable` would hide that the money is
 * earned; a `billable` chip alone would present a disputed milestone as clean.
 *
 * ## What is deliberately absent from every state contract on this screen
 *
 * The amount. §7a classes `contract_milestone` `sensitive` and the amount is
 * pgcrypto-encrypted at rest; publishing it into a `data-verify-*` attribute
 * would write a client's contract value into the DOM in clear for the
 * convenience of a test. The contracts carry `data-verify-amount-readable`
 * instead — a boolean about whether the decrypt worked, which is the only thing
 * an assertion actually needs.
 */

function Fraction({
  have,
  total,
  tone,
}: {
  have: number;
  total: number;
  tone: "coverage" | "shipped";
}) {
  const complete = total > 0 && have === total;
  return (
    <span
      // Named so a test can read the number that is actually painted. The row's
      // `data-verify-covered` / `data-verify-shipped` attributes would not
      // notice the two fractions being rendered into each other's columns, and
      // FR-75's whole point is that those two columns say different things.
      data-verify-unit={`fraction-${tone}`}
      className={cn(
        "ident tabular-nums",
        complete
          ? tone === "coverage"
            ? "text-state-verified font-medium"
            : "text-foreground font-medium"
          : "text-muted-foreground",
      )}
    >
      {have}/{total}
    </span>
  );
}

export function CommittedTable({
  milestones,
}: {
  milestones: readonly CommittedMilestone[];
}) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table
        data-verify-unit="committed-table"
        data-verify-rows={milestones.length}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">milestone</TableHead>
            <TableHead className="whitespace-nowrap">due</TableHead>
            <TableHead className="whitespace-nowrap text-right">amount</TableHead>
            <TableHead className="whitespace-nowrap">state</TableHead>
            <TableHead className="whitespace-nowrap text-right">covered</TableHead>
            <TableHead className="whitespace-nowrap text-right">shipped</TableHead>
            <TableHead className="whitespace-nowrap">invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.map((milestone) => {
            const acceptanceCount = milestone.acceptance.length;
            const amount = money(milestone.amount, milestone.currency);

            return (
              <TableRow
                key={milestone.milestone}
                data-verify-unit="committed-row"
                data-verify-id={milestone.milestone}
                data-verify-state={milestone.state}
                data-verify-contested={milestone.contested ? "true" : "false"}
                data-verify-covered={milestone.covered.length}
                data-verify-shipped={milestone.shipped.length}
                data-verify-acceptance={acceptanceCount}
                data-verify-regressed={milestone.regressed.length}
                // A boolean, never the figure. See the header note.
                data-verify-amount-readable={
                  milestone.amountUnreadable ? "false" : "true"
                }
                data-verify-submitted={
                  milestone.submitted === null ? "false" : "true"
                }
                data-verify-paid={milestone.paid === null ? "false" : "true"}
              >
                <TableCell className="max-w-sm align-top">
                  <span className="text-foreground block text-sm font-medium">
                    {milestone.name}
                  </span>
                  <span className="ident text-muted-foreground block text-xs">
                    {milestone.engagement}
                    <span className="text-muted-foreground/70">
                      {" · "}
                      {milestone.clientName}
                    </span>
                  </span>
                  <MilestoneAcceptance milestone={milestone} />
                </TableCell>

                <TableCell className="ident text-muted-foreground align-top whitespace-nowrap">
                  {isoDay(milestone.due) ?? (
                    <Absent title="This milestone has no due date." />
                  )}
                </TableCell>

                <TableCell className="ident align-top text-right tabular-nums whitespace-nowrap">
                  {amount === null ? (
                    milestone.amountUnreadable ? (
                      <span
                        data-verify-unit="amount-unreadable"
                        className="text-state-blocked text-xs"
                        title="This milestone's amount is stored as ciphertext that could not be read back. It is excluded from every total on this screen and counted separately — it is NOT being treated as zero."
                      >
                        {/* COPY: shown when an amount will not decrypt */}
                        unreadable
                      </span>
                    ) : (
                      <Absent title="No amount was recorded for this milestone." />
                    )
                  ) : (
                    <span className="text-foreground">{amount}</span>
                  )}
                </TableCell>

                <TableCell className="align-top">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <MilestoneStateChip state={milestone.state} />
                    {milestone.contested ? (
                      <ContestedChip
                        defects={milestone.contestingDefects.length}
                      />
                    ) : null}
                    {/* FR-64: a defect nobody graded, standing against one of
                        this milestone's acceptance requirements. It cannot make
                        the milestone `contested` — that needs a `critical` — and
                        it must not therefore go quiet. */}
                    {milestone.unclassifiedDefects.length > 0 ? (
                      <span
                        data-verify-unit="unclassified-defects"
                        data-verify-count={milestone.unclassifiedDefects.length}
                        title="Defects against this milestone's acceptance requirements whose severity the parser could not classify. An ungraded defect cannot contest a milestone, so it is stated here instead of being dropped."
                      >
                        <StateBadge state="unparsed" />
                      </span>
                    ) : null}
                  </span>
                </TableCell>

                <TableCell className="align-top text-right whitespace-nowrap">
                  <Fraction
                    have={milestone.covered.length}
                    total={acceptanceCount}
                    tone="coverage"
                  />
                </TableCell>

                <TableCell className="align-top text-right whitespace-nowrap">
                  <Fraction
                    have={milestone.shipped.length}
                    total={acceptanceCount}
                    tone="shipped"
                  />
                </TableCell>

                <TableCell className="ident align-top text-xs whitespace-nowrap">
                  {/* FR-54's invoice state is recorded, not derived. Both dates
                      are shown because "submitted" and "paid" are separate
                      facts and a single "invoiced" flag loses the gap between
                      them, which is the gap Erik chases. */}
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={
                        milestone.submitted === null
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground"
                      }
                    >
                      {/* COPY: invoice submitted / not submitted labels */}
                      {isoDay(milestone.submitted) ?? "not submitted"}
                    </span>
                    <span
                      className={
                        milestone.paid === null
                          ? "text-muted-foreground/50"
                          : "text-state-verified"
                      }
                    >
                      {/* COPY: invoice paid / not paid labels */}
                      {isoDay(milestone.paid) ?? "not paid"}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The per-requirement breakdown, behind a native `<details>`.
 *
 * `<details>` rather than a dialog or a client-side accordion, for the same
 * reason the filter bar is a GET form: it works before hydration, it is one tab
 * stop, and on this branch the CSP means "before hydration" is sometimes
 * "forever". It also prints.
 *
 * Every acceptance requirement gets its own row with **both** answers, because
 * the aggregate `3/4 covered · 3/4 shipped` on the parent row does not say
 * whether it is the same requirement missing from both.
 */
function MilestoneAcceptance({
  milestone,
}: {
  milestone: CommittedMilestone;
}) {
  if (milestone.acceptance.length === 0) {
    return (
      <p className="text-state-carried mt-1 text-xs">
        {/* COPY: warning that a milestone has no acceptance criteria at all */}
        No acceptance criteria are recorded, so nothing can cover or ship it.
      </p>
    );
  }

  const covered = new Set(milestone.covered);
  const shipped = new Set(milestone.shipped);
  const regressed = new Set(milestone.regressed);

  return (
    <details
      data-verify-unit="milestone-acceptance"
      data-verify-id={milestone.milestone}
      className="mt-1.5"
    >
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2">
        {/* COPY: the expander label for a milestone's acceptance requirements */}
        {milestone.acceptance.length} acceptance requirements
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {milestone.acceptance.map((ref) => (
          <li
            key={ref}
            data-verify-unit="acceptance-ref"
            data-verify-ref={ref}
            data-verify-covered={covered.has(ref) ? "true" : "false"}
            data-verify-shipped={shipped.has(ref) ? "true" : "false"}
            data-verify-regressed={regressed.has(ref) ? "true" : "false"}
            className="flex flex-wrap items-center gap-1.5"
          >
            <Ref value={ref} />
            <CoverageChip value={covered.has(ref) ? "covered" : "uncovered"} />
            <ShippedChip environments={milestone.shippedEnvironments[ref] ?? []} />
            {/* FR-70: a requirement this milestone once had covered and has
                lost. It is neither "covered" nor plainly "uncovered" — it is a
                thing that went backwards, and it says so. */}
            {regressed.has(ref) ? (
              <span
                data-verify-unit="regressed-ref"
                className="ident border-state-blocked/50 text-state-blocked inline-flex items-center rounded-md border border-dashed px-1.5 py-0.5 text-xs leading-none"
                title="FR-70: this acceptance requirement was covered and is not covered now."
              >
                {/* COPY: the label for an acceptance requirement that lost coverage */}
                regressed
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
