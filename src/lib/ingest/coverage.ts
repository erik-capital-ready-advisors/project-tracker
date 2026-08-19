import type { Requirement, TestCase, TestResult, WorkItem } from "./types";

export interface CoverageInput {
  requirements: Requirement[];
  workItems: WorkItem[];
  tests: TestCase[];
  results: TestResult[];
}

export interface CoverageIndex {
  /** Refs with a passing test whose certifier did not execute the work. */
  covered: Set<string>;
  /** Refs with a passing test, certifier notwithstanding. */
  claimed: Set<string>;
  /** Test ids whose certifier executed the work they cover. */
  selfCertified: Set<string>;
  /** Refs whose only passing evidence was never checked against the deployment. */
  unproven: Set<string>;
}

export interface CoverageReport {
  requirements: number;
  tests: number;
  mapped: number;
  uncovered: string[];
  selfCertified: string[];
  unproven: string[];
}

/**
 * Which executors built the work implementing each requirement.
 *
 * The join is deliberately per-requirement, not per-engagement. Comparing a
 * certifier against every executor in the engagement looks equivalent and is
 * not: on a real fleet run `qa-reviewer` is itself a work-unit executor, so the
 * widened form rejects every legitimate QA certification as self-certification
 * and leaves every milestone permanently un-billable.
 */
function implementers(workItems: WorkItem[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const item of workItems) {
    if (item.executor === null) continue;
    for (const ref of item.implements) {
      const executors = map.get(ref) ?? new Set<string>();
      executors.add(item.executor);
      map.set(ref, executors);
    }
  }
  return map;
}

export function indexCoverage(input: CoverageInput): CoverageIndex {
  const built = implementers(input.workItems);
  const testsById = new Map(input.tests.map((test) => [test.id, test]));

  const covered = new Set<string>();
  const claimed = new Set<string>();
  const selfCertified = new Set<string>();
  const provenLive = new Set<string>();
  const provenAtAll = new Set<string>();

  for (const result of input.results) {
    if (result.status !== "pass") continue;
    const test = testsById.get(result.testId);
    if (test === undefined) continue;

    for (const ref of test.covers) {
      claimed.add(ref);

      if (result.certifiedBy === null) continue;
      if (built.get(ref)?.has(result.certifiedBy) === true) {
        selfCertified.add(test.id);
        continue;
      }
      provenAtAll.add(ref);
      if (result.evidenceScope !== "not-verified") {
        provenLive.add(ref);
        covered.add(ref);
      }
    }
  }

  const unproven = new Set(
    [...provenAtAll].filter((ref) => !provenLive.has(ref)),
  );
  return { covered, claimed, selfCertified, unproven };
}

export function untestedReport(input: CoverageInput): CoverageReport {
  const index = indexCoverage(input);
  const refs = input.requirements.map((requirement) => requirement.ref);
  return {
    requirements: refs.length,
    tests: input.tests.length,
    mapped: refs.filter((ref) => index.covered.has(ref)).length,
    uncovered: refs.filter((ref) => !index.covered.has(ref)),
    selfCertified: [...index.selfCertified].sort(),
    unproven: refs.filter((ref) => index.unproven.has(ref)),
  };
}
