import type {
  Disposition,
  EvidenceScope,
  ExecutionMode,
  ExecutorKind,
  ReasonClass,
  WorkStatus,
} from "@/lib/ingest/types";
import {
  fromDisposition,
  fromExecutionMode,
  fromExecutorKind,
  fromNullableEvidenceScope,
  fromReasonClass,
  fromWorkStatus,
} from "@/lib/server/answers/from-db";
import { isPlannedRow } from "@/lib/server/workitems/planned";

import { labelEntities, refFromId, resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import {
  decryptProse,
  fetchById,
  fetchEngagement,
  fetchWhere,
  num,
  requiredText,
  text,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";
import { danglingRef, toRef } from "./types";

/**
 * FR-81 for `work_item` — every field §7a lets the operator read, plus this
 * row's inbound and outbound references.
 *
 * ## The two encrypted columns are both read here, and both are §7a's
 *
 * §7a classifies `work_item` `sensitive` with "**pgcrypto columns on
 * `description` and `raw_status`**" and "operator, agents, decrypted
 * server-side". `answers/load.ts` reads neither by default and leaves
 * `rawStatus` permanently null, because none of the six answers needs prose to
 * compute a rule. A detail view is the opposite surface and FR-81 says so in
 * terms, so both are read — at one `decrypt_field` round trip per non-null
 * value, and only when the caller leaves `withProse` on.
 *
 * `raw_status` matters more than it looks: it is the status paragraph the
 * artifact actually wrote, kept beside the `unparsed` the parser produced. On a
 * row whose `status` is `unparsed` it is the only thing that can say what the
 * artifact claimed — without it a loud failure degrades into a silent one.
 *
 * ## What is a reference and what is a field
 *
 * `fleet_run` and `stack` are foreign keys and neither is one of FR-81's eight
 * kinds, so neither has a detail view and neither may be rendered as a link.
 * They come back as plain named facts. `engagement` is the same case. Only
 * `blocker`, `external_wait`, `work_item`, `requirement` and `defect` become
 * `DetailRef`s here, because those are the kinds `entity-routes.ts` can build an
 * href for.
 */

/** A `fleet_run`, which has no detail view. Named facts, never a link. */
export interface WorkItemRun {
  id: string;
  /** The human run id (`eb2490`), not the uuid. */
  runId: string | null;
  branch: string | null;
  mode: string | null;
  verdict: string | null;
}

export interface WorkItemDetail {
  kind: "work_item";
  id: string;
  engagement: DetailEngagement | null;

  /** FR-16's unit id. Null on `hand` and `external` work, which carry none. */
  unit: string | null;
  executionMode: ExecutionMode;
  workType: string | null;
  phase: number | null;
  executor: string | null;
  executorKind: ExecutorKind;
  status: WorkStatus;
  /** §7a `sensitive`, pgcrypto. The artifact's own status prose. */
  rawStatus: Prose;
  /** §7a `sensitive`, pgcrypto. */
  description: Prose;
  unautomatedReason: ReasonClass | null;
  disposition: Disposition | null;
  evidenceScope: EvidenceScope | null;
  notVerifiedCount: number;
  startedAt: string | null;
  endedAt: string | null;
  /**
   * FR-87 — planned work: `execution_mode IS NULL` and `status = 'pending'`.
   * Read from the raw column before `fromExecutionMode` turns the NULL into
   * `"fleet"` and the signal disappears.
   */
  planned: boolean;
  /** `work_item.updated_at`. FR-91's staleness timestamp. */
  updatedAt: string | null;

  /** Not an FR-81 kind — a named fact, never rendered as a reference. */
  run: WorkItemRun | null;
  /** Not an FR-81 kind. */
  stack: { id: string; name: string | null } | null;

  /** Outbound. The blocker holding this item, if any. */
  blocker: DetailRef | null;
  /** Outbound. The external wait holding this item, if any. */
  externalWait: DetailRef | null;
  /** Outbound. `work_item_dependency.depends_on_id` — what this waits on. */
  dependsOn: DetailRef[];
  /** Outbound. `work_item_requirement.requirement_ref` (FR-19). */
  implementsRequirements: DetailRef[];

  /** Inbound. Work items whose `depends_on_id` is this row. */
  blocks: DetailRef[];
  /** Inbound. Defects whose `fixing_work_item_id` is this row (FR-71). */
  fixesDefects: DetailRef[];
}

const COLUMNS =
  "id, engagement_id, fleet_run_id, unit, execution_mode, work_type, phase, " +
  "description, executor, executor_kind, status, unautomated_reason, disposition, " +
  "evidence_scope, not_verified_count, stack_id, blocker_id, external_wait_id, " +
  "raw_status, started_at, ended_at, updated_at";

export async function loadWorkItemDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<WorkItemDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "work_item", COLUMNS, id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);
  const runId = text(row.fleet_run_id);
  const stackId = text(row.stack_id);
  const blockerId = text(row.blocker_id);
  const waitId = text(row.external_wait_id);

  const [
    engagement,
    prose,
    runRow,
    stackRow,
    blockerLabels,
    waitLabels,
    dependencyRows,
    dependentRows,
    requirementRows,
    defectRows,
  ] = await Promise.all([
    fetchEngagement(db, engagementId),
    decryptProse(db, [text(row.description), text(row.raw_status)], withProse),
    runId === null
      ? Promise.resolve(null)
      : fetchById(db, "fleet_run", "id, run_id, branch, mode, verdict", runId),
    stackId === null
      ? Promise.resolve(null)
      : fetchById(db, "stack", "id, name", stackId),
    labelEntities(db, "blocker", blockerId === null ? [] : [blockerId]),
    labelEntities(db, "external_wait", waitId === null ? [] : [waitId]),
    fetchWhere(db, "work_item_dependency", "id, work_item_id, depends_on_id", "work_item_id", rowId),
    fetchWhere(db, "work_item_dependency", "id, work_item_id, depends_on_id", "depends_on_id", rowId),
    fetchWhere(db, "work_item_requirement", "id, work_item_id, requirement_ref", "work_item_id", rowId),
    fetchWhere(
      db,
      "defect",
      "id, engagement_id, ref, fixing_work_item_id",
      "fixing_work_item_id",
      rowId,
    ),
  ]);

  const dependsOnIds = dependencyRows.map((one) => requiredText(one.depends_on_id));
  const blocksIds = dependentRows.map((one) => requiredText(one.work_item_id));
  const requirementRefs = requirementRows.map((one) => requiredText(one.requirement_ref));

  const workItemLabels = await labelEntities(db, "work_item", [
    ...dependsOnIds,
    ...blocksIds,
  ]);

  // Requirement refs are TEXT, not foreign keys — FR-12 requires a ref naming
  // something that does not exist to be reported rather than rejected at
  // ingest, so a dangling one here is expected output and not a fault.
  const requirementQueries: RefQuery[] = requirementRefs.map((ref) => ({
    kind: "requirement" as const,
    ref,
    engagementId,
  }));
  const resolution = await resolveRefs(db, requirementQueries);

  return {
    kind: "work_item",
    id: rowId,
    engagement,
    unit: text(row.unit),
    executionMode: fromExecutionMode(row.execution_mode),
    workType: text(row.work_type),
    phase: num(row.phase),
    executor: text(row.executor),
    executorKind: fromExecutorKind(row.executor_kind),
    status: fromWorkStatus(row.status),
    description: prose[0],
    rawStatus: prose[1],
    unautomatedReason: fromReasonClass(row.unautomated_reason),
    disposition: fromDisposition(row.disposition),
    evidenceScope: fromNullableEvidenceScope(row.evidence_scope),
    notVerifiedCount: num(row.not_verified_count) ?? 0,
    startedAt: text(row.started_at),
    endedAt: text(row.ended_at),
    planned: isPlannedRow({
      execution_mode: row.execution_mode,
      status: row.status,
    }),
    updatedAt: text(row.updated_at),

    run:
      runRow === null || runId === null
        ? null
        : {
            id: requiredText(runRow.id),
            runId: text(runRow.run_id),
            branch: text(runRow.branch),
            mode: text(runRow.mode),
            verdict: text(runRow.verdict),
          },
    stack:
      stackRow === null || stackId === null
        ? null
        : { id: requiredText(stackRow.id), name: text(stackRow.name) },

    blocker: blockerId === null ? null : refFromId("blocker", blockerId, blockerLabels),
    externalWait:
      waitId === null ? null : refFromId("external_wait", waitId, waitLabels),
    dependsOn: dependsOnIds.map((one) => refFromId("work_item", one, workItemLabels)),
    implementsRequirements: requirementQueries.map((query) => {
      const resolved = resolvedId(resolution, query);
      return resolved === null
        ? danglingRef(
            "requirement",
            query.ref,
            "No requirement with that reference has been ingested for this engagement.",
          )
        : toRef("requirement", resolved, query.ref);
    }),

    blocks: blocksIds.map((one) => refFromId("work_item", one, workItemLabels)),
    fixesDefects: defectRows.map((one) =>
      toRef("defect", requiredText(one.id), text(one.ref)),
    ),
  };
}

/**
 * `work_item` rows referenced only by id, resolved to renderable references.
 *
 * Exported for the Wave C units adopting `<EntityRef>` on the existing screens:
 * the answer payloads already carry a work item's uuid and its `unit`, but the
 * ones that carry only a uuid — a defect's `fixingWorkItem`, a dependency edge —
 * need the label, and one round trip for the whole screen is the shape that gets
 * that without eleven screens each writing their own.
 */
export async function workItemRefs(
  db: DetailDb,
  ids: readonly string[],
): Promise<Map<string, DetailRef>> {
  const labels = await labelEntities(db, "work_item", ids);
  return new Map(
    [...new Set(ids)]
      .filter((one) => one !== "")
      .map((one) => [one, refFromId("work_item", one, labels)] as const),
  );
}
