import { describeUnknownRefs, UNKNOWN_REF_TREATMENT } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * FR-10 + FR-12 — the requirement references that constitute acceptance, and the
 * ones that name nothing.
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
 * State contract for qa-reviewer:
 *   data-verify-unit="acceptance-refs"
 *   data-verify-total, data-verify-unknown  (counts, never the refs themselves)
 *   data-verify-unit="acceptance-ref", data-verify-ref, data-verify-known
 */
export function AcceptanceRefs({
  refs,
  unknown,
}: {
  refs: readonly string[];
  unknown: readonly string[];
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

  return (
    <div
      className="flex flex-col gap-1"
      data-verify-unit="acceptance-refs"
      data-verify-total={refs.length}
      data-verify-unknown={unknown.length}
    >
      <div className="flex flex-wrap gap-1">
        {refs.map((ref) => {
          const known = !unknownSet.has(ref);
          return (
            <span
              key={ref}
              data-verify-unit="acceptance-ref"
              data-verify-ref={ref}
              data-verify-known={known}
              title={
                known
                  ? undefined
                  : "This engagement has no ingested requirement with that reference."
              }
              className={cn(
                "ident rounded border px-1.5 py-0.5 text-[0.7rem] leading-none",
                known
                  ? "border-border text-muted-foreground"
                  : cn(UNKNOWN_REF_TREATMENT, "border-dashed font-semibold"),
              )}
            >
              {ref}
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
