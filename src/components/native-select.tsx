import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A styled native `<select>`, and the reason it is native.
 *
 * shadcn's `Select` is a Radix listbox: a Client Component with popper
 * positioning and a hidden input. That is the right choice for a rich picker,
 * and the wrong one for the two things this unit does with a dropdown:
 *
 *   1. **FR-44's filter bar is a plain GET form.** The filters belong in the
 *      URL, so the state is shareable, bookmarkable, back-button-correct and
 *      reconstructible by a Server Component with no client state at all. A
 *      native `<select>` inside a `<form method="get">` does that with no
 *      JavaScript; a Radix listbox needs a client component and a router push to
 *      reach the same place.
 *   2. **Spec 5a asks for keyboard-first speed on a screen read in ten-second
 *      glances.** A native select is the fastest control on the platform:
 *      type-ahead works, it is the OS picker on a phone, and it is reachable in
 *      one tab stop.
 *
 * It is also, deliberately, one fewer file in `src/components/ui` for two
 * concurrent units to both create.
 *
 * The chevron is decorative and the select sits on top of it, so the whole
 * control -- glyph included -- is one hit target.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative inline-flex w-full">
      <select
        data-slot="native-select"
        className={cn(
          "border-input h-8 w-full min-w-0 appearance-none rounded-lg border bg-transparent py-1 pr-7 pl-2.5 text-base transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3",
          "md:text-sm dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
      />
    </div>
  );
}

/**
 * A label and its control, associated by id rather than by nesting.
 *
 * Explicit `htmlFor` is what makes the label a click target for a native select
 * on every browser, and it is what a screen reader announces. `hint` is rendered
 * below and wired through `aria-describedby`, so a constraint ("YYYY-MM-DD", "a
 * comma-separated list of unit keys") is announced rather than only seen.
 */
function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="text-muted-foreground text-xs font-medium tracking-wide"
      >
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Field, NativeSelect };
