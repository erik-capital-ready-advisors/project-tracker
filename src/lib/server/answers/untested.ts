/**
 * FR-48 / FR-49 / FR-55 — Untested. *What have I not proved?*
 *
 * > **FR-48** The untested view reports, per engagement, the requirement count,
 * > the test count, the mapped count, the uncovered requirements, and the
 * > self-certified tests.
 * > **FR-49** A requirement whose only covering test carries evidence scope
 * > `not-verified` is reported as unproven, distinctly from uncovered.
 * > **FR-55** Untested reports coverage per FR-48 and links each uncovered
 * > requirement to the work item that implements it.
 *
 * ## The three states are three states
 *
 * `covered`, `unproven` and `uncovered` are reported separately and are never
 * summed into a single "tested" number. FR-49 exists because they mean different
 * things and call for different actions:
 *
 *   * **uncovered** — nothing passing names this requirement. Write a test.
 *   * **unproven** — something passing names it, with an independent certifier,
 *     but the evidence scope was `not-verified`. The test exists and nobody
 *     checked it against the deployment. Go and look.
 *   * **self-certified** — something passing names it, and the certifier is the
 *     executor of the work that implemented it. FR-47 calls this a finding.
 *
 * All three arrive from `untestedReport` in `src/lib/ingest/coverage.ts`.
 * Nothing here re-derives coverage; this file adds FR-55's link from an
 * uncovered requirement back to the work item that implements it, which needs a
 * database read and therefore could not live in the pure module.
 *
 * ## Why the link runs on `ref` and never on requirement text
 *
 * §7a encrypts `requirement.text` and leaves `ref` clear, "so requirements are
 * matched, joined and reported by `FR-nn` and never by text". `work_item_requirement`
 * stores the ref as text for the same reason. The whole of this answer is
 * computable without decrypting anything, and it is.
 */

import { untestedReport } from "@/lib/ingest/coverage";
import type { CoverageReport } from "@/lib/ingest/coverage";

import type { AnswerDb } from "./db";
import type { UntestedFilters } from "./filters";
import { loadCoverageInput, loadEngagements } from "./load";

/** FR-55's link: an uncovered requirement and the work claiming to implement it. */
export interface UncoveredRequirement {
  ref: string;
  /**
   * The work items whose `work_item_requirement` rows name this ref.
   *
   * Empty means nothing claims to implement it — which is a different and often
   * more interesting finding than "it is implemented but untested", so the
   * empty array is reported rather than the requirement being dropped.
   */
  implementedBy: {
    id: string;
    unit: string | null;
    status: string;
    executor: string | null;
    executorKind: string;
  }[];
}

export interface SelfCertifiedTest {
  id: string;
  file: string;
  title: string;
  harness: string;
  covers: string[];
  /** FR-46's certifier as recorded on the test record itself. */
  certifiedBy: string | null;
  authoredBy: string | null;
}

export interface EngagementCoverage extends CoverageReport {
  engagement: string;
  clientName: string;
  /** FR-55. One entry per `uncovered` ref, in the same order. */
  uncoveredDetail: UncoveredRequirement[];
  /** FR-48's self-certified tests, resolved from ids to records. */
  selfCertifiedDetail: SelfCertifiedTest[];
}

export interface UntestedAnswer {
  /** FR-48 is explicitly *per engagement*, so this is never one merged report. */
  engagements: EngagementCoverage[];
  engagementUnknown: boolean;
}

export async function untestedAnswer(
  db: AnswerDb,
  filters: UntestedFilters,
): Promise<UntestedAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return { engagements: [], engagementUnknown: filters.engagement !== null };
  }

  // Loaded once across every engagement in scope and partitioned below, rather
  // than one round trip per engagement.
  const coverage = await loadCoverageInput(db, engagements);

  const reports: EngagementCoverage[] = engagements.map((engagement) => {
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

    // Results are not filtered by engagement: `indexCoverage` looks each result's
    // test up by id and skips any it cannot find, so a result belonging to
    // another engagement's test is already excluded. Filtering them here as well
    // would be a second implementation of the same rule.
    const report = untestedReport(slice);

    const implementers = new Map<string, UncoveredRequirement["implementedBy"]>();
    for (const item of slice.workItems) {
      for (const ref of item.implements) {
        const entry = {
          id: item.id,
          unit: item.unit,
          status: item.status,
          executor: item.executor,
          executorKind: item.executorKind,
        };
        const existing = implementers.get(ref);
        if (existing === undefined) implementers.set(ref, [entry]);
        else existing.push(entry);
      }
    }

    const testsById = new Map(slice.tests.map((one) => [one.id, one]));

    return {
      ...report,
      engagement: engagement.slug,
      clientName: engagement.clientName,
      uncoveredDetail: report.uncovered.map((ref) => ({
        ref,
        implementedBy: implementers.get(ref) ?? [],
      })),
      selfCertifiedDetail: report.selfCertified.flatMap((id) => {
        const test = testsById.get(id);
        return test === undefined
          ? []
          : [
              {
                id: test.id,
                file: test.file,
                title: test.title,
                harness: test.harness,
                covers: test.covers,
                certifiedBy: test.certifiedBy,
                authoredBy: test.authoredBy,
              },
            ];
      }),
    };
  });

  return { engagements: reports, engagementUnknown: false };
}
