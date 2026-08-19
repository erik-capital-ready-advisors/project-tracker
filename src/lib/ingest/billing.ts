import type { CoverageIndex } from "./coverage";
import type { Milestone } from "./types";

export type MilestoneState = "open" | "claimed" | "billable";

/**
 * A milestone becomes billable by derivation only. Nothing sets this field.
 *
 * - billable: every acceptance criterion has a passing test with an
 *   independent certifier.
 * - claimed:  every criterion passes, but at least one only on the say-so of
 *   whoever built it. That is a review request, not an invoice.
 * - open:     something is untested.
 */
export function milestoneState(
  milestone: Milestone,
  index: CoverageIndex,
): { state: MilestoneState; missing: string[] } {
  const missing = milestone.acceptance.filter((ref) => !index.covered.has(ref));
  if (missing.length === 0) return { state: "billable", missing };

  const allClaimed = milestone.acceptance.every((ref) => index.claimed.has(ref));
  return { state: allClaimed ? "claimed" : "open", missing };
}
