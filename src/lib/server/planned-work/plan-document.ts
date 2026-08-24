import "server-only";

import { apiError } from "@/lib/api";
import type { ParsedPlan, PlanTask } from "@/lib/ingest/planDocument";
import type { ReleaseDb } from "@/lib/server/releases/db";
import type { ServiceClient } from "@/lib/supabase/service";

import { createPlannedWorkItems } from "./create-planned-work-item";
import { markPlanCollisions, type CollisionMarkResult } from "./mark-collisions";
import type { PlannedWorkInput } from "./types";

/**
 * FR-88's parsed half — the seam between i2's plan parser and u2's insert
 * primitive.
 *
 * > **FR-88** Planned work is created two ways: **parsed from a plan
 * > document**, and **entered by hand through a form**. Both produce ordinary
 * > `work_item` rows; neither introduces a new entity. **Both paths require an
 * > engagement.**
 *
 * u2 built the hand-entry half at `/work-items/new` and owns the single
 * spelling of a planned row in `./create-planned-work-item`. This module owns
 * only the mapping onto it and the FR-90 mark afterwards. **It writes no row
 * itself** — a second insert path is exactly what u2's primitive exists to
 * prevent, and the drift would be silent: one path encrypting the description
 * and the other not, one setting `status = 'pending'` and the other leaving the
 * column default.
 *
 * ## Why this module carries no gate
 *
 * Same reason the primitive beneath it does not. It takes an **already
 * authorised** client, because its callers hold different authorities — an
 * agent bearer token on `POST /api/ingest/plan`, and potentially an operator
 * action later. **Every caller gates before calling.** `import "server-only"`
 * keeps a Client Component from reaching it at all.
 *
 * ## Nothing here echoes prose
 *
 * §7a classifies `work_item` **sensitive**, and a plan task's `title`,
 * `rawHeading` and step texts are the client prose that classification is
 * about. The result type below carries **counts and 1-based source line
 * numbers, never text** — the same call u2 made in leaving `description` off
 * `PlannedWorkRecord`. A line number tells Erik where to look in a document he
 * already has; a title in a result object ends up in a log line.
 */

/** The mapping's outcome. Counts and line numbers only — see the note above. */
export interface PlanDocumentMapping {
  /** Tasks this product understood, ready for u2's primitive. */
  inputs: PlannedWorkInput[];
  /**
   * 1-based source lines of `### Task` headings i2's parser could not
   * classify. **Withheld, not written** — see `mapPlanTasks`.
   */
  unparsedTaskLines: number[];
  /** Step lines the parser could not classify, orphans included. */
  unparsedSteps: number;
  /** Step lines it DID classify. None is persisted — see `mapPlanTasks`. */
  stepsNotPersisted: number;
  /** Tasks carrying an explicit FR-90 reconciliation id. */
  tasksWithPlanRef: number;
  /** Tasks carrying none. Today, by measurement, this is every task. */
  tasksWithoutPlanRef: number;
}

/**
 * One `PlanTask` → one `PlannedWorkInput`, or nothing.
 *
 * ## An unparsed task is withheld, and counted
 *
 * A heading i2's parser emitted as `status: "unparsed"` has `title: null`. It
 * does not become a row. u2's primitive fixes `status = 'pending'`, so writing
 * one would put a row into the ledger asserting this product understood a line
 * it did not — the wrong `done` that `unparsed` is the only default *because
 * of*. Its line number is reported instead, so it is loud rather than dropped:
 * a record parsed and discarded in silence is the failure this product is a
 * reaction to.
 *
 * ## `unit` is deliberately NULL
 *
 * The plan's only per-task handle is the positional `### Task N:` heading, and
 * `N` shifts the moment a task is inserted above it. Writing that into a column
 * named `unit` would produce a value that reads like a stable key and is not
 * one — Q13's hazard arriving through a different column. `plan_ref` is the
 * only key this path writes, and i2's parser supplies it only where the
 * document states one explicitly. **Queued for Erik rather than settled here.**
 *
 * ## Steps are not persisted
 *
 * §7a models no child entity under `work_item`, and folding a task's `- [ ]`
 * steps into its `description` turns a one-line answer to "what is next" into a
 * paragraph. The count is reported so the omission is visible.
 */
function toInput(task: PlanTask): PlannedWorkInput | null {
  if (task.status === "unparsed" || task.title === null) return null;

  return {
    description: task.title,
    workType: null,
    unit: null,
    planRef: task.planRef,
  };
}

/** Pure. Maps a parsed plan onto the primitive's input shape. */
export function mapPlanTasks(plan: ParsedPlan): PlanDocumentMapping {
  const inputs: PlannedWorkInput[] = [];
  const unparsedTaskLines: number[] = [];
  let stepsNotPersisted = 0;

  for (const task of plan.tasks) {
    stepsNotPersisted += task.steps.filter(
      (step) => step.status !== "unparsed",
    ).length;

    const input = toInput(task);
    if (input === null) unparsedTaskLines.push(task.line);
    else inputs.push(input);
  }

  return {
    inputs,
    unparsedTaskLines,
    unparsedSteps: plan.unparsedSteps,
    stepsNotPersisted,
    tasksWithPlanRef: plan.tasksWithPlanRef,
    tasksWithoutPlanRef: plan.tasksWithoutPlanRef,
  };
}

/**
 * The mapping's reportable half — everything except `inputs`.
 *
 * `inputs` carry `description`, which is the plan's prose and §7a
 * **sensitive**. It is the primitive's argument, not a result, and it must not
 * ride along in anything a caller might log, return or serialise. u2 made the
 * same call in leaving `description` off `PlannedWorkRecord`; an earlier draft
 * of this file extended `PlanDocumentMapping` wholesale and a test caught the
 * plaintext in the returned object.
 */
export type PlanDocumentCounts = Omit<PlanDocumentMapping, "inputs">;

export interface PlanIngestResult extends PlanDocumentCounts {
  engagementSlug: string;
  source: string;
  /** Task headings the parser saw, understood or not. */
  tasksParsed: number;
  /** Planned rows this call created. */
  written: number;
  /**
   * Rows the upsert skipped because their `plan_ref` already exists in this
   * engagement. **This is FR-90's idempotency, not a merge.** `ignoreDuplicates`
   * is `ON CONFLICT DO NOTHING`, so an existing row is left exactly as it is —
   * a planned row that has since been dispatched is not reset to `pending` by a
   * second read of the plan it came from.
   */
  skippedAsDuplicate: number;
  /** FR-90. See `markPlanCollisions`. */
  reconciliation: CollisionMarkResult;
}

/**
 * The engagement id behind a slug.
 *
 * Resolved here as well as inside the primitive — one redundant round trip,
 * bought deliberately. `markPlanCollisions` needs the id even when **zero** rows
 * were written (every task unparsed, or every keyed task already present), and
 * in that case there is no returned record to read it off. Reaching into u2's
 * private resolver, or skipping the mark when nothing was inserted, would each
 * be worse: the second would leave a real collision unmarked precisely on the
 * repeat post.
 */
async function resolveEngagementId(
  db: ServiceClient,
  slug: string,
): Promise<string> {
  const { data, error } = await db
    .from("engagement")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw apiError(
      "internal_error",
      "The engagement could not be read, so nothing was written.",
    );
  }

  if (!data) {
    throw apiError(
      "invalid_request",
      `No engagement is registered under \`${slug}\`, so nothing was written. ` +
        `Register it first, or post against one that exists.`,
    );
  }

  return String(data.id);
}

/**
 * Ingest one parsed plan document.
 *
 * Order matters: the engagement is resolved first so an unknown slug costs
 * nothing, then the rows are written, then FR-90 is applied to the engagement
 * as a whole — including to planned rows an earlier post created, which is the
 * case a mark scoped to "the rows I just wrote" would miss.
 *
 * @param db   an already-authorised client. **This module does not gate.**
 * @param plan i2's parse result. A `not-a-plan` document never reaches here;
 *             Q12 has the caller reject it whole.
 */
export async function ingestPlanDocument(
  db: ServiceClient,
  plan: ParsedPlan,
): Promise<PlanIngestResult> {
  const engagementId = await resolveEngagementId(db, plan.engagement);

  // `inputs` is separated here and never spread into the result. It holds the
  // plan's prose; see `PlanDocumentCounts`.
  const { inputs, ...counts } = mapPlanTasks(plan);

  const records = await createPlannedWorkItems(db, plan.engagement, inputs);

  const reconciliation = await markPlanCollisions(
    db as unknown as ReleaseDb,
    engagementId,
  );

  return {
    ...counts,
    engagementSlug: plan.engagement,
    source: plan.source,
    tasksParsed: plan.tasks.length,
    written: records.length,
    skippedAsDuplicate: inputs.length - records.length,
    reconciliation,
  };
}
