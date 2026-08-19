/**
 * FR-44 — work items listed, filtered and sorted across every engagement in one
 * view.
 *
 * ## One list, because three lists is the problem
 *
 * Fleet, hand and external items are the same rows in the same table. This
 * function does not know which mode it is reading and does not branch on one;
 * `executionMode` is a filter like any other. That is the architecture decision
 * `CLAUDE.md` records: *"Splitting them yields three lists Erik has to merge in
 * his head, which is the state this product exists to end."*
 *
 * ## Every filter and sort is a clear column, and that is a §7a consequence
 *
 * `description` and `raw_status` are pgcrypto `bytea`. §7a states the
 * consequence outright: **there is no cross-engagement full-text search over
 * work items in v1.** So this reads and orders on status, executor kind,
 * execution mode, dates and dependency state — all clear — and the sort column
 * comes from an allowlist in `rules.ts` rather than from the caller's string.
 *
 * Decryption is **opt-in and bounded**. The default is off, because a list
 * that decrypts by default is one RPC per row and reintroduces the search
 * surface §7a closed by the back door.
 */

import { apiError } from "@/lib/api";
import type { ServiceClient } from "@/lib/supabase/service";

import { decryptField } from "./field-crypto";
import { WORK_ITEM_SORT_COLUMNS } from "./rules";
import type {
  StoredDisposition,
  StoredEvidenceScope,
  StoredExecutionMode,
  StoredExecutorKind,
  StoredUnautomatedReason,
  StoredWorkStatus,
  WorkItemSortColumn,
} from "./rules";

export const WORK_ITEM_PAGE_LIMIT = 200;
/** Above this many rows, decryption is refused rather than done slowly. */
export const DECRYPT_ROW_CAP = 50;

export interface WorkItemFilters {
  engagementSlug?: string | null;
  executionMode?: StoredExecutionMode | null;
  executorKind?: StoredExecutorKind | null;
  status?: StoredWorkStatus | null;
  disposition?: StoredDisposition | null;
  unautomatedReason?: StoredUnautomatedReason | null;
  evidenceScope?: StoredEvidenceScope | null;
  /** True: only items pointing at an unresolved external wait. */
  blockedOnly?: boolean;
  sort?: WorkItemSortColumn | null;
  direction?: "asc" | "desc" | null;
  limit?: number;
  offset?: number;
  /** §7a: decrypts `description` server-side. Off by default. */
  includeDescription?: boolean;
}

export interface ListedWorkItem {
  id: string;
  engagementId: string;
  engagementSlug: string | null;
  unit: string | null;
  executionMode: StoredExecutionMode;
  executorKind: StoredExecutorKind;
  executor: string | null;
  status: StoredWorkStatus;
  workType: string | null;
  phase: number | null;
  disposition: StoredDisposition | null;
  unautomatedReason: StoredUnautomatedReason | null;
  evidenceScope: StoredEvidenceScope | null;
  notVerifiedCount: number;
  stackName: string | null;
  blockerId: string | null;
  externalWaitId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Null unless `includeDescription` was asked for. */
  description: string | null;
}

export interface WorkItemListing {
  items: ListedWorkItem[];
  /**
   * The count of rows **on this page** that could not be classified.
   *
   * Reported on every listing, never suppressed. A zero here means "every row
   * on this page classified", which is a claim; the field is always present so
   * that claim is always made explicitly.
   *
   * ## Why the name says `OnPage`, and why it must keep saying it
   *
   * This is **not** FR-58's count. FR-58's count is the whole ledger's, defined
   * once in `@/lib/server/answers/unparsed` and rendered by the badge in the app
   * shell. This one is page-local and narrowed by whatever filters the caller
   * passed, so the two are different numbers by construction — a filtered page
   * can read `0` while the ledger holds unclassified records.
   *
   * A page-local count is legitimate information: it tells Erik whether the rows
   * *he is looking at* classified. It was called `unparsed`, and a screen
   * rendering it beside the shell badge showed two different numbers for what a
   * reader takes to be the same thing — which is the failure the shared
   * definition exists to end, arrived at through a field name. Renamed here
   * rather than reconciled away, because the quantity is fine and only the name
   * was lying. **Nothing about what it computes has changed.**
   */
  unparsedOnPage: number;
  /** FR-40 — how many of these only Erik can do. Feeds the Bottleneck answer. */
  erikGateCount: number;
  truncated: boolean;
}

interface WorkItemRow {
  id: string;
  engagement_id: string;
  unit: string | null;
  execution_mode: StoredExecutionMode;
  executor_kind: StoredExecutorKind;
  executor: string | null;
  status: StoredWorkStatus;
  work_type: string | null;
  phase: number | null;
  disposition: StoredDisposition | null;
  unautomated_reason: StoredUnautomatedReason | null;
  evidence_scope: StoredEvidenceScope | null;
  not_verified_count: number | null;
  blocker_id: string | null;
  external_wait_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  description: string | null;
  engagement: { slug: string } | { slug: string }[] | null;
  stack: { name: string } | { name: string }[] | null;
}

const COLUMNS =
  "id, engagement_id, unit, execution_mode, executor_kind, executor, status, " +
  "work_type, phase, disposition, unautomated_reason, evidence_scope, " +
  "not_verified_count, blocker_id, external_wait_id, started_at, ended_at, " +
  "description, engagement:engagement_id (slug), stack:stack_id (name)";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** FR-44. */
export async function listWorkItems(
  db: ServiceClient,
  filters: WorkItemFilters = {},
): Promise<WorkItemListing> {
  const limit = Math.min(
    Math.max(1, filters.limit ?? WORK_ITEM_PAGE_LIMIT),
    WORK_ITEM_PAGE_LIMIT,
  );
  const offset = Math.max(0, filters.offset ?? 0);

  if (filters.includeDescription === true && limit > DECRYPT_ROW_CAP) {
    throw apiError(
      "invalid_request",
      `Decrypting descriptions is limited to ${DECRYPT_ROW_CAP} rows per page ` +
        `because each one is a separate round trip. Narrow the filters or drop ` +
        `includeDescription.`,
    );
  }

  let query = db.from("work_item").select(COLUMNS);

  if (filters.engagementSlug) {
    const { data: engagement, error } = await db
      .from("engagement")
      .select("id")
      .eq("slug", filters.engagementSlug)
      .maybeSingle();
    if (error) throw apiError("internal_error", "Could not read the engagement.");
    if (!engagement) throw apiError("invalid_request", "No engagement has that slug.");
    query = query.eq("engagement_id", engagement.id);
  }

  if (filters.executionMode) query = query.eq("execution_mode", filters.executionMode);
  if (filters.executorKind) query = query.eq("executor_kind", filters.executorKind);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.disposition) query = query.eq("disposition", filters.disposition);
  if (filters.unautomatedReason) {
    query = query.eq("unautomated_reason", filters.unautomatedReason);
  }
  if (filters.evidenceScope) query = query.eq("evidence_scope", filters.evidenceScope);
  if (filters.blockedOnly === true) query = query.not("external_wait_id", "is", null);

  const sort: WorkItemSortColumn = filters.sort ?? "started_at";
  if (!(WORK_ITEM_SORT_COLUMNS as readonly string[]).includes(sort)) {
    // Unreachable through `parseSortColumn`, and asserted here anyway: this is
    // the last point before a caller-supplied string would reach PostgREST's
    // order parameter.
    throw apiError("invalid_request", "That is not a sortable column.");
  }

  const { data, error } = await query
    .order(sort, { ascending: filters.direction !== "desc" })
    .range(offset, offset + limit - 1);

  if (error) throw apiError("internal_error", "Could not read the work items.");

  const rows = (data ?? []) as unknown as WorkItemRow[];

  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      engagementId: row.engagement_id,
      engagementSlug: one(row.engagement)?.slug ?? null,
      unit: row.unit,
      executionMode: row.execution_mode,
      executorKind: row.executor_kind,
      executor: row.executor,
      status: row.status,
      workType: row.work_type,
      phase: row.phase,
      disposition: row.disposition,
      unautomatedReason: row.unautomated_reason,
      evidenceScope: row.evidence_scope,
      notVerifiedCount: row.not_verified_count ?? 0,
      stackName: one(row.stack)?.name ?? null,
      blockerId: row.blocker_id,
      externalWaitId: row.external_wait_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      description:
        filters.includeDescription === true
          ? await decryptField(db, row.description)
          : null,
    })),
  );

  return {
    items,
    unparsedOnPage: items.filter((item) => item.status === "unparsed").length,
    erikGateCount: items.filter((item) => item.executorKind === "erik_gate").length,
    truncated: items.length === limit,
  };
}
