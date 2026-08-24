import Link from "next/link";

import { Absent } from "@/components/answer-chips";
import { entityHref, ENTITY_LABEL, type EntityKind } from "@/lib/entity-routes";
import { UNKNOWN_REF_TREATMENT } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * FR-80 + FR-83 — one entity reference, either navigable or visibly a reference
 * to nothing.
 *
 * ## The two states, and why there is no third
 *
 * FR-80: "every entity reference rendered on any screen is navigable to that
 * entity". FR-83: a reference that resolves to nothing "renders in FR-12's
 * dangling-reference treatment and **is never a link**. It is not a 404, not a
 * search, and not silently plain text."
 *
 * So `id` is `string | null`, required, with no default. That is deliberate and
 * it is the point of the component: a caller that has not determined whether the
 * reference resolved cannot construct this element at all. `data-verify-known`
 * is computed from what was passed, never defaulted — an absent attribute would
 * let a view that never checked render a link, which is exactly FR-83's failure.
 *
 * ## The dangling treatment is FR-12's, reused rather than reinvented
 *
 * `UNKNOWN_REF_TREATMENT` and the dashed, semibold outline are what
 * `AcceptanceRefs` already draws, and the reasoning attached to that constant is
 * load-bearing here too: it is deliberately **not** the `unparsed` fuchsia.
 * Fuchsia means exactly one thing in this product — "the system could not
 * classify this" — and a dangling reference is the opposite failure: it parsed
 * perfectly and points at nothing. It takes the `blocked` family, outlined, so
 * it is not read as a blocked work item either.
 *
 * ## The anchor is an ANCESTOR of the span, never the same element
 *
 * `e2e/m27-navigation.spec.ts` asserts `el.closest("a") !== null` on the span
 * carrying `data-verify-unit="entity-ref"`. `closest()` includes the element
 * itself, so putting the attributes on the anchor would pass that assertion and
 * break the dangling half of the contract, which asserts the same expression is
 * `false`. Keeping the two elements distinct means one query answers one
 * question in both states.
 *
 * ## §7a
 *
 * `requirement.text` is encrypted and `ref` is clear, so a requirement is
 * matched and displayed by `FR-nn` and never by text. This component renders
 * identifiers and nothing else — no prose reaches it, by construction.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="entity-ref"
 *   data-verify-kind        one of FR-81's eight kinds
 *   data-verify-ref         the reference as rendered (`FR-42`, `u4`, `D-7`)
 *   data-verify-known       "true" | "false" — never absent, no third value
 *   data-verify-treatment   "dangling", on every known="false" reference
 */
export function EntityRef({
  kind,
  label,
  id,
  title,
  className,
}: {
  kind: EntityKind;
  /** The reference as a human reads it. Becomes `data-verify-ref` and the text. */
  label: string;
  /**
   * The resolved **database** id, or `null` when the reference resolves to
   * nothing. Not the human reference string — see `entityHref`.
   */
  id: string | null;
  /** Extra explanation on hover. The dangling case supplies its own. */
  title?: string;
  className?: string;
}) {
  const href = id === null ? null : entityHref(kind, id);
  const known = href !== null;

  const token = (
    <span
      data-verify-unit="entity-ref"
      data-verify-kind={kind}
      data-verify-ref={label}
      data-verify-known={known ? "true" : "false"}
      {...(known ? {} : { "data-verify-treatment": "dangling" })}
      title={
        known
          ? title
          : (title ??
            `No ${ENTITY_LABEL[kind]} with that reference has been ingested. It is shown rather than hidden, and it is not a link: this reference parsed correctly and points at nothing.`)
      }
      className={cn(
        "ident inline-block rounded px-1 py-0.5 text-xs whitespace-nowrap",
        known
          ? "bg-muted/60 text-foreground/80"
          : cn(UNKNOWN_REF_TREATMENT, "border border-dashed font-semibold"),
        className,
      )}
    >
      {label}
    </span>
  );

  // FR-83, in one branch: the dangling reference is returned with no anchor
  // anywhere in the ancestry this component creates.
  if (!known) return token;

  return (
    <Link
      href={href}
      data-verify-unit="entity-link"
      className="rounded-sm underline-offset-2 hover:underline"
    >
      {token}
    </Link>
  );
}

/** One entry in an `EntityRefList`. The same three facts `EntityRef` needs. */
export type EntityRefItem = {
  kind: EntityKind;
  label: string;
  id: string | null;
  title?: string;
};

/**
 * A list of entity references, wrapping between tokens and never inside one.
 *
 * Mirrors `RefList` in `answer-chips.tsx`, including the part that matters: an
 * empty list renders as `Absent` with a **stated reason**, not as a blank cell.
 * A blank is indistinguishable from a list nobody rendered.
 */
export function EntityRefList({
  refs,
  empty,
}: {
  refs: readonly EntityRefItem[];
  empty: string;
}) {
  if (refs.length === 0) return <Absent title={empty} />;

  return (
    <span className="inline-flex flex-wrap gap-1">
      {refs.map((ref) => (
        <EntityRef
          key={`${ref.kind}:${ref.label}`}
          kind={ref.kind}
          label={ref.label}
          id={ref.id}
          title={ref.title}
        />
      ))}
    </span>
  );
}
