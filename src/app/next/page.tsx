import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[1];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function NextPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the next screen */}
      <EmptyState
        headline="Nothing is ready to start."
        detail="Work items whose dependencies are all satisfied, and which no open blocker or wait holds, appear here ordered by the nearest dated milestone they serve."
      />
    </Screen>
  );
}
