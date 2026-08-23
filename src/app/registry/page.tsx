import Link from "next/link";

import { EmptyState, Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { listEngagements } from "@/lib/server/registry/engagements";
import type { EngagementRecord } from "@/lib/server/registry/types";

import { EngagementTable } from "./_components/engagement-table";
import { OperatorGatePanel } from "./_components/operator-gate";
import { readOperatorGate, type GateRefusal } from "./_lib/gate";

const NAV = OPERATOR_ROUTES[0];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * Per-operator and never cached across sessions.
 *
 * `cookies()` inside the Supabase session client already forces this at runtime;
 * stating it here means the reason is visible at the top of the file rather than
 * being an emergent property of a client three imports away.
 */
export const dynamic = "force-dynamic";

/**
 * FR-9 + FR-13 + FR-77 — the engagements Erik has registered.
 *
 * This is one of only two screens in the product where anything is typed;
 * everything else is captured or derived. So the primary action sits in the
 * header rather than at the bottom of an empty state, and the empty state says
 * what will appear rather than only that nothing has.
 */
export default async function RegistryPage() {
  const gate = await readOperatorGate();

  let engagements: readonly EngagementRecord[] = [];
  let failure: GateRefusal | null = null;

  if (gate.kind === "ok") {
    try {
      engagements = await listEngagements();
    } catch {
      // The gate said this session may read; the read itself still failed. That
      // is a different sentence from "sign in", and it deliberately carries no
      // mechanism.
      failure = { kind: "error" };
    }
  }

  const blocked = gate.kind !== "ok" ? gate : failure;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={["FR-9", "FR-10", "FR-13", "FR-77"]}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Engagements and their contract milestones are the only records typed by
          hand. Everything else in the ledger is captured or derived.
        </p>
        <Button asChild size="sm" className="ml-auto">
          <Link href="/registry/new" data-verify-unit="engagement-new-link">
            Register engagement
          </Link>
        </Button>
      </div>

      {blocked !== null ? (
        <OperatorGatePanel gate={blocked} />
      ) : engagements.length === 0 ? (
        <EmptyState
          headline="No engagements recorded."
          detail="Register one to give ingested runs, requirements and contract milestones something to belong to."
        />
      ) : (
        <EngagementTable engagements={engagements} />
      )}
    </Screen>
  );
}
