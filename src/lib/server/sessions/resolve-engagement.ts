/**
 * FR-26 — which engagement a hand-prompted session belongs to.
 *
 * Pure. The database read that supplies `candidates` lives in `record.ts`; the
 * decision lives here so it can be tested against a frozen list.
 *
 * ## Why this is not a `like` query in Postgres
 *
 * The rule is **longest matching prefix**, and there is no clean way to ask
 * PostgREST for that. Doing it in TypeScript over the engagement list is honest
 * about the cost — this is a single-operator client book, tens of rows — and it
 * makes the tie-breaking testable, which matters because the tie-break is the
 * whole rule: `/Users/erik/Projects/acme` and `/Users/erik/Projects/acme/admin`
 * are two different engagements and the session belongs to the second.
 *
 * ## The `unassigned` fallback is not a failure path
 *
 * FR-26: a session that resolves to no known engagement is *stored* against the
 * `unassigned` engagement and listed for Erik to attribute, **rather than
 * discarded**. Losing the record of an hour of client work because a repository
 * has not been registered yet is a worse outcome than filing it in a queue, and
 * it is invisible when it happens. So `unassigned` is the answer this function
 * gives, never `null`, and the caller has nothing to decide.
 */

export interface EngagementCandidate {
  id: string;
  slug: string;
  repoPath: string | null;
}

/** The slug i1 seeded for exactly this purpose. */
export const UNASSIGNED_SLUG = "unassigned";

export type ResolutionSource = "explicit-slug" | "repo-path" | "unassigned";

export interface EngagementResolution {
  engagementId: string;
  slug: string;
  /** How it was decided. Reported back so a mis-filed session is diagnosable. */
  source: ResolutionSource;
}

/** Strip trailing slashes so `/a/b/` and `/a/b` are the same directory. */
function normalise(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * True when `directory` is `repoPath` or sits inside it.
 *
 * The `/` in the second branch is load-bearing. A bare `startsWith` would make
 * `/Users/erik/Projects/acme-site` match an engagement rooted at
 * `/Users/erik/Projects/acme`, filing one client's session against another
 * client's engagement — which is both a wrong number and a confidentiality
 * problem, since the summary is that client's prose.
 */
function isWithin(directory: string, repoPath: string): boolean {
  return directory === repoPath || directory.startsWith(`${repoPath}/`);
}

export function resolveEngagement(
  input: { workingDirectory: string; engagementSlug: string | null },
  candidates: readonly EngagementCandidate[],
): EngagementResolution {
  const unassigned = candidates.find((c) => c.slug === UNASSIGNED_SLUG);

  if (input.engagementSlug !== null) {
    const named = candidates.find((c) => c.slug === input.engagementSlug);
    if (named) {
      return { engagementId: named.id, slug: named.slug, source: "explicit-slug" };
    }
    // A slug the caller invented does NOT fall through to a path match. The
    // caller asserted an engagement; if it does not exist, that assertion is
    // wrong and the session goes to the queue for a human to look at, rather
    // than being quietly filed somewhere the caller did not name.
  } else {
    const directory = normalise(input.workingDirectory);
    let best: EngagementCandidate | null = null;
    let bestLength = -1;

    for (const candidate of candidates) {
      if (candidate.repoPath === null || candidate.repoPath === "") continue;
      const repoPath = normalise(candidate.repoPath);
      if (!isWithin(directory, repoPath)) continue;
      if (repoPath.length > bestLength) {
        best = candidate;
        bestLength = repoPath.length;
      }
    }

    if (best) {
      return { engagementId: best.id, slug: best.slug, source: "repo-path" };
    }
  }

  if (!unassigned) {
    // i1 seeds this row in the schema migration and `engagement.slug` is unique,
    // so its absence means the migration did not run or the row was deleted.
    // Loud, because the alternative is discarding the session FR-26 says to keep.
    throw new Error(
      `FR-26 requires an engagement with slug "${UNASSIGNED_SLUG}" to file ` +
        `unattributable sessions against, and none exists. It is seeded by ` +
        `20260819144331_schema_21_entities.sql; check that migration ran.`,
    );
  }

  return {
    engagementId: unassigned.id,
    slug: unassigned.slug,
    source: "unassigned",
  };
}
