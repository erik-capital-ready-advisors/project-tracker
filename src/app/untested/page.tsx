import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[3];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function UntestedPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the untested screen */}
      <EmptyState
        headline="No requirements recorded yet."
        detail="Coverage per engagement appears here: requirement count, test count, mapped count, the uncovered requirements, and the self-certified tests."
      />
    </Screen>
  );
}
