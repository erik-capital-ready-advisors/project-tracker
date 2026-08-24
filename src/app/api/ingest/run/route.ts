import { apiError, apiOk, INGEST_WRITE, withAgentRoute } from "@/lib/api";
import { parseRunPayload } from "@/lib/server/ingest/payload";
import { persistPlan } from "@/lib/server/ingest/persist";
import { planRun } from "@/lib/server/ingest/plan";
import { markPlanCollisions } from "@/lib/server/planned-work/mark-collisions";
import type { ReleaseDb } from "@/lib/server/releases/db";

/**
 * `POST /api/ingest/run` — FR-14 to FR-23.
 *
 * Takes the artifacts of one fleet run as TEXT and persists what they say.
 *
 * ## FR-23, and why it is structural rather than a promise
 *
 * "Ingest never writes to the source repository." This route imports no `fs`,
 * no `path` and no `child_process`, and it receives file CONTENTS rather than
 * file paths — `payload.ts` rejects any name carrying a path separator. There is
 * no handle here to write through. The pure package underneath it is bound by
 * the same rule from the other side: `src/lib/ingest` is 19 modules of functions
 * over strings, and the only `node:fs` import in the whole package is inside a
 * test.
 *
 * ## What the response carries, and why it is shaped like this
 *
 * `unparsed` is the count FR-58 requires on every endpoint, and it is the
 * work-item count specifically — the number Erik is asked to trust. The other
 * counts sit under `data`, including the ones this route deliberately did NOT
 * persist, because a record parsed and dropped in silence is the failure mode
 * this whole product is a reaction to.
 *
 * The route is deliberately thin: validate, plan (pure), persist. All three are
 * separately testable and only the third needs a database.
 */
export const POST = withAgentRoute(INGEST_WRITE, async ({ db, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const artifacts = parseRunPayload(body);

  let plan;
  try {
    plan = planRun(artifacts);
  } catch {
    // `normalizeQuestions` calls `JSON.parse` per line and throws on a malformed
    // one. That is a 400 about the caller's payload, not a 500 about this
    // server — and without this it would read as the latter.
    throw apiError(
      "invalid_request",
      "An artifact could not be parsed. The most likely cause is a malformed " +
        "line in a `questionFiles` entry, which must be JSON Lines.",
    );
  }

  const result = await persistPlan(db, plan);

  /**
   * FR-90, the direction that lands second.
   *
   * A run ingested into an engagement that already holds planned rows is the
   * same reconciliation as a plan ingested into one that already holds run
   * work items — the meeting FR-90 describes, arriving in the other order.
   * Marking only on the plan path would leave a real collision unmarked
   * whenever the run came last, so both paths call the one shared function and
   * cannot disagree about what a collision is.
   *
   * It is idempotent (`plan_reconciliation = 'unreconciled'` is a filter on the
   * update, not just a read), so re-posting a run marks nothing twice, and it
   * never resets a row some later milestone has marked `keyed`.
   *
   * Nothing is merged here. CR-005 §3.1a defers FR-90's write half, and no
   * artifact carries a shared key today in any case.
   */
  const reconciliation = await markPlanCollisions(
    db as unknown as ReleaseDb,
    result.engagementId,
  );

  return apiOk(
    {
      engagement: plan.engagementSlug,
      run: plan.runId,
      fleetRunId: result.fleetRunId,
      persisted: result.counts,
      reconciliation: {
        marked: reconciliation.marked,
        collisions: reconciliation.collisionIds.length,
        plannedRows: reconciliation.plannedCount,
        merged: 0,
      },
      unresolved: {
        dependencies: result.unresolvedDependencies,
        blockers: result.unresolvedBlockers,
      },
      // FR-20's tracker is parsed and handed back rather than stored. See
      // `notPersisted` for the reason, which is a §7a classification gap.
      trackerMilestones: plan.trackerMilestones,
      gates: plan.fleetRun.gates,
      testCounts: {
        passed: plan.fleetRun.tests_passed,
        failed: plan.fleetRun.tests_failed,
        skipped: plan.fleetRun.tests_skipped,
      },
      notPersisted: plan.summary.notPersisted,
      unmappable: plan.summary.unmappable,
      validationErrors: plan.summary.validationErrors,
      unparsedDetail: {
        workItems: plan.summary.unparsedWorkItems,
        // FR-64. A finding whose severity heading this product does not know is
        // reported at its own count rather than graded into the nearest bucket.
        defects: plan.summary.unparsedDefects,
        trackerMilestones: plan.summary.unparsedTrackerMilestones,
        gates: plan.summary.unparsedGates,
      },
    },
    { unparsed: plan.summary.unparsedWorkItems },
  );
});
