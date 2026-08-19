import { EmptyState, Screen } from "@/components/screen";
import { OPERATOR_ROUTES } from "@/lib/nav";

const NAV = OPERATOR_ROUTES[2];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function WaitsPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the waits screen */}
      <EmptyState
        headline="No external waits recorded."
        detail="Waits on people outside the studio appear here with the date they started and the date they are expected to clear."
      />
    </Screen>
  );
}
