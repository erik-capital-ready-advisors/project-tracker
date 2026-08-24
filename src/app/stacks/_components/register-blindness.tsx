import type { ReactNode } from "react";

import type { RegisterBlindness, RegisterState } from "@/lib/stacks-load";
import { cn } from "@/lib/utils";

/**
 * FR-108 — **the register reports its own blindness**, and this is not a footer.
 *
 * ## Why this sits above the table and not beneath it
 *
 * FR-108 is the requirement on this screen most likely to be built as
 * decoration, and it is not decoration: the register's first honest answer on
 * this ledger is *"nothing has earned anything, and here is how little I have
 * seen"*. Half of the sessions in the ledger carry no stack at all. A screen
 * that renders one composed table row and tucks that fact into a footnote has
 * told Erik the register is a register, when what it actually is today is one
 * observation and one blind spot of equal size.
 *
 * So the figures are tiles at the top of the screen, sized to be read in the
 * ten-second glance spec 5a designs for, and the largest of them is the one
 * counting what the register could **not** place.
 *
 * ## Nothing is dropped from a denominator
 *
 * `sessionsTotal = sessionsWithStack + sessionsWithoutStack`, and
 * `sessionsWithStack = Σ row.sessions + sessionsOnUnknownStack`. Both identities
 * hold by construction in `@/lib/server/stacks/list.ts` and are asserted there.
 * Every one of those five figures is rendered here, including the two that are
 * unreachable today, because a figure that only appears once it is non-zero is a
 * figure nobody has ever seen work.
 *
 * ## Colour discipline
 *
 * One hue is spent on this screen — `state-carried`, borrowed for FR-107's
 * actionable set — and it appears here only on the actionable tile, and only
 * when that tile is non-zero. Everything else rides the neutral ladder. A
 * denominator hole is not a state on spec 5a's scale; it is a number, and
 * painting it would spend a token that has a meaning everywhere else in the
 * product.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="register-blindness"  data-verify-state
 *   data-verify-unit="blindness-figure"    data-verify-figure=<key>,
 *                                           data-verify-value=<number>
 *   data-verify-unit="blindness-headline"  data-verify-sessions-without-stack,
 *                                           data-verify-sessions-total
 *   data-verify-unit="nothing-earned"      (rendered only while stacksEarned is 0)
 */

/** A figure and what it is a figure of. The number is never bare. */
function Figure({
  figure,
  value,
  label,
  detail,
  emphasis = "normal",
}: {
  figure: string;
  value: number;
  label: string;
  detail: string;
  emphasis?: "normal" | "headline" | "actionable";
}) {
  return (
    <div
      data-verify-unit="blindness-figure"
      data-verify-figure={figure}
      data-verify-value={value}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md border px-3 py-2",
        emphasis === "headline"
          ? "border-foreground/40 bg-muted"
          : emphasis === "actionable"
            ? "border-state-carried/50 bg-state-carried/10"
            : "border-border bg-transparent",
      )}
    >
      <span
        className={cn(
          "ident leading-none font-semibold tabular-nums",
          emphasis === "headline"
            ? "text-foreground text-2xl"
            : emphasis === "actionable"
              ? "text-state-carried text-xl"
              : "text-foreground/90 text-xl",
        )}
      >
        {value}
      </span>
      <span className="text-foreground/80 text-xs font-medium">{label}</span>
      <span className="text-muted-foreground text-xs">{detail}</span>
    </div>
  );
}

/** `x of y` as a percentage, or `null` when there is no denominator to divide by. */
function share(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

export function RegisterBlindnessPanel({
  blindness,
  state,
  children,
}: {
  blindness: RegisterBlindness;
  state: RegisterState;
  /** The Q25 claim, rendered by the page so it stays beside the hours it governs. */
  children?: ReactNode;
}) {
  const blindShare = share(blindness.sessionsWithoutStack, blindness.sessionsTotal);

  return (
    <section
      data-verify-unit="register-blindness"
      data-verify-state={state}
      aria-labelledby="register-blindness-heading"
      className="border-border flex flex-col gap-3 rounded-lg border px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="register-blindness-heading"
          className="text-foreground text-sm font-semibold"
        >
          What this register has, and what it has not seen
        </h2>

        <p
          data-verify-unit="blindness-headline"
          data-verify-sessions-without-stack={blindness.sessionsWithoutStack}
          data-verify-sessions-total={blindness.sessionsTotal}
          className="text-foreground max-w-3xl text-sm"
        >
          {blindness.sessionsWithoutStack === 0 ? (
            <>
              Every one of the {blindness.sessionsTotal} sessions the ledger
              holds names a stack, so nothing below is missing from the
              denominator.
            </>
          ) : (
            <>
              <strong className="ident font-semibold">
                {blindness.sessionsWithoutStack} of {blindness.sessionsTotal}
              </strong>{" "}
              sessions in the ledger name no stack at all
              {blindShare === null ? null : (
                <>
                  {" "}
                  &mdash; <span className="ident">{blindShare}</span> of
                  everything captured
                </>
              )}
              . Those sessions are counted here and are still in the total; they
              contribute to no row in the table below, and no figure on this
              screen quietly drops them.
            </>
          )}
        </p>
      </div>

      {children}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Figure
          figure="sessions-total"
          value={blindness.sessionsTotal}
          label="sessions counted"
          detail="Every work_session row, unfiltered — all Mode 2 capture."
        />
        <Figure
          figure="sessions-without-stack"
          value={blindness.sessionsWithoutStack}
          label="name no stack"
          detail="Seen, counted, attributable to nothing."
          emphasis="headline"
        />
        <Figure
          figure="sessions-with-stack"
          value={blindness.sessionsWithStack}
          label="name a stack"
          detail="The only sessions the table below is built from."
        />
        <Figure
          figure="sessions-without-duration"
          value={blindness.sessionsWithoutDuration}
          label="recorded no duration"
          detail="Hours understate by exactly these sessions."
        />
        <Figure
          figure="sessions-on-unknown-stack"
          value={blindness.sessionsOnUnknownStack}
          label="name a stack with no row"
          detail="Held out of the rows rather than assumed away."
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure
          figure="stacks-total"
          value={blindness.stacksTotal}
          label="stacks observed"
          detail="Every stack the ledger has ever recorded."
        />
        <Figure
          figure="stacks-covered"
          value={blindness.stacksCovered}
          label="have an agent named"
          detail="Set by the operator; never inferred (FR-109)."
        />
        <Figure
          figure="stacks-earned"
          value={blindness.stacksEarned}
          label="have earned a specialist"
          detail="Clause 1 fired. Clause 2 was never evaluated."
        />
        <Figure
          figure="stacks-actionable"
          value={blindness.stacksActionable}
          label="are actionable"
          detail="Earned, and nobody has named an agent (FR-107)."
          emphasis={blindness.stacksActionable > 0 ? "actionable" : "normal"}
        />
      </div>

      {/*
        Rendered only while it is true, and it retires itself the day a stack
        crosses clause 1. A caveat written as permanent copy becomes a false
        statement the moment the data changes, and nobody goes back to delete it.

        The sentence is deliberately narrower than "no stack has earned a
        specialist": clause 2 has never run, so the product cannot make the
        wider claim. Q27, and `i1`'s `TriggerOutcome` for the same reason.
      */}
      {blindness.stacksEarned === 0 ? (
        <p
          data-verify-unit="nothing-earned"
          className="text-muted-foreground border-border border-t pt-2 text-xs"
        >
          No stack has earned a specialist on clause 1, the only clause this
          register evaluates. That is an answer the register reached by looking,
          and it is a different claim from a register with nothing in it.
        </p>
      ) : null}
    </section>
  );
}
