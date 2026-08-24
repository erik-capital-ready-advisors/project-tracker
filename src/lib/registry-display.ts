/**
 * Display semantics for the registry screens (FR-9 to FR-13, FR-77, FR-78).
 *
 * Pure on purpose, and in `src/lib/` next to `unparsed-display.ts` for the same
 * reason that module is there: these are the rules that must not be got wrong,
 * and they have to be testable without a DOM and without a database.
 *
 * The rule the whole file is organised around is the product's own -- a
 * plausible wrong number is the worst output available. So:
 *
 *   * A milestone amount that did not decrypt is `null`, and `null` renders as
 *     "unreadable", never as `0` and never as an empty cell. `$0` is a positive
 *     claim that a client owes nothing.
 *   * Totals across mixed currencies are not summed into a single figure, and
 *     "no milestones yet" is reported differently from "mixed currencies" even
 *     though `milestoneTotals()` returns `currency: null` for both.
 *   * An absent identifier renders as "not recorded" rather than blank, because
 *     FR-77 exists so the wrong-account failure mode is visible in one lookup,
 *     and a blank cell is indistinguishable from a cell nobody rendered.
 */

/** Rendered wherever a nullable value is genuinely absent. */
export const NOT_RECORDED = "not recorded";

/** Rendered for a milestone amount that did not decrypt to a finite number. */
export const UNREADABLE_AMOUNT = "unreadable";

/**
 * The label for a total whose rows do not agree on one currency.
 *
 * Relocated here from the now-deleted `money-display.ts` (B32): that module's
 * `money()` formatter disagreed with `formatAmount` on symbol-vs-code and on
 * thousands separators, and QA's recommendation — verified rather than taken on
 * faith, since `LOCALE` is pinned two lines below and defuses the hydration
 * objection `money-display.ts` was built to avoid — was to keep this function
 * and delete the other module. This constant had no formatting logic of its
 * own to disagree over, so it moves over unchanged and keeps its one consumer,
 * `CommittedTotalsStrip`.
 *
 * `describedTotals()` below answers the bare `"not summed"` for the same
 * condition on the registry's per-engagement panel — a shorter form for a
 * denser row, not a second disagreement: neither reading nor doubling one of
 * the two loses the other's context.
 */
export const MIXED_CURRENCY_TOTAL =
  "not summed — these milestones are in more than one currency";

/**
 * The one locale used for every number on these screens.
 *
 * Explicit rather than the runtime default: `Intl` on the server and `Intl` in
 * the browser resolve a missing locale from different environments, and a
 * server-rendered "1,000" against a client-rendered "1 000" is a hydration
 * mismatch that only appears on someone else's machine.
 */
const LOCALE = "en-US";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * A timestamp that states no zone — `2026-09-01T00:00:00` with no `Z` and no
 * `±hh:mm`. Measured rather than assumed: `new Date()` parses a bare
 * `YYYY-MM-DD` as UTC, so that form survives `toISOString()` in every timezone,
 * but it parses a zone-less timestamp as LOCAL time. At UTC+14 that renders
 * `2026-09-01T00:00:00` as `2026-08-31` — a contractual date shown a day early,
 * on some machines and not others.
 */
const ZONELESS_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T[\d:.]+$/;

/**
 * A contract amount, or the honest absence of one.
 *
 * `null` is NOT zero. `listMilestones()` returns `null` when the stored
 * ciphertext did not decrypt to a finite number, and rendering that as `$0`
 * understates what a client owes -- the exact class of wrong-but-plausible
 * output this product exists to stop producing.
 */
export function formatAmount(
  amount: number | null,
  currency: string,
): { text: string; readable: boolean } {
  if (amount === null || !Number.isFinite(amount)) {
    return { text: UNREADABLE_AMOUNT, readable: false };
  }

  try {
    return {
      text: new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount),
      readable: true,
    };
  } catch {
    // An unrecognised currency code is not a reason to drop the number. Show
    // the figure and the code side by side rather than guessing at a symbol.
    const plain = new Intl.NumberFormat(LOCALE, {
      maximumFractionDigits: 2,
    }).format(amount);
    return { text: `${plain} ${currency}`, readable: true };
  }
}

/**
 * A date for display. `due_date` is stored as a plain `YYYY-MM-DD`;
 * `submitted_at` and `paid_at` arrive as timestamps.
 *
 * Both render as `YYYY-MM-DD` in mono with tabular figures, per spec 5a: dates
 * are identifiers here, read in columns and compared, not prose.
 */
export function formatDate(value: string | null): string {
  if (value === null) return NOT_RECORDED;
  const trimmed = value.trim();
  if (trimmed === "") return NOT_RECORDED;

  // A plain ISO date passes through untouched. `new Date()` would agree here --
  // it reads a date-only string as UTC -- so this is exactness rather than a
  // fix, and it costs nothing.
  if (ISO_DATE.test(trimmed)) return trimmed;

  // A timestamp stating no zone does NOT agree, and that one is a real defect:
  // it is read as local time, so west of UTC it is the same day and east of it
  // is the day before. Take the date the string actually carries instead of
  // letting the host's timezone decide which day a milestone was submitted.
  const zoneless = ZONELESS_TIMESTAMP.exec(trimmed);
  if (zoneless !== null) return zoneless[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return NOT_RECORDED;
  return parsed.toISOString().slice(0, 10);
}

/**
 * The `YYYY-MM-DD` value an `<input type="date">` expects, or `""` for empty.
 * Shares `formatDate`'s timezone care for the same reason.
 */
export function toDateInputValue(value: string | null): string {
  const formatted = formatDate(value);
  return formatted === NOT_RECORDED ? "" : formatted;
}

/** An identifier (FR-77) for display. Never blank -- absent is stated. */
export function formatIdentifier(value: string | null): {
  text: string;
  recorded: boolean;
} {
  if (value === null || value.trim() === "") {
    return { text: NOT_RECORDED, recorded: false };
  }
  return { text: value.trim(), recorded: true };
}

/**
 * Split a free-text field into a list. Accepts commas and newlines, because
 * FR-13 makes this the one place Erik types and both are things people type.
 * Trims, drops empties, de-duplicates, preserving first-seen order.
 */
export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n\r]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
    ),
  ];
}

/**
 * Acceptance references, as typed. Also splits on whitespace, so
 * `FR-10 FR-11 FR-12` works, and uppercases so `fr-10` is never reported as an
 * unknown requirement for a casing reason.
 *
 * This does NOT decide whether a reference is well-formed. `validateMilestone`
 * in `@/lib/server/registry/validation` owns that, and a second copy of the
 * pattern here would drift from it and produce two answers to one question.
 */
export function splitRefs(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim().toUpperCase())
        .filter((entry) => entry !== ""),
    ),
  ];
}

/** How a list field is rendered back into its textarea for editing. */
export function joinList(values: readonly string[]): string {
  return values.join(", ");
}

export type TotalsDisplay = {
  /** `null` when there is no single currency to state. */
  currency: string | null;
  committed: string;
  submitted: string;
  paid: string;
  /**
   * Why the totals carry no currency, when they carry none; `null` when they do.
   *
   * `"empty"` and `"mixed"` are deliberately distinct. `milestoneTotals()`
   * answers `currency: null` for both, and reporting "mixed currencies" for an
   * engagement with no milestones would be a statement about data that is not
   * there.
   */
  qualifier: "empty" | "mixed" | null;
  /** Milestones whose amount did not decrypt. Never folded into the totals. */
  unreadable: number;
};

/**
 * Present the server-computed totals.
 *
 * §7a: "no SQL aggregation over money; totals are computed server-side after
 * decryption." `milestoneTotals()` is that computation and this function does
 * not repeat it. It decides only how to say what came back -- including the one
 * thing the numbers alone cannot say, which is whether a missing currency means
 * "nothing to total" or "more than one currency, so no single total exists".
 */
export function describeTotals(
  totals: {
    currency: string | null;
    committed: number;
    submitted: number;
    paid: number;
    unreadable: number;
  },
  milestoneCount: number,
): TotalsDisplay {
  const qualifier =
    totals.currency !== null ? null : milestoneCount === 0 ? "empty" : "mixed";

  const render = (value: number): string => {
    if (qualifier === "mixed") return "not summed";
    if (totals.currency === null) {
      return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(
        value,
      );
    }
    return formatAmount(value, totals.currency).text;
  };

  return {
    currency: totals.currency,
    committed: render(totals.committed),
    submitted: render(totals.submitted),
    paid: render(totals.paid),
    qualifier,
    unreadable: totals.unreadable,
  };
}

/**
 * FR-12's finding, as one sentence.
 *
 * Reported, never swallowed, and never used to reject the row: the schema stores
 * acceptance refs as text precisely so a dangling reference survives to be seen.
 * A foreign key would have refused the write and lost the finding.
 */
export function describeUnknownRefs(refs: readonly string[]): string | null {
  if (refs.length === 0) return null;
  const list = refs.join(", ");
  return refs.length === 1
    ? `${list} names a requirement this engagement has not ingested.`
    : `${list} name requirements this engagement has not ingested.`;
}

/**
 * The colour family a dangling acceptance reference renders in.
 *
 * Deliberately NOT `state-unparsed`. Fuchsia means exactly one thing in this
 * product -- "the system could not classify this" -- and a dangling reference is
 * the opposite: it parsed perfectly and points at nothing. It renders in the
 * `blocked` family because acceptance cannot be evaluated until it is fixed,
 * outlined rather than filled so it is not read as a blocked work item.
 *
 * Queued as a question; this is a colour decision Erik has not reviewed.
 */
export const UNKNOWN_REF_TREATMENT =
  "border-state-blocked/50 text-state-blocked bg-state-blocked/10";
