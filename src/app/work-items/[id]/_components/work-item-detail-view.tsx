import Link from "next/link";

import { Absent, DispositionChip } from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
  NO_IDENTIFIER,
} from "@/components/entity-detail";
import { EntityRef, EntityRefList } from "@/components/entity-ref";
import { PlannedChip } from "@/components/planned-chip";
import { ProseValue } from "@/components/prose-value";
import { isoMinute } from "@/lib/display-format";
import type { WorkItemDetail } from "@/lib/detail-load";
import { fallbackLabel } from "@/lib/detail-load";
import type { EvidenceScope } from "@/lib/ingest/types";
import type { StoredEvidenceScope } from "@/lib/server/workitems/rules";

import {
  EvidenceScopeChip,
  ExecutionModeChip,
  ExecutorChip,
  WorkStatusChip,
} from "../../_components/chips";

/**
 * FR-81 for `work_item` — every field §7a lets the operator read, plus every
 * reference into and out of this row.
 *
 * ## B33 — the local `ProseValue` copy is gone
 *
 * This file used to carry its own copy of the four-state prose renderer,
 * byte-identical to the ones in `defect-detail-view.tsx` and
 * `blocker-detail-view.tsx`. B33 hoisted all three (plus the milestones and
 * requirements/open-question copies) into `@/components/prose-value` — see
 * that file's header for the contract and for which naming won.
 *
 * `EngagementLink` below is still duplicated across this file and the other
 * two Wave C detail views; it was not in scope for B33 and is unaffected.
 *
 * ## Nothing here introduces a design decision
 *
 * §5a is approved (see `spec/prod.md`, 2026-08-22). Every treatment below
 * already exists in this repository: `EntityDetail`'s field primitives, the
 * work-item chip ladder, `answer-chips`' `Absent`, and the shared
 * `@/components/prose-value` for the encrypted fields. No colour, no token, no
 * spacing idiom is new.
 */

/* ---------------------------------------------------------------------- */
/* Duplicated primitive — see the header                                   */
/* ---------------------------------------------------------------------- */

/**
 * The engagement, as a plain `next/link` and deliberately **not** an
 * `<EntityRef>`.
 *
 * FR-80 names the engagement slug among the references that must be navigable,
 * but `engagement` is not one of FR-81's eight kinds — and
 * `tests/m27-gate.test.ts` asserts `ENTITY_KINDS` equals exactly those eight,
 * so adding a ninth turns a passing gate red. The engagement detail view
 * already exists at `/registry/[slug]`, so FR-80 is met in substance by linking
 * to it directly. i1 raised this as its finding 1 and Erik holds the ruling.
 */
function EngagementLink({
  engagement,
}: {
  engagement: WorkItemDetail["engagement"];
}) {
  if (engagement === null) {
    return (
      <Absent title="This row is not attached to an engagement. That is a gap in the record." />
    );
  }

  return (
    <Link
      href={`/registry/${engagement.slug}`}
      data-verify-unit="detail-engagement"
      data-verify-slug={engagement.slug}
      className="inline-flex flex-wrap items-baseline gap-2 rounded-sm underline-offset-2 hover:underline"
    >
      <span className="text-foreground">{engagement.clientName}</span>
      <span className="ident text-muted-foreground text-xs">
        {engagement.slug}
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * FR-43's evidence scope, spelled the way Postgres spells it.
 *
 * `WorkItemDetail.evidenceScope` is the hyphenated domain spelling and
 * `EvidenceScopeChip` takes the underscored stored one. This map is exhaustive
 * over the domain union rather than a call to `EVIDENCE_SCOPE.parse`, which
 * returns `null` for an unrecognised value — and a `null` reaching that chip
 * would render "no scope recorded" over a row that recorded one, which is the
 * exact false-absence this product refuses. Exhaustive means a fifth scope
 * breaks the build instead.
 */
const STORED_SCOPE: Record<EvidenceScope, StoredEvidenceScope> = {
  "observed-live": "observed_live",
  "observed-elsewhere": "observed_elsewhere",
  asserted: "asserted",
  "not-verified": "not_verified",
};

/** One mono fact that is not a reference and never becomes a link. */
function Fact({ value }: { value: string | null }) {
  return value === null ? null : (
    <span className="ident text-xs break-all">{value}</span>
  );
}

export function WorkItemDetailView({
  detail,
  asOf,
}: {
  detail: WorkItemDetail;
  /** `YYYY-MM-DD`. FR-91 reference date, read once at the page. */
  asOf: string;
}) {
  const title = detail.unit ?? fallbackLabel("work_item", detail.id);

  return (
    <EntityDetail
      kind="work_item"
      title={title}
      question="Everything recorded about this work item, and everything that references it."
      requirements={["FR-81", "FR-83", "FR-85"]}
      // `unit` is null on `hand` and `external` work, which carry none.
      identifier={detail.unit ?? NO_IDENTIFIER}
      actions={
        <Link
          href="/work-items"
          data-verify-unit="detail-back"
          className="text-muted-foreground text-xs underline underline-offset-2"
        >
          ← All work items
        </Link>
      }
    >
      <DetailSection
        heading="Identity"
        requirements={["FR-39", "FR-40", "FR-43"]}
        verifyUnit="work-item-identity"
      >
        <DetailFields>
          <DetailField label="Engagement" absent="No engagement is recorded.">
            <EngagementLink engagement={detail.engagement} />
          </DetailField>

          <DetailField label="Execution mode" absent="No mode is recorded.">
            <div className="flex flex-wrap items-center gap-1.5">
              <ExecutionModeChip
                mode={detail.executionMode}
                planned={detail.planned}
              />
              {/* FR-91. The detail view is the one screen that shows a single
                  row in full, so the staleness age belongs beside the absence
                  it explains rather than in a section of its own. */}
              <PlannedChip item={detail} asOf={asOf} />
            </div>
          </DetailField>

          <DetailField label="Status" absent="No status is recorded.">
            <WorkStatusChip status={detail.status} />
          </DetailField>

          <DetailField label="Executor" absent="No executor is recorded.">
            <ExecutorChip kind={detail.executorKind} executor={detail.executor} />
          </DetailField>

          <DetailField
            label="Work type"
            absent="No work type was recorded on this row."
            mono
          >
            <Fact value={detail.workType} />
          </DetailField>

          <DetailField
            label="Phase"
            absent="No phase was recorded on this row."
            mono
          >
            {detail.phase === null ? null : String(detail.phase)}
          </DetailField>

          <DetailField
            label="Disposition"
            absent="No disposition was recorded. That is a gap in the record, not a decision."
          >
            <DispositionChip disposition={detail.disposition} />
          </DetailField>

          <DetailField
            label="Evidence scope"
            absent="No evidence scope was recorded."
          >
            {/* FR-43. An absent scope is a third thing and the chip draws it as
                one: "no scope recorded" is not the recorded value
                `not-verified`. */}
            <EvidenceScopeChip
              scope={
                detail.evidenceScope === null
                  ? null
                  : STORED_SCOPE[detail.evidenceScope]
              }
            />
          </DetailField>

          <DetailField
            label="Not verified"
            absent="No count was recorded."
            mono
          >
            {/* A real count, so `0` here is a measurement and not an unknown
                rendered as zero. `WorkItemDetail.notVerifiedCount` is
                non-nullable in i1's type, which is what makes that true. */}
            <span
              data-verify-unit="work-item-not-verified"
              data-verify-count={detail.notVerifiedCount}
            >
              {detail.notVerifiedCount}
            </span>
          </DetailField>

          <DetailField
            label="Unautomated reason"
            absent="Nothing recorded a reason this was not automated."
            mono
          >
            <Fact value={detail.unautomatedReason} />
          </DetailField>

          <DetailField label="Started" absent="No start was recorded." mono>
            <Fact value={isoMinute(detail.startedAt)} />
          </DetailField>

          <DetailField label="Ended" absent="No end was recorded." mono>
            <Fact value={isoMinute(detail.endedAt)} />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="Prose"
        requirements={["FR-81"]}
        verifyUnit="work-item-prose"
      >
        <DetailFields>
          <DetailField
            label="Description"
            absent="No description was ever stored on this row."
          >
            <ProseValue
              field="description"
              prose={detail.description}
              absent="No description was ever stored on this row."
            />
          </DetailField>

          {/* `raw_status` is the status paragraph the artifact itself wrote,
              kept beside the status the parser produced. On a row whose status
              is `unparsed` it is the only thing that can say what the artifact
              claimed — which is what keeps a loud failure from degrading into a
              silent one. */}
          <DetailField
            label="Raw status"
            absent="The artifact recorded no status prose for this row."
          >
            <ProseValue
              field="raw_status"
              prose={detail.rawStatus}
              absent="The artifact recorded no status prose for this row."
            />
          </DetailField>
        </DetailFields>
      </DetailSection>

      {/* `fleet_run` and `stack` are foreign keys and neither is one of FR-81's
          eight kinds, so neither has a detail view and neither may be drawn as
          a reference. FR-83 forbids a link this product cannot build, so these
          are named facts in mono and nothing more. */}
      <DetailSection
        heading="Run and stack"
        requirements={["FR-16"]}
        verifyUnit="work-item-context"
      >
        <DetailFields>
          <DetailField
            label="Run"
            absent="This work item is not attached to a fleet run."
            mono
          >
            <Fact value={detail.run?.runId ?? null} />
          </DetailField>
          <DetailField label="Branch" absent="No branch was recorded." mono>
            <Fact value={detail.run?.branch ?? null} />
          </DetailField>
          <DetailField label="Run mode" absent="No run mode was recorded." mono>
            <Fact value={detail.run?.mode ?? null} />
          </DetailField>
          <DetailField label="Verdict" absent="No verdict was recorded." mono>
            <Fact value={detail.run?.verdict ?? null} />
          </DetailField>
          <DetailField label="Stack" absent="No stack was recorded." mono>
            <Fact value={detail.stack?.name ?? null} />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="References out"
        requirements={["FR-80", "FR-83"]}
        verifyUnit="work-item-outbound"
      >
        <DetailFields>
          <DetailField
            label="Blocker"
            absent="No blocker row names this work item."
          >
            {detail.blocker === null ? null : (
              <EntityRef {...detail.blocker} />
            )}
          </DetailField>

          <DetailField
            label="External wait"
            absent="No external wait names this work item."
          >
            {detail.externalWait === null ? null : (
              <EntityRef {...detail.externalWait} />
            )}
          </DetailField>

          <DetailField label="Depends on" absent="Nothing.">
            <EntityRefList
              refs={detail.dependsOn}
              empty="This work item depends on nothing."
            />
          </DetailField>

          <DetailField label="Implements" absent="Nothing.">
            <EntityRefList
              refs={detail.implementsRequirements}
              empty="This work item claims to implement no requirement."
            />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="References in"
        requirements={["FR-80", "FR-83"]}
        verifyUnit="work-item-inbound"
      >
        <DetailFields>
          <DetailField label="Blocks" absent="Nothing.">
            <EntityRefList
              refs={detail.blocks}
              empty="No work item depends on this one."
            />
          </DetailField>

          <DetailField label="Fixes defects" absent="Nothing.">
            <EntityRefList
              refs={detail.fixesDefects}
              empty="No defect names this work item as its fix."
            />
          </DetailField>
        </DetailFields>
      </DetailSection>
    </EntityDetail>
  );
}
