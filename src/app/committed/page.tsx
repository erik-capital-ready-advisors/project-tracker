import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[2];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function CommittedPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the committed screen */}
      <EmptyState
        headline="No contract milestones recorded."
        detail="Milestones across every engagement appear here with amount, due date, acceptance criteria, coverage state, shipped state and invoice state."
      />
    </Screen>
  );
}
