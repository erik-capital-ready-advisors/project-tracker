import { EmptyState, Screen } from "@/components/screen";
import { OPERATOR_ROUTES } from "@/lib/nav";

const NAV = OPERATOR_ROUTES[0];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function RegistryPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the registry screen */}
      <EmptyState
        headline="No engagements recorded."
        detail="Engagements, their contract milestones, acceptance criteria and provisioning identifiers appear here."
      />
    </Screen>
  );
}
