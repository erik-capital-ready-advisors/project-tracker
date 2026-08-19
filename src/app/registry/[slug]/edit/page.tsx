import Link from "next/link";
import { notFound } from "next/navigation";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { getEngagement } from "@/lib/server/registry/engagements";
import type { EngagementRecord } from "@/lib/server/registry/types";

import { EngagementForm } from "../../_components/engagement-form";
import { OperatorGatePanel } from "../../_components/operator-gate";
import { readOperatorGate, type GateRefusal } from "../../_lib/gate";

export const metadata = { title: "Edit engagement — Delivery Ledger" };

export const dynamic = "force-dynamic";

/**
 * FR-9 + FR-77 — edit an engagement in place.
 *
 * Unlike `/registry/new` this screen holds a client's data, so it does not
 * render the form until the gate says the session may read. There is nothing to
 * withhold on an empty form; there is on a filled one.
 */
export default async function EditEngagementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const gate = await readOperatorGate();

  let engagement: EngagementRecord | null = null;
  let failure: GateRefusal | null = gate.kind === "ok" ? null : gate;

  if (failure === null) {
    try {
      engagement = await getEngagement(slug);
    } catch {
      failure = { kind: "error" };
    }
  }

  if (failure === null && engagement === null) notFound();

  return (
    <Screen
      title="Edit engagement"
      question="Who the work is for, where its artifacts live, and which accounts it was provisioned into."
      requirements={["FR-9", "FR-13", "FR-77", "FR-78"]}
    >
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/registry/${slug}`}>← Back to engagement</Link>
        </Button>
      </div>

      <div className="flex max-w-3xl flex-col gap-4">
        {failure !== null ? (
          <OperatorGatePanel gate={failure} />
        ) : engagement !== null ? (
          <EngagementForm engagement={engagement} />
        ) : null}
      </div>
    </Screen>
  );
}
