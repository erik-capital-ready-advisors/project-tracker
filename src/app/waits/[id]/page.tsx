import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
} from "@/components/entity-detail";
import { EntityRefList } from "@/components/entity-ref";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { readExternalWaitDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";
import { formatDate, NOT_RECORDED } from "@/lib/registry-display";

const SCREEN = "External wait";
const QUESTION =
  "One dependency on somebody outside the studio: who owns it, when it started, when it is expected back, and what it is holding.";
const REQUIREMENTS = ["FR-81", "FR-33", "FR-35", "FR-36"] as const;

export const metadata = { title: "External wait — Delivery Ledger" };

export const dynamic = "force-dynamic";

/**
 * FR-81 for `external_wait`.
 *
 * ## §7a — nothing on this table is encrypted, and that is a decision
 *
 * §7a classes `external_wait` `personal` at provider default and leaves `reason`
 * **deliberately clear**. So `readExternalWaitDetail` takes no `withProse`
 * option, there is no `Prose` on this view, and none is looked for. Every field
 * below is stored and read in the clear.
 *
 * ## What this view deliberately does NOT compute
 *
 * **FR-34's overdue flag.** A wait past its expected-by date is overdue, and
 * that derivation already exists once, in `listWaits`, behind `/waits`.
 * `ExternalWaitDetail` carries no `overdue` field and this view does not derive
 * one — a second implementation of that comparison is a second answer to one
 * question, which is the drift CR-003's ruling 5 forbids on the milestone view
 * for exactly the same reason. The expected-by date is shown; the verdict on it
 * belongs to `/waits`, which is one link away.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="external-wait-detail"
 *   data-verify-resolved            "true" | "false"
 *   data-verify-resolution-method   FR-35's `probe` / `manual`, or "not-recorded"
 *   data-verify-blocks              how many work items this wait holds
 *
 * Counts and statuses only. No owner name, no reason text and no probe target is
 * published into a `data-verify-*` attribute: §7a classes this row `personal`,
 * and an owner is a person outside the studio.
 */
export default async function ExternalWaitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `readExternalWaitDetail` calls `requireOperator()` beside its own query, so
  // there is no gate here. `loadForOperator` turns a refusal into a rendered
  // notice rather than a blank screen — "I could not look" is a different claim
  // from "there is nothing here", and this product does not collapse the two.
  const result = await loadForOperator(() => readExternalWaitDetail(id));

  if (!result.ok) {
    return (
      <Screen title={SCREEN} question={QUESTION} requirements={REQUIREMENTS}>
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={SCREEN}
        />
      </Screen>
    );
  }

  const wait = result.data;

  // An id naming no row is a 404, and that is not the failure above: a 404 and a
  // 500 are different claims. Called out here rather than inside the read,
  // because `notFound()` signals by throwing and `loadForOperator` would catch
  // it and report a database failure instead.
  if (wait === null) notFound();

  const resolved = wait.resolvedAt !== null;

  return (
    <EntityDetail
      kind="external_wait"
      title={wait.label}
      question={QUESTION}
      requirements={REQUIREMENTS}
      identifier={wait.label}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/waits" data-verify-unit="back-to-waits">
            ← All waits
          </Link>
        </Button>
      }
    >
      <div
        className="flex flex-col gap-4"
        data-verify-unit="external-wait-detail"
        data-verify-resolved={resolved ? "true" : "false"}
        data-verify-resolution-method={wait.resolutionMethod ?? "not-recorded"}
        data-verify-blocks={wait.blocks.length}
      >
        <DetailSection heading="The wait" requirements={["FR-33", "FR-35"]}>
          <DetailFields>
            <DetailField
              label="Engagement"
              absent="This wait is not attached to an engagement, or its engagement row could not be read."
            >
              {wait.engagement === null ? undefined : (
                // Ruling 3: the engagement is not one of FR-81's eight kinds and
                // does not become a ninth. A plain link to the registry, never an
                // `<EntityRef>`.
                <Link
                  href={`/registry/${wait.engagement.slug}`}
                  data-verify-unit="engagement-link"
                  className="rounded-sm underline-offset-2 hover:underline"
                >
                  {wait.engagement.clientName}{" "}
                  <span className="ident text-muted-foreground">
                    {wait.engagement.slug}
                  </span>
                </Link>
              )}
            </DetailField>

            <DetailField
              label="Owner"
              absent="Nobody outside the studio is recorded as owning this wait, so there is nobody to chase."
            >
              {wait.owner}
            </DetailField>

            <DetailField
              label="Owner type"
              absent="What kind of party owns this wait was not recorded."
              mono
            >
              {wait.ownerType}
            </DetailField>

            <DetailField
              label="Reason"
              absent="No reason was recorded for this wait."
            >
              {/* §7a leaves `reason` clear on this table on purpose, so this is a
                  plain string and not a `Prose` with four states. */}
              {wait.reason}
            </DetailField>
          </DetailFields>
        </DetailSection>

        <DetailSection heading="Dates" requirements={["FR-34", "FR-36"]}>
          <DetailFields>
            <DetailField
              label="Started"
              absent="No start date was recorded, so how long this has been waiting cannot be counted."
              mono
            >
              {dateText(wait.startedAt)}
            </DetailField>

            <DetailField
              label="Expected by"
              absent="Nobody gave a date, so this wait can never be flagged overdue. That is not the same as being on schedule."
              mono
            >
              {dateText(wait.expectedBy)}
            </DetailField>

            <DetailField
              label="Resolved"
              absent="Still waiting. This wait has not come back."
              mono
            >
              {dateText(wait.resolvedAt)}
            </DetailField>

            <DetailField
              label="Resolved by"
              absent={
                resolved
                  ? "This wait was resolved and nobody was recorded as having resolved it."
                  : "Still waiting, so there is nobody to record."
              }
            >
              {wait.resolvedBy}
            </DetailField>

            <DetailField
              label="Method"
              absent="FR-35: how this wait would be resolved — by probe or by hand — was not recorded."
              mono
            >
              {wait.resolutionMethod}
            </DetailField>

            <DetailField
              label="Probe target"
              absent={
                wait.resolutionMethod === "probe"
                  ? "This wait resolves by probe and no target was recorded, so there is nothing to probe."
                  : "This wait does not resolve by probe, so it has no target."
              }
              mono
            >
              {wait.probeTarget}
            </DetailField>
          </DetailFields>

          {/* FR-34's verdict is not restated here; see this file's header. */}
          <p className="text-muted-foreground border-border border-t px-4 py-2 text-xs">
            Whether this wait is overdue is derived once, on{" "}
            <Link
              href="/waits"
              className="text-foreground underline underline-offset-2"
            >
              Waits
            </Link>
            , from the expected-by date above. It is not recomputed here.
          </p>
        </DetailSection>

        <DetailSection
          heading="Work items this wait holds"
          requirements={["FR-81", "FR-83"]}
          verifyUnit="external-wait-blocks"
        >
          <div className="px-4 py-3">
            <EntityRefList
              refs={wait.blocks}
              empty="No work item names this wait. Nothing in the ledger is held by it."
            />
          </div>
        </DetailSection>
      </div>
    </EntityDetail>
  );
}

/**
 * A date for a `DetailField`, or `undefined` so the field states its own absence.
 *
 * `formatDate` rather than `isoDay` from `@/lib/display-format`, and the choice
 * is measured rather than stylistic: `isoDay` reduces a value with
 * `new Date(Date.parse(v)).toISOString()`, which reads a zone-less timestamp
 * (`2026-09-01T00:00:00`, no `Z` and no offset) as LOCAL time. Measured at
 * `TZ=Pacific/Kiritimati`: `isoDay` answers `2026-08-31` and `formatDate`
 * answers `2026-09-01`. `formatDate` takes the date the string actually carries.
 */
function dateText(value: string | null): string | undefined {
  const text = formatDate(value);
  return text === NOT_RECORDED ? undefined : text;
}
