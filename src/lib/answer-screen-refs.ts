import type { EntityKind } from "@/lib/entity-routes";
import { refKey, resolvedId } from "@/lib/server/detail/refs";
import type { RefQuery, RefResolution } from "@/lib/server/detail/refs";

/**
 * The seam between i1's reference resolver and the six answer screens
 * (CR-003 FR-80, FR-83).
 *
 * ## Why this module exists at all
 *
 * `readRefResolution` is keyed by the **engagement uuid**. Every answer payload
 * under `@/lib/server/answers/*` carries the engagement **slug** and nothing
 * else — `BlockedItem.engagement`, `CommittedMilestone.engagement`,
 * `EngagementCoverage.engagement` are all slugs, and none of the six answer
 * types exposes an `engagementId`. So a screen adopting `<EntityRef>` has to
 * bridge slug → uuid before it can resolve a single `FR-nn`, and six screens
 * each bridging it their own way is six places for the bridge to rot.
 *
 * The bridge is `listEngagements()`, which every screen already has the
 * authorisation to call, and this module is the twenty lines around it. It is
 * **pure** — it opens no client, reads no table and imports nothing marked
 * `server-only` — so the six screen components stay renderable under vitest in
 * jsdom, which is where FR-83's two states are actually asserted.
 *
 * ## Why a lookup function and not pre-resolved refs
 *
 * A screen renders references from inside nested components — a wait inside a
 * group inside a page, a defect inside a severity group inside an engagement.
 * Threading a pre-built `EntityRefItem[]` through those would mean every
 * intermediate component carrying a parallel structure whose ordering has to
 * stay in step with the data it mirrors, and the first thing to drift would be
 * which reference belongs to which row.
 *
 * A lookup is one prop, and it answers at the point of rendering. The signature
 * is deliberately narrow: given the kind, the engagement slug the row already
 * carries and the reference as it is rendered, it returns the row id or `null`.
 *
 * ## `null` is not a failure and it is not a default
 *
 * It is FR-83's case: the reference parsed and points at nothing. It comes back
 * `null` for three reasons and all three are the same finding to a reader —
 * nothing matched, more than one matched (i1's uniqueness rule refuses rather
 * than guesses), or the engagement slug is not one this render resolved.
 *
 * What it must never mean is "nobody checked". A screen whose engagement read
 * failed must not render dangling references, because the dangling treatment
 * makes a positive claim — *no such row has been ingested* — that a failed read
 * has not established. So the pages run the engagement read **inside** the same
 * `loadForOperator` call as the answer itself: a failure renders the load
 * notice and no data at all, rather than a page of references to nothing.
 */

/** A reference a screen renders and needs resolved. The engagement is a slug. */
export interface RefEntry {
  kind: EntityKind;
  /** The engagement **slug**, as every answer payload carries it. */
  engagement: string;
  /** The reference as it is rendered: `FR-42`, `u4`, `D-7`, a wait's label. */
  ref: string;
}

/**
 * Kind + engagement slug + rendered reference → the row id, or `null`.
 *
 * `null` is FR-83's dangling case and `<EntityRef id={null}>` renders it. There
 * is no third return: a caller that has not resolved a reference cannot render
 * one, which is the property `data-verify-known` depends on.
 */
export type RefLookup = (
  kind: EntityKind,
  engagementSlug: string,
  ref: string,
) => string | null;

/**
 * slug → `engagement.id`, from whatever the caller already read.
 *
 * Typed structurally rather than as `EngagementRecord` so this module does not
 * import the registry's server-action module. It needs two columns.
 */
export function engagementIdsBySlug(
  records: readonly { slug: string; id: string }[],
): Map<string, string> {
  return new Map(records.map((record) => [record.slug, record.id]));
}

/**
 * The batch to hand `readRefResolution` — deduplicated, and one round trip per
 * kind for the whole screen rather than one per row.
 *
 * An entry whose slug is not in the map is **dropped rather than sent with an
 * empty engagement id**. `resolveRefs` would filter an empty id out of its read
 * anyway; dropping it here keeps the batch honest about what was asked, and
 * `lookup` returns `null` for it regardless, so the reference dangles. That is
 * the correct outcome: a reference scoped to an engagement this render does not
 * know about has not been shown to exist.
 *
 * A blank reference is dropped for the same reason — `entityHref` refuses an
 * empty id, and asking the resolver to match `""` against a natural key would
 * be asking it to guess.
 */
export function collectRefQueries(
  engagementIdBySlug: ReadonlyMap<string, string>,
  entries: readonly RefEntry[],
): RefQuery[] {
  const queries = new Map<string, RefQuery>();

  for (const entry of entries) {
    if (entry.ref.trim() === "") continue;
    const engagementId = engagementIdBySlug.get(entry.engagement);
    if (engagementId === undefined) continue;

    const query: RefQuery = {
      kind: entry.kind,
      ref: entry.ref,
      engagementId,
    };
    // Keyed by `refKey` and never by hand: a work item carries a run and a
    // release an environment, and a key spelled out here would collide the
    // first time either is supplied.
    queries.set(refKey(query), query);
  }

  return [...queries.values()];
}

/** The lookup the screens render against, closed over one screen's resolution. */
export function buildRefLookup(
  engagementIdBySlug: ReadonlyMap<string, string>,
  resolution: RefResolution,
): RefLookup {
  return (kind, engagementSlug, ref) => {
    const engagementId = engagementIdBySlug.get(engagementSlug);
    if (engagementId === undefined) return null;
    return resolvedId(resolution, { kind, ref, engagementId });
  };
}
