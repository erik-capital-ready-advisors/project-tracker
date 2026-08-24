import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { loadForOperator } from "@/lib/operator-load";
import { readRunDetail } from "@/lib/runs-load";
import { isoToday } from "@/lib/today";

import { AmbiguousRuns } from "./_components/ambiguous-runs";
import { RunDetailView } from "./_components/run-detail-view";

export const metadata = { title: "Fleet run — Delivery Ledger" };

export const dynamic = "force-dynamic";

const SCREEN = "Fleet run";
const QUESTION =
  "Everything one fleet run recorded: the units it dispatched, the questions it queued, the requirements it touched, and the gates it reported.";
const REQUIREMENTS = ["FR-93", "FR-94", "FR-95"];

/**
 * FR-93 / FR-94 / FR-95 — one fleet run (CR-005 §3.2, M2.8).
 *
 * ## Four outcomes, not three
 *
 * `/work-items/[id]` and the other seven M2.7 detail views have three, and this
 * route's structure is theirs plus one:
 *
 *   * **The read was refused or failed** → `OperatorLoadNotice`. Not an empty
 *     state and not a 404 — a screen that renders "nothing here" after a failed
 *     read has reported a clean ledger without looking at one.
 *   * **No run carries this id** → `notFound()`. Called **outside**
 *     `loadForOperator`, because `notFound()` signals by throwing and a `try`
 *     around it would swallow it into the failure notice.
 *   * **More than one run carries this id** → `AmbiguousRuns`, rendered.
 *   * **Exactly one** → the view.
 *
 * ## Why `ambiguous` is a screen and not a 404
 *
 * `fleet_run`'s constraint is `unique (engagement_id, run_id)`, so a run id is
 * unique **within an engagement** and not across the ledger — while FR-92 makes
 * `/runs` cross-engagement. Run ids are six hex characters, so a collision is
 * waiting rather than theoretical. Collapsing it into `not_found` would tell a
 * reader that a run they can see on `/runs` does not exist; taking the first
 * match would render one engagement's run under an id that also belongs to
 * another's, with nothing on the screen saying so. Both are wrong answers that
 * look checked, so the state is rendered instead. i1 queued the routing question
 * for Erik and this unit does not pre-empt his ruling by inventing an
 * engagement-scoped route key.
 *
 * It cannot fire on today's data — one run, two engagements — and it is built
 * and tested anyway, because a branch nothing has ever exercised is
 * indistinguishable from a branch that does not work.
 *
 * ## The gate is not here, on purpose
 *
 * `readRunDetail` calls `requireOperator()` inside, beside the query. A gate
 * that lives in the caller is a gate the second call site forgets, and this
 * route and `/runs` were built by two units in parallel — exactly the shape
 * that produces a second call site. This page adds none and removes none;
 * `loadForOperator` reads the operator context first only to tell the four
 * refusal reasons apart for the notice.
 *
 * ## FR-94 is answered here, and it is NOT the shell badge
 *
 * `UnparsedCount` is mounted in `AppShell` in the single root layout, so every
 * route reports FR-58's **global** census structurally. FR-94 asks for a
 * different number: *this run's own* count. The two genuinely disagree on
 * today's data — the badge reads `0` while run `b0952e` reads `1`, because
 * `fleet_run.verdict` is literally the word `unparsed` and the global census's
 * population is three tables that do not include `fleet_run`. So the run's count
 * is rendered under its own `data-verify-unit="run-unparsed"` and never under
 * `unparsed-count`: two elements answering the same selector is an ambiguous
 * assertion at best and two different numbers at worst.
 *
 * ## §7a — no decrypted prose reaches this route
 *
 * Every projection behind `readRunDetail` is listed in
 * `@/lib/server/runs/columns.ts` and every one of them is clear. This screen
 * says *which* unit or question to open; the eight M2.7 detail views are where
 * prose is decrypted, behind their own gate. No `data-verify-*` attribute on
 * this route or its components carries a value from an encrypted column.
 *
 * ## FR-86 — no new agent-reachable surface
 *
 * This is a React Server Component and there is no `route.ts` beside it.
 */
export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ "run-id": string }>;
}) {
  const { "run-id": runId } = await params;
  const result = await loadForOperator(() => readRunDetail(runId));

  if (!result.ok) {
    return (
      <Screen title={SCREEN} question={QUESTION} requirements={REQUIREMENTS}>
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={SCREEN}
        />
      </Screen>
    );
  }

  // A run id that names no row is a 404, not an empty run.
  if (result.data.state === "not_found") notFound();

  if (result.data.state === "ambiguous") {
    return (
      <Screen
        title={SCREEN}
        question={QUESTION}
        requirements={REQUIREMENTS}
      >
        <AmbiguousRuns runId={runId} matches={result.data.matches} />
      </Screen>
    );
  }

  return <RunDetailView run={result.data.run} asOf={isoToday()} />;
}
