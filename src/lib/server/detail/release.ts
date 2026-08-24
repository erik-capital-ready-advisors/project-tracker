import type { ReleaseSource } from "@/lib/ingest/types";

import { resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import { fetchById, fetchEngagement, fetchWhere, requiredText, text } from "./rows";
import type { DetailDb, DetailEngagement, DetailRef } from "./types";
import { danglingRef, toRef } from "./types";

/**
 * FR-81 for `release` (CR-001 FR-73, FR-74).
 *
 * §7a classifies `release` and `release_requirement` `internal`, at rest
 * "provider default". **Nothing on either table is encrypted**, so this loader
 * takes no `DetailOptions`, for the same reason `external-wait.ts` does not.
 *
 * The outbound side is the requirements the release names. They are stored as
 * TEXT refs rather than foreign keys — the schema header states why, and it is
 * FR-12's rule: "a foreign key would reject the row at ingest and lose the
 * finding". So a release naming `FR-99` in an engagement that has no `FR-99`
 * renders dangling, which is the finding being reported.
 *
 * **This loader does not say whether a requirement is "shipped".** That is
 * FR-74's derivation and it already exists, once, in `shippedIndex`. A release
 * detail view showing what a release names is a different statement from a
 * requirement's shipped state, and collapsing them here would put a second
 * derivation of FR-74 in the tree.
 */
export interface ReleaseDetail {
  kind: "release";
  id: string;
  engagement: DetailEngagement | null;

  identifier: string;
  environment: string;
  url: string | null;
  deployedAt: string | null;
  /** FR-73: `declared` or `ingested`. */
  source: ReleaseSource;
  recordedBy: string | null;

  /** Outbound. The requirements this release names (FR-74). */
  requirements: DetailRef[];
}

const COLUMNS =
  "id, engagement_id, identifier, environment, url, deployed_at, source, recorded_by";

export async function loadReleaseDetail(
  db: DetailDb,
  id: string,
): Promise<ReleaseDetail | null> {
  const row = await fetchById(db, "release", COLUMNS, id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);

  const [engagement, linkRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    fetchWhere(
      db,
      "release_requirement",
      "id, release_id, requirement_ref",
      "release_id",
      rowId,
    ),
  ]);

  const queries: RefQuery[] = linkRows.map((one) => ({
    kind: "requirement" as const,
    ref: requiredText(one.requirement_ref),
    engagementId,
  }));
  const resolution = await resolveRefs(db, queries);

  return {
    kind: "release",
    id: rowId,
    engagement,
    identifier: requiredText(row.identifier),
    environment: requiredText(row.environment),
    url: text(row.url),
    deployedAt: text(row.deployed_at),
    source: requiredText(row.source) as ReleaseSource,
    recordedBy: text(row.recorded_by),
    requirements: queries.map((query) => {
      const resolved = resolvedId(resolution, query);
      return resolved === null
        ? danglingRef(
            "requirement",
            query.ref,
            "This release names a requirement that has not been ingested for this engagement.",
          )
        : toRef("requirement", resolved, query.ref);
    }),
  };
}
