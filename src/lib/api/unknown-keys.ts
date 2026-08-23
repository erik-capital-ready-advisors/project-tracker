/**
 * The `unparsed` discipline, applied to request bodies.
 *
 * ## Why a field nobody reads is a defect and not a harmless extra
 *
 * A key the endpoint does not recognise was put there by a caller who believed
 * it meant something. Accepting it returns `201` and stores a record missing
 * whatever the caller was trying to say — which is the wrong-`done` failure this
 * product exists to end, arriving through its own API.
 *
 * Two measured instances on this build, both `201`, both silent:
 *
 *   * `POST /api/ingest/session` with `engagementSlug` — the field is spelled
 *     `engagement` — filed a session with a correct, registered slug against
 *     `unassigned`. A wrong attribution Erik then has to find and undo by hand.
 *   * `POST /api/ingest/release` with `deployedAt` — the field is spelled
 *     `deployed_at` — stored `deployed_at: null`, losing the deploy date FR-73
 *     requires.
 *
 * i7 already made an unrecognised **query** parameter a 400. A request body
 * should not be laxer than a query string.
 *
 * ## `didYouMean` exists because the casing across these endpoints is genuinely
 * inconsistent
 *
 * `/api/ingest/release` reads snake_case while `/api/ingest/session` and
 * `/api/waits` read camelCase. That inconsistency is real and it is a wire
 * contract, so changing it is Erik's call and not a remediation — it is queued.
 * What this module does is make the mismatch **loud** at the moment it bites:
 * a caller who sends `deployedAt` is told the field is `deployed_at`, rather
 * than being handed a `201` and a lost date.
 *
 * The match is on the identifier with separators and case removed, so
 * `deployedAt`, `deployed_at`, `Deployed_At` and `deployedat` all point at the
 * one field they are obviously reaching for. It never accepts the variant — it
 * only names the right spelling. Accepting it would be this module inventing a
 * wire contract, which is the same overreach in the opposite direction.
 */

export interface UnknownKey {
  key: string;
  /** An accepted field this is near-certainly a misspelling of, if there is one. */
  didYouMean: string | null;
}

/** An identifier stripped to letters and digits, so casing and separators stop mattering. */
function canonical(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function findUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  accepted: readonly string[],
): UnknownKey[] {
  const exact = new Set(accepted);
  const byCanonical = new Map<string, string>();
  for (const name of accepted) byCanonical.set(canonical(name), name);

  const unknown: UnknownKey[] = [];
  for (const key of Object.keys(record)) {
    if (exact.has(key)) continue;
    unknown.push({ key, didYouMean: byCanonical.get(canonical(key)) ?? null });
  }
  return unknown;
}

/**
 * One problem string per unrecognised key, in the collect-every-problem style
 * the ingest validators already use — a misconfigured hook is fixed in one pass
 * rather than one round trip per typo.
 *
 * `path` prefixes nested objects, e.g. `workItem.title`.
 */
export function unknownKeyProblems(
  record: Readonly<Record<string, unknown>>,
  accepted: readonly string[],
  options: { path?: string } = {},
): string[] {
  const prefix = options.path === undefined ? "" : `${options.path}.`;
  return findUnknownKeys(record, accepted).map(({ key, didYouMean }) => {
    const named = `\`${prefix}${key}\``;
    if (didYouMean !== null) {
      return (
        `${named} is not a field this endpoint reads — did you mean ` +
        `\`${prefix}${didYouMean}\`? The two spellings are not interchangeable. ` +
        `Accepting the wrong one would store the record without this value and ` +
        `still answer success, which is the failure this refusal exists to prevent.`
      );
    }
    return (
      `${named} is not a field this endpoint reads, so nothing would have been ` +
      `done with it. Accepted here: ${accepted.map((name) => `\`${prefix}${name}\``).join(", ")}.`
    );
  });
}
