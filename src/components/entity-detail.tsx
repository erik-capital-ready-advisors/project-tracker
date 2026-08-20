import type { ReactNode } from "react";

import { Absent } from "@/components/answer-chips";
import { Screen } from "@/components/screen";
import { ENTITY_LABEL, type EntityKind } from "@/lib/entity-routes";
import { cn } from "@/lib/utils";

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
   * The entity's own human reference (`u4`, `FR-42`, `D-7`), in mono. `null`
   * when the entity carries none — stated as absent, never rendered blank.
   */
  identifier?: string | null;
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
        {identifier === null || identifier === undefined ? (
          <Absent title={`This ${ENTITY_LABEL[kind]} carries no reference of its own.`} />
        ) : (
          <span className="ident text-muted-foreground text-xs">{identifier}</span>
        )}
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
