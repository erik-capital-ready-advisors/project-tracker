import { indexCoverage } from "./coverage";
import type { CoverageIndex, CoverageInput } from "./coverage";
import type { TestResult } from "./types";

/**
 * The current result of each test.
 *
 * `test_result` is append-only, so **input order is history order** and this
 * function does not re-sort. That is a contract on the caller, and it is
 * deliberate: `runAt` is nullable, an undated result cannot be placed in a
 * sequence, and picking an order for it silently would decide whether a
 * regression is reported or hidden. The database read that feeds this orders by
 * `run_at`; a caller that shuffles gets wrong answers loudly rather than a
 * quiet false clean.
 */
export function latestResults(results: TestResult[]): TestResult[] {
  const latest = new Map<string, TestResult>();
  for (const result of results) latest.set(result.testId, result);
  return [...latest.values()];
}

/** Coverage as it stands now, ignoring every superseded result. */
export function currentCoverage(input: CoverageInput): CoverageIndex {
  return indexCoverage({ ...input, results: latestResults(input.results) });
}

export interface TestRegression {
  testId: string;
  /** When the test last passed, as recorded. Null when the pass was undated. */
  lastPassedAt: string | null;
  failedAt: string | null;
}

export interface RequirementRegression {
  ref: string;
  /** Tests naming this requirement whose current result is a failure. */
  failingTests: string[];
}

export interface RegressionReport {
  /** FR-69 kind 1: a test that passed before and fails now. */
  tests: TestRegression[];
  /** FR-69 kind 2: a requirement that was covered under FR-47 and is not now. */
  requirements: RequirementRegression[];
}

/**
 * FR-69. A regression is derived from the append-only history, never asserted.
 * There is no regression entity and nothing writes one.
 *
 * The two kinds are reported separately because they answer different
 * questions. A test can go red without any requirement losing coverage — a
 * second test may still cover it — and a requirement can lose coverage with no
 * test going red at all, if the only passing evidence was self-certified. The
 * system reports both and never collapses them into one number.
 */
export function findRegressions(input: CoverageInput): RegressionReport {
  const current = new Map(
    latestResults(input.results).map((result) => [result.testId, result] as const),
  );

  const tests: TestRegression[] = [];
  for (const [testId, latest] of current) {
    if (latest.status !== "fail") continue;
    const passes = input.results.filter(
      (result) => result.testId === testId && result.status === "pass",
    );
    if (passes.length === 0) continue;
    tests.push({
      testId,
      lastPassedAt: passes[passes.length - 1].runAt,
      failedAt: latest.runAt,
    });
  }

  // Covered at some point in the history, against covered right now. A
  // requirement in the first set and not the second lost its covering
  // condition, which is what FR-69's second kind names.
  const ever = indexCoverage(input);
  const now = currentCoverage(input);
  const failingNow = new Set(
    [...current.values()]
      .filter((result) => result.status === "fail")
      .map((result) => result.testId),
  );

  const requirements: RequirementRegression[] = [...ever.covered]
    .filter((ref) => !now.covered.has(ref))
    .sort()
    .map((ref) => ({
      ref,
      failingTests: input.tests
        .filter((test) => test.covers.includes(ref) && failingNow.has(test.id))
        .map((test) => test.id)
        .sort(),
    }));

  return { tests: tests.sort((a, b) => a.testId.localeCompare(b.testId)), requirements };
}
