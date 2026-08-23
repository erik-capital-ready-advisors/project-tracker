import { milestoneState } from "./billing";
import { isUnresolved } from "./defects";
import { currentCoverage, findRegressions } from "./regressions";
import { isShipped } from "./releases";
import type { MilestoneState } from "./billing";
import type { CoverageInput } from "./coverage";
import type { DefectVerdict } from "./defects";
import type { Defect, Milestone } from "./types";

export interface MilestoneVerdict {
  milestone: string;
  /** FR-50, computed against current coverage only. */
  state: MilestoneState;
  /** FR-79. Billable, flagged, and never presented as clean. */
  contested: boolean;
  /** Defect ids that contest it: unresolved, `critical`, naming an acceptance ref. */
  contestingDefects: string[];
  /**
   * Defect ids naming an acceptance ref whose severity the parser could not
   * grade. Not contesting — an ungraded defect is not a critical one — but
   * surfaced so a milestone is never shown clean while an unread finding names
   * one of its requirements.
   */
  unclassifiedDefects: string[];
  covered: string[];
  notCovered: string[];
  /** FR-75. Shipped is asked separately from covered and never collapsed into it. */
  shipped: string[];
  notShipped: string[];
  /** FR-70. Acceptance requirements that lost their covering condition. */
  regressed: string[];
}

export interface CommittedInput {
  milestones: Milestone[];
  coverage: CoverageInput;
  defects: Defect[];
  verdicts: Map<string, DefectVerdict>;
  /** From `shippedIndex` in releases.ts. */
  shipped: Map<string, Set<string>>;
  /** Narrow `shipped` to one environment. Omitted, any release counts. */
  environment?: string;
}

/**
 * FR-75 with FR-70 and FR-79 folded in — the Committed answer, per milestone.
 *
 * Built and deployed are different claims and this report never collapses them:
 * `covered` answers "is there a passing test with an independent certifier",
 * `shipped` answers "did a release name it", and a milestone can be either
 * without the other.
 *
 * FR-70 needs no rule of its own. `state` is computed against **current**
 * coverage — the latest result per test — so a covering test going red removes
 * the coverage and the milestone leaves `billable` on its own. The assertion
 * that this actually happens lives in the test beside this file, which is what
 * FR-70 asks for.
 */
export function committedReport(input: CommittedInput): MilestoneVerdict[] {
  const coverage = currentCoverage(input.coverage);
  const regressed = new Set(
    findRegressions(input.coverage).requirements.map((one) => one.ref),
  );

  return input.milestones.map((milestone) => {
    const acceptance = new Set(milestone.acceptance);
    const { state, missing } = milestoneState(milestone, coverage);

    const naming = input.defects.filter(
      (defect) =>
        defect.requirementRef !== null &&
        acceptance.has(defect.requirementRef) &&
        isUnresolved(input.verdicts.get(defect.id)?.status ?? defect.status),
    );

    const contestingDefects = naming
      .filter((defect) => defect.severity === "critical")
      .map((defect) => defect.id)
      .sort();

    return {
      milestone: milestone.id,
      state,
      // FR-79: contested is billable-and-flagged, not a separate state that
      // would let the milestone read as un-billable. Downgrading or resolving
      // the defect clears it, because both drop it out of `naming`.
      contested: state === "billable" && contestingDefects.length > 0,
      contestingDefects,
      unclassifiedDefects: naming
        .filter((defect) => defect.severity === "unparsed")
        .map((defect) => defect.id)
        .sort(),
      covered: milestone.acceptance.filter((ref) => coverage.covered.has(ref)),
      notCovered: missing,
      shipped: milestone.acceptance.filter((ref) =>
        isShipped(input.shipped, ref, input.environment),
      ),
      notShipped: milestone.acceptance.filter(
        (ref) => !isShipped(input.shipped, ref, input.environment),
      ),
      regressed: milestone.acceptance.filter((ref) => regressed.has(ref)),
    };
  });
}
