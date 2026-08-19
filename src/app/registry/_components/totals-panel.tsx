import { describeTotals } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * What this engagement is worth, what has been submitted, and what has been paid.
 *
 * §7a: `contract_milestone.amount` is pgcrypto-encrypted, so there is no SQL
 * aggregation over money — `milestoneTotals()` decrypts and then sums in
 * TypeScript, and this panel only decides how to say what came back.
 *
 * Two numbers it deliberately refuses to print:
 *
 *   * **A total across mixed currencies.** `milestoneTotals()` returns
 *     `currency: null` rather than adding pounds to dollars, and this reads
 *     "not summed" rather than showing a figure that would be wrong in a way
 *     nobody would notice.
 *   * **Zero for a milestone that did not decrypt.** Those are counted in
 *     `unreadable` and reported next to the totals. A silently-zero milestone
 *     understates what a client owes.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="milestone-totals"
 *   data-verify-qualifier="empty" | "mixed" | "single"
 *   data-verify-currency, data-verify-unreadable
 */
export function TotalsPanel({
  totals,
  milestoneCount,
}: {
  totals: {
    currency: string | null;
    committed: number;
    submitted: number;
    paid: number;
    unreadable: number;
  };
  milestoneCount: number;
}) {
  const display = describeTotals(totals, milestoneCount);

  const cells = [
    { label: "Committed", value: display.committed },
    { label: "Submitted", value: display.submitted },
    { label: "Paid", value: display.paid },
  ];

  return (
    <section
      className="border-border rounded-lg border px-4 py-3"
      data-verify-unit="milestone-totals"
      data-verify-qualifier={display.qualifier ?? "single"}
      data-verify-currency={display.currency ?? ""}
      data-verify-unreadable={display.unreadable}
      aria-label="Contract totals"
    >
      <div className="grid grid-cols-3 gap-3">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">{cell.label}</span>
            <span
              className={cn(
                "ident text-sm font-semibold",
                display.qualifier === "mixed" && "text-muted-foreground font-normal italic",
              )}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>

      {display.qualifier === "mixed" ? (
        <p className="text-muted-foreground mt-2 max-w-prose text-xs">
          Milestones on this engagement are stated in more than one currency, so
          there is no single total. Adding them would produce a number that looks
          right and is not.
        </p>
      ) : null}

      {display.unreadable > 0 ? (
        <p className="text-state-blocked mt-2 max-w-prose text-xs">
          {display.unreadable === 1
            ? "One milestone amount could not be read and contributes nothing to these totals — it is not zero."
            : `${display.unreadable} milestone amounts could not be read and contribute nothing to these totals — they are not zero.`}
        </p>
      ) : null}
    </section>
  );
}
