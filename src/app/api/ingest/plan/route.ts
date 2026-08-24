import { apiError, apiOk, INGEST_WRITE, withAgentRoute } from "@/lib/api";
import { parsePlanDocument } from "@/lib/ingest/planDocument";
import { ingestPlanDocument } from "@/lib/server/planned-work/plan-document";
import { parsePlanPayload } from "@/lib/server/planned-work/plan-payload";

/**
 * `POST /api/ingest/plan` — FR-87, FR-88, FR-90.
 *
 * Takes a plan document as TEXT and creates the planned `work_item` rows it
 * describes, then applies FR-90's reconciliation mark to the engagement.
 *
 * ## Why this is not part of `POST /api/ingest/run`
 *
 * **A plan is not a run artifact.** `ingestRun` has no slot for one on purpose:
 * a run reports what happened, and a plan states what is intended before any
 * run exists (FR-87). Folding a plan into a run payload would tie planned work
 * to a `fleet_run` row that does not and should not exist for it.
 *
 * ## How this route is gated
 *
 * `withAgentRoute(INGEST_WRITE, …)`. The write primitive underneath —
 * `createPlannedWorkItems` — deliberately carries **no** `'use server'` and
 * **no** `requireOperator()`, because its other caller is an operator form
 * action; it takes an already-authorised client and the caller owns the gate.
 * **This route is that gate**, and the wrapper is what supplies it:
 *
 *   1. **FR-4** the bearer token is verified before the handler runs at all;
 *   2. **FR-5** the token carries `ingest:write`, and `ctx.db` is scoped so the
 *      handler cannot reach `contract_milestone` or the other operator-only
 *      tables even by accident;
 *   3. **FR-8** the request is counted against the token's rate window first;
 *   4. **FR-6 / FR-59** exactly one `audit_log` row is written for every
 *      outcome, refusals included.
 *
 * `ingest:write` is reused rather than a new capability minted. It grants **no
 * new authority**: a token holding it can already insert `work_item` rows
 * through `POST /api/ingest/run`, and this route writes the same table under
 * the same §7a class. A new capability member would need a migration. Queued
 * for Erik anyway, because it is a capability boundary and those are not
 * decided quietly.
 *
 * ## Q12 — a document that is not a plan is rejected whole
 *
 * Not partially parsed, and not turned into a page of `unparsed` rows. It
 * leaves as a 400 naming the reason, because the caller posted something this
 * endpoint cannot act on and "200, zero rows written" is the quiet answer this
 * product exists to stop giving.
 *
 * The route is deliberately thin: validate, parse (pure), persist.
 */
export const POST = withAgentRoute(INGEST_WRITE, async ({ db, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const payload = parsePlanPayload(body);

  const parsed = parsePlanDocument(
    payload.text,
    payload.engagementSlug,
    payload.source,
  );

  if (parsed.kind === "not-a-plan") {
    const why =
      parsed.reason === "no-task-headings"
        ? "it carries no `### Task N: <title>` heading outside a code fence"
        : "its task headings carry no `- [ ]` steps";

    throw apiError(
      "invalid_request",
      `\`${payload.source}\` is not a plan document: ${why}. Nothing was ` +
        `written. A document of another shape is rejected whole rather than ` +
        `parsed into rows nobody can trust (Q12).`,
    );
  }

  const result = await ingestPlanDocument(db, parsed);

  return apiOk(
    {
      engagement: result.engagementSlug,
      source: result.source,
      tasksParsed: result.tasksParsed,
      written: result.written,
      // `ON CONFLICT DO NOTHING` on `(engagement_id, plan_ref)`. Idempotency,
      // not a merge — the existing row is left exactly as it is.
      skippedAsDuplicate: result.skippedAsDuplicate,
      planRefs: {
        present: result.tasksWithPlanRef,
        absent: result.tasksWithoutPlanRef,
      },
      // FR-90 / Q13. Every reconciliation marks and none merges, because no
      // artifact carries a shared key today — CR-005 §3.1a. That is the ruling
      // satisfied, not a gap: the false `done` rate is zero by construction.
      reconciliation: {
        marked: result.reconciliation.marked,
        collisions: result.reconciliation.collisionIds.length,
        plannedRows: result.reconciliation.plannedCount,
        ingestedRows: result.reconciliation.ingestedCount,
        alreadyMarked: result.reconciliation.alreadyMarked,
        merged: 0,
        mergeDeferred: "CR-005 §3.1a — FR-90's write half is not in M2.9.",
      },
      // Loud rather than dropped. Line numbers, never the prose on them: §7a
      // classifies `work_item` text `sensitive`, and a heading echoed into a
      // response is a heading in a log line.
      notPersisted: {
        unparsedTaskLines: result.unparsedTaskLines,
        steps: result.stepsNotPersisted,
      },
      unparsedDetail: {
        tasks: result.unparsedTaskLines.length,
        steps: result.unparsedSteps,
      },
    },
    // FR-58's count, and it is the work-item one: a task withheld because this
    // product did not understand its heading is a planned row Erik does not
    // have.
    { unparsed: result.unparsedTaskLines.length },
  );
});
