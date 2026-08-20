import Link from "next/link";

import {
  Absent,
  DefectSeverityChip,
  DefectStatusChip,
} from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
  NO_IDENTIFIER,
} from "@/components/entity-detail";
import { EntityRef } from "@/components/entity-ref";
import { isoMinute } from "@/lib/display-format";
import type { DefectDetail, Prose } from "@/lib/detail-load";
import { fallbackLabel } from "@/lib/detail-load";

/**
 * FR-81 for `defect` (CR-001) — every field §7a lets the operator read, plus
 * this defect's references.
 *
 * ## The duplication in this file is deliberate and is a finding, not a habit
 *
 * `ProseValue` and `EngagementLink` below are byte-identical to the copies in
 * `src/app/work-items/[id]/_components/work-item-detail-view.tsx` and
 * `src/app/blockers/[id]/_components/blocker-detail-view.tsx`. See that first
 * file's header for the reasoning, and `f1.md` "Findings" for the
 * recommendation to factor them into `src/components/` once Wave C has merged.
 *
 * ## `title` is clear and `description` is not, and both are §7a's decision
 *
 * CR-001 §4's stated exception leaves `defect.title` unencrypted because it is
 * the display key a person recognises a defect by. `description` is pgcrypto
 * under §7a. `wontFixReason` is encrypted under the **baseline** rather than
 * §7a — §7a is silent on it (B13) — and it is rendered here on the same
 * four-state footing as the rest, because a decision that could not be read
 * back is exactly the fact FR-67 says must not be collapsed into "not a problem
 * any more".
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
  engagement: DefectDetail["engagement"];
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

export function DefectDetailView({ detail }: { detail: DefectDetail }) {
  return (
    <EntityDetail
      kind="defect"
      title={detail.title === "" ? fallbackLabel("defect", detail.id) : detail.title}
      question="Everything recorded about this defect, and what it points at."
      requirements={["FR-81", "FR-83", "FR-85"]}
      // A defect's `ref` is nullable: the row carries no reference of its own,
      // which is its fact and not a failed read.
      identifier={detail.ref ?? NO_IDENTIFIER}
      actions={
        <Link
          href="/broken"
          data-verify-unit="detail-back"
          className="text-muted-foreground text-xs underline underline-offset-2"
        >
          ← Broken
        </Link>
      }
    >
      <DetailSection
        heading="Identity"
        requirements={["FR-63", "FR-64", "FR-67"]}
        verifyUnit="defect-identity"
      >
        <DetailFields>
          <DetailField label="Engagement" absent="No engagement is recorded.">
            <EngagementLink engagement={detail.engagement} />
          </DetailField>

          <DetailField label="Status" absent="No status is recorded.">
            {/* FR-67: `wont_fix` is a decision and `verified` is a proof. The
                chip keeps them apart and this view does not collapse them into
                "not a problem any more". */}
            <DefectStatusChip status={detail.status} />
          </DetailField>

          {/* FR-64. Both spellings are rendered, and that is the rule rather
              than a redundancy: `severity` is the enum the parser produced and
              `rawSeverity` is the grading word the artifact actually wrote.
              Where the two disagree, the disagreement is the data. */}
          <DetailField label="Severity" absent="No severity is recorded.">
            <DefectSeverityChip severity={detail.severity} />
          </DetailField>

          <DetailField
            label="Graded as"
            absent="The artifact stated no severity word of its own."
            mono
          >
            <Fact value={detail.rawSeverity} />
          </DetailField>

          <DetailField label="Source" absent="No source is recorded." mono>
            <Fact value={detail.source} />
          </DetailField>

          <DetailField
            label="Source key"
            absent="No artifact key was recorded for this defect."
            mono
          >
            <Fact value={detail.sourceKey} />
          </DetailField>

          <DetailField label="Reported" absent="No report date was recorded." mono>
            <Fact value={isoMinute(detail.reportedAt)} />
          </DetailField>

          <DetailField
            label="Reported by"
            absent="Nobody is recorded as having reported this."
            mono
          >
            <Fact value={detail.reportedBy} />
          </DetailField>

          <DetailField
            label="Verified"
            absent="No verification date was recorded."
            mono
          >
            <Fact value={isoMinute(detail.verifiedAt)} />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="Prose"
        requirements={["FR-81"]}
        verifyUnit="defect-prose"
      >
        <DetailFields>
          <DetailField
            label="Description"
            absent="No description was ever stored on this defect."
          >
            <ProseValue
              field="description"
              prose={detail.description}
              absent="No description was ever stored on this defect."
            />
          </DetailField>

          {/* Encrypted under the security baseline rather than §7a, which is
              silent on it (B13). Rendered because a `wont_fix` whose reason
              cannot be read is a decision with no stated cause, and FR-67 makes
              that decision first-class. */}
          <DetailField
            label="Won't-fix reason"
            absent="No reason was stored. On a `wont_fix` defect that is a decision with nothing recorded behind it."
          >
            <ProseValue
              field="wont_fix_reason"
              prose={detail.wontFixReason}
              absent="No reason was stored. On a `wont_fix` defect that is a decision with nothing recorded behind it."
            />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        heading="References out"
        requirements={["FR-65", "FR-71", "FR-83"]}
        verifyUnit="defect-outbound"
      >
        <DetailFields>
          <DetailField
            label="Requirement"
            absent="This defect names no requirement."
          >
            {detail.requirement === null ? null : (
              <EntityRef {...detail.requirement} />
            )}
          </DetailField>

          <DetailField
            label="Fixing work item"
            absent="No work item is recorded as fixing this defect."
          >
            {detail.fixingWorkItem === null ? null : (
              <EntityRef {...detail.fixingWorkItem} />
            )}
          </DetailField>
        </DetailFields>
      </DetailSection>

      {/* FR-66. `test_case` is not one of FR-81's eight kinds, so a test gets no
          `<EntityRef>`: `entityHref` can build no destination for it, and a link
          this product cannot build is the broken link FR-83 forbids. These are
          named facts. */}
      <DetailSection
        heading="Tests naming this defect"
        requirements={["FR-66"]}
        verifyUnit="defect-tests"
      >
        {detail.tests.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-xs">
            {detail.ref === null
              ? "No `D-nn` has been allocated to this defect yet, so no test can name it."
              : "No test in this engagement names this defect's reference."}
          </p>
        ) : (
          <ul
            className="divide-border divide-y"
            data-verify-unit="defect-test-list"
            data-verify-count={detail.tests.length}
          >
            {detail.tests.map((test) => (
              <li key={test.id} className="flex flex-col gap-1 px-4 py-2">
                <span className="text-xs">{test.title}</span>
                <span className="ident text-muted-foreground text-xs break-all">
                  {test.harness} · {test.file}
                </span>
                {test.covers.length === 0 ? null : (
                  <span className="ident text-muted-foreground/70 text-xs">
                    covers {test.covers.join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </EntityDetail>
  );
}
