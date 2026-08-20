import type { ReactNode } from "react";

import { Absent } from "@/components/answer-chips";
import { Screen } from "@/components/screen";
import { ENTITY_LABEL, type EntityKind } from "@/lib/entity-routes";
import { cn } from "@/lib/utils";

/**
 * The caller stating, in so many words, that this entity carries no reference of
 * its own: a `hand`-mode work item has no `unit`, a blocker's `ref` is nullable,
 * an open question has no human key at all.
 *
 * It is a sentinel **object** and not the string `"none"` because TypeScript
 * reduces `string | "none"` to plain `string`. The literal is absorbed the
 * moment it is written: the union stops discriminating, an editor shows
 * `string | null`, and a reference that arrives from the database spelled `none`
 * — labels and milestone names are ingested text — would render as a claim about
 * the row instead of as the row's own reference. A stored value must never be
 * able to impersonate a control value; that is the same rule `unparsed` is.
 */
export const NO_IDENTIFIER = { reference: "none" } as const;

/**
 * Three arms, and the prop carrying this type is **required** (B34).
 *
 *   * `string` — the entity's own reference (`u4`, `FR-42`, `D-7`), in mono.
 *   * `NO_IDENTIFIER` — the caller stating the entity carries none. This is the
 *     ONLY value that produces "carries no reference of its own", so that claim
 *     can only ever be made on purpose.
 *   * `null` — a reference is expected here and could not be read or resolved.
 *
 * The last two are rendered differently on purpose, and it is the same
 * distinction `Prose` draws between `absent` and `unreadable` and the same one
 * `NOT_RECORDED` draws against `UNREADABLE_AMOUNT`: nothing was ever stored is a
 * different claim from something was stored and cannot be read.
 *
 * Before B34 this prop was `identifier?: string | null` and **omitting it
 * rendered the positive claim** "This <entity> carries no reference of its
 * own." — a falsehood about the row, produced by a caller who simply forgot,
 * with a green type-check. Omission is now a compile error.
 *
 * A blank or whitespace-only string is the `null` case, not the `NO_IDENTIFIER`
 * case. It rendered an invisible empty slot before B34, and it is evidence of a
 * reference that cannot be shown — never evidence that the row has none.
 *
 * ## Four views pass the same string as their `title`, and that is CORRECT
 *
 * `/releases/[id]`, `/requirements/[id]`, `/milestones/[id]` and `/waits/[id]`
 * pass `release.identifier`, `detail.ref`, `milestone.name` and `wait.label` —
 * the same values their titles are drawn from. B34's write-up reads that as a
 * workaround for the optional prop. It is not: those are the only human
 * references those four kinds have, and `labelEntities` uses the very same
 * columns wherever else in the product those rows are named. The row is
 * redundant with the heading above it; it is not a dodge, and **switching any of
 * them to `NO_IDENTIFIER` would manufacture the exact falsehood B34 exists to
 * prevent** — a release plainly labelled `v1.4.0` claiming to carry no
 * reference. If the duplication is worth removing, it is a display decision
 * about the identity row, not a change to what these views claim.
 */
export type EntityIdentifier = string | null | typeof NO_IDENTIFIER;

/**
 * FR-81's detail views share this shell, so eight of them are one design rather
 * than eight.
 *
 * ## What it is, visually
 *
 * The existing precedent is `src/app/registry/[slug]/page.tsx`, this product's
 * only detail page before M2.7, and this is that page's structure factored out:
 * `Screen` for the title, the question and the requirement refs; an identity row
 * carrying the entity's own reference in mono with the actions pushed right; and
 * bordered sections below it. Nothing here introduces a colour, a token or a
 * spacing idiom — §5a's design is NOT YET APPROVED and a detail view is not the
 * place to start spending an unapproved palette.
 *
 * ## FR-85 is satisfied structurally and is deliberately not re-implemented here
 *
 * "Every detail view reports the current `unparsed` count." `UnparsedCount` is
 * mounted in `AppShell`, which is mounted in the ROOT `src/app/layout.tsx`, and
 * there is no other `layout.tsx` in the tree — so every route, including a
 * `src/app/<x>/[id]/page.tsx`, renders inside it. That is what makes FR-85
 * structural instead of a rule eight views have to remember. **Do not add a
 * second count to a detail view**: two elements answering
 * `[data-verify-unit='unparsed-count']` is an ambiguous assertion at best and
 * two different numbers at worst.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="entity-detail"
 *   data-verify-kind   one of FR-81's eight kinds
 *   data-verify-unit="entity-identifier"
 *   data-verify-state  "unreadable"  (the one identifier state worth counting)
 */
export function EntityDetail({
  kind,
  title,
  question,
  requirements,
  identifier,
  actions,
  children,
}: {
  kind: EntityKind;
  /** The heading. A person's name for this row, not its uuid. */
  title: string;
  /** The question this view answers, in `Screen`'s voice. */
  question: string;
  requirements?: readonly string[];
  /**
   * The entity's own human reference. **Required** — see `EntityIdentifier`.
   */
  identifier: EntityIdentifier;
  /** Back and edit affordances, pushed to the end of the identity row. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen title={title} question={question} requirements={requirements}>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
        data-verify-unit="entity-detail"
        data-verify-kind={kind}
      >
        <Identifier kind={kind} identifier={identifier} />
        <span className="text-muted-foreground text-xs">{ENTITY_LABEL[kind]}</span>
        {actions === undefined ? null : (
          <div className="ml-auto flex gap-2">{actions}</div>
        )}
      </div>

      <div className="flex flex-col gap-4">{children}</div>
    </Screen>
  );
}

/**
 * The identity row's leading slot, in all three of `EntityIdentifier`'s arms.
 *
 * Order matters: the sentinel is checked first, because it is the only input
 * that licenses the "carries no reference" claim, and a blank string falls
 * through to `unreadable` rather than borrowing it.
 */
function Identifier({
  kind,
  identifier,
}: {
  kind: EntityKind;
  identifier: EntityIdentifier;
}) {
  if (typeof identifier === "object" && identifier !== null) {
    return <Absent title={`This ${ENTITY_LABEL[kind]} carries no reference of its own.`} />;
  }

  if (identifier !== null && identifier.trim() !== "") {
    return <span className="ident text-muted-foreground text-xs">{identifier}</span>;
  }

  // `renderProse`'s treatment for the same fact, in the same words: the
  // `blocked` family, stated, never blank. Reaching this branch with a blank
  // string is the B34 empty slot — visible now rather than invisible.
  return (
    <span
      data-verify-unit="entity-identifier"
      data-verify-state="unreadable"
      className="ident text-state-blocked text-xs font-semibold"
      title={`A reference is expected for this ${ENTITY_LABEL[kind]} and could not be read. This is a fault, not an absence: nothing here says the row carries no reference.`}
    >
      unreadable
    </span>
  );
}

/**
 * One bordered group inside a detail view.
 *
 * `verifyUnit` is a passthrough rather than a fixed value because FR-82 asserts
 * on the sections by name — `requirement-work-items`, `requirement-tests`,
 * `requirement-defects`, `requirement-releases` — and those names belong to the
 * view that owns them, not to this shell.
 */
export function DetailSection({
  heading,
  requirements,
  verifyUnit,
  children,
}: {
  heading: string;
  /** Requirement refs this section serves, in mono beside the heading. */
  requirements?: readonly string[];
  /** Becomes `data-verify-unit` when the section carries an assertion. */
  verifyUnit?: string;
  children: ReactNode;
}) {
  const headingId = `detail-section-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section
      className="border-border rounded-lg border"
      aria-labelledby={headingId}
      {...(verifyUnit === undefined ? {} : { "data-verify-unit": verifyUnit })}
    >
      <header className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h2 id={headingId} className="text-sm font-semibold">
          {heading}
        </h2>
        {requirements?.length ? (
          <span className="ident text-muted-foreground text-xs">
            {requirements.join(" · ")}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** The `<dl>` a run of `DetailField`s lives in. */
export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="divide-border divide-y">{children}</dl>;
}

/**
 * One label/value row.
 *
 * `absent` is required, and that is the whole discipline of this primitive: a
 * value that was never recorded renders as `Absent` carrying a stated reason,
 * never as a blank cell and never as `0`. A blank is indistinguishable from a
 * row nobody rendered, and `0` is a positive claim.
 */
export function DetailField({
  label,
  absent,
  mono,
  children,
}: {
  label: string;
  /** Why there is nothing here, shown on hover when `children` is absent. */
  absent: string;
  /** Identifiers, dates and durations are mono with tabular figures (§5a). */
  mono?: boolean;
  children?: ReactNode;
}) {
  const recorded = children !== undefined && children !== null && children !== "";

  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("min-w-0 text-xs", mono === true && "ident break-all")}>
        {recorded ? children : <Absent title={absent} />}
      </dd>
    </div>
  );
}
