/**
 * FR-71 / FR-72 — Broken. *What is actually failing right now?* (CR-001's sixth answer.)
 *
 * > **FR-71** Broken lists open defects grouped by severity and current
 * > regressions of both kinds, per engagement, each linked to the requirement,
 * > work item and test it implicates.
 *
 * ## "Open" means derived-open, not recorded-open
 *
 * A defect's `status` column is what was *recorded*. FR-66 says `verified` is
 * computed and no field sets it, so this answer runs every defect through
 * `deriveDefectStatuses` first and lists the ones `isUnresolved` still holds.
 * The practical consequence: a defect somebody marked `fixed` stays on Broken
 * until a passing test names its `D-nn` **and** that test's certifier is not the
 * executor of the fixing work item. Marking your own fix verified does not clear
 * it from this screen, which is the entire point of FR-66.
 *
 * `blockedBy` travels with each row — `no-passing-test`, `no-fixing-executor`,
 * or `self-certified` — so the screen says *why* a defect is still open rather
 * than only that it is.
 *
 * ## The two regression kinds stay two
 *
 * FR-69 defines them and `findRegressions` computes them independently:
 *
 *   * a **test** whose latest result is `fail` and which has an earlier `pass`;
 *   * a **requirement** that was covered under FR-47 and is not covered now.
 *
 * Neither is derived from the other. A test can go red with no requirement
 * losing coverage (a second test still covers it), and a requirement can lose
 * coverage with no test going red at all (the only passing evidence turned out
 * to be self-certified). Collapsing them into one "regressions" number would
 * hide the second case completely, and the second case is the one nobody is
 * watching for.
 *
 * ## `unparsed` severity is a bucket, not a hidden row
 *
 * FR-64: "A finding paragraph the parser does not classify is stored `unparsed`
 * and counted per FR-58." So `unparsed` is one of the four severity groups here,
 * listed with the rest rather than filtered out — a defect nobody has graded is
 * exactly the thing that must not go quiet.
 *
 * ## No decrypt on this path
 *
 * i3's finding, preserved: every join runs on `D-nn`, `FR-nn`, `status`,
 * `severity` and `certifiedBy`, all clear columns. `defect.title` is clear by
 * CR-001 §4's stated exception and is the display key. `defect.description` is
 * ciphertext and is never selected — a screen wanting reproduction detail
 * decrypts at its own edge, one row at a time, on the operator path.
 */

import { deriveDefectStatuses, isUnresolved } from "@/lib/ingest/defects";
import { findRegressions } from "@/lib/ingest/regressions";
import type { VerificationBlock } from "@/lib/ingest/defects";

import type { AnswerDb } from "./db";
import type { BrokenFilters } from "./filters";
import { loadCoverageInput, loadDefects, loadEngagements } from "./load";

export interface BrokenDefect {
  id: string;
  /** `D-nn`. Null until the persistence layer allocates one. */
  ref: string | null;
  /** Clear by CR-001 §4's stated exception. The display key. */
  title: string;
  severity: string;
  /** The derived status (FR-66), which may differ from what was recorded. */
  status: string;
  recordedStatus: string;
  /** FR-66. Why `verified` was withheld, or null when it was granted. */
  blockedBy: VerificationBlock | null;
  /** Tests naming this defect whose certifier is the fixing item's executor. */
  selfCertifiedTests: string[];
  source: string;
  reportedAt: string | null;
  reportedBy: string | null;
  /** FR-71's three links. */
  requirementRef: string | null;
  workItem: { id: string; unit: string | null; executor: string | null } | null;
  tests: { id: string; file: string; title: string }[];
}

export interface BrokenSeverityGroup {
  severity: string;
  defects: BrokenDefect[];
}

export interface BrokenTestRegression {
  testId: string;
  file: string;
  title: string;
  harness: string;
  /** FR-71's links, resolved from the test's own title tags. */
  covers: string[];
  lastPassedAt: string | null;
  failedAt: string | null;
}

export interface BrokenRequirementRegression {
  ref: string;
  failingTests: { id: string; file: string; title: string }[];
  /** FR-71's work-item link, from `work_item_requirement`. */
  implementedBy: { id: string; unit: string | null; executor: string | null }[];
}

export interface BrokenEngagement {
  engagement: string;
  clientName: string;
  /** FR-71. Four groups, always present, `unparsed` among them. */
  bySeverity: BrokenSeverityGroup[];
  openDefectCount: number;
  testRegressions: BrokenTestRegression[];
  requirementRegressions: BrokenRequirementRegression[];
}

export interface BrokenAnswer {
  engagements: BrokenEngagement[];
  engagementUnknown: boolean;
}

/** FR-63's severity order, worst first. `unparsed` last, and never omitted. */
const SEVERITY_ORDER = ["critical", "major", "minor", "unparsed"] as const;

/**
 * The `D-nn` references a test title names, read the same way FR-45 reads
 * `FR-nn`.
 *
 * Deliberately **not** `new RegExp(defect.ref)`. `defect.ref` is a `text` column,
 * so a value carrying regex metacharacters would compile into a pattern that
 * matches titles it has nothing to do with — a link this screen presents to Erik
 * as evidence. Reading the refs out of the title and comparing them as strings
 * cannot do that whatever the column holds.
 */
function defectRefsIn(title: string): string[] {
  return title.match(/\bD-\d+\b/g) ?? [];
}

export async function brokenAnswer(
  db: AnswerDb,
  filters: BrokenFilters,
): Promise<BrokenAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return { engagements: [], engagementUnknown: filters.engagement !== null };
  }

  const [coverage, defects] = await Promise.all([
    loadCoverageInput(db, engagements),
    loadDefects(db, engagements),
  ]);

  const verdicts = deriveDefectStatuses({
    defects,
    workItems: coverage.workItems,
    tests: coverage.tests,
    results: coverage.results,
  });

  const itemById = new Map(coverage.workItems.map((one) => [one.id, one]));
  const testById = new Map(coverage.tests.map((one) => [one.id, one]));

  const reports: BrokenEngagement[] = engagements.map((engagement) => {
    const slice = {
      requirements: coverage.requirements.filter(
        (one) => one.engagement === engagement.slug,
      ),
      workItems: coverage.workItems.filter(
        (one) => one.engagement === engagement.slug,
      ),
      tests: coverage.tests.filter((one) => one.engagement === engagement.slug),
      results: coverage.results,
    };

    const open: BrokenDefect[] = [];
    for (const defect of defects) {
      if (defect.engagement !== engagement.slug) continue;
      const verdict = verdicts.get(defect.id);
      const status = verdict?.status ?? defect.status;
      if (!isUnresolved(status)) continue;
      if (filters.severity !== null && defect.severity !== filters.severity) continue;

      const item =
        defect.fixingWorkItem === null
          ? null
          : (itemById.get(defect.fixingWorkItem) ?? null);

      // FR-71's test link: every test in this engagement whose title names the
      // defect's `D-nn`. Read from the title the same way FR-45 reads `FR-nn`,
      // and skipped entirely when the defect has no ref — a defect with no
      // reference cannot be named by a test, and matching on anything else here
      // would be inventing a link.
      const tests =
        defect.ref === null
          ? []
          : slice.tests
              .filter((test) => defectRefsIn(test.title).includes(defect.ref as string))
              .map((test) => ({ id: test.id, file: test.file, title: test.title }));

      open.push({
        id: defect.id,
        ref: defect.ref,
        title: defect.title,
        severity: defect.severity,
        status,
        recordedStatus: defect.status,
        blockedBy: verdict?.blockedBy ?? null,
        selfCertifiedTests: verdict?.selfCertified ?? [],
        source: defect.source,
        reportedAt: defect.reportedAt,
        reportedBy: defect.reportedBy,
        requirementRef: defect.requirementRef,
        workItem:
          item === null
            ? null
            : { id: item.id, unit: item.unit, executor: item.executor },
        tests,
      });
    }

    // Every severity group is emitted, including empty ones. An absent
    // `critical` group and an empty `critical` group look identical to a reader
    // scanning for the worst bucket, and only one of them means "none".
    const bySeverity = SEVERITY_ORDER.filter(
      (severity) => filters.severity === null || filters.severity === severity,
    ).map((severity) => ({
      severity,
      defects: open
        .filter((defect) => defect.severity === severity)
        .sort((a, b) => (a.ref ?? a.id).localeCompare(b.ref ?? b.id)),
    }));

    const regressions = findRegressions(slice);
    const implementers = new Map<
      string,
      { id: string; unit: string | null; executor: string | null }[]
    >();
    for (const item of slice.workItems) {
      for (const ref of item.implements) {
        const entry = { id: item.id, unit: item.unit, executor: item.executor };
        const existing = implementers.get(ref);
        if (existing === undefined) implementers.set(ref, [entry]);
        else existing.push(entry);
      }
    }

    return {
      engagement: engagement.slug,
      clientName: engagement.clientName,
      bySeverity,
      openDefectCount: open.length,
      testRegressions: regressions.tests.flatMap((regression) => {
        const test = testById.get(regression.testId);
        return test === undefined
          ? []
          : [
              {
                testId: regression.testId,
                file: test.file,
                title: test.title,
                harness: test.harness,
                covers: test.covers,
                lastPassedAt: regression.lastPassedAt,
                failedAt: regression.failedAt,
              },
            ];
      }),
      requirementRegressions: regressions.requirements.map((regression) => ({
        ref: regression.ref,
        failingTests: regression.failingTests.flatMap((id) => {
          const test = testById.get(id);
          return test === undefined
            ? []
            : [{ id, file: test.file, title: test.title }];
        }),
        implementedBy: implementers.get(regression.ref) ?? [],
      })),
    };
  });

  return { engagements: reports, engagementUnknown: false };
}
