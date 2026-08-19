import { EmptyState, Screen } from "@/components/screen";
import { ANSWER_ROUTES } from "@/lib/nav";

const NAV = ANSWER_ROUTES[4];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export default function BottleneckPage() {
  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      {/* COPY: empty-state headline and detail for the bottleneck screen */}
      <EmptyState
        headline="Nothing is waiting on you."
        detail="Work whose executor is Erik or an Erik-gate appears here, ranked by how much downstream work it unblocks and by the nearest milestone at risk."
      />
    </Screen>
  );
}
