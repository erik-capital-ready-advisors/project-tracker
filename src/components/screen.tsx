import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Every screen in the product shares this frame: the question it answers, the
 * requirement refs it serves, and a body.
 *
 * Requirement refs render in mono with tabular figures (`ident`) per spec 5a --
 * they are identifiers, read in columns and compared, not prose.
 */
export function Screen({
  title,
  question,
  requirements,
  children,
}: {
  title: string;
  question: string;
  requirements?: readonly string[];
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-6"
      data-verify-unit="screen"
      data-verify-screen={title}
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {requirements?.length ? (
            <span className="ident text-muted-foreground text-xs">
              {requirements.join(" · ")}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">{question}</p>
      </header>
      {children}
    </div>
  );
}

/**
 * The designed empty state. Spec 5a's aesthetic is an instrument panel, and an
 * instrument reading zero must look different from an instrument that is off --
 * so this states what the screen will show rather than only that it is empty.
 */
export function EmptyState({
  headline,
  detail,
  className,
}: {
  headline: string;
  detail: string;
  className?: string;
}) {
  return (
    <div
      data-verify-unit="empty-state"
      data-verify-empty="true"
      className={cn(
        "border-border text-muted-foreground rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-foreground text-sm font-medium">{headline}</p>
      <p className="mx-auto mt-1 max-w-md text-sm">{detail}</p>
    </div>
  );
}
