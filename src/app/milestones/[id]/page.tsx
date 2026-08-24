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
import { ProseValue } from "@/components/prose-value";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { readContractMilestoneDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";
import {
  formatAmount,
  formatDate,
  NOT_RECORDED,
  UNREADABLE_AMOUNT,
} from "@/lib/registry-display";

const SCREEN = "Contract milestone";
const QUESTION =
  "One thing committed to a client: what it is worth, when it is due, and which requirements constitute its acceptance.";
const REQUIREMENTS = ["FR-81", "FR-10", "FR-11", "FR-12"] as const;

export const metadata = { title: "Contract milestone — Delivery Ledger" };

export const dynamic = "force-dynamic";

/**
 * FR-81 for `contract_milestone` — the operator's view of the one table an agent
 * token may never reach.
 *
 * ## FR-86, and why this file is a page and nothing else
 *
 * §7a: *"operator only; agent tokens are refused this table entirely (FR-5)."*
 * FR-86: detail views *"add no new decryption surface reachable by an agent
 * token."* CR-003 §5 restates it: the agent's answer stays a `403`.
 *
 * So this route is a React Server Component and **there is no `route.ts`, no
 * server action and no JSON endpoint beside it.** That is the whole control at
 * this layer: an agent-reachable endpoint over this table would be exactly the
 * surface FR-86 was written to prevent. `readContractMilestoneDetail` calls
 * `requireOperator()` beside its own query, and `loadContractMilestoneDetail`
 * throws naming `contract_milestone` if an agent-scoped client ever reaches it —
 * i1 verified that with a control proving the refusal is not an artefact of a
 * broken fake.
 *
 * ## The amount, which is where a plausible wrong number does the most damage
 *
 * `amount: number | null` and `amountUnreadable: boolean` are two facts, not
 * one, and they describe three situations that must not look alike:
 *
 *   * a number — rendered through `formatAmount`, never formatted by hand;
 *   * `null` with the flag **false** — nobody has priced this milestone. There
 *     is no figure and none was expected. `NOT_RECORDED`.
 *   * `null` with the flag **true** — ciphertext IS stored and did not read back
 *     as a number. A figure Erik would put in an invoice is missing.
 *     `UNREADABLE_AMOUNT`, in the `blocked` family, stated loudly.
 *
 * **Neither absent case renders as `0` and neither renders blank.** `$0` is a
 * positive claim that a client owes nothing, and a blank cell is
 * indistinguishable from a cell nobody rendered.
 *
 * ## What this view deliberately does NOT compute — ruling 5
 *
 * **FR-50's billable state.** `open` / `claimed` / `billable` is derived from
 * acceptance coverage by `committedAnswer`, once, behind `/committed`. A second
 * implementation on this page would be a second answer to the question "may I
 * invoice this", and the two would drift. This view shows the acceptance
 * references and links to the screen that rules on them.
 *
 * ## Two encrypted columns, from two different sources
 *
 * `amount` is §7a's, named there outright. `notes` is encrypted under the
 * **security baseline** and §7a is silent on it (B13). Both are stated in the
 * build report rather than left to be inferred from the code.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="contract-milestone-detail"
 *   data-verify-amount-readable    "true" when a number was read
 *   data-verify-amount-unreadable  "true" when ciphertext was stored and failed
 *   data-verify-notes-state        the four `ProseState` values
 *   data-verify-submitted          "true" | "false"
 *   data-verify-paid               "true" | "false"
 *   data-verify-acceptance         how many requirements constitute acceptance
 *   data-verify-dangling           how many of them resolve to nothing (FR-83)
 *
 * **No amount, no currency-qualified figure and no note text is published into
 * any `data-verify-*` attribute.** §7a: an amount here is what Erik charges a
 * named client and the set of them is the studio's pricing model. The contract
 * carries counts and statuses; it never carries the money.
 */
export default async function ContractMilestoneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The gate lives inside `readContractMilestoneDetail`, beside its query. This
  // page adds none and removes none. `loadForOperator` turns a refusal into a
  // stated notice: "I could not look" is a different claim from "there is
  // nothing here", and on this table the difference is a client's money.
  const result = await loadForOperator(() => readContractMilestoneDetail(id));

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

  const milestone = result.data;

  // An id naming no row is a 404, and a 404 is not the failure above. Outside
  // the read on purpose: `notFound()` signals by throwing, and `loadForOperator`
  // would catch it and report a database failure instead.
  if (milestone === null) notFound();

  const amount = formatAmount(milestone.amount, milestone.currency, {
    unreadable: milestone.amountUnreadable,
  });
  const dangling = milestone.acceptance.filter((ref) => ref.id === null).length;

  return (
    <EntityDetail
      kind="contract_milestone"
      title={milestone.name}
      question={QUESTION}
      requirements={REQUIREMENTS}
      identifier={milestone.name}
      actions={
        milestone.engagement === null ? undefined : (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/registry/${milestone.engagement.slug}`}
              data-verify-unit="back-to-engagement"
            >
              ← Engagement
            </Link>
          </Button>
        )
      }
    >
      <div
        className="flex flex-col gap-4"
        data-verify-unit="contract-milestone-detail"
        data-verify-amount-readable={amount.readable ? "true" : "false"}
        data-verify-amount-unreadable={milestone.amountUnreadable ? "true" : "false"}
        data-verify-notes-state={milestone.notes.state}
        data-verify-submitted={milestone.submittedAt !== null ? "true" : "false"}
        data-verify-paid={milestone.paidAt !== null ? "true" : "false"}
        data-verify-acceptance={milestone.acceptance.length}
        data-verify-dangling={dangling}
      >
        <DetailSection heading="The milestone" requirements={["FR-10", "FR-11"]}>
          <DetailFields>
            <DetailField
              label="Engagement"
              absent="This milestone is not attached to an engagement, or its engagement row could not be read. A milestone with no client is not billable to anyone."
            >
              {milestone.engagement === null ? undefined : (
                // Ruling 3: the engagement is not a ninth entity kind. A plain
                // link to the registry, never an `<EntityRef>`.
                <Link
                  href={`/registry/${milestone.engagement.slug}`}
                  data-verify-unit="engagement-link"
                  className="rounded-sm underline-offset-2 hover:underline"
                >
                  {milestone.engagement.clientName}{" "}
                  <span className="ident text-muted-foreground">
                    {milestone.engagement.slug}
                  </span>
                </Link>
              )}
            </DetailField>

            {/* The three-way branch this whole view is organised around. Never
                `0`, never blank, and the two absent cases never look alike. */}
            <DetailField
              label="Amount"
              absent="No amount could be stated at all, which none of the branches below can produce. If this is on screen, this view has a defect."
              mono
            >
              {amount.readable ? (
                <span className="font-medium">{amount.text}</span>
              ) : milestone.amountUnreadable ? (
                <span
                  className="text-state-blocked font-semibold"
                  title="An amount is stored for this milestone and its ciphertext did not decrypt to a number. This is NOT zero and it is not an unpriced milestone — a figure that belongs on an invoice cannot be read."
                >
                  {UNREADABLE_AMOUNT}
                </span>
              ) : (
                <span
                  className="text-muted-foreground/85 italic"
                  title="Nobody has priced this milestone. Nothing is stored, so there is nothing to read back. This is not zero and it is not a decryption failure."
                >
                  {NOT_RECORDED}
                </span>
              )}
            </DetailField>

            <DetailField
              label="Currency"
              absent="No currency was recorded, which should not be possible — the column carries a default."
              mono
            >
              {/* Stated separately as well as inside the formatted amount, so it
                  survives both of the cases where there is no figure to format. */}
              {milestone.currency}
            </DetailField>

            <DetailField
              label="Due"
              absent="No due date was recorded, so this milestone cannot come due."
              mono
            >
              {dateText(milestone.dueDate)}
            </DetailField>

            <DetailField
              label="Submitted"
              absent="Not submitted to the client yet."
              mono
            >
              {dateText(milestone.submittedAt)}
            </DetailField>

            <DetailField label="Paid" absent="Not paid." mono>
              {dateText(milestone.paidAt)}
            </DetailField>
          </DetailFields>
        </DetailSection>

        <DetailSection heading="Notes" requirements={["FR-11"]}>
          <DetailFields>
            <DetailField
              label="Notes"
              absent="Nothing was stored in this field. It is empty, rather than unreadable or unread."
            >
              {/* Four `ProseState`s, four renderings. `notes` is encrypted under
                  the security BASELINE, not §7a — §7a is silent on it (B13). */}
              <ProseValue
                field="notes"
                prose={milestone.notes}
                absent="Nothing was stored in this field. It is empty, rather than unreadable or unread."
              />
            </DetailField>
          </DetailFields>
        </DetailSection>

        <DetailSection
          heading="Acceptance"
          requirements={["FR-12", "FR-83"]}
          verifyUnit="contract-milestone-acceptance"
        >
          <div className="flex flex-col gap-2 px-4 py-3">
            <EntityRefList
              refs={milestone.acceptance}
              empty="No acceptance criteria name a requirement, so nothing decides when this milestone is done."
            />
            <p className="text-muted-foreground text-xs">
              Whether these are covered — and therefore whether this milestone is
              open, claimed or billable — is derived once, on{" "}
              <Link
                href="/committed"
                data-verify-unit="committed-link"
                className="text-foreground underline underline-offset-2"
              >
                Committed
              </Link>
              . It is not recomputed here, because two answers to &ldquo;may I
              invoice this&rdquo; is one answer too many.
              {dangling > 0
                ? " A reference drawn as dangling names a requirement this engagement has never ingested. FR-12 reports it every time the row is read rather than rejecting the row at write time, which would have lost the finding."
                : ""}
            </p>
          </div>
        </DetailSection>
      </div>
    </EntityDetail>
  );
}

/**
 * A date for a `DetailField`, or `undefined` so the field states its own absence.
 *
 * `formatDate` rather than `isoDay` from `@/lib/display-format`, and on this view
 * it is contractual: `isoDay` reduces through
 * `new Date(Date.parse(v)).toISOString()`, which reads a zone-less timestamp as
 * LOCAL time. Measured at `TZ=Pacific/Kiritimati`, `2026-09-01T00:00:00` answers
 * `2026-08-31` that way and `2026-09-01` through `formatDate` — a milestone due
 * date shown a day early, on some machines and not others.
 */
function dateText(value: string | null): string | undefined {
  const text = formatDate(value);
  return text === NOT_RECORDED ? undefined : text;
}
