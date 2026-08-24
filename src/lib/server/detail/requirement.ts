import { indexCoverage } from "@/lib/ingest/coverage";
import { latestResults } from "@/lib/ingest/regressions";
import type { EvidenceScope, TestResult, WorkStatus } from "@/lib/ingest/types";
import { loadCoverageInput, loadEngagements } from "@/lib/server/answers/load";
import { loadShippedIndex } from "@/lib/server/releases/shipped";

import {
  decryptOne,
  fetchById,
  fetchEngagement,
  fetchIn,
  fetchWhere,
  requiredText,
  text,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";
import { toRef } from "./types";

/**
 * FR-81 and **FR-82** for `requirement` — the de-siloing view.
 *
 * > **FR-82** A requirement's detail view lists every work item implementing it
 * > (FR-19), every test naming it (FR-45), every defect violating it (FR-65),
 * > and every release shipping it (FR-74). **Nothing new is derived** — these
 * > four relationships are already parsed and stored; this requirement is that
 * > they be *shown together*.
 *
 * ## "Nothing new is derived" is read as binding, and here is where each thing
 * comes from
 *
 * | What | Where it is computed | This file's part |
 * |---|---|---|
 * | which work items implement `FR-nn` | `work_item_requirement` rows | filters the already-loaded list |
 * | which tests name it | `test_case.covers` | filters the already-loaded list |
 * | a test's current result | `latestResults` (`ingest/regressions.ts`) | calls it |
 * | `covered` / `unproven` / `uncovered` | `indexCoverage` (`ingest/coverage.ts`) | calls it |
 * | FR-47 self-certification | `indexCoverage` | reads its set |
 * | which defects violate it | `defect.requirement_ref` | one read |
 * | shipped state and environments | `shippedIndex` via `loadShippedIndex` | calls it |
 *
 * **`indexCoverage` is called, not reimplemented, and it is called over exactly
 * the same slice `untestedAnswer` builds** — the engagement's requirements, work
 * items and tests, with results unfiltered, because `indexCoverage` looks each
 * result's test up by id and skips the ones it cannot find. That equality is the
 * point: if a requirement reads `unproven` on `/untested` it reads `unproven`
 * here, because the same function produced both. The first distinction a second
 * implementation would collapse is `unproven` versus `uncovered`, which FR-49
 * exists to keep apart.
 *
 * `loadCoverageInput` reads work items **without prose**, so none of the four
 * relationships costs a `decrypt_field` call. The only decryption on this page
 * is the requirement's own `text`.
 *
 * ## §7a
 *
 * `requirement` is `sensitive`: "**pgcrypto column on `text`**; `ref` and
 * `section` left clear", "operator, agents, decrypted server-side". Every join
 * above runs on `ref`, never on text — §7a states the consequence itself
 * ("requirements are matched, joined and reported by `FR-nn` and never by
 * text") and this file obeys it even though it is the one place that *does*
 * decrypt the text for display.
 */

/** FR-49's three states, and they are never summed into one "tested" number. */
export type RequirementCoverage = "covered" | "unproven" | "uncovered";

/** FR-19. A work item claiming to implement this requirement. */
export interface RequirementWorkItem {
  ref: DetailRef;
  unit: string | null;
  status: WorkStatus;
  executor: string | null;
  executorKind: string;
  /**
   * FR-87 — planned work. FR-91 wants it distinguishable on every screen that
   * shows a work item, and "which work items implement this requirement" is
   * one: a planned row here says the requirement is *intended* to be covered,
   * which is a different claim from work being underway against it.
   */
  planned: boolean;
  /** `work_item.updated_at`. FR-91's staleness timestamp. */
  updatedAt: string | null;
}

/** FR-45. A test naming this requirement. `test_case` has no detail view. */
export interface RequirementTest {
  id: string;
  file: string;
  title: string;
  harness: string;
  covers: string[];
  authoredBy: string | null;
  /** FR-46's certifier as recorded on the test record itself. */
  certifiedBy: string | null;
  /** The most recent recorded run, or `null` when the test has never run. */
  latest: {
    status: TestResult["status"];
    evidenceScope: EvidenceScope;
    certifiedBy: string | null;
    runAt: string | null;
  } | null;
  /** FR-47. This test's certifier executed the work implementing the requirement. */
  selfCertified: boolean;
}

/** FR-65. A defect recorded against this requirement. */
export interface RequirementDefect {
  ref: DetailRef;
  title: string;
  severity: string;
  status: string;
}

/** FR-74. A release naming this requirement. */
export interface RequirementRelease {
  ref: DetailRef;
  identifier: string;
  environment: string;
  deployedAt: string | null;
}

export interface RequirementDetail {
  kind: "requirement";
  id: string;
  engagement: DetailEngagement | null;

  ref: string;
  /** Clear under §7a. */
  section: string | null;
  /** §7a `sensitive`, pgcrypto. */
  text: Prose;

  /** FR-47 / FR-49, computed by `indexCoverage` and not by this file. */
  coverage: RequirementCoverage;
  /**
   * FR-74's environments, from `shippedIndex`. **A set, never a boolean** — a
   * preview deploy and a production deploy are different claims and FR-75 says
   * the system never collapses them.
   */
  shippedEnvironments: string[];

  /** FR-82, relationship 1 (FR-19). */
  workItems: RequirementWorkItem[];
  /** FR-82, relationship 2 (FR-45). */
  tests: RequirementTest[];
  /** FR-82, relationship 3 (FR-65). */
  defects: RequirementDefect[];
  /** FR-82, relationship 4 (FR-74). */
  releases: RequirementRelease[];

  /**
   * FR-81's inbound side, beyond FR-82's four: the contract milestones whose
   * acceptance criteria name this requirement.
   *
   * Operator-only by construction — this loader is reachable only through
   * `detail-load.ts`, which gates on `requireOperator()`, and an agent reaching
   * it through `agentScopedDb` is refused at `from("contract_milestone")`.
   * **No amount is read here**; only `id` and `name`, both clear.
   */
  milestones: DetailRef[];
}

export async function loadRequirementDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<RequirementDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "requirement", "id, engagement_id, ref, section, text", id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);
  const ref = requiredText(row.ref);

  const engagement = await fetchEngagement(db, engagementId);
  if (engagement === null) {
    // Every one of these tables is `on delete cascade` from `engagement`, so a
    // requirement whose engagement is gone cannot exist. Reported rather than
    // guessed at: returning a half-populated page would state that this
    // requirement is implemented by nothing and shipped nowhere.
    return null;
  }

  // `loadEngagements` rather than the row above, because `loadCoverageInput`
  // takes its own `EngagementRef` shape and keys every record on the SLUG.
  const engagementRefs = await loadEngagements(db, engagement.slug);

  const [prose, coverageInput, shipped, defectRows, releaseLinkRows, criterionRows, milestoneRows] =
    await Promise.all([
      decryptOne(db, text(row.text), withProse),
      loadCoverageInput(db, engagementRefs),
      loadShippedIndex(db, engagementId),
      fetchWhere(
        db,
        "defect",
        "id, engagement_id, ref, title, severity, status, requirement_ref",
        "requirement_ref",
        ref,
      ),
      fetchWhere(
        db,
        "release_requirement",
        "id, release_id, requirement_ref",
        "requirement_ref",
        ref,
      ),
      fetchWhere(
        db,
        "acceptance_criterion",
        "id, milestone_id, requirement_ref",
        "requirement_ref",
        ref,
      ),
      fetchIn(db, "contract_milestone", "id, engagement_id, name", "engagement_id", [
        engagementId,
      ]),
    ]);

  // The same slice `untestedAnswer` builds, for the same reason: results are
  // deliberately NOT filtered by engagement, because `indexCoverage` looks each
  // result's test up by id and skips any it cannot find. Filtering them here as
  // well would be a second implementation of the same rule.
  const slice = {
    requirements: coverageInput.requirements.filter(
      (one) => one.engagement === engagement.slug,
    ),
    workItems: coverageInput.workItems.filter(
      (one) => one.engagement === engagement.slug,
    ),
    tests: coverageInput.tests.filter((one) => one.engagement === engagement.slug),
    results: coverageInput.results,
  };

  const index = indexCoverage(slice);
  const coverage: RequirementCoverage = index.covered.has(ref)
    ? "covered"
    : index.unproven.has(ref)
      ? "unproven"
      : "uncovered";

  const latest = new Map(
    latestResults(slice.results).map((result) => [result.testId, result] as const),
  );

  const workItems: RequirementWorkItem[] = slice.workItems
    .filter((one) => one.implements.includes(ref))
    .map((one) => ({
      ref: toRef("work_item", one.id, one.unit),
      unit: one.unit,
      status: one.status,
      executor: one.executor,
      executorKind: one.executorKind,
      planned: one.planned,
      updatedAt: one.updatedAt,
    }));

  const tests: RequirementTest[] = slice.tests
    .filter((one) => one.covers.includes(ref))
    .map((one) => {
      const result = latest.get(one.id);
      return {
        id: one.id,
        file: one.file,
        title: one.title,
        harness: one.harness,
        covers: one.covers,
        authoredBy: one.authoredBy,
        certifiedBy: one.certifiedBy,
        latest:
          result === undefined
            ? null
            : {
                status: result.status,
                evidenceScope: result.evidenceScope,
                certifiedBy: result.certifiedBy,
                runAt: result.runAt,
              },
        selfCertified: index.selfCertified.has(one.id),
      };
    });

  const defects: RequirementDefect[] = defectRows
    // `defect.requirement_ref` is text and not a foreign key, so the same ref
    // can exist in two engagements. Scoped explicitly rather than trusted.
    .filter((one) => requiredText(one.engagement_id) === engagementId)
    .map((one) => ({
      ref: toRef("defect", requiredText(one.id), text(one.ref)),
      title: requiredText(one.title),
      severity: requiredText(one.severity),
      status: requiredText(one.status),
    }));

  const releasesById = new Map(shipped.releases.map((one) => [one.id, one] as const));
  const releases: RequirementRelease[] = releaseLinkRows.flatMap((link) => {
    const release = releasesById.get(requiredText(link.release_id));
    // Absent means the release belongs to another engagement — `loadShippedIndex`
    // read only this one's. Dropped rather than rendered, because it is not this
    // requirement's release at all.
    if (release === undefined) return [];
    return [
      {
        ref: toRef("release", release.id, release.identifier),
        identifier: release.identifier,
        environment: release.environment,
        deployedAt: release.deployedAt,
      },
    ];
  });

  const milestoneNames = new Map(
    milestoneRows.map((one) => [requiredText(one.id), text(one.name)] as const),
  );
  const milestones: DetailRef[] = criterionRows.flatMap((one) => {
    const milestoneId = requiredText(one.milestone_id);
    if (!milestoneNames.has(milestoneId)) return [];
    return [toRef("contract_milestone", milestoneId, milestoneNames.get(milestoneId) ?? null)];
  });

  return {
    kind: "requirement",
    id: rowId,
    engagement,
    ref,
    section: text(row.section),
    text: prose,
    coverage,
    shippedEnvironments: [...(shipped.index.get(ref) ?? [])].sort(),
    workItems,
    tests,
    defects,
    releases,
    milestones,
  };
}
