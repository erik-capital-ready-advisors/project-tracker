import { requirementRefs } from "./refs";
import type { Release, ReleaseRequirement } from "./types";

/**
 * FR-74. A release names the requirements it ships, with ranges expanded per
 * the FR-19 rule — reusing `requirementRefs` rather than writing a second
 * expander, because two expanders drift and the manifests use three range
 * shapes already.
 */
export function parseReleaseRequirements(
  releaseId: string,
  text: string,
): ReleaseRequirement[] {
  return requirementRefs(text).map((ref) => ({ releaseId, ref }));
}

/**
 * FR-74. Which requirements have shipped, and where to.
 *
 * The value is the set of environments rather than a boolean on purpose. A
 * requirement deployed to preview and a requirement deployed to production are
 * different claims, and collapsing them here would leave no way to tell them
 * apart later — the same rule FR-43 states for evidence scopes and FR-75 states
 * for built against deployed.
 */
export function shippedIndex(
  releases: Release[],
  links: ReleaseRequirement[],
): Map<string, Set<string>> {
  const environmentOf = new Map(
    releases.map((release) => [release.id, release.environment] as const),
  );

  const shipped = new Map<string, Set<string>>();
  for (const link of links) {
    const environment = environmentOf.get(link.releaseId);
    if (environment === undefined) continue;
    const environments = shipped.get(link.ref) ?? new Set<string>();
    environments.add(environment);
    shipped.set(link.ref, environments);
  }
  return shipped;
}

/**
 * A requirement's `shipped` state, derived from the releases naming it. No
 * field sets it.
 *
 * `environment` narrows the question to one environment. Left out, any release
 * counts — Erik has not yet said whether a staging deploy makes a requirement
 * shipped for the Committed answer, so the parser reports what the artifacts
 * say and the caller decides. Queued as a question on run b0952e.
 */
export function isShipped(
  shipped: Map<string, Set<string>>,
  ref: string,
  environment?: string,
): boolean {
  const environments = shipped.get(ref);
  if (environments === undefined) return false;
  return environment === undefined || environments.has(environment);
}
