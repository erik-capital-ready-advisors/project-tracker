import { formatAmount, MIXED_CURRENCY_TOTAL } from "@/lib/registry-display";

import type { CommittedTotals } from "@/lib/server/answers/committed";

/**
 * The four money totals, and the fifth number that says how much is missing from
 * them.
 *
 * ## Why `unreadable` sits in the same strip as the totals
 *
 * A milestone whose amount will not decrypt is **excluded** from every total
 * above and counted here. That exclusion is correct — guessing at a contract
 * value is worse than declining to — but a total that quietly omits a row is a
 * smaller number that looks complete, which is the same shape as an `unparsed`
 * count rendered as `0`. So the count of omissions is rendered beside the
 * numbers it changes, not in a footnote.
 *
 * ## Mixed currencies produce no total at all
 *
 * `committedAnswer` returns `currency: null` when the rows do not agree on one,
 * rather than adding across currencies to make a single number that is true of
 * none. The screen prints the reason in place of the figure. Same reasoning as
 * everything else on these six screens: the absence of an answer is stated, not
 * papered over with a plausible one.
 */
export function CommittedTotalsStrip({ totals }: { totals: CommittedTotals }) {
  if (totals.currency === null) {
    return (
      <div
        data-verify-unit="committed-totals"
        data-verify-currency="mixed"
        data-verify-unreadable={totals.unreadable}
        className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs"
      >
        {MIXED_CURRENCY_TOTAL}
        {totals.unreadable > 0 ? (
          <UnreadableNote count={totals.unreadable} />
        ) : null}
      </div>
    );
  }

  const rows = [
    ["committed", totals.committed],
    ["billable", totals.billable],
    ["submitted", totals.submitted],
    ["paid", totals.paid],
  ] as const;

  return (
    <div
      data-verify-unit="committed-totals"
      data-verify-currency={totals.currency}
      data-verify-unreadable={totals.unreadable}
      className="border-border flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-3 py-2.5"
    >
      {rows.map(([label, value]) => (
        <span
          key={label}
          data-verify-unit="committed-total"
          data-verify-label={label}
          className="flex flex-col"
        >
          <span className="text-muted-foreground text-xs">{label}</span>
          <span className="ident text-foreground text-sm tabular-nums">
            {formatAmount(value, totals.currency as string).text}
          </span>
        </span>
      ))}

      {totals.unreadable > 0 ? (
        <span className="basis-full">
          <UnreadableNote count={totals.unreadable} />
        </span>
      ) : null}
    </div>
  );
}

function UnreadableNote({ count }: { count: number }) {
  return (
    <span
      data-verify-unit="totals-unreadable"
      data-verify-count={count}
      className="text-state-blocked ident block text-xs"
    >
      {count} milestone{count === 1 ? "" : "s"} excluded — the amount is
      unreadable. These totals are lower than the real figures by an unknown
      amount.
    </span>
  );
}
