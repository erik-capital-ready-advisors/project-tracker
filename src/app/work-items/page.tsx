import { EmptyState, Screen } from "@/components/screen";
import { OPERATOR_ROUTES } from "@/lib/nav";

const NAV = OPERATOR_ROUTES[1];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function WorkItemsPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the work-items screen */}
      <EmptyState
        headline="No work items recorded."
        detail="Every work item across every engagement appears here in one list, whether it came from the fleet, a hand-prompted session, or an external wait."
      />
    </Screen>
  );
}
