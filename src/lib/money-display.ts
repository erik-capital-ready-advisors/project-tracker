/**
 * Money rendering for Committed, as a pure function.
 *
 * ## Why not `Intl.NumberFormat`
 *
 * Same reason `@/lib/display-format` refuses a locale date, and it bites harder
 * here. A Server Component renders in the deployment's locale and the browser
 * rehydrates in the reader's; any formatter that consults the ambient locale
 * produces two different strings for the same value, which React reports as a
 * hydration mismatch — or does not, and the number silently changes shape.
 * With money, the shapes that differ are the *decimal separator* and the
 * *grouping separator*, and `1.250,00` versus `1,250.00` is a factor of a
 * thousand read wrong at a glance.
 *
 * Spec 5a also puts these in a monospace column with tabular figures to be
 * compared down the page, and a format that varies by machine cannot be.
 *
 * So: a fixed format, everywhere, always. Grouped thousands with a narrow space,
 * two decimals, and the ISO currency code after the number rather than a symbol
 * before it. The code is unambiguous where a symbol is not — `$` is at least
 * four currencies and this ledger holds more than one.
 *
 * ## The unit is not asserted here
 *
 * `contract_milestone.amount` decrypts to a number and nothing in the spec or
 * the schema states whether it is major units (12500.00) or minor units
 * (1250000). This module formats what it is given as major units, which is what
 * the totals in `committedAnswer` already assume by summing them directly.
 * **Queued for Erik** — if it is minor units, the fix is one divide in this
 * file and nothing else changes, which is why it is safe to proceed.
 */

/** U+202F narrow no-break space: groups digits without widening the column. */
const GROUP = " ";

/**
 * Format an amount for display.
 *
 * `null` is **not** rendered as `0`. A milestone worth nothing and a milestone
 * whose ciphertext would not decrypt are different claims, and one of them is a
 * number Erik would put on an invoice — so an unreadable amount is the caller's
 * job to render as unreadable, and this returns `null` to force that.
 */
export function money(
  amount: number | null | undefined,
  currency: string,
): string | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount)) return null;

  // `toFixed(2)` rather than hand-rolled cent arithmetic. Subtracting the whole
  // part and multiplying by 100 introduces a second rounding on top of the one
  // the value already carries — `1.005 - 1` is `0.00499999999999989` in float64
  // — and a hand-rolled carry then has to handle a cents value of 100. `toFixed`
  // does one rounding, the platform's, and cannot produce `.100`.
  //
  // It does NOT make the value exact: `amount` arrives as `Number(<decrypted
  // text>)`, so any precision beyond float64 was lost before this module saw it.
  // That is worth knowing and is not fixable here — if contract amounts ever
  // need exactness, they need a decimal type at the boundary, not a formatter.
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".") as [string, string];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);

  return `${amount < 0 ? "-" : ""}${grouped}.${cents} ${currency}`;
}

/**
 * The label for a total whose rows do not agree on one currency.
 *
 * `committedAnswer` returns `currency: null` in that case rather than adding
 * amounts across currencies, which would produce a single number that is true of
 * no currency. The screen has to say why the total is missing instead of
 * printing a blank, for the same reason an unknown `unparsed` count is not `0`.
 */
export const MIXED_CURRENCY_TOTAL =
  // COPY: shown in place of a total when the rows carry more than one currency
  "no single total — these milestones are in more than one currency";
