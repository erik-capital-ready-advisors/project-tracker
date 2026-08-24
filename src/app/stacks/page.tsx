import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { EmptyState, Screen } from "@/components/screen";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { setStackAgentCoveringAction } from "@/lib/server/stacks/actions";
import { readStackRegister } from "@/lib/stacks-load";

import { RegisterBlindnessPanel } from "./_components/register-blindness";
import { StackTable } from "./_components/stack-table";
import { TriggerRule } from "./_components/trigger-rule";

/**
 * This screen reads its own nav entry by **href**, not by position (B44).
 *
 * Six pages in this product still index `OPERATOR_ROUTES` positionally, `[0]`
 * through `[5]`, which is why B44 is open and why this unit's entry had to be
 * appended at the end. B44's prescribed fix is a lookup by href, and this is
 * that fix applied to the one call site this unit owns — it adds no eighth
 * positional index and it refactors none of the six, which are five files no
 * unit in this run owns.
 *
 * The `!` is load-bearing. If the `/stacks` entry is deleted or its href
 * changed, this module throws at import and every test that mounts this page
 * fails immediately. That is the point: B43 exists because two of run 29b583's
 * fixes were protected by nothing, and deleting them left the whole suite green
 * at exit 0.
 */
const NAV = OPERATOR_ROUTES.find((item) => item.href === "/stacks")!;

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * CR-007 §3, FR-104 to FR-109 — the register of which stacks the fleet covers,
 * at `/stacks`.
 *
 * ## What this screen is
 *
 * Every technology the ledger has ever observed, the hours accumulated on it,
 * the engagements it appears in, when it was first and last seen, and whether a
 * fleet agent covers it. It answers one question: **which specialist should the
 * fleet grow next, and does the evidence actually support growing it.**
 *
 * ## Q26 RULED — the word this screen does not use
 *
 * The route is `/stacks`, the title is "Stacks", and `coverage` is reused
 * nowhere: not as a filename, a directory, a component name, a class, a heading
 * or a line of visible copy. `src/lib/ingest/coverage.ts` already means
 * requirement and test coverage (FR-45 to FR-51) and a second meaning for this
 * product's most overloaded word is a defect on its own. Every label here says
 * **covering** or **agent**, after `stack.agent_covering`, which is what the
 * 2026-08-19 migration called the column. `i1` verified that by grep rather than
 * by intention and this unit did the same; the grep is in the build report.
 *
 * ## FR-108 is the answer, not the footer
 *
 * The blindness panel is the first thing under the header, above the table, and
 * its largest number is the count of sessions the register could **not** place.
 * On this ledger today that is one of two — half of everything captured. A
 * screen that rendered the single populated row and tucked that into a footnote
 * would have produced the wrong-`done` this product exists to refuse: it would
 * read as a register when what it is today is one observation beside a blind
 * spot of equal size.
 *
 * ## FR-108's three states are three different claims
 *
 * `no-sessions`   — nothing has been captured. The register has no data because
 *                   there is none. It says so, and it does not render an empty
 *                   table, because an empty table reads as "we looked and found
 *                   nothing to report" rather than "we have not looked".
 * `no-stacks`     — sessions exist and not one names a stack. The register has
 *                   seen work and can attribute none of it. This is a **third**
 *                   claim, distinct from both of FR-108's two, and it is the
 *                   state this ledger is one un-attributed session away from.
 * `observed`      — at least one stack is in the register, so every other figure
 *                   is a measurement rather than an absence.
 *
 * The blindness panel renders whenever there is anything to be blind about —
 * `no-stacks` and `observed`. Under `no-sessions` both denominators are zero and
 * a grid of zeros would restate the empty state in a form that looks like a
 * measurement.
 *
 * ## The engagement picker is deliberately absent here
 *
 * `/stacks` is not in `ENGAGEMENT_FILTERABLE_PATHS`, so the shell renders no
 * picker on this route. That is correct rather than an omission: FR-104 asks for
 * every stack the **ledger** has observed, `readStackRegister()` takes no
 * argument by design, and the engagement count on each row is the figure FR-106
 * compares against — narrowing the register to one engagement would make that
 * count meaningless while leaving the threshold in place. The screen says so
 * once, in words, because a reader used to the picker will notice its absence.
 *
 * ## Three outcomes, not two
 *
 * The rule every operator screen here follows. A failed read renders
 * `<OperatorLoadNotice>` and **never** an empty state: a screen that renders
 * "no stacks" after a failed query has told Erik the ledger is empty without
 * looking at it. That is the same class of mistake as rendering an unknown count
 * as `0`.
 *
 * ## Security
 *
 * `stack` is §7a `internal` and renders freely. `work_session` is `sensitive` on
 * `summary`, and this screen never reaches it — `readStackRegister()` is the
 * only read on this path, `i1` proved four independent ways that the column is
 * neither selected nor decrypted, and this unit added no second read. FR-106's
 * clause two mentions contract milestones (`sensitive`, refused to agent tokens
 * entirely); the screen renders a notice saying that clause is not evaluated,
 * which touches no `contract_milestone` data at all.
 *
 * **B29 inherited, named, not deepened.** The read and the write both run as
 * `service_role` (`BYPASSRLS`), so `requireOperator()` is the whole of the
 * authorisation on both. This unit adds no new `service_role` mechanism and
 * introduces no new surface; it binds the two `i1` built.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="register-state"       data-verify-state=<RegisterState>
 *   data-verify-unit="mode-2-capture-claim" (Q25's sentence, above the table)
 *   data-verify-unit="ledger-wide-note"
 *   data-verify-unit="no-stacks-notice"     data-verify-sessions-total
 *   plus `register-blindness`, `trigger-rule`, `stack-table` and
 *   `agent-covering-dialog`, each documented in its own file.
 */
export default async function StacksPage() {
  // `readStackRegister()` calls `requireOperator()` itself — the gate belongs
  // beside the query, not in a caller that a second call site could forget.
  const result = await loadForOperator(() => readStackRegister());
  const register = result.ok ? result.data : null;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {register === null ? null : (
        <div
          data-verify-unit="register-state"
          data-verify-state={register.state}
          className="flex flex-col gap-6"
        >
          {register.state === "no-sessions" ? (
            <EmptyState
              headline="No work session has been captured yet, so there is nothing to attribute."
              detail={
                "This is not a register reporting that no stack has earned a specialist — " +
                "it is a register with nothing in it, which is a different claim and the " +
                "only honest one available. A stack appears here the first time a captured " +
                "session names it."
              }
            />
          ) : (
            <RegisterBlindnessPanel
              blindness={register.blindness}
              state={register.state}
            >
              {/*
                Q25 RULED, and this is where the sentence sits.

                Every `work_session` row is counted with no filter by executor,
                by execution mode or by `source`, and the screen states that they
                are all Mode 2 capture. The claim is placed here — inside the
                panel that holds the session denominators, directly above the
                hours column it governs, in body text rather than a tooltip or a
                footnote — because the point of the ruling is that the sentence
                must be READ. The day something other than the session hook
                writes a `work_session`, this becomes visibly wrong instead of
                quietly wrong, and that is the whole design.
              */}
              <p
                data-verify-unit="mode-2-capture-claim"
                className="border-border text-foreground max-w-3xl border-l-2 py-0.5 pl-3 text-sm"
              >
                Every session counted here is{" "}
                <strong className="font-semibold">Mode 2 capture</strong> —
                Erik hand-prompting Claude, recorded by the session hook. Nothing
                else in this product writes a work session today, and the hours
                below are summed from all of them with no filter by executor, by
                execution mode or by source. If another producer ever starts
                writing sessions, this sentence becomes wrong where you can see
                it rather than wrong where you cannot.
              </p>
            </RegisterBlindnessPanel>
          )}

          <TriggerRule
            thresholds={register.thresholds}
            blockingMilestone={register.blockingMilestone}
          />

          {register.state === "no-stacks" ? (
            <div
              data-verify-unit="no-stacks-notice"
              data-verify-sessions-total={register.blindness.sessionsTotal}
              className="border-border rounded-lg border border-dashed px-6 py-8 text-center"
            >
              <p className="text-foreground text-sm font-medium">
                Sessions have been captured. Not one of them names a stack.
              </p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xl text-sm">
                All {register.blindness.sessionsTotal} of them are counted above
                and none can be attributed, so there is no row to draw and no
                stack to evaluate. This is not an empty register, and it is not a
                register reporting that nothing has earned a specialist. It is a
                register that has seen work and can place none of it.
              </p>
            </div>
          ) : null}

          {register.state === "observed" ? (
            <>
              <StackTable
                stacks={register.stacks}
                thresholds={register.thresholds}
                onSetAgentCovering={setStackAgentCoveringAction}
              />

              <p
                data-verify-unit="ledger-wide-note"
                className="text-muted-foreground text-xs"
              >
                This register is ledger-wide and carries no engagement filter, so
                the shell offers no picker on this screen. Narrowing it to one
                engagement would leave FR-106&rsquo;s threshold in place while
                making the engagement count it is compared against mean something
                else. Rows are ordered by name; the order states nothing about
                which stack matters most.
              </p>
            </>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
