import Link from "next/link";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";

import { EngagementForm } from "../_components/engagement-form";
import { OperatorGatePanel } from "../_components/operator-gate";
import { readOperatorGate } from "../_lib/gate";

export const metadata = { title: "Register engagement — Delivery Ledger" };

export const dynamic = "force-dynamic";

/**
 * FR-9 + FR-77 — register an engagement.
 *
 * The form renders whether or not this session may write, and the gate panel
 * sits above it as an advisory rather than in place of it. That is deliberate:
 * the form carries no data of anyone's, so there is nothing here to withhold,
 * and hiding it would mean the only way to discover that a session cannot write
 * is to be unable to find the screen. The refusal Erik needs to see is the one
 * the server gives when he submits — `submitEngagement` calls actions whose
 * first line is `requireOperator()`, and that is the boundary.
 *
 * Queued as a question: whether operator screens should gate at the page level
 * or, as here, gate the data and the mutation and let the chrome render.
 */
export default async function NewEngagementPage() {
  const gate = await readOperatorGate();

  return (
    <Screen
      title="Register engagement"
      question="Who the work is for, where its artifacts live, and which accounts it was provisioned into."
      requirements={["FR-9", "FR-13", "FR-77", "FR-78"]}
    >
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/registry">← All engagements</Link>
        </Button>
      </div>

      {/* One measure for the whole screen: a refusal that spans wider than the
          form it is about reads as belonging to the page rather than to the
          form. */}
      <div className="flex max-w-3xl flex-col gap-4">
        {gate.kind !== "ok" ? <OperatorGatePanel gate={gate} /> : null}
        <EngagementForm />
      </div>
    </Screen>
  );
}
