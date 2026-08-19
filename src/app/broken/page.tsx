import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[5];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function BrokenPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the broken screen */}
      <EmptyState
        headline="Nothing is broken."
        detail="Open defects grouped by severity, and current regressions of both kinds, appear here linked to the requirement, work item and test each implicates."
      />
    </Screen>
  );
}
