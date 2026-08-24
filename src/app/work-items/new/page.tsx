import Link from "next/link";

import { OperatorGatePanel } from "@/app/registry/_components/operator-gate";
import { readOperatorGate } from "@/app/registry/_lib/gate";
import { EmptyState, Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { readEngagementRoster } from "@/lib/engagement-roster";

import { createPlannedWorkItemSafe } from "./actions";
import { PlannedWorkForm } from "./_components/planned-work-form";

export const metadata = { title: "Plan work item — Delivery Ledger" };

/**
 * Per-operator and never cached across sessions. `cookies()` inside the
 * Supabase session client already forces this at runtime; stating it here means
 * the reason is visible at the top of the file rather than being an emergent
 * property of a client three imports away.
 */
export const dynamic = "force-dynamic";

/**
 * FR-87 + FR-88 — planned work, entered by hand.
 *
 * ## Why this is a route and not a dialog
 *
 * `/registry/new` is the in-repo precedent for a creation form as its own
 * route, and the run's resolved spec settled on matching it. The consequence is
 * carried rather than discovered: **this takes the served route count 30 → 31**,
 * and `manual-gate.sh` fails FORWARD on a served route the guide's evidence
 * file does not mention. That is `doc1`'s section to write, not this unit's.
 *
 * ## Why the form renders even when the session may not write
 *
 * Same call `/registry/new` makes, for the same reason: the form carries
 * nobody's data, so there is nothing here to withhold, and hiding it would mean
 * the only way to discover that a session cannot write is to be unable to find
 * the screen. The refusal Erik needs to see is the one the server gives on
 * submit — `createPlannedWorkItemSafe` calls `requireOperator()` before a
 * service-role client is opened, and that is the boundary.
 *
 * The engagement **roster** is a different matter and is withheld: it is a list
 * of Erik's clients, and `readEngagementRoster` already returns `gated` rather
 * than options for a caller who is not a role-holding operator at `aal2`.
 *
 * ## Three roster outcomes, not two
 *
 * `ok` with options, `ok` with none, and `unavailable`. The third is the one
 * worth spelling out: a read that failed must not render as "you have no
 * engagements", which is the same mistake as printing `0` for an unread
 * unparsed count.
 *
 * ## This route adds no `OPERATOR_ROUTES` entry
 *
 * `/registry/new` has none either — a creation form is reached from the listing
 * it belongs to, not from the primary nav. Six pages read `OPERATOR_ROUTES` by
 * positional index (B44), so an entry appended here would be safe but pointless
 * and an entry inserted would silently retitle two settings screens.
 */
export default async function NewWorkItemPage() {
  const gate = await readOperatorGate();
  const roster = await readEngagementRoster();

  const options = roster.status === "ok" ? roster.options : [];

  return (
    <Screen
      title="Plan work item"
      question="Work that has been decided on but not yet dispatched, so Next can answer before a run exists."
      requirements={["FR-87", "FR-88"]}
    >
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/work-items">← All work items</Link>
        </Button>
      </div>

      {/* One measure for the whole screen: a refusal that spans wider than the
          form it is about reads as belonging to the page rather than to the
          form. */}
      <div className="flex max-w-3xl flex-col gap-4">
        {gate.kind !== "ok" ? <OperatorGatePanel gate={gate} /> : null}

        {roster.status === "unavailable" ? (
          <p
            role="alert"
            data-verify-unit="roster-unavailable"
            className="border-state-carried/40 bg-state-carried/5 text-foreground rounded-lg border px-3 py-2.5 text-sm"
          >
            The engagement list could not be read, so the picker below is empty
            for a reason that is not &ldquo;you have no engagements&rdquo;.
            Reload the page. If it persists, check that the database is
            reachable.
          </p>
        ) : null}

        {roster.status === "ok" && options.length === 0 ? (
          <EmptyState
            headline="No engagement to plan against."
            detail="Planned work carries an engagement at creation and there is no unassigned planned item (FR-87, Q14). Register an engagement first."
          />
        ) : null}

        <PlannedWorkForm
          engagements={options}
          onCreate={createPlannedWorkItemSafe}
        />
      </div>
    </Screen>
  );
}
