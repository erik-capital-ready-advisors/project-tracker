import { labelEntities, refFromId } from "./refs";
import { fetchById, fetchEngagement, fetchWhere, requiredText, text } from "./rows";
import type { DetailDb, DetailEngagement, DetailRef } from "./types";

/**
 * FR-81 for `external_wait`.
 *
 * **Nothing on this table is encrypted and that is a decision, not an
 * omission.** §7a classifies it `personal`, at rest "provider default", and the
 * schema comment states it plainly: "`reason` is deliberately left clear. That
 * is §7a's explicit call for this table, not an omission." So this loader takes
 * no `DetailOptions` at all — there is nothing here to opt into, and an option
 * that never does anything is a promise a later reader will believe.
 *
 * The inbound side is `work_item.external_wait_id`. §7 states the relationship
 * as "an external wait blocks many work items" and lists no join entity, so the
 * schema models it as that one-to-many FK rather than a 22nd table.
 */
export interface ExternalWaitDetail {
  kind: "external_wait";
  id: string;
  engagement: DetailEngagement | null;

  label: string;
  owner: string | null;
  ownerType: string | null;
  /** Clear text under §7a. */
  reason: string | null;
  startedAt: string | null;
  expectedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  /** FR-35: `probe` or `manual`. */
  resolutionMethod: string | null;
  probeTarget: string | null;

  /** Inbound. Work items whose `external_wait_id` is this row. */
  blocks: DetailRef[];
}

const COLUMNS =
  "id, engagement_id, label, owner, owner_type, reason, started_at, expected_by, " +
  "resolved_at, resolved_by, resolution_method, probe_target";

export async function loadExternalWaitDetail(
  db: DetailDb,
  id: string,
): Promise<ExternalWaitDetail | null> {
  const row = await fetchById(db, "external_wait", COLUMNS, id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);

  const [engagement, blockedRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    fetchWhere(
      db,
      "work_item",
      "id, engagement_id, external_wait_id",
      "external_wait_id",
      rowId,
    ),
  ]);

  const blockedIds = blockedRows.map((one) => requiredText(one.id));
  const labels = await labelEntities(db, "work_item", blockedIds);

  return {
    kind: "external_wait",
    id: rowId,
    engagement,
    label: requiredText(row.label),
    owner: text(row.owner),
    ownerType: text(row.owner_type),
    reason: text(row.reason),
    startedAt: text(row.started_at),
    expectedBy: text(row.expected_by),
    resolvedAt: text(row.resolved_at),
    resolvedBy: text(row.resolved_by),
    resolutionMethod: text(row.resolution_method),
    probeTarget: text(row.probe_target),
    blocks: blockedIds.map((one) => refFromId("work_item", one, labels)),
  };
}
