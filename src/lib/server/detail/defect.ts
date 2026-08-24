import type { DefectSeverity, DefectSource, DefectStatus } from "@/lib/ingest/types";

import { labelEntities, refFromId, resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import {
  decryptProse,
  fetchById,
  fetchEngagement,
  fetchWhere,
  requiredText,
  text,
  textArray,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";
import { danglingRef, toRef } from "./types";

/**
 * FR-81 for `defect` (CR-001, CR-003).
 *
 * ## Which columns are clear and which are not, and why the distinction is
 * load-bearing here
 *
 * §7a classifies this table `sensitive` with "**pgcrypto column on
 * `description`**; `title` left clear — CR-001 stated exception". The exception
 * exists because `title` is the display key on the Broken screen; the operator
 * guide carries the rule that makes it safe, namely that the title is a short
 * label and "reproduction detail, data samples and client specifics belong in
 * the encrypted description".
 *
 * `wont_fix_reason` is encrypted under the **security baseline, not §7a** —
 * §7a names only `description` and is silent on this column, and the migration
 * says so in terms. Blocker B13 records that it ships encrypted pending Erik's
 * confirmation. It is read here as operator prose, and the report names it
 * individually as baseline-sourced.
 *
 * `raw_severity` and `source_key` are **clear** — later migrations added both
 * and stated the class unchanged, because a single grading word and a
 * `filename#ordinal` carry no client prose. `raw_severity` is the one thing that
 * can say what a finding claimed to be when `severity` is `unparsed`.
 *
 * ## The inbound side is tests, not an entity kind
 *
 * `test_case.covers` is a `text[]` of `FR-nn` **and `D-nn`** refs (FR-45,
 * FR-66), so the rows naming a defect are test cases. `test_case` is not one of
 * FR-81's eight kinds and has no detail view, so these come back as named facts
 * rather than as `DetailRef`s — a link Wave A cannot build an href for is the
 * broken link FR-83 exists to prevent.
 */

/** A test naming this defect. `test_case` has no detail view. */
export interface DefectTest {
  id: string;
  file: string;
  title: string;
  harness: string;
  covers: string[];
}

export interface DefectDetail {
  kind: "defect";
  id: string;
  engagement: DetailEngagement | null;

  ref: string | null;
  source: DefectSource;
  severity: DefectSeverity;
  /** The grading word the artifact used, kept beside the mapped enum. Clear. */
  rawSeverity: string | null;
  /** §7a / CR-001 stated exception: clear on purpose. */
  title: string;
  /** §7a `sensitive`, pgcrypto. */
  description: Prose;
  status: DefectStatus;
  /** Encrypted under the BASELINE, not §7a. See B13. */
  wontFixReason: Prose;
  reportedAt: string | null;
  reportedBy: string | null;
  verifiedAt: string | null;
  /** `<artifact filename>#<ordinal>`. Clear, and an identifier, never prose. */
  sourceKey: string | null;

  /** Outbound. The requirement this defect violates (FR-65). */
  requirement: DetailRef | null;
  /** Outbound. The work item fixing it (FR-71). */
  fixingWorkItem: DetailRef | null;

  /** Inbound. Test cases whose `covers` names this defect's ref (FR-66). */
  tests: DefectTest[];
}

const COLUMNS =
  "id, engagement_id, ref, source, severity, raw_severity, title, description, " +
  "status, wont_fix_reason, requirement_ref, fixing_work_item_id, reported_at, " +
  "reported_by, verified_at, source_key";

export async function loadDefectDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<DefectDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "defect", COLUMNS, id);
  if (row === null) return null;

  const engagementId = requiredText(row.engagement_id);
  const ref = text(row.ref);
  const requirementRef = text(row.requirement_ref);
  const fixingId = text(row.fixing_work_item_id);

  const requirementQuery: RefQuery | null =
    requirementRef === null
      ? null
      : { kind: "requirement", ref: requirementRef, engagementId };

  const [engagement, prose, workItemLabels, resolution, testRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    decryptProse(db, [text(row.description), text(row.wont_fix_reason)], withProse),
    labelEntities(db, "work_item", fixingId === null ? [] : [fixingId]),
    resolveRefs(db, requirementQuery === null ? [] : [requirementQuery]),
    fetchWhere(
      db,
      "test_case",
      "id, engagement_id, harness, file, title, covers",
      "engagement_id",
      engagementId,
    ),
  ]);

  const requirementResolved =
    requirementQuery === null ? null : resolvedId(resolution, requirementQuery);

  return {
    kind: "defect",
    id: requiredText(row.id),
    engagement,
    ref,
    source: requiredText(row.source) as DefectSource,
    severity: requiredText(row.severity) as DefectSeverity,
    rawSeverity: text(row.raw_severity),
    title: requiredText(row.title),
    description: prose[0],
    status: requiredText(row.status) as DefectStatus,
    wontFixReason: prose[1],
    reportedAt: text(row.reported_at),
    reportedBy: text(row.reported_by),
    verifiedAt: text(row.verified_at),
    sourceKey: text(row.source_key),

    requirement:
      requirementRef === null
        ? null
        : requirementResolved === null
          ? danglingRef(
              "requirement",
              requirementRef,
              "No requirement with that reference has been ingested for this engagement. FR-65 requires this to be reported rather than hidden.",
            )
          : toRef("requirement", requirementResolved, requirementRef),
    fixingWorkItem:
      fixingId === null ? null : refFromId("work_item", fixingId, workItemLabels),

    // Filtered in memory over the engagement's test cases rather than with a
    // `covers` array containment filter, because `ref` may be null and because
    // one paged read serves every relationship on this page. `covers` is a
    // clear `text[]`, so nothing here decrypts.
    tests:
      ref === null
        ? []
        : testRows
            .filter((one) => textArray(one.covers).includes(ref))
            .map((one) => ({
              id: requiredText(one.id),
              file: requiredText(one.file),
              title: requiredText(one.title),
              harness: requiredText(one.harness),
              covers: textArray(one.covers),
            })),
  };
}
