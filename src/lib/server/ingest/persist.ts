import type { SupabaseClient } from "@supabase/supabase-js";

import { apiError } from "@/lib/api";
import type { Database } from "@/lib/database.types";

import { encryptAll } from "./encrypt";
import type { RunPlan } from "./plan";

type Db = SupabaseClient<Database>;

/**
 * FR-22. Apply a `RunPlan` to the database, idempotently.
 *
 * ## How idempotency is actually achieved
 *
 * Every write here is an upsert against a natural key the artifacts determine,
 * never against a generated id:
 *
 * | Table | Conflict target |
 * |---|---|
 * | `fleet_run` | `(engagement_id, run_id)` |
 * | `requirement` | `(engagement_id, ref)` |
 * | `blocker` | `(engagement_id, ref)` |
 * | `work_item` | `(engagement_id, fleet_run_id, unit)` |
 * | `work_item_dependency` | `(work_item_id, depends_on_id)` |
 * | `work_item_requirement` | `(work_item_id, requirement_ref)` |
 * | `open_question` | `(engagement_id, source_key)` |
 * | `test_case` | `(engagement_id, file, title)` |
 *
 * **Every one of those is a plain unique index, and that is load-bearing rather
 * than incidental.** A PARTIAL unique index cannot be inferred by
 * `ON CONFLICT (columns)` unless the statement restates the index predicate, and
 * PostgREST's `on_conflict` parameter carries column names only — so an upsert
 * against a partial index fails `42P10`, and it fails on the SECOND post, which
 * is exactly the case FR-22 is about. Two of these indexes were partial when
 * this unit started; migration `20260819170622` replaced both, and its header
 * carries the measurement.
 *
 * ## The children are reconciled, not merely upserted
 *
 * `work_item_dependency` and `work_item_requirement` are deleted-then-written
 * per work item, because an upsert alone is monotonic: if a manifest is edited
 * to REMOVE a dependency, an upsert-only path leaves the old edge behind
 * forever, and "posting the same run twice produces the same records" would
 * hold while "posting a corrected run produces the corrected records" would not.
 *
 * ## What is never repaired on the way in
 *
 * An `unparsed` status is written as `unparsed`. Nothing in this file inspects
 * a status it was handed and improves it.
 */

export interface PersistResult {
  engagementId: string;
  fleetRunId: string;
  counts: {
    requirements: number;
    blockers: number;
    workItems: number;
    dependencies: number;
    workItemRequirements: number;
    questions: number;
    testCases: number;
  };
  /**
   * FR-42. A `depends-on` naming a unit that does not exist in this run. Both
   * ends of the edge are real foreign keys, so the edge cannot be stored — it is
   * counted and named rather than dropped in silence.
   */
  unresolvedDependencies: { unit: string; dependsOnUnit: string }[];
  /** FR-17. A work item naming a blocker no artifact defined. */
  unresolvedBlockers: { unit: string; blockerKey: string }[];
}

function fail(what: string): never {
  // No Postgres message reaches the caller: it names tables, constraints and
  // sometimes row values, and the row values here are §7a `sensitive`.
  throw apiError(
    "internal_error",
    `The run could not be ingested (${what}). Check the audit_log row for this ` +
      `request; this response deliberately carries no database message.`,
  );
}

export async function persistPlan(db: Db, plan: RunPlan): Promise<PersistResult> {
  // --- engagement -----------------------------------------------------------
  // Inlined deliberately rather than extracted into a shared resolver: i6 and i8
  // need the same lookup, and a shared module written three times in three
  // worktrees conflicts at merge. It is one indexed query.
  const { data: engagement, error: engagementError } = await db
    .from("engagement")
    .select("id")
    .eq("slug", plan.engagementSlug)
    .maybeSingle();

  if (engagementError) fail("engagement lookup");
  if (!engagement) {
    throw apiError(
      "invalid_request",
      `No engagement is registered with the slug \`${plan.engagementSlug}\`. ` +
        `Register it first — FR-13 makes engagement records the one thing that ` +
        `is typed rather than ingested, so ingest will not create one.`,
    );
  }
  const engagementId = engagement.id;

  // --- fleet_run ------------------------------------------------------------
  const { data: fleetRun, error: fleetRunError } = await db
    .from("fleet_run")
    .upsert(
      { engagement_id: engagementId, ...plan.fleetRun },
      { onConflict: "engagement_id,run_id" },
    )
    .select("id")
    .single();

  if (fleetRunError || !fleetRun) fail("fleet_run");
  const fleetRunId = fleetRun.id;

  // --- requirement (FR-12) --------------------------------------------------
  if (plan.requirements.length > 0) {
    const texts = await encryptAll(db, plan.requirements.map((r) => r.text));
    const { error } = await db.from("requirement").upsert(
      plan.requirements.map((requirement, index) => ({
        engagement_id: engagementId,
        ref: requirement.ref,
        text: texts[index],
      })),
      { onConflict: "engagement_id,ref" },
    );
    if (error) fail("requirement");
  }

  // --- blocker (FR-17, FR-20) -----------------------------------------------
  if (plan.blockers.length > 0) {
    const descriptions = await encryptAll(db, plan.blockers.map((b) => b.description));
    const { error } = await db.from("blocker").upsert(
      plan.blockers.map((blocker, index) => ({
        engagement_id: engagementId,
        ref: blocker.ref,
        owner: blocker.owner,
        description: descriptions[index],
        disposition: blocker.disposition,
      })),
      { onConflict: "engagement_id,ref" },
    );
    if (error) fail("blocker");
  }

  const { data: blockerRows, error: blockerReadError } = await db
    .from("blocker")
    .select("id, ref")
    .eq("engagement_id", engagementId);
  if (blockerReadError) fail("blocker read-back");

  const blockerIdByRef = new Map(
    (blockerRows ?? [])
      .filter((row): row is { id: string; ref: string } => row.ref !== null)
      .map((row) => [row.ref, row.id]),
  );

  // --- work_item (FR-14 to FR-16) -------------------------------------------
  const unresolvedBlockers: PersistResult["unresolvedBlockers"] = [];

  if (plan.workItems.length > 0) {
    const [descriptions, rawStatuses] = await Promise.all([
      encryptAll(db, plan.workItems.map((item) => item.description)),
      encryptAll(db, plan.workItems.map((item) => item.raw_status)),
    ]);

    const rows = plan.workItems.map((item, index) => {
      // `blockerKey` is `<engagement>:B3`; the ref stored on the row is `B3`.
      const ref =
        item.blockerKey === null
          ? null
          : item.blockerKey.slice(plan.engagementSlug.length + 1);
      const blockerId = ref === null ? null : blockerIdByRef.get(ref) ?? null;
      if (ref !== null && blockerId === null) {
        unresolvedBlockers.push({ unit: item.unit, blockerKey: item.blockerKey ?? ref });
      }

      return {
        engagement_id: engagementId,
        fleet_run_id: fleetRunId,
        unit: item.unit,
        execution_mode: item.execution_mode,
        work_type: item.work_type,
        phase: item.phase,
        description: descriptions[index],
        executor: item.executor,
        executor_kind: item.executor_kind,
        status: item.status,
        unautomated_reason: item.unautomated_reason,
        disposition: item.disposition,
        evidence_scope: item.evidence_scope,
        not_verified_count: item.not_verified_count,
        raw_status: rawStatuses[index],
        blocker_id: blockerId,
      };
    });

    const { error } = await db
      .from("work_item")
      .upsert(rows, { onConflict: "engagement_id,fleet_run_id,unit" });
    if (error) fail("work_item");
  }

  const { data: workItemRows, error: workItemReadError } = await db
    .from("work_item")
    .select("id, unit")
    .eq("engagement_id", engagementId)
    .eq("fleet_run_id", fleetRunId);
  if (workItemReadError) fail("work_item read-back");

  const workItemIdByUnit = new Map(
    (workItemRows ?? [])
      .filter((row): row is { id: string; unit: string } => row.unit !== null)
      .map((row) => [row.unit, row.id]),
  );
  const workItemIds = [...workItemIdByUnit.values()];

  // --- work_item_dependency (FR-42) -----------------------------------------
  const unresolvedDependencies: PersistResult["unresolvedDependencies"] = [];
  const edges: { work_item_id: string; depends_on_id: string }[] = [];

  for (const dependency of plan.dependencies) {
    const from = workItemIdByUnit.get(dependency.unit);
    const to = workItemIdByUnit.get(dependency.dependsOnUnit);
    // A self-edge would violate `work_item_dependency_no_self`, so it is
    // reported as unresolved rather than sent to a certain constraint error.
    if (from === undefined || to === undefined || from === to) {
      unresolvedDependencies.push(dependency);
      continue;
    }
    edges.push({ work_item_id: from, depends_on_id: to });
  }

  if (workItemIds.length > 0) {
    const { error } = await db
      .from("work_item_dependency")
      .delete()
      .in("work_item_id", workItemIds);
    if (error) fail("work_item_dependency reconcile");
  }
  if (edges.length > 0) {
    const { error } = await db
      .from("work_item_dependency")
      .upsert(edges, { onConflict: "work_item_id,depends_on_id" });
    if (error) fail("work_item_dependency");
  }

  // --- work_item_requirement (FR-19) ----------------------------------------
  const links = plan.workItemRequirements
    .map((link) => ({
      work_item_id: workItemIdByUnit.get(link.unit),
      requirement_ref: link.requirement_ref,
    }))
    .filter(
      (link): link is { work_item_id: string; requirement_ref: string } =>
        link.work_item_id !== undefined,
    );

  if (workItemIds.length > 0) {
    const { error } = await db
      .from("work_item_requirement")
      .delete()
      .in("work_item_id", workItemIds);
    if (error) fail("work_item_requirement reconcile");
  }
  if (links.length > 0) {
    const { error } = await db
      .from("work_item_requirement")
      .upsert(links, { onConflict: "work_item_id,requirement_ref" });
    if (error) fail("work_item_requirement");
  }

  // --- open_question (FR-18, FR-22) -----------------------------------------
  // Split by whether the artifact carries an answer. A question Erik has already
  // answered in the product must not have that answer erased by re-posting the
  // run, so the answer columns are simply absent from the payload for records
  // that state none — PostgREST's ON CONFLICT DO UPDATE only sets the columns
  // the payload names.
  if (plan.questions.length > 0) {
    const [questions, guesses, answers] = await Promise.all([
      encryptAll(db, plan.questions.map((q) => q.question)),
      encryptAll(db, plan.questions.map((q) => q.best_guess)),
      encryptAll(db, plan.questions.map((q) => q.answer)),
    ]);

    const columnsFor = (index: number) => ({
      engagement_id: engagementId,
      source_key: plan.questions[index].source_key,
      run: plan.questions[index].run,
      unit: plan.questions[index].unit,
      section: plan.questions[index].section,
      question: questions[index],
      best_guess: guesses[index],
      confidence: plan.questions[index].confidence,
    });

    const answered = plan.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.answer !== null);

    const unanswered = plan.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.answer === null);

    // Two separate upserts, because PostgREST requires one uniform column set
    // per request and these two deliberately differ: the unanswered payload
    // OMITS the answer columns, so `ON CONFLICT DO UPDATE` leaves whatever the
    // operator has already typed into them untouched.
    if (answered.length > 0) {
      const { error } = await db.from("open_question").upsert(
        answered.map(({ question, index }) => ({
          ...columnsFor(index),
          answer: answers[index],
          answered_by: question.answered_by,
          answered_at: question.answered_at,
          status: question.status,
        })),
        { onConflict: "engagement_id,source_key" },
      );
      if (error) fail("open_question (answered)");
    }

    if (unanswered.length > 0) {
      const { error } = await db
        .from("open_question")
        .upsert(
          unanswered.map(({ index }) => columnsFor(index)),
          { onConflict: "engagement_id,source_key" },
        );
      if (error) fail("open_question (unanswered)");
    }
  }

  // --- test_case (FR-45's input to FR-21) -----------------------------------
  if (plan.testCases.length > 0) {
    const { error } = await db.from("test_case").upsert(
      plan.testCases.map((test) => ({
        engagement_id: engagementId,
        harness: test.harness,
        file: test.file,
        title: test.title,
        covers: test.covers,
      })),
      { onConflict: "engagement_id,file,title" },
    );
    if (error) fail("test_case");
  }

  return {
    engagementId,
    fleetRunId,
    counts: {
      requirements: plan.requirements.length,
      blockers: plan.blockers.length,
      workItems: plan.workItems.length,
      dependencies: edges.length,
      workItemRequirements: links.length,
      questions: plan.questions.length,
      testCases: plan.testCases.length,
    },
    unresolvedDependencies,
    unresolvedBlockers,
  };
}
