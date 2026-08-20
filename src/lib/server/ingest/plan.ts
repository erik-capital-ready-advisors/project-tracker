import { ingestRun } from "@/lib/ingest/ingestRun";
import { parseProdMd, type TrackerMilestone } from "@/lib/ingest/prodMd";
import { normalizeQuestions } from "@/lib/ingest/questions";
import {
  parseCheckpoint,
  parseQaGates,
  type GateOutcome,
} from "@/lib/ingest/runReport";
import type { Database } from "@/lib/database.types";

import {
  toConfidence,
  toDisposition,
  toEvidenceScope,
  toExecutionMode,
  toExecutorKind,
  toHarness,
  toPhase,
  toReason,
  toTimestamp,
  toWorkStatus,
  type Unmappable,
} from "./mapping";

type Enums = Database["public"]["Enums"];

/**
 * The artifacts of one fleet run, as TEXT.
 *
 * FR-23 is a property of this type rather than of a rule someone has to
 * remember: ingest receives the *contents* of a repository's artifacts over the
 * wire and never a path to them. There is nothing here to open, so there is
 * nothing here to write back to, and no amount of carelessness downstream can
 * turn a payload into a filesystem handle.
 */
export interface RunArtifacts {
  engagementSlug: string;
  runId: string;
  manifests: { name: string; text: string }[];
  questionFiles: { name: string; text: string }[];
  specText: string | null;
  testFiles: { path: string; source: string }[];
  prodMdText: string | null;
  checkpointText: string | null;
  qaReportText: string | null;
}

/** Plaintext at this layer. `persist.ts` encrypts on the way to the column. */
export interface PlannedWorkItem {
  unit: string;
  execution_mode: Enums["execution_mode"];
  work_type: string | null;
  phase: number | null;
  description: string | null;
  executor: string | null;
  executor_kind: Enums["executor_kind"];
  status: Enums["work_status"];
  unautomated_reason: Enums["unautomated_reason"] | null;
  disposition: Enums["work_disposition"] | null;
  evidence_scope: Enums["evidence_scope"] | null;
  not_verified_count: number;
  raw_status: string | null;
  /** `<engagement>:B3`, resolved to a `blocker.id` by the writer. */
  blockerKey: string | null;
}

export interface PlannedBlocker {
  ref: string;
  owner: string;
  description: string | null;
  disposition: Enums["work_disposition"] | null;
}

export interface PlannedQuestion {
  /** FR-22's natural key: `<filename>#<record ordinal within that file>`. */
  source_key: string;
  run: string | null;
  unit: string | null;
  section: string | null;
  question: string | null;
  best_guess: string | null;
  confidence: Enums["question_confidence"] | null;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  status: Enums["question_status"];
}

export interface PlannedTestCase {
  harness: Enums["test_harness"];
  file: string;
  title: string;
  covers: string[];
}

export interface PlannedFleetRun {
  run_id: string;
  branch: string | null;
  mode: string | null;
  started_at: string | null;
  ended_at: string | null;
  verdict: string | null;
  gates: Record<string, GateOutcome>;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_skipped: number | null;
}

export interface RunPlan {
  engagementSlug: string;
  runId: string;
  fleetRun: PlannedFleetRun;
  requirements: { ref: string; text: string | null }[];
  blockers: PlannedBlocker[];
  workItems: PlannedWorkItem[];
  /** Unit-to-unit; resolved to row ids by the writer, unresolved ones counted. */
  dependencies: { unit: string; dependsOnUnit: string }[];
  workItemRequirements: { unit: string; requirement_ref: string }[];
  questions: PlannedQuestion[];
  testCases: PlannedTestCase[];
  /**
   * FR-20. Parsed and REPORTED, not persisted — see `notPersisted` below.
   */
  trackerMilestones: TrackerMilestone[];
  /** FR-58 and the honesty budget. */
  summary: {
    unparsedWorkItems: number;
    unparsedTrackerMilestones: number;
    unparsedGates: number;
    validationErrors: string[];
    /** Values the enum seam could not map. Never silently defaulted. */
    unmappable: Unmappable[];
    /**
     * Records parsed but deliberately NOT written, with the reason. FR-20's
     * milestone tracker is here because the 21-entity schema has no
     * build-milestone entity and §7a classifies no such table — and an entity
     * with no §7a row is a blocker, not a default.
     */
    notPersisted: { kind: string; count: number; reason: string }[];
  };
}

/**
 * FR-14 to FR-23, as one pure function.
 *
 * Text in, the exact set of rows to write out. No database, no clock, no
 * filesystem — which is what lets the idempotency property be tested directly:
 * the same artifacts must produce a byte-identical plan, because every natural
 * key in it is derived from the artifacts and from nothing else.
 *
 * Nothing here repairs an `unparsed`. A work item the manifest could not
 * classify arrives at the database as `unparsed`, and the count travels with it.
 */
export function planRun(artifacts: RunArtifacts): RunPlan {
  const engagement = artifacts.engagementSlug;

  const parsed = ingestRun({
    engagement,
    manifests: artifacts.manifests,
    questionFiles: artifacts.questionFiles,
    specText: artifacts.specText,
    testFiles: artifacts.testFiles,
  });

  const prod =
    artifacts.prodMdText === null ? null : parseProdMd(artifacts.prodMdText, engagement);
  const checkpoint =
    artifacts.checkpointText === null ? null : parseCheckpoint(artifacts.checkpointText);
  const qa = artifacts.qaReportText === null ? null : parseQaGates(artifacts.qaReportText);

  const unmappable: Unmappable[] = [];
  const note = (field: string, value: string) => unmappable.push({ field, value });

  // --- fleet_run (FR-21) ----------------------------------------------------
  // The checkpoint's build gate and the QA report's gates are merged into one
  // object. Where both name the same gate the QA report wins, because it is the
  // later artifact — and where they disagree the disagreement is preserved,
  // because `build_after_phase1` is recorded under its own key rather than
  // being folded into `build`.
  const gates: Record<string, GateOutcome> = { ...(qa?.gates ?? {}) };
  if (checkpoint?.buildGate) gates.build_after_phase1 = checkpoint.buildGate;

  const fleetRun: PlannedFleetRun = {
    run_id: artifacts.runId,
    branch: checkpoint?.branch ?? null,
    mode: checkpoint?.mode ?? null,
    started_at: toTimestamp(checkpoint?.startedAt ?? null),
    ended_at: toTimestamp(checkpoint?.endedAt ?? null),
    verdict: qa?.verdict ?? null,
    gates,
    tests_passed: qa?.testsPassed ?? null,
    tests_failed: qa?.testsFailed ?? null,
    tests_skipped: qa?.testsSkipped ?? null,
  };

  // --- blockers (FR-17 + FR-20) --------------------------------------------
  // The manifest's Blocked table and prod.md's Active blockers table both name
  // `Bn` identifiers in one engagement's namespace, so they merge on `ref`.
  // prod.md wins on a collision: it is the document that carries an explicit
  // Owner column and a resolution state, where the manifest carries neither.
  const blockersByRef = new Map<string, PlannedBlocker>();

  for (const blocker of parsed.blockers) {
    const ref = blocker.id.slice(engagement.length + 1);
    blockersByRef.set(ref, {
      ref,
      owner: blocker.owner,
      description: blocker.description === "" ? null : blocker.description,
      disposition: toDisposition(blocker.disposition),
    });
  }
  for (const blocker of prod?.blockers ?? []) {
    const ref = blocker.id.slice(engagement.length + 1);
    blockersByRef.set(ref, {
      ref,
      owner: blocker.owner,
      description: blocker.description === "" ? null : blocker.description,
      disposition: toDisposition(blocker.disposition),
    });
  }

  // --- work items (FR-14, FR-15, FR-16, FR-19) ------------------------------
  const workItems: PlannedWorkItem[] = [];
  const dependencies: { unit: string; dependsOnUnit: string }[] = [];
  const workItemRequirements: { unit: string; requirement_ref: string }[] = [];
  const seenUnits = new Set<string>();

  for (const item of parsed.workItems) {
    const unit = item.unit;
    if (unit === null) continue;

    // FR-16 scopes a unit id by engagement AND run. Within one run a unit id is
    // singular, so a manifest naming `i1` twice is a defect in the manifest —
    // the later row is dropped and counted rather than silently overwriting the
    // earlier one through the upsert.
    if (seenUnits.has(unit)) {
      note("work_item.unit (duplicate within run)", unit);
      continue;
    }
    seenUnits.add(unit);

    const executionMode = toExecutionMode(item.executionMode);
    const executorKind = toExecutorKind(item.executorKind);
    const status = toWorkStatus(item.status);
    if (executionMode === null || executorKind === null || status === null) {
      note("work_item enum", `${unit}: ${item.executionMode}/${item.executorKind}/${item.status}`);
      continue;
    }

    const phase = toPhase(item.phase);
    if (item.phase !== null && phase === null) note("work_item.phase", item.phase);

    workItems.push({
      unit,
      execution_mode: executionMode,
      work_type: item.workType,
      phase,
      description: item.description,
      executor: item.executor,
      executor_kind: executorKind,
      status,
      unautomated_reason: toReason(item.unautomatedReason),
      disposition: toDisposition(item.unautomatedDisposition),
      evidence_scope: toEvidenceScope(item.evidenceScope),
      not_verified_count: item.notVerifiedCount,
      raw_status: item.rawStatus,
      blockerKey: item.blocker,
    });

    for (const dependsOnUnit of item.dependsOn) {
      dependencies.push({ unit, dependsOnUnit });
    }
    for (const ref of item.implements) {
      workItemRequirements.push({ unit, requirement_ref: ref });
    }
  }

  // --- questions (FR-18 + FR-22) -------------------------------------------
  // Parsed per FILE so that the record's ordinal within its own file is known.
  // `<filename>#<ordinal>` is the stable key: the fleet appends to these files
  // and never rewrites them, so an ordinal already written keeps its meaning,
  // and re-posting the same run updates rather than duplicates.
  const questions: PlannedQuestion[] = [];
  for (const file of artifacts.questionFiles) {
    normalizeQuestions([file], engagement).forEach((question, ordinal) => {
      const confidence = toConfidence(question.confidence);
      if (question.confidence !== null && confidence === null) {
        note("open_question.confidence", question.confidence);
      }
      questions.push({
        source_key: `${file.name}#${ordinal}`,
        run: question.run,
        unit: question.unit,
        section: question.section,
        question: question.question,
        best_guess: question.bestGuess,
        confidence,
        answer: question.answer,
        answered_by: question.answeredBy,
        answered_at: toTimestamp(question.answeredOn),
        status: question.status,
      });
    });
  }

  // --- test cases (FR-21's per-test half) -----------------------------------
  const testCases: PlannedTestCase[] = [];
  const seenTests = new Set<string>();
  for (const test of parsed.tests) {
    const harness = toHarness(test.harness);
    if (harness === null) {
      note("test_case.harness", test.harness);
      continue;
    }
    // `unique (engagement_id, file, title)` — two tests in one file sharing a
    // title collide, so the duplicate is counted rather than sent to a
    // guaranteed constraint violation.
    const key = `${test.file}\0${test.title}`;
    if (seenTests.has(key)) {
      note("test_case (duplicate file+title)", `${test.file}: ${test.title}`);
      continue;
    }
    seenTests.add(key);
    testCases.push({
      harness,
      file: test.file,
      title: test.title,
      covers: test.covers,
    });
  }

  const notPersisted: RunPlan["summary"]["notPersisted"] = [];
  if (prod && prod.milestones.length > 0) {
    notPersisted.push({
      kind: "prod.md milestone tracker",
      count: prod.milestones.length,
      reason:
        "The 21-entity schema has no build-milestone entity and §7a classifies " +
        "none, and an entity with no §7a row is a blocker rather than a default. " +
        "Parsed and returned in the response; queued as a question for Erik.",
    });
  }

  return {
    engagementSlug: engagement,
    runId: artifacts.runId,
    fleetRun,
    requirements: parsed.requirements.map((r) => ({ ref: r.ref, text: r.text })),
    blockers: [...blockersByRef.values()],
    workItems,
    dependencies,
    workItemRequirements,
    questions,
    testCases,
    trackerMilestones: prod?.milestones ?? [],
    summary: {
      unparsedWorkItems: parsed.unparsed,
      unparsedTrackerMilestones: prod?.unparsed ?? 0,
      unparsedGates: qa?.unparsed ?? 0,
      validationErrors: parsed.errors,
      unmappable,
      notPersisted,
    },
  };
}
