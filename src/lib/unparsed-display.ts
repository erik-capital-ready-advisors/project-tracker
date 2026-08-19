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
export function unparsedLabel(count: number | null | undefined): string {
  const state = unparsedState(count);
  if (state === "unknown") return "unparsed count unavailable";
  const n = count as number;
  return `${n} unparsed`;
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
