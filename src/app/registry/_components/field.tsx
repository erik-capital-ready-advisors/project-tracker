import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * A labelled field, at the density spec 5a asks for.
 *
 * FR-13 is the reason this exists as a component rather than as markup repeated
 * fourteen times: engagement and milestone records are the ONLY data Erik types,
 * so the hint under a field is the whole of the product's documentation for what
 * that field means. Every one of them is written to be read once and then never
 * again.
 *
 * A native `<label htmlFor>` rather than a Radix one. It does the same job here,
 * costs no dependency, and adds no file to `src/components/ui/` while another
 * unit is editing that tree.
 */

export function Fieldset({
  legend,
  detail,
  children,
  className,
}: {
  legend: string;
  detail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn("border-border rounded-lg border px-4 py-3.5", className)}
    >
      <legend className="px-1.5 text-xs font-semibold tracking-wide uppercase">
        {legend}
      </legend>
      {detail ? (
        <p className="text-muted-foreground mt-0.5 mb-3 max-w-prose text-xs">
          {detail}
        </p>
      ) : null}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type BaseProps = {
  name: string;
  label: string;
  hint?: ReactNode;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  /** Identifiers, refs, paths and dates render in mono with tabular figures. */
  mono?: boolean;
  /** Spans both columns of the enclosing `Fieldset` grid. */
  wide?: boolean;
  disabled?: boolean;
};

function Shell({
  name,
  label,
  hint,
  required,
  wide,
  children,
}: BaseProps & { children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <label htmlFor={name} className="text-xs font-medium">
        {label}
        {required ? (
          // `aria-hidden` because a label's text nodes concatenate into the
          // accessible name with no separator: without it every required field
          // in this product announces as "Client<no space>required". Observed
          // on the running app by u2 on run d4000f. Nothing is lost — every
          // call site that renders this word also passes `required` through to
          // the control, and the DOM `required` attribute is what assistive
          // technology reads the requirement from.
          <span aria-hidden className="text-muted-foreground ml-1 font-normal">
            required
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={`${name}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  type = "text",
  inputMode,
  ...props
}: BaseProps & {
  type?: "text" | "date" | "url";
  inputMode?: "text" | "decimal";
}) {
  const { name, hint, required, defaultValue, placeholder, mono, disabled } = props;
  return (
    <Shell {...props}>
      <Input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-describedby={hint ? `${name}-hint` : undefined}
        // FR-13 + §7a: these forms carry a client's name, contract terms and
        // provisioning identifiers. Nothing here is offered to the browser's
        // autofill store, and nothing here is a credential field the browser
        // should ever try to remember.
        autoComplete="off"
        className={cn("h-8 text-sm", mono && "ident")}
      />
    </Shell>
  );
}

export function TextField({
  rows = 2,
  ...props
}: BaseProps & { rows?: number }) {
  const { name, hint, required, defaultValue, placeholder, mono, disabled } = props;
  return (
    <Shell {...props}>
      <Textarea
        id={name}
        name={name}
        rows={rows}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-describedby={hint ? `${name}-hint` : undefined}
        autoComplete="off"
        className={cn("min-h-0 py-1.5 text-sm", mono && "ident")}
      />
    </Shell>
  );
}
