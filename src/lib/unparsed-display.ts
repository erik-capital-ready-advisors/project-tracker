/**
 * Presentation semantics for the `unparsed` count (FR-58).
 *
 * This is a pure module on purpose: it holds the one rule that must not be got
 * wrong, and it must be testable without a DOM. It is display logic only --
 * the parsers that PRODUCE unparsed rows live in `src/lib/ingest/` and are a
 * separate work-unit's territory. Nothing here reads a file or a database.
 *
 * The rule this product is built around is that a wrong `done` is the worst
 * output it can produce. The display-layer corollary is narrower but has the
 * same shape: **an unknown count must never render as zero.** "0 unparsed" is a
 * positive claim that the system classified everything it was given. If the
 * count could not be read -- no database yet, a failed query, a missing field --
 * saying "0" asserts that claim without having checked it, which is precisely
 * the failure FR-58 exists to make impossible.
 *
 * So there are three display states, not two.
 */

export type UnparsedDisplayState = "unknown" | "zero" | "nonzero";

/**
 * FR-96a — whether the count has to say out loud what it counted.
 *
 * `"whole-ledger"` when an engagement filter is active on the screen below.
 * `"none"` otherwise, which is the default and leaves every existing label
 * byte-identical.
 *
 * ## Why the badge is not scoped to the filter, and says so instead
 *
 * FR-58 requires the unparsed count on every surface, and the app shell mounts
 * it in the chrome precisely so that is structural rather than a rule each
 * screen has to remember. Scoping it to the filter would hang a number over
 * eleven screens that silently changed meaning; leaving it ledger-wide and
 * unlabelled hangs a ledger-wide number over a scoped list, which reads as a
 * scoped one.
 *
 * **The failure being prevented is already on the record.** M2.8 logged a run's
 * own unparsed count disagreeing with the global badge — badge 0, run `b0952e`
 * 1. A filtered list under an unlabelled global count is that same disagreement
 * one layer up. So the count stays ledger-wide and the label is what keeps it
 * honest.
 */
export type UnparsedScopeNote = "none" | "whole-ledger";

/**
 * The parenthetical FR-96a specifies, or the empty string.
 *
 * **Suppressed in the `unknown` state, deliberately.** "unparsed count
 * unavailable (whole ledger)" attaches a scope to a number that does not exist:
 * there is nothing to be misread as scoped, and the suffix would only spend the
 * width the short label exists to save. The suffix applies to `zero` as much as
 * to `nonzero`, because "0 unparsed" over a filtered list is exactly the wrong
 * reading FR-96a names.
 */
function scopeSuffix(
  count: number | null | undefined,
  scope: UnparsedScopeNote,
): string {
  if (scope !== "whole-ledger") return "";
  if (unparsedState(count) === "unknown") return "";
  // Verbatim from FR-96a's own worked example, "3 unparsed (whole ledger)".
  // Not softened, not shortened to "(all)", not moved into a tooltip: the note
  // IS the control that stops a ledger-wide number being read as a scoped one,
  // and a reader who has to hover for it has already misread the number.
  return " (whole ledger)";
}

/**
 * What to publish in the badge's `data-verify-scope` contract, so an assertion
 * can tell a labelled count from an unlabelled one without parsing prose.
 */
export function unparsedVerifyScope(
  count: number | null | undefined,
  scope: UnparsedScopeNote,
): UnparsedScopeNote {
  return scopeSuffix(count, scope) === "" ? "none" : "whole-ledger";
}

/**
 * Classify a count into a display state.
 *
 * `null` and `undefined` mean "not read yet / could not be read". A negative or
 * non-finite number is nonsense rather than zero, and is also reported unknown
 * rather than being clamped -- clamping a bad value into a clean-looking "0" is
 * the same move as widening a regex to make a stubborn row classify.
 */
export function unparsedState(
  count: number | null | undefined,
): UnparsedDisplayState {
  if (count === null || count === undefined) return "unknown";
  if (!Number.isFinite(count) || count < 0) return "unknown";
  return count === 0 ? "zero" : "nonzero";
}

/**
 * The visible label. Never abbreviated away and never empty, because FR-58
 * requires the count to be stated on every surface rather than only when it is
 * interesting.
 */
export function unparsedLabel(
  count: number | null | undefined,
  scope: UnparsedScopeNote = "none",
): string {
  const state = unparsedState(count);
  if (state === "unknown") return "unparsed count unavailable";
  const n = count as number;
  return `${n} unparsed${scopeSuffix(count, scope)}`;
}

/**
 * The same statement, short enough for a 375px header.
 *
 * ## Why this exists rather than a `truncate` class
 *
 * The full label is 222 characters' worth of pixels — 222px measured — and the
 * app shell mounts it in a header beside a nav trigger and a theme toggle. At
 * 375px that header overflowed the viewport by 46px **on every route in the
 * product**, which is a horizontal scrollbar on a dashboard whose whole promise
 * is a ten-second glance.
 *
 * Ellipsis-truncating it was the smaller change and it is the wrong one: the
 * state that overflows is `unknown`, and `unparsed count unav…` cuts the word
 * carrying the entire meaning. So the *unknown* state gets a shorter phrasing
 * and the other two are already short enough to keep verbatim.
 *
 * **The three states stay three.** `unknown` renders with a `?` and never with
 * a number, so it cannot be read as `0` at any width — which is the one thing
 * this module exists to guarantee.
 */
export function unparsedShortLabel(
  count: number | null | undefined,
  scope: UnparsedScopeNote = "none",
): string {
  // `?` is this product's standing mark for a fact nobody established —
  // `run-unparsed.tsx` spells the same state the same way, and the word
  // `unparsed` survives at every width because it is the one carrying the
  // meaning. Never a digit here: see the module comment.
  return unparsedState(count) === "unknown"
    ? "unparsed ?"
    : unparsedLabel(count, scope);
}

/**
 * The numeric value to publish in the `data-verify-count` state contract.
 * `null` when the count is unknown, so an assertion can tell "unknown" from
 * "zero" without parsing the label.
 */
export function unparsedVerifyCount(
  count: number | null | undefined,
): number | null {
  return unparsedState(count) === "unknown" ? null : (count as number);
}
