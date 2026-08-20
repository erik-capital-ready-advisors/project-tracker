import type { Disposition } from "@/lib/ingest/types";
import { fromDisposition } from "@/lib/server/answers/from-db";

import { labelEntities, refFromId } from "./refs";
import {
  decryptOne,
  fetchById,
  fetchEngagement,
  fetchWhere,
  requiredText,
  text,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";

/**
 * FR-81 for `blocker`.
 *
 * §7a: `sensitive`, "**pgcrypto column on `description`**", "operator, agents,
 * decrypted server-side". The schema comment says why a table that looks
 * operational is classified this way, and it is the reason the detail view is
 * the surface that has to be careful: `description` "carries verbatim prose
 * written by specialists mid-build — client database identifiers, provisioning
 * failures, named custodians".
 *
 * `ref` is nullable, so a blocker can be a row with no human reference of its
 * own; `toRef` falls back to `fallbackLabel` in that case rather than rendering
 * an empty token.
 *
 * The whole of the inbound side is `work_item.blocker_id`. There is no other
 * foreign key to this table in the schema.
 */
export interface BlockerDetail {
  kind: "blocker";
  id: string;
  engagement: DetailEngagement | null;

  ref: string | null;
  /** FR-52's grouping key. Null in the database when nothing stated one. */
  owner: string | null;
  /** §7a `sensitive`, pgcrypto. */
  description: Prose;
  openedAt: string | null;
  resolvedAt: string | null;
  disposition: Disposition | null;

  /** Inbound. Work items whose `blocker_id` is this row (FR-52). */
  blocks: DetailRef[];
}

const COLUMNS =
  "id, engagement_id, ref, owner, description, opened_at, resolved_at, disposition";

export async function loadBlockerDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<BlockerDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "blocker", COLUMNS, id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);

  const [engagement, description, blockedRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    decryptOne(db, text(row.description), withProse),
    fetchWhere(db, "work_item", "id, engagement_id, blocker_id", "blocker_id", rowId),
  ]);

  const blockedIds = blockedRows.map((one) => requiredText(one.id));
  const labels = await labelEntities(db, "work_item", blockedIds);

  return {
    kind: "blocker",
    id: rowId,
    engagement,
    ref: text(row.ref),
    owner: text(row.owner),
    description,
    openedAt: text(row.opened_at),
    resolvedAt: text(row.resolved_at),
    disposition: fromDisposition(row.disposition),
    blocks: blockedIds.map((one) => refFromId("work_item", one, labels)),
  };
}
