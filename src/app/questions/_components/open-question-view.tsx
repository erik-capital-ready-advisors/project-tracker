import Link from "next/link";

import { Absent } from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
  NO_IDENTIFIER,
} from "@/components/entity-detail";
import { EntityRef } from "@/components/entity-ref";
import { Button } from "@/components/ui/button";
import type { OpenQuestionDetail } from "@/lib/detail-load";
import { fallbackLabel } from "@/lib/detail-load";
import { formatDate, NOT_RECORDED } from "@/lib/registry-display";

// Lives in the requirement unit's `_components` because five of Wave C's eight
// detail views render a `Prose` field and no unit owns `src/components/` — a
// shared component created by whichever parallel unit got there first is a merge
// collision. Queued as a question; it should be lifted to
// `src/components/detail-prose.tsx` once Wave C is merged.
import { DetailProse } from "../../requirements/_components/detail-prose";

/**
 * FR-81 for `open_question` (FR-18) — a question the fleet queued, its best
 * guess, and its answer.
 *
 * ## This route has no inbound link in this milestone, and that is reported
 *
 * i1 measured it rather than assumed it: **nothing in the product points at an
 * open question.** No table holds a foreign key to `open_question`
 * (`grep -rn "references public.open_question" supabase/migrations/` → 0) and no
 * file under `src/app/` mentioned it before this one. So this view is reachable
 * only by typing a uuid.
 *
 * It is built anyway because FR-81 names `open_question` as one of its eight and
 * `pnpm gate:m27` enumerates all eight. Adding a listing screen to give it an
 * inbound link would be new scope nobody approved, and papering over the finding
 * is worse than the finding.
 *
 * ## It has no reference a person would recognise, and that is normal here
 *
 * Ruling 2: `fallbackLabel(kind, id)` is the only fallback, and for this kind it
 * is the ordinary case rather than an edge — an `open_question` has no human
 * key at all. `source_key` exists (`<artifact filename>#<ordinal>`) and is a
 * machine key: no screen in this product renders a filename and an ordinal as a
 * reference a person follows, so it is shown as a field and not as the title.
 *
 * The identity line gets `run:unit §section` where those exist, because that is
 * the tuple a reader recognises, and `Absent` where they do not.
 *
 * ## Its one outbound reference, and why it can dangle
 *
 * `(run, unit)` names a work item. Resolution refuses when ambiguous — exactly
 * one match resolves, zero and two-or-more both dangle — so a `u4` recorded
 * without a run becomes dangling the day a second run defines one, visibly.
 * `<EntityRef id={null}>` draws that and is never a link (FR-83).
 *
 * ## §7a, and the one field that is not §7a's
 *
 * `question` and `best_guess` are §7a `sensitive` under pgcrypto. **`answer` is
 * encrypted under the security baseline, not §7a** — §7a is silent on it and
 * blocker B13 tracks Erik confirming the classification. All three render
 * through the same four-state `Prose` renderer, and none of them is ever
 * published into a `data-verify-*` attribute.
 *
 * ## §5a
 *
 * Nothing new. `EntityDetail`'s shell, `DetailSection`'s bordered strip,
 * `DetailField`'s required `absent`, the `ident` mono utility. No colour, token
 * or spacing idiom is introduced.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="open-question-state"     data-verify-status, data-verify-confidence,
 *                                              data-verify-answered
 *   data-verify-unit="open-question-question"  the question and its best guess
 *   data-verify-unit="open-question-answer"    the answer, if one was recorded
 *   data-verify-unit="open-question-origin"    where it came from
 *
 * Statuses only. No question text, no best guess and no answer text reaches an
 * attribute.
 */
export function OpenQuestionView({ detail }: { detail: OpenQuestionDetail }) {
  const engagement = detail.engagement;
  const identifier = identityLine(detail);

  return (
    <EntityDetail
      kind="open_question"
      title={fallbackLabel("open_question", detail.id)}
      question="One question the fleet could not answer for itself: what it asked, what it assumed in the meantime, and what was decided."
      requirements={["FR-18", "FR-81", "FR-83", "FR-85"]}
      // `identityLine` returns null when the row records no run, unit or
      // section — an open question has no human key of its own.
      identifier={identifier ?? NO_IDENTIFIER}
      actions={
        engagement === null ? undefined : (
          // Ruling 3: the engagement is not a ninth entity kind. A plain link to
          // a route that already exists, never an `<EntityRef>`.
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/registry/${engagement.slug}`}
              data-verify-unit="open-question-engagement-link"
            >
              ← {engagement.clientName}
            </Link>
          </Button>
        )
      }
    >
      <div
        className="flex flex-wrap items-center gap-3"
        data-verify-unit="open-question-state"
        data-verify-status={detail.status}
        data-verify-confidence={detail.confidence ?? "unrecorded"}
        data-verify-answered={detail.answeredAt === null ? "false" : "true"}
      >
        <span className="border-border ident rounded border px-1.5 py-0.5 text-xs">
          {detail.status}
        </span>
        <span className="text-muted-foreground text-xs">
          confidence{" "}
          <span className="ident">
            {detail.confidence ?? (
              <Absent title="No confidence was recorded on this question. It is not `high` by default — nothing was stated." />
            )}
          </span>
        </span>
      </div>

      {/* ---- What was asked, and what was assumed while nobody answered ---- */}
      <DetailSection
        heading="The question"
        requirements={["FR-18", "FR-81"]}
        verifyUnit="open-question-question"
      >
        <div className="border-border border-b px-4 py-3">
          <DetailProse
            prose={detail.question}
            field="open-question-question"
            absent="No question text is stored. §7a encrypts this column, so an absence here means nothing was written — not that it could not be read."
          />
        </div>
        <div className="px-4 py-3">
          <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            Best guess
          </h3>
          <p className="text-muted-foreground mb-2 max-w-3xl text-xs">
            What the unit proceeded on rather than blocking. It is what shipped
            if nobody answered — so it is shown beside the question and not
            behind it.
          </p>
          <DetailProse
            prose={detail.bestGuess}
            field="open-question-best-guess"
            absent="No best guess is stored. The unit recorded a question and did not record what it would do in the meantime."
          />
        </div>
      </DetailSection>

      {/* ---- What was decided ---- */}
      <DetailSection
        heading="The answer"
        requirements={["FR-18"]}
        verifyUnit="open-question-answer"
      >
        <div className="border-border border-b px-4 py-3">
          <DetailProse
            prose={detail.answer}
            field="open-question-answer"
            absent="Nobody has answered this question. The best guess above is what the build proceeded on."
          />
        </div>
        <DetailFields>
          <DetailField
            label="Answered by"
            absent="No answerer was recorded. If an answer is stored above, who decided it was not captured — and those are two separate gaps."
          >
            {detail.answeredBy}
          </DetailField>
          <DetailField
            label="Answered at"
            mono
            absent="No answer timestamp was recorded."
          >
            {formatDate(detail.answeredAt) === NOT_RECORDED
              ? null
              : formatDate(detail.answeredAt)}
          </DetailField>
          <DetailField
            label="Status"
            mono
            absent="No status was recorded, which should not be possible — this column is not nullable."
          >
            {detail.status}
          </DetailField>
        </DetailFields>
      </DetailSection>

      {/* ---- Where it came from ---- */}
      <DetailSection
        heading="Where it came from"
        requirements={["FR-80", "FR-83"]}
        verifyUnit="open-question-origin"
      >
        <DetailFields>
          <DetailField
            label="Work item"
            absent="This question records no unit id, so it names no work item at all. That is different from naming one that has not been ingested."
          >
            {detail.workItem === null ? null : (
              <EntityRef
                kind={detail.workItem.kind}
                label={detail.workItem.label}
                id={detail.workItem.id}
                title={detail.workItem.title}
              />
            )}
          </DetailField>
          <DetailField
            label="Run"
            mono
            absent="No fleet run was recorded on this question."
          >
            {detail.run}
          </DetailField>
          <DetailField
            label="Unit"
            mono
            absent="No work-unit id was recorded on this question."
          >
            {detail.unit}
          </DetailField>
          <DetailField
            label="Spec section"
            mono
            absent="No spec section was recorded. Clear under §7a — this is a gap in the artifact, not an encryption failure."
          >
            {detail.section}
          </DetailField>
          <DetailField
            label="Engagement"
            absent="This question has no engagement, which should not be possible — the table cascades from it."
          >
            {engagement === null ? null : (
              <Link
                href={`/registry/${engagement.slug}`}
                className="underline-offset-2 hover:underline"
              >
                {engagement.clientName}{" "}
                <span className="ident text-muted-foreground">
                  {engagement.slug}
                </span>
              </Link>
            )}
          </DetailField>
          <DetailField
            label="Source key"
            mono
            absent="No source key was recorded. This row predates the key that makes ingest idempotent, or was written by hand."
          >
            {detail.sourceKey}
          </DetailField>
        </DetailFields>
      </DetailSection>
    </EntityDetail>
  );
}

/**
 * `run:unit §section`, from whichever halves exist, or `null`.
 *
 * `null` rather than a partial string when nothing is recorded: `EntityDetail`
 * renders that as `Absent` with a stated reason, and an empty identifier would
 * be indistinguishable from one nobody rendered.
 */
function identityLine(detail: OpenQuestionDetail): string | null {
  const pair =
    detail.run !== null && detail.unit !== null
      ? `${detail.run}:${detail.unit}`
      : (detail.run ?? detail.unit);

  const section = detail.section === null ? null : `§${detail.section}`;
  const parts = [pair, section].filter((part) => part !== null);

  return parts.length === 0 ? null : parts.join(" ");
}
