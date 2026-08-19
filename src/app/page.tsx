import Link from "next/link";

import { Screen } from "@/components/screen";
import { ANSWER_ROUTES, OPERATOR_ROUTES, type NavItem } from "@/lib/nav";

function AnswerCard({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      data-verify-unit="answer-card"
      data-verify-href={item.href}
      className="border-border hover:border-ring/60 hover:bg-muted/40 group flex flex-col gap-1.5 rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="group-hover:text-primary text-sm font-medium transition-colors">
          {item.label}
        </span>
        <span className="ident text-muted-foreground text-[11px]">
          {item.requirements.join(" · ")}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{item.question}</p>
    </Link>
  );
}

export default function HomePage() {
  return (
    <Screen
      title="Delivery Ledger"
      question="Six questions answered in thirty seconds, without opening a repo or reading a manifest."
      requirements={["FR-52", "FR-58", "FR-71"]}
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          The six answers
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ANSWER_ROUTES.map((item) => (
            <AnswerCard key={item.href} item={item} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Records
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {OPERATOR_ROUTES.map((item) => (
            <AnswerCard key={item.href} item={item} />
          ))}
        </div>
      </section>
    </Screen>
  );
}
