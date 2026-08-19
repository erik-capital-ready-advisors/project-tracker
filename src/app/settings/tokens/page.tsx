import { EmptyState, Screen } from "@/components/screen";
import { OPERATOR_ROUTES } from "@/lib/nav";

const NAV = OPERATOR_ROUTES[3];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function AgentTokensPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the settings/tokens screen */}
      <EmptyState
        headline="No agent tokens issued."
        detail="Tokens an agent uses to read and write the ledger appear here with their capabilities and last use. A token's plaintext is shown once at creation and never again."
      />
    </Screen>
  );
}
