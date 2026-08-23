import { shippedIndex } from "@/lib/ingest/releases";
import type { Release, ReleaseRequirement } from "@/lib/ingest/types";

import { fetchAllRows } from "./db";
import type { ReleaseDb } from "./db";

/**
 * The read side of FR-74: load the rows, hand them to i3's pure derivation, and
 * add nothing.
 *
 * ## Why there is no SQL view here
 *
 * `shippedIndex` in `src/lib/ingest/releases.ts` already computes this, is
 * already tested against frozen inputs, and is already the thing
 * `committedReport` consumes. A second derivation in SQL would be a second
 * source of truth for a question the spec says has exactly one — "a
 * requirement's `shipped` state is derived from the releases naming it; no field
 * sets it." This module's whole job is to be the boring part: fetch, map, call.
 *
 * ## Why the value is a set of environments and not a boolean
 *
 * FR-75: built and deployed are different claims and the system never collapses
 * them. A preview deploy and a production deploy are a third distinction inside
 * "deployed", and i3 deliberately kept it. Collapsing it here would throw away
 * the only thing that lets a Committed screen ask the stricter question later,
 * and it would do so invisibly. There is no `shipped: boolean` anywhere in this
 * path and that is deliberate.
 */

export interface ShippedLoad {
  /** ref → the set of environments a release named it in. */
  index: Map<string, Set<string>>;
  /** The releases the index was built from, for a caller that wants to show them. */
  releases: Release[];
  /**
   * Null on success. On failure the caller reports the failure rather than an
   * empty index — an empty index reads as "nothing has shipped", which is a
   * positive claim this function did not establish.
   */
  error: string | null;
}

function toRelease(row: Record<string, unknown>): Release {
  return {
    id: row.id as string,
    engagement: row.engagement_id as string,
    identifier: row.identifier as string,
    environment: row.environment as string,
    url: (row.url as string | null) ?? null,
    deployedAt: (row.deployed_at as string | null) ?? null,
    source: row.source as Release["source"],
    recordedBy: (row.recorded_by as string | null) ?? null,
  };
}

/**
 * Every release for one engagement, and the requirement refs each names.
 *
 * Both reads are paged. `release_requirement` is the table most likely to cross
 * PostgREST's 1000-row cap first — one row per requirement per release, so a
 * hundred deploys of a fifty-requirement engagement is already 5000 rows — and a
 * truncated read there would silently report requirements as not shipped.
 */
export async function loadShippedIndex(
  db: ReleaseDb,
  engagementId: string,
): Promise<ShippedLoad> {
  const empty: ShippedLoad = { index: new Map(), releases: [], error: null };

  const releaseRows = await fetchAllRows(
    db,
    "release",
    "id, engagement_id, identifier, environment, url, deployed_at, source, recorded_by",
    (query) => query.eq("engagement_id", engagementId),
  );
  if (releaseRows.error) return { ...empty, error: releaseRows.error };

  const releases = releaseRows.rows.map(toRelease);
  if (releases.length === 0) return empty;

  const ids = new Set(releases.map((release) => release.id));

  // Filtered by engagement through the release ids rather than with an `.in()`
  // list, because the id list grows with the engagement and an `.in()` of
  // thousands of uuids is a URL PostgREST will refuse on length. Reading the
  // whole table paged and filtering in memory is correct at this product's size
  // — one operator, tens of engagements — and the filter is explicit so a later
  // reader can see the trade rather than infer it.
  const linkRows = await fetchAllRows(
    db,
    "release_requirement",
    "release_id, requirement_ref",
    (query) => query,
  );
  if (linkRows.error) return { ...empty, error: linkRows.error };

  const links: ReleaseRequirement[] = linkRows.rows
    .filter((row) => ids.has(row.release_id as string))
    .map((row) => ({
      releaseId: row.release_id as string,
      ref: row.requirement_ref as string,
    }));

  return { index: shippedIndex(releases, links), releases, error: null };
}
