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
import { isoMinute } from "@/lib/display-format";
import type { BlockerDetail, Prose } from "@/lib/detail-load";
import { fallbackLabel } from "@/lib/detail-load";

/**
 * FR-81 for `blocker` — every field §7a lets the operator read, plus every work
 * item this blocker holds.
 *
 * ## The duplication in this file is deliberate and is a finding, not a habit
 *
 * `ProseValue` and `EngagementLink` below are byte-identical to the copies in
 * `src/app/work-items/[id]/_components/work-item-detail-view.tsx` and
 * `src/app/defects/[id]/_components/defect-detail-view.tsx`. See that first
 * file's header for the reasoning, and `f1.md` "Findings" for the
 * recommendation to factor them into `src/components/` once Wave C has merged.
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
/* Duplicated primitive 1 of 2 — see the header                            */
/* ---------------------------------------------------------------------- */

/**
 * A §7a-encrypted field, read back, in all FOUR of its states.
 *
 * `unreadable` takes the treatment `src/app/registry/_components/milestone-table.tsx`
 * already gives an amount that did not decrypt, and for the identical reason:
 * *this is not zero, and it is not empty.* `not-requested` is drawn quietly
 * instead, because nothing is wrong — nobody asked.
 *
 * The state reaches `data-verify-prose-state`; **the text never does.**
 */
function ProseValue({
  field,
  prose,
  absent,
}: {
  /** The field's stable name, for the state contract. Never its value. */
  field: string;
  prose: Prose;
  /** Why there may be nothing here, when nothing was ever stored. */
  absent: string;
}) {
  const body = (() => {
    switch (prose.state) {
      case "present":
        return (
          <p className="text-foreground whitespace-pre-wrap">{prose.text}</p>
        );
      case "absent":
        return <Absent title={absent} />;
      case "unreadable":
        return (
          <span
            className="ident text-state-blocked font-semibold"
            title="The stored ciphertext did not decrypt. This field is not empty — its contents could not be read back."
          >
            unreadable
          </span>
        );
      case "not-requested":
        return (
          <span
            className="text-muted-foreground/70 text-xs italic"
            title="This view did not ask for this field to be decrypted, so nothing here is a statement about what it holds."
          >
            not read
          </span>
        );
    }
  })();

  return (
    <div
      data-verify-unit="detail-prose"
      data-verify-field={field}
      data-verify-prose-state={prose.state}
      className="min-w-0"
    >
      {body}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Duplicated primitive 2 of 2 — see the header                            */
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
