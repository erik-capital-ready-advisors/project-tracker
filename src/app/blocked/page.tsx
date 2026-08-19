import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[0];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function BlockedPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the blocked screen */}
      <EmptyState
        headline="Nothing is blocked."
        detail="Blocked work items and open external waits appear here, grouped by owner, with elapsed time and disposition."
      />
    </Screen>
  );
}
