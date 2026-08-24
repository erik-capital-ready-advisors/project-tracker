import type { WorkStatus } from "@/lib/ingest/types";
import {
  dispatchUsage,
  renderGates,
  runDuration,
  runUnparsed,
  runVerdict,
  testTriple,
} from "@/lib/runs-display";
import {
  fromDisposition,
  fromExecutionMode,
  fromExecutorKind,
  fromNullableEvidenceScope,
  fromWorkStatus,
} from "@/lib/server/answers/from-db";
import { IN_CHUNK, chunk, fetchAllRows } from "@/lib/server/answers/db";
import type { AnswerQuery } from "@/lib/server/answers/db";
import { LoadError } from "@/lib/server/answers/load";
import { labelEntities, refFromId, resolveRefs, resolvedId } from "@/lib/server/detail/refs";
import type { RefQuery } from "@/lib/server/detail/refs";
import { fetchWhere, num, requiredText, text } from "@/lib/server/detail/rows";
import type { Row } from "@/lib/server/detail/rows";
import type { DetailEngagement, DetailRef } from "@/lib/server/detail/types";
import { danglingRef, toRef } from "@/lib/server/detail/types";
import { isPlannedRow } from "@/lib/server/workitems/planned";

import {
  FLEET_RUN_COLUMNS,
  RUN_DEFECT_COLUMNS,
  RUN_QUESTION_COLUMNS,
  RUN_WORK_ITEM_COLUMNS,
  RUN_WORK_ITEM_REQUIREMENT_COLUMNS,
} from "./columns";
import { fetchEngagements } from "./list";
import type {
  RunDefects,
  RunDetail,
  RunDetailResult,
  RunIdentity,
  RunQuestion,
  RunRequirements,
  RunWorkUnit,
  RunsDb,
} from "./types";

/**
 * FR-93 — one run: its work units, the questions it queued, the defects it
 * opened, the requirements it touched, and its `gates` payload.
 *
 * ## The route key is `run_id`, which is not a primary key
 *
 * `/runs/[run-id]` is keyed by the human run id (`b0952e`) because FR-93 says so
 * and because that is what a person reads off a manifest. The migration's
 * constraint is `unique (engagement_id, run_id)`, so the id is unique **within**
 * an engagement and not across the ledger. Two matches is therefore a state this
 * function returns rather than a case it resolves — see `RunDetailResult`.
 *
 * ## What is read and what is deliberately not
 *
 * Every projection comes from `./columns.ts` and every one of them is clear
 * under §7a. **Nothing on this path decrypts anything**, and no `decrypt_field`
 * RPC is issued: this is a listing of a run's contents, and the eight detail
 * views built in M2.7 are where a reader goes for the prose. A work unit's
 * `raw_status`, a question's `question` and `best_guess`, a defect's
 * `description` — all of them are one click away at their own detail view, and
 * none of them is loaded here to be summarised on the way past.
 */
export async function loadRunDetail(
  db: RunsDb,
  runId: string,
): Promise<RunDetailResult> {
  const trimmed = runId.trim();
  if (trimmed === "") return { state: "not_found" };

  const rows = await fetchWhere(db, "fleet_run", FLEET_RUN_COLUMNS, "run_id", trimmed);
  if (rows.length === 0) return { state: "not_found" };

  const engagements = await fetchEngagements(
    db,
    rows.map((row) => requiredText(row.engagement_id)),
  );

  if (rows.length > 1) {
    return {
      state: "ambiguous",
      matches: rows.map((row) => identity(row, engagements)),
    };
  }

  const row = rows[0];
  const id = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);
  const gates = renderGates(row.gates);
  const verdict = text(row.verdict);

  // Work units first, because both the defect edge and the requirement join are
  // reached *through* them — `work_item` is the only table holding a run key.
  const [workUnits, questions] = await Promise.all([
    loadWorkUnits(db, id),
    loadQuestions(db, engagementId, trimmed),
  ]);

  const workItemIds = workUnits.map((unit) => unit.id);

  const [defects, requirementList] = await Promise.all([
    loadDefects(db, workItemIds),
    loadRequirements(db, engagementId, workItemIds),
  ]);

  return {
    state: "found",
    run: {
      ...identity(row, engagements),
      startedAt: text(row.started_at),
      endedAt: text(row.ended_at),
      verdict: runVerdict({ verdict }),
      duration: runDuration(text(row.started_at), text(row.ended_at)),
      dispatches: dispatchUsage(num(row.dispatches_used), num(row.dispatch_cap)),
      tests: testTriple(
        num(row.tests_passed),
        num(row.tests_failed),
        num(row.tests_skipped),
      ),
      gates,
      unparsed: runUnparsed({
        unparsedWorkItems: workUnits.filter((unit) => unit.status === "unparsed")
          .length,
        gates,
        verdict,
      }),
      workUnits: workUnits.map((unit) => unit.view),
      questions,
      defects,
      requirements: requirementList,
    } satisfies RunDetail,
  };
}

function identity(
  row: Row,
  engagements: Map<string, DetailEngagement>,
): RunIdentity {
  return {
    id: requiredText(row.id),
    runId: requiredText(row.run_id),
    engagement: engagements.get(requiredText(row.engagement_id)) ?? null,
    branch: text(row.branch),
    mode: text(row.mode),
  };
}

/* -------------------------------------------------------------------------- */
/* Work units                                                                  */
/* -------------------------------------------------------------------------- */

interface LoadedWorkUnit {
  id: string;
  /** Lifted out of `view` so the FR-94 count reads it without re-deriving. */
  status: WorkStatus;
  view: RunWorkUnit;
}

/**
 * FR-93's "its work units and their outcomes".
 *
 * `work_item.fleet_run_id` is the only foreign key edge from a run to anything,
 * and it is set on all 20 work items in the ledger today. Ordered by `phase`
 * then `unit` so a reader sees the run's own shape rather than uuid order; both
 * are nullable and rows missing either sort last, which is stated rather than
 * hidden because it is the same non-chronology caveat the listing carries.
 */
async function loadWorkUnits(db: RunsDb, fleetRunId: string): Promise<LoadedWorkUnit[]> {
  const rows = await fetchWhere(
    db,
    "work_item",
    RUN_WORK_ITEM_COLUMNS,
    "fleet_run_id",
    fleetRunId,
  );

  const labels = await labelEntities(
    db,
    "work_item",
    rows.map((row) => requiredText(row.id)),
  );

  const units = rows.map((row): LoadedWorkUnit => {
    const id = requiredText(row.id);
    const status = fromWorkStatus(row.status);

    return {
      id,
      status,
      view: {
        ref: refFromId("work_item", id, labels),
        unit: text(row.unit),
        status,
        executionMode: fromExecutionMode(row.execution_mode),
        executorKind: fromExecutorKind(row.executor_kind),
        executor: text(row.executor),
        workType: text(row.work_type),
        phase: num(row.phase),
        disposition: fromDisposition(row.disposition),
        evidenceScope: fromNullableEvidenceScope(row.evidence_scope),
        notVerifiedCount: num(row.not_verified_count) ?? 0,
        startedAt: text(row.started_at),
        endedAt: text(row.ended_at),
        // FR-87 read off the raw columns, deliberately: `execution_mode` above
        // has already been through `fromExecutionMode`, which folds a planned
        // row's NULL into the `unparsed` sentinel.
        planned: isPlannedRow({
          execution_mode: row.execution_mode,
          status: row.status,
        }),
        updatedAt: text(row.updated_at),
      },
    };
  });

  units.sort((a, b) => {
    const phase = orderNullLast(a.view.phase, b.view.phase);
    if (phase !== 0) return phase;
    return orderNullLast(a.view.unit, b.view.unit);
  });

  return units;
}

function orderNullLast<T extends string | number>(a: T | null, b: T | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* Questions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * FR-93's "the questions it queued".
 *
 * ## The join is `(engagement_id, run)` and never `run` alone
 *
 * `open_question.run` is `text` and **not a foreign key** — it holds the run id
 * as a person writes it, which `@/lib/server/detail/open-question.ts` already
 * documents as a stored relationship rather than a derived one. Because
 * `fleet_run.run_id` is only unique per engagement, matching on `run` alone
 * would pull another engagement's questions onto this run's page the moment two
 * engagements share an id. Both halves of the key are therefore applied.
 *
 * Measured 2026-08-23: 96 of 96 `open_question` rows carry `run = 'b0952e'` and
 * join to the single `fleet_run` row this way.
 *
 * Clear columns only — see `./columns.ts`.
 */
async function loadQuestions(
  db: RunsDb,
  engagementId: string,
  runId: string,
): Promise<RunQuestion[]> {
  const result = await fetchAllRows(db, "open_question", RUN_QUESTION_COLUMNS, (query) =>
    query.eq("engagement_id", engagementId).eq("run", runId),
  );
  if (result.error) throw new LoadError("open_question", result.error);

  const labels = await labelEntities(
    db,
    "open_question",
    result.rows.map((row) => requiredText(row.id)),
  );

  const questions = result.rows.map((row): RunQuestion => {
    const id = requiredText(row.id);
    return {
      ref: refFromId("open_question", id, labels),
      unit: text(row.unit),
      section: text(row.section),
      // `low | med | high | null`. `toConfidence` already maps an unrecognised
      // wire value to NULL at ingest rather than rounding it to a label, so a
      // null here is never coerced into one of the three to look complete.
      confidence: text(row.confidence),
      status: requiredText(row.status),
      answeredBy: text(row.answered_by),
      answeredAt: text(row.answered_at),
    };
  });

  questions.sort((a, b) => {
    const unit = orderNullLast(a.unit, b.unit);
    if (unit !== 0) return unit;
    return orderNullLast(a.section, b.section);
  });

  return questions;
}

/* -------------------------------------------------------------------------- */
/* Defects — the finding, not a list                                           */
/* -------------------------------------------------------------------------- */

/**
 * FR-93's "the defects it opened", answered with what the schema can support.
 *
 * ## There is no opened-by edge, and none is inferred
 *
 * `RunDefects.opened` is `null` and typed `null`. The reasoning is on the type;
 * the part that belongs here is what this function refuses to do. It does **not**
 * fall back to `defect.reported_by`, to a `source_key` naming the run's artifact
 * file, to a `ref` prefix, or to `reported_at` falling inside the run's window.
 * Every one of those would produce a plausible list, none of them is a
 * relationship the ledger records, and a plausible list is worse than an absent
 * one — it is the wrong-`done` failure arriving through a heuristic instead of
 * through a parser.
 *
 * What it does read is the single modelled edge: `fixing_work_item_id` pointing
 * at one of this run's work items, which means *this run fixed that defect*.
 * That is a real fact and a different one from FR-93's question, so it is
 * returned under its own name. Measured 2026-08-23: NULL on all 13 defect rows,
 * so this list is empty today — empty because it was queried and came back
 * empty, which the caller can distinguish from `opened`'s `null`.
 */
async function loadDefects(
  db: RunsDb,
  workItemIds: readonly string[],
): Promise<RunDefects> {
  const fixed: DetailRef[] = [];

  for (const batch of chunk([...new Set(workItemIds)], IN_CHUNK)) {
    if (batch.length === 0) continue;
    const result = await fetchAllRows(db, "defect", RUN_DEFECT_COLUMNS, (query) =>
      (query as AnswerQuery).in("fixing_work_item_id", batch),
    );
    if (result.error) throw new LoadError("defect", result.error);

    for (const row of result.rows) {
      fixed.push(
        toRef("defect", requiredText(row.id), text(row.ref), text(row.title) ?? undefined),
      );
    }
  }

  fixed.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  return { opened: null, openedUnavailable: "no_opened_by_edge", fixed };
}

/* -------------------------------------------------------------------------- */
/* Requirements                                                                */
/* -------------------------------------------------------------------------- */

/**
 * FR-93's "the requirements it touched".
 *
 * A list of **refs**, because §7a keeps `requirement.text` encrypted while `ref`
 * stays clear, and the migration's own comment draws the consequence: requirements
 * are matched, joined and reported by `FR-nn` and never by their text.
 *
 * `work_item_requirement.requirement_ref` is `text` rather than a foreign key —
 * FR-12 requires a ref naming something that does not exist to be *reported*
 * rather than rejected at ingest — so a dangling ref here is expected output and
 * not a fault, and gets FR-83's dangling treatment rather than being dropped.
 *
 * Measured 2026-08-23: 74 distinct refs across run `b0952e`'s 20 work items,
 * from 116 `work_item_requirement` rows in total.
 */
async function loadRequirements(
  db: RunsDb,
  engagementId: string,
  workItemIds: readonly string[],
): Promise<RunRequirements> {
  const refs = new Set<string>();

  for (const batch of chunk([...new Set(workItemIds)], IN_CHUNK)) {
    if (batch.length === 0) continue;
    const result = await fetchAllRows(
      db,
      "work_item_requirement",
      RUN_WORK_ITEM_REQUIREMENT_COLUMNS,
      (query) => (query as AnswerQuery).in("work_item_id", batch),
    );
    if (result.error) throw new LoadError("work_item_requirement", result.error);

    for (const row of result.rows) refs.add(requiredText(row.requirement_ref));
  }

  const sorted = [...refs].filter((ref) => ref !== "").sort(byRequirementNumber);

  const queries: RefQuery[] = sorted.map((ref) => ({
    kind: "requirement" as const,
    ref,
    engagementId,
  }));
  const resolution = await resolveRefs(db, queries);

  const resolvedRefs = queries.map((query) => {
    const resolved = resolvedId(resolution, query);
    return resolved === null
      ? danglingRef(
          "requirement",
          query.ref,
          "No requirement with that reference has been ingested for this engagement.",
        )
      : toRef("requirement", resolved, query.ref);
  });

  return {
    refs: resolvedRefs,
    danglingCount: resolvedRefs.filter((ref) => ref.id === null).length,
  };
}

/**
 * `FR-2` before `FR-10`, which a lexical sort gets backwards.
 *
 * Falls back to a plain string comparison for any ref that does not carry a
 * trailing number, rather than forcing one — a ref this function cannot parse
 * keeps its place instead of being assigned a number it does not have.
 */
function byRequirementNumber(a: string, b: string): number {
  const aMatch = /^(\D*)(\d+)$/.exec(a);
  const bMatch = /^(\D*)(\d+)$/.exec(b);

  if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
    return Number(aMatch[2]) - Number(bMatch[2]);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
