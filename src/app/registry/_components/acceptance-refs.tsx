import { EntityRef } from "@/components/entity-ref";
import { describeUnknownRefs } from "@/lib/registry-display";

/**
 * FR-10 + FR-12 + **FR-80/FR-83** — the requirement references that constitute
 * acceptance, the ones that name nothing, and (since M2.7) a link to the ones
 * that name something.
 *
 * FR-12 is the requirement with teeth here: "a reference naming a requirement
 * that does not exist is reported rather than silently accepted." `i5` returns
 * it on every read rather than only at write time, deliberately — a warning
 * shown once at save is a warning that is gone by the time anyone looks. So the
 * dangling reference is marked in place, in the row, for as long as it is wrong.
 *
 * It is NOT rendered in the `unparsed` colour. Fuchsia means exactly one thing
 * in this product and a dangling reference is not it: this reference parsed
 * perfectly and points at nothing, which is the opposite failure. It takes the
 * `blocked` family with an outline treatment, because what it blocks is the
 * ability to evaluate acceptance at all.
 *
 * §7a: requirements are matched and displayed by `ref`, never by text —
 * `requirement.text` is encrypted and `ref` is clear, and that is the whole
 * reason this component shows `FR-nn` and no prose.
 *
 * ## Two contracts, because there are two questions (M2.7, f5)
 *
 * The `acceptance-ref` contract is M1.3's and it answers FR-12's question: *does
 * this engagement hold an ingested requirement with this ref?* The `entity-ref`
 * contract nested inside it is M2.7's and answers FR-83's: *did this reference
 * resolve to exactly one row, so that it can be a link?*
 *
 * They are kept apart rather than merged because they can disagree, and this
 * product records a disagreement rather than picking a winner. `resolveRefs`
 * refuses an ambiguous match, and a caller that renders this component without a
 * `resolved` map has determined nothing at all — in both cases FR-12 may say
 * "known" while the reference is honestly not navigable. The outer attribute
 * keeps saying what FR-12 found; the inner one keeps saying what resolution
 * found; `data-verify-unresolved` counts the second so the gap is a number
 * somebody can read rather than a discovery made one token at a time.
 *
 * ## The dangling treatment is preserved to the pixel
 *
 * `<EntityRef>` already draws FR-12's treatment — it imports the same
 * `UNKNOWN_REF_TREATMENT` constant this file does, which is why adopting it
 * cannot drift the colour. What it does not inherit is this component's tighter
 * metrics, so `ACCEPTANCE_TOKEN` restates them and `cn` merges them over the
 * component's defaults. The unknown half is therefore unchanged: same colour,
 * same dashed border, same weight, same padding, same size, still not a link.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="acceptance-refs"
 *   data-verify-total, data-verify-unknown  (counts, never the refs themselves)
 *   data-verify-unresolved                  (count of refs that are not links)
 *   data-verify-unit="acceptance-ref", data-verify-ref, data-verify-known
 *   data-verify-unit="entity-ref"           (nested — see `entity-ref.tsx`)
 */

/**
 * The metrics this component has drawn since M1.3, restated so `<EntityRef>`'s
 * looser defaults cannot change them. Merged by `cn`, so `px-1.5` beats `px-1`
 * and `text-[0.7rem]` beats `text-xs`; `leading-none` has nothing to beat.
 */
const ACCEPTANCE_TOKEN = "px-1.5 text-[0.7rem] leading-none";

const NOT_INGESTED =
  "This engagement has no ingested requirement with that reference.";

/**
 * The case FR-12 and resolution disagree on. Rare — `requirement` is unique on
 * `(engagement_id, ref)`, so it needs either an unresolved batch or a caller
 * that passed no map at all — and worth its own sentence when it happens,
 * because "known but not a link" otherwise reads as a broken link.
 */
const NOT_RESOLVED =
  "This engagement has ingested a requirement with that reference, but it did not resolve to exactly one row, so it is shown rather than linked.";

export function AcceptanceRefs({
  refs,
  unknown,
  resolved,
}: {
  refs: readonly string[];
  unknown: readonly string[];
  /**
   * `ref` → the requirement's database uuid, or `null` for a reference that
   * resolved to nothing.
   *
   * Optional, and its absence means **nothing was resolved**, so every token
   * dangles. That is the `unparsed`-is-the-only-default rule applied to a prop:
   * a caller that has not resolved anything must not be able to produce a link
   * by omission.
   */
  resolved?: ReadonlyMap<string, string | null>;
}) {
  const unknownSet = new Set(unknown);
  const finding = describeUnknownRefs(unknown);

  if (refs.length === 0) {
    return (
      <span className="text-muted-foreground/70 text-xs italic">
        no acceptance stated
      </span>
    );
  }

  const unresolved = refs.filter((ref) => (resolved?.get(ref) ?? null) === null);

  return (
    <div
      className="flex flex-col gap-1"
      data-verify-unit="acceptance-refs"
      data-verify-total={refs.length}
      data-verify-unknown={unknown.length}
      data-verify-unresolved={unresolved.length}
    >
      <div className="flex flex-wrap gap-1">
        {refs.map((ref) => {
          const known = !unknownSet.has(ref);
          const id = resolved?.get(ref) ?? null;

          return (
            // The wrapper carries M1.3's contract and draws nothing. The box,
            // the colour and the link decision all belong to `<EntityRef>`, so
            // there is exactly one implementation of FR-83 in this repository.
            <span
              key={ref}
              data-verify-unit="acceptance-ref"
              data-verify-ref={ref}
              data-verify-known={known}
              className="inline-flex"
            >
              <EntityRef
                kind="requirement"
                label={ref}
                id={id}
                title={known ? (id === null ? NOT_RESOLVED : undefined) : NOT_INGESTED}
                className={ACCEPTANCE_TOKEN}
              />
            </span>
          );
        })}
      </div>
      {finding ? (
        <p className="text-state-blocked max-w-prose text-[0.7rem]">{finding}</p>
      ) : null}
    </div>
  );
}
