import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { formatIdentifier } from "@/lib/registry-display";
import { getEngagement } from "@/lib/server/registry/engagements";
import {
  listMilestones,
  milestoneTotals,
} from "@/lib/server/registry/milestones";
import type {
  EngagementRecord,
  MilestoneRecord,
} from "@/lib/server/registry/types";

import { IdentifiersPanel } from "../_components/identifiers-panel";
import { MilestoneDialog } from "../_components/milestone-dialog";
import { MilestoneTable } from "../_components/milestone-table";
import { OperatorGatePanel } from "../_components/operator-gate";
import { TotalsPanel } from "../_components/totals-panel";
import { readOperatorGate, type GateRefusal } from "../_lib/gate";

export const metadata = { title: "Engagement — Delivery Ledger" };

export const dynamic = "force-dynamic";

type Totals = Awaited<ReturnType<typeof milestoneTotals>>;

/**
 * One engagement, its provisioning, and its contract milestones.
 *
 * `listMilestones` and `milestoneTotals` are both called, and `milestoneTotals`
 * calls `listMilestones` internally — so this reads the milestones twice. That
 * is deliberate. §7a requires totals to be computed server-side after
 * decryption, `milestoneTotals` IS that computation, and re-deriving the sums
 * here from the records I already hold would be a second implementation of the
 * money rules that could drift from the first. A one-operator studio pays one
 * extra query for that; the two reads run concurrently rather than in sequence.
 */
export default async function EngagementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const gate = await readOperatorGate();

  if (gate.kind !== "ok") {
    return (
      <Screen
        title="Engagement"
        question="Contract milestones, acceptance criteria and provisioning identifiers."
        requirements={["FR-10", "FR-11", "FR-12", "FR-77"]}
      >
        <OperatorGatePanel gate={gate} />
      </Screen>
    );
  }

  let engagement: EngagementRecord | null;
  let milestones: readonly MilestoneRecord[] = [];
  let totals: Totals | null = null;
  let failure: GateRefusal | null = null;

  try {
    engagement = await getEngagement(slug);
    if (engagement !== null) {
      [milestones, totals] = await Promise.all([
        listMilestones(engagement.id),
        milestoneTotals(engagement.id),
      ]);
    }
  } catch {
    engagement = null;
    failure = { kind: "error" };
  }

  if (failure !== null) {
    return (
      <Screen
        title="Engagement"
        question="Contract milestones, acceptance criteria and provisioning identifiers."
        requirements={["FR-10", "FR-11", "FR-12", "FR-77"]}
      >
        <OperatorGatePanel gate={failure} />
      </Screen>
    );
  }

  // A slug that names no engagement is a 404, not an empty engagement. Called
  // outside the try above, because `notFound()` signals by throwing.
  if (engagement === null) notFound();

  const source = formatIdentifier(engagement.source);
  const contract = formatIdentifier(engagement.contractType);

  return (
    <Screen
      title={engagement.clientName}
      question="Contract milestones, acceptance criteria and provisioning identifiers."
      requirements={["FR-10", "FR-11", "FR-12", "FR-77"]}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
        data-verify-unit="engagement-detail"
        data-verify-slug={engagement.slug}
        data-verify-milestones={milestones.length}
      >
        <span className="ident text-muted-foreground text-xs">
          {engagement.slug}
        </span>
        <span className="border-border ident rounded border px-1.5 py-0.5 text-xs">
          {engagement.status}
        </span>
        <span className="text-muted-foreground text-xs">
          {contract.text} · sourced {source.text}
        </span>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/registry">← All engagements</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/registry/${engagement.slug}/edit`}
              data-verify-unit="engagement-edit-link"
            >
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {/* The milestone table gets the full measure and the reference panels sit
          beneath it, rather than the two competing for one row.

          Measured, not assumed: against a 22rem sidebar the main track was
          654px at 1280 and the milestone table needed 811, so Paid and the row
          actions were clipped behind a horizontal scrollbar. Every way of
          getting six columns into 654px costs something §5a asks for — fixed
          columns read down, or the acceptance finding staying visible. Nothing
          is lost by stacking: provisioning is a one-lookup reference, not
          something scanned in parallel with the milestones. */}
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-3" aria-labelledby="milestones-heading">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="milestones-heading" className="text-sm font-semibold">
                Contract milestones
              </h2>
              <span className="ident text-muted-foreground text-xs">
                FR-10 · FR-11 · FR-12
              </span>
              <div className="ml-auto">
                <MilestoneDialog engagementId={engagement.id} slug={engagement.slug} />
              </div>
            </div>

            {milestones.length === 0 ? (
              <EmptyState
                headline="No contract milestones."
                /* COPY: sharpen the milestone empty-state detail */
                detail="A milestone carries a name, an amount, a due date, and the requirement references that constitute acceptance."
              />
            ) : (
              <MilestoneTable
                milestones={milestones}
                engagementId={engagement.id}
                slug={engagement.slug}
              />
            )}
          </section>

          <section
            className="border-border rounded-lg border"
            aria-labelledby="artifacts-heading"
          >
            <header className="border-border border-b px-4 py-2.5">
              <h2 id="artifacts-heading" className="text-sm font-semibold">
                Where the work lives
              </h2>
            </header>
            <dl className="divide-border divide-y">
              {(
                [
                  ["Repository", engagement.repoPath],
                  ["Spec", engagement.specPath],
                  ["Fleet artifacts", engagement.fleetDir],
                ] as const
              ).map(([label, value]) => {
                const shown = formatIdentifier(value);
                return (
                  <div
                    key={label}
                    className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-2"
                  >
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd
                      className={
                        shown.recorded
                          ? "ident min-w-0 text-xs break-all"
                          : "ident text-muted-foreground/70 min-w-0 text-xs italic"
                      }
                    >
                      {shown.text}
                    </dd>
                  </div>
                );
              })}
              <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-2">
                <dt className="text-muted-foreground text-xs">Stacks</dt>
                <dd className="flex min-w-0 flex-wrap gap-1">
                  {engagement.stacks.length === 0 ? (
                    <span className="text-muted-foreground/70 text-xs italic">
                      not recorded
                    </span>
                  ) : (
                    engagement.stacks.map((stack) => (
                      <span
                        key={stack}
                        className="border-border ident text-muted-foreground rounded border px-1.5 py-0.5 text-[0.7rem] leading-none"
                      >
                        {stack}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {totals !== null ? (
            <TotalsPanel totals={totals} milestoneCount={milestones.length} />
          ) : null}
          <IdentifiersPanel engagement={engagement} />
        </div>
      </div>
    </Screen>
  );
}
