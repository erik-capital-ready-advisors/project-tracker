import Link from "next/link";
import { KeyRound, ShieldAlert, TriangleAlert, UserRoundX } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What a screen renders when it could NOT read its data.
 *
 * ## Why this is not an empty state
 *
 * `EmptyState` in `@/components/screen` says "there is nothing here", which is a
 * positive claim about the data. This component says "I could not look", which
 * is a claim about the *reading*. Collapsing the two is the display-layer form
 * of the failure this product exists to prevent -- a screen that renders "No
 * work items recorded." because the operator is not signed in has reported a
 * clean ledger without checking one.
 *
 * The same rule `@/lib/unparsed-display` applies to a count, applied to a whole
 * screen: unknown is a third state, and it never renders as zero.
 *
 * ## The four reasons are distinguished on purpose
 *
 * `requireOperator()` refuses for four different causes and the operator has to
 * do a different thing in each. None of these distinctions is available to an
 * anonymous attacker -- you must already hold a valid session to see any of them
 * beyond `sign-in` -- so distinguishing them leaks nothing.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="load-notice"
 *   data-verify-reason="sign-in" | "mfa" | "no-role" | "error"
 *   data-verify-screen="<screen the notice replaced>"
 */

export type LoadNoticeReason = "sign-in" | "mfa" | "no-role" | "error";

const ICON = {
  "sign-in": KeyRound,
  mfa: ShieldAlert,
  "no-role": UserRoundX,
  error: TriangleAlert,
} as const;

const HEADLINE: Record<LoadNoticeReason, string> = {
  // COPY: sign-in notice headline
  "sign-in": "Sign in to read this screen.",
  // COPY: second-factor notice headline
  mfa: "A second factor is required.",
  // COPY: no-role notice headline
  "no-role": "This account holds no role in the ledger.",
  // COPY: read-failure notice headline
  error: "This screen could not be read.",
};

export function OperatorLoadNotice({
  reason,
  detail,
  screen,
  className,
}: {
  reason: LoadNoticeReason;
  /**
   * The refusal's own sentence. `ApiError` messages are written for the caller
   * and carry no mechanism, so they are safe to show verbatim; anything else is
   * replaced by the caller before it reaches here.
   */
  detail: string;
  /** The screen this notice stands in for, so a reader knows what is missing. */
  screen: string;
  className?: string;
}) {
  const Icon = ICON[reason];

  return (
    // `<output>` rather than a div with `role="status"`: its implicit ARIA role
    // is `status`, so the notice is announced without an explicit attribute.
    <output
      data-verify-unit="load-notice"
      data-verify-reason={reason}
      data-verify-screen={screen}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm",
        reason === "error"
          ? "border-state-blocked/40 bg-state-blocked/5"
          : "border-border bg-muted/40",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          reason === "error" ? "text-state-blocked" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p className="text-foreground font-medium">{HEADLINE[reason]}</p>
        <p className="text-muted-foreground mt-0.5">{detail}</p>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {/* COPY: the standing clarification that a failed read is not an empty ledger */}
          Nothing was read, so nothing on this screen is a statement about what
          the ledger holds.
        </p>

        {/*
          Both authentication refusals link to `/sign-in` and neither links
          deeper. That screen reads the session's assurance levels and forwards
          to the password, verify or enrolment step itself, so there is one
          entry point and one place where the routing rule lives -- and a notice
          rendered from stale state cannot send anyone to the wrong step.

          `no-role` and `error` get no link on purpose: neither is fixable from
          inside the application, and a button that cannot help is worse than
          none.
        */}
        {reason === "sign-in" || reason === "mfa" ? (
          <Link
            href="/sign-in"
            data-verify-unit="load-notice-action"
            className="text-foreground mt-2 inline-block text-xs underline underline-offset-2"
          >
            {/* COPY: the link out of an authentication refusal */}
            Go to sign-in
          </Link>
        ) : null}
      </div>
    </output>
  );
}
