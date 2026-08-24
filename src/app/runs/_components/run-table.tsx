import Link from "next/link";

import { Absent } from "@/components/answer-chips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NOT_RECORDED } from "@/lib/registry-display";
import type {
  DispatchUsage,
  ListedRun,
  RunDuration,
  TestTriple,
} from "@/lib/runs-load";
import { cn } from "@/lib/utils";

import { RunUnparsedCell } from "./run-unparsed";
import { RunVerdict } from "./run-verdict";

/**
 * FR-92 -- one row per ingested fleet run, newest first, across every
 * engagement.
 *
 * ## This table was designed against the data it will actually render
 *
 * There is **one** `fleet_run` row today and most of its columns are NULL:
 * `dispatch_cap`, `dispatches_used` and all three test counts are unset, the
 * verdict is the literal word `unparsed`, and the duration is a genuine zero
 * because the ingest read the same instant for start and end. A table that only
 * looks composed once every column is populated is a table nobody has looked at,
 * so the not-recorded treatments below are designed as first-class cells rather
 * than as a fallback: each one **states** what was not recorded, in words, and
 * none of them is a bare blank that reads as a rendering bug.
 *
 * ## NULL is not zero, on every numeric column here (D3)
 *
 * The one rule this table cannot get wrong. `0m` and "no end recorded" are
 * different facts; `0 of 20` and "no dispatch count recorded" are different
 * facts; `0 / 0 / 0` and "no test counts recorded" are different facts. In each
 * pair the first asserts a measurement and the second reports its absence, and
 * collapsing them would let "nobody wrote this down" read as "we checked and it
 * was nothing" -- the wrong-`done` this product exists to prevent, in miniature,
 * five times over. `@/lib/runs-display` keeps them apart by construction and
 * every cell below keeps them apart on screen.
 *
 * A **measured** zero is still rendered as a zero, loudly and without hedging.
 * Refusing to state a real zero is the opposite failure and just as bad.
 *
 * ## Colour restraint
 *
 * Spec 5a reserves the semantic scale for its named states, so a duration, a
 * dispatch ratio and a test triple carry none -- including a non-zero `failed`,
 * which is deliberately not painted red here. It is a count the artifact
 * *claimed*, never a result this product observed, and `@/lib/runs-display`'s
 * header is explicit about that distinction; giving it the weight of an observed
 * failure would overstate what the row knows. Recorded in the build report as a
 * decision rather than an oversight.
 *
 * The two exceptions are the two states that *are* on the scale: `unparsed`
 * (hatched fuchsia, reused, never re-invented) and a nonsense value such as a
 * run that ends before it starts, which rides the `blocked` family so it reads
 * as visibly wrong rather than blending in.
 *
 * ## No prose reaches this table (D4)
 *
 * `listRuns` selects no ciphertext column, so there is nothing here to withhold.
 * The identifiers below -- run id, branch, mode, engagement slug -- are clear by
 * §7a, and the verdict is a status token from the artifact rather than prose. No
 * `data-verify-*` attribute on this screen carries content of any kind.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-table"
 *   data-verify-unit="run-row"        data-verify-run-id, data-verify-mode,
 *                                      data-verify-verdict-agreement
 *   data-verify-unit="run-link"       data-verify-run-id
 *   data-verify-unit="run-duration"   data-verify-duration-state,
 *                                      data-verify-minutes (known only)
 *   data-verify-unit="run-dispatches" data-verify-dispatch-state
 *   data-verify-unit="run-tests"      data-verify-tests-state
 *   plus `run-verdict` and `run-unparsed`, documented in their own files.
 */

/** The shared treatment for "the ledger recorded nothing here". */
const NOT_RECORDED_CLASS = "ident text-muted-foreground/70 text-xs";

function NotRecorded({ title }: { title: string }) {
  return (
    <span className={NOT_RECORDED_CLASS} title={title}>
      {NOT_RECORDED}
    </span>
  );
}

const DURATION_UNKNOWN: Record<
  Exclude<RunDuration, { state: "known" }>["reason"],
  { label: string; title: string; nonsense: boolean }
> = {
  no_start: {
    label: "no start recorded",
    title:
      "This run has no recorded start, so no duration can be derived. It is " +
      "not a run that took no time.",
    nonsense: false,
  },
  no_end: {
    label: "no end recorded",
    title:
      "This run has no recorded end. It may still be running, or the " +
      "checkpoint it was read from stated no finish time -- either way, no " +
      "duration can be derived.",
    nonsense: false,
  },
  ends_before_start: {
    label: "ends before it starts",
    title:
      "This run's recorded end precedes its recorded start. That is reported " +
      "rather than clamped to zero: a nonsense value turned into a clean " +
      "looking 0m is a wrong answer that looks checked.",
    nonsense: true,
  },
};

function DurationCell({ duration }: { duration: RunDuration }) {
  if (duration.state === "known") {
    return (
      <span
        data-verify-unit="run-duration"
        data-verify-duration-state="known"
        data-verify-minutes={duration.minutes}
        className="ident text-foreground/80 text-xs"
        title={
          duration.minutes === 0
            ? "A measured zero: this run's recorded start and end are the same " +
              "instant. A run with no recorded end reads differently, and the " +
              "two are never rendered the same way."
            : undefined
        }
      >
        {duration.label}
      </span>
    );
  }

  const unknown = DURATION_UNKNOWN[duration.reason];

  return (
    <span
      data-verify-unit="run-duration"
      data-verify-duration-state={duration.reason}
      className={cn(
        unknown.nonsense
          ? "ident border-state-blocked/50 bg-state-blocked/10 text-state-blocked inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none font-semibold whitespace-nowrap"
          : NOT_RECORDED_CLASS,
      )}
      title={unknown.title}
    >
      {unknown.label}
    </span>
  );
}

/**
 * FR-92's "dispatches used against cap".
 *
 * ## Why this cell is written as though `unknown` were the normal case
 *
 * Because it is, and permanently. `dispatch_cap` and `dispatches_used` exist in
 * the migration and in the generated types and **nothing in this product writes
 * either one** -- `i1` grepped `src/`, `tests/` and `e2e/` and found no producer
 * at all. So this is the consumer half of a seam whose producer half was never
 * built, and `unknown` is not a degraded branch here: it is the only branch that
 * will ever run until an ingest path starts recording those numbers.
 *
 * That is the shape a graceful fallback hides best -- it has no failing state,
 * so it looks correct forever and nobody notices the gap. Hence two things: this
 * cell states the absence in words instead of showing a dash, and the screen
 * carries a note naming the missing producer for as long as **every** run reads
 * unknown. Neither of them is `0 of 0`, which would claim a cap this run never
 * ran under.
 */
function DispatchCell({ dispatches }: { dispatches: DispatchUsage }) {
  if (dispatches.state === "known") {
    return (
      <span
        data-verify-unit="run-dispatches"
        data-verify-dispatch-state="known"
        className="ident text-foreground/80 text-xs"
      >
        {dispatches.label}
      </span>
    );
  }

  if (dispatches.state === "partial") {
    return (
      <span
        data-verify-unit="run-dispatches"
        data-verify-dispatch-state="partial"
        className="ident text-foreground/80 text-xs"
        title="Only half of this pair was recorded. The missing half is shown as a question mark rather than filled in from the manifest's budget -- a cap this product inferred is not a cap the run ran under."
      >
        {dispatches.used ?? "?"} of {dispatches.cap ?? "?"}
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-dispatches"
      data-verify-dispatch-state="unknown"
    >
      <NotRecorded title="Neither a dispatch count nor a cap was recorded for this run. Nothing in the product currently writes these two columns, so this reads not recorded on every run." />
    </span>
  );
}

/**
 * The reported test triple, as `passed / failed / skipped`.
 *
 * These are counts the artifact **claimed**, never results this product
 * observed. A missing count renders `?` and never `0`: `0 / 0 / 0` states that a
 * suite ran and found nothing, and the artifact stated no counts at all.
 */
function TestsCell({ tests }: { tests: TestTriple }) {
  if (tests.state === "unknown") {
    return (
      <span data-verify-unit="run-tests" data-verify-tests-state="unknown">
        <NotRecorded title="This run's report stated no test counts. That is different from a suite that ran and passed nothing, which would be recorded as zeros." />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-tests"
      data-verify-tests-state={tests.state}
      className="ident text-foreground/80 text-xs"
      title={
        tests.label ??
        "Some of this run's test counts were not recorded and are shown as a " +
          "question mark rather than as zero. These are counts the run's own " +
          "report claimed, not results this product observed."
      }
    >
      {tests.passed ?? "?"} / {tests.failed ?? "?"} / {tests.skipped ?? "?"}
    </span>
  );
}

export function RunTable({ runs }: { runs: readonly ListedRun[] }) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table data-verify-unit="run-table">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">run</TableHead>
            <TableHead className="whitespace-nowrap">engagement</TableHead>
            <TableHead className="whitespace-nowrap">branch</TableHead>
            <TableHead className="whitespace-nowrap">mode</TableHead>
            <TableHead className="whitespace-nowrap">verdict</TableHead>
            <TableHead className="whitespace-nowrap">duration</TableHead>
            <TableHead className="whitespace-nowrap">dispatches</TableHead>
            <TableHead className="whitespace-nowrap">tests p / f / s</TableHead>
            <TableHead className="whitespace-nowrap">unparsed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              data-verify-unit="run-row"
              data-verify-run-id={run.runId}
              data-verify-mode={run.mode ?? "unknown"}
              data-verify-verdict-agreement={run.verdict.agreement}
            >
              <TableCell className="font-medium whitespace-nowrap">
                <Link
                  href={`/runs/${run.runId}`}
                  data-verify-unit="run-link"
                  data-verify-run-id={run.runId}
                  className="ident hover:text-foreground underline-offset-2 hover:underline"
                >
                  {run.runId}
                </Link>
              </TableCell>

              <TableCell className="text-muted-foreground whitespace-nowrap">
                {run.engagement === null ? (
                  <Absent title="This run's engagement could not be read." />
                ) : (
                  <Link
                    href={`/registry/${run.engagement.slug}`}
                    data-verify-unit="engagement-link"
                    data-verify-slug={run.engagement.slug}
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {run.engagement.clientName}{" "}
                    <span className="ident text-muted-foreground/70 text-xs">
                      {run.engagement.slug}
                    </span>
                  </Link>
                )}
              </TableCell>

              <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                {run.branch ?? (
                  <NotRecorded title="No branch was recorded for this run." />
                )}
              </TableCell>

              <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                {run.mode ?? (
                  <NotRecorded title="No mode was recorded for this run." />
                )}
              </TableCell>

              <TableCell>
                <RunVerdict verdict={run.verdict} />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <DurationCell duration={run.duration} />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <DispatchCell dispatches={run.dispatches} />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <TestsCell tests={run.tests} />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <RunUnparsedCell unparsed={run.unparsed} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
