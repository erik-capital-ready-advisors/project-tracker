import Link from "next/link";

import { Absent, DispositionChip } from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
  NO_IDENTIFIER,
} from "@/components/entity-detail";
import { EntityRefList } from "@/components/entity-ref";
import { ProseValue } from "@/components/prose-value";
import { isoMinute } from "@/lib/display-format";
import type { BlockerDetail } from "@/lib/detail-load";
import { fallbackLabel } from "@/lib/detail-load";

/**
 * FR-81 for `blocker` — every field §7a lets the operator read, plus every work
 * item this blocker holds.
 *
 * ## B33 — the local `ProseValue` copy is gone
 *
 * This file used to carry its own copy of the four-state prose renderer,
 * byte-identical to the ones in `work-item-detail-view.tsx` and
 * `defect-detail-view.tsx`. B33 hoisted all three (plus the milestones and
 * requirements/open-question copies) into `@/components/prose-value` — see
 * that file's header for the contract and for which naming won.
 *
 * `EngagementLink` below is still duplicated across this file and the other
 * two Wave C detail views; it was not in scope for B33 and is unaffected.
 *
 * ## `ref` is nullable and `owner` defaults, and those are different facts
 *
 * A blocker with no `ref` still exists and is still navigable, so it takes
 * `fallbackLabel`'s display name and `EntityDetail` draws the identity slot as
 * absent. `owner` is FR-52's grouping key and it is **not** defaulted here: the
 * default `erik` is applied at ingest, and a row that reached the database with
 * no owner is a gap in the record rather than one of Erik's.
 */

/* ---------------------------------------------------------------------- */
/* Duplicated primitive — see the header                                   */
/* ---------------------------------------------------------------------- */

/** The engagement, as a plain `next/link` and deliberately not an `<EntityRef>`. */
function EngagementLink({
  engagement,
}: {
  engagement: BlockerDetail["engagement"];
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

/** One mono fact that is not a reference and never becomes a link. */
function Fact({ value }: { value: string | null }) {
  return value === null ? null : (
    <span className="ident text-xs break-all">{value}</span>
  );
}

export function BlockerDetailView({ detail }: { detail: BlockerDetail }) {
  return (
    <EntityDetail
      kind="blocker"
      title={detail.ref ?? fallbackLabel("blocker", detail.id)}
      question="What this blocker is, who owns it, and what it is holding."
      requirements={["FR-81", "FR-83", "FR-85"]}
      // A blocker's `ref` is nullable by design; `title` already falls back to
      // `fallbackLabel` for exactly the same rows.
      identifier={detail.ref ?? NO_IDENTIFIER}
      actions={
        <Link
          href="/blocked"
          data-verify-unit="detail-back"
          className="text-muted-foreground text-xs underline underline-offset-2"
        >
          ← Blocked
        </Link>
      }
    >
      <DetailSection
        heading="Identity"
        requirements={["FR-30", "FR-52"]}
        verifyUnit="blocker-identity"
      >
        <DetailFields>
          <DetailField label="Engagement" absent="No engagement is recorded.">
            <EngagementLink engagement={detail.engagement} />
          </DetailField>

          {/* FR-52's grouping key. Not defaulted here — see the header. */}
          <DetailField
            label="Owner"
            absent="No owner reached the database on this row. That is a gap in the record, not a blocker of Erik's."
            mono
          >
            <Fact value={detail.owner} />
          </DetailField>

          <DetailField
            label="Disposition"
            absent="No disposition was recorded. That is a gap in the record, not a decision."
          >
            {/* FR-30: `carried` (still owned, still open) and `closed` (decided
                against) are different answers, and an unrecorded disposition is
                a third thing rather than a quiet `closed`. */}
            <DispositionChip disposition={detail.disposition} />
          </DetailField>

          <DetailField label="Opened" absent="No opening date was recorded." mono>
            <Fact value={isoMinute(detail.openedAt)} />
          </DetailField>

          {/* An unresolved blocker and a blocker whose resolution date nobody
              wrote down are different facts, so this renders as absent rather
              than as "still open". */}
          <DetailField
            label="Resolved"
            absent="No resolution date was recorded. This blocker reads as unresolved."
            mono
          >
            <Fact value={isoMinute(detail.resolvedAt)} />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="Prose"
        requirements={["FR-81"]}
        verifyUnit="blocker-prose"
      >
        <DetailFields>
          <DetailField
            label="Description"
            absent="No description was ever stored on this blocker."
          >
            <ProseValue
              field="description"
              prose={detail.description}
              absent="No description was ever stored on this blocker."
            />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="What this is holding"
        requirements={["FR-52", "FR-80", "FR-83"]}
        verifyUnit="blocker-inbound"
      >
        <DetailFields>
          <DetailField label="Blocks" absent="Nothing.">
            <span
              data-verify-unit="blocker-blocks"
              data-verify-count={detail.blocks.length}
            >
              <EntityRefList
                refs={detail.blocks}
                empty="No work item names this blocker. An unresolved blocker holding nothing is worth reading twice."
              />
            </span>
          </DetailField>
        </DetailFields>
      </DetailSection>
    </EntityDetail>
  );
}
