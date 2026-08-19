import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The frame the three authentication screens share.
 *
 * Deliberately narrow and centred: these are the only screens in the product
 * that ask for input before showing anything, and spec 5a's instrument-panel
 * density is the wrong register for a credential prompt. Everything else in the
 * product is read in ten-second glances; this is read once and typed into.
 *
 * It still renders inside the app shell, because the root layout wraps every
 * route and belongs to another work unit. That is a **layout decision Erik has
 * not reviewed** and is listed as such in the report: an operator who is not
 * signed in still sees the navigation rail. It leaks nothing — every screen
 * behind it refuses independently — but it is not obviously the right look.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      data-verify-unit="auth-shell"
      data-verify-screen={title}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 py-8"
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      {children}
      {footer === undefined ? null : (
        <div className="text-muted-foreground text-xs">{footer}</div>
      )}
    </div>
  );
}

/**
 * A refusal from the authentication path.
 *
 * `role="alert"` rather than `<output>`: this interrupts, where a status
 * politely waits. The messages it carries come from GoTrue and are already
 * written for an end user; nothing here quotes a query or a table.
 */
export function AuthError({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      data-verify-unit="auth-error"
      className={cn("text-state-blocked text-sm", className)}
    >
      {message}
    </p>
  );
}
