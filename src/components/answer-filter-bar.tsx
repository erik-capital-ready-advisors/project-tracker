import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/native-select";
import { DEFAULT_LIMIT, LIMITS, PARAM } from "@/lib/answer-query";

/**
 * The filter bar the six answer screens share.
 *
 * ## It is a plain GET form, and that is a decision worth naming
 *
 * No client component, no router push, no local state. The controls submit to
 * the screen's own path and the Server Component re-renders from the URL. What
 * that buys, in the order it matters here:
 *
 *   * a filtered answer is a link Erik can paste into a note or a client email;
 *   * the back button steps through filter changes correctly;
 *   * **the screen works before JavaScript loads**, which is not hypothetical on
 *     this branch — the CSP carries `upgrade-insecure-requests`, and any browser
 *     that applies it to a local HTTP origin gets no client bundle at all. A
 *     dashboard whose promise is an answer in under thirty seconds cannot have
 *     its filters wait on hydration.
 *
 * u4 established this shape on `/work-items`. It is reused rather than
 * reinvented, so the two surfaces behave identically.
 */
export function AnswerFilterBar({
  action,
  filtered,
  children,
}: {
  /** The screen's own path. The form posts back to where it already is. */
  action: string;
  /** Whether any filter narrows the answer, so the Clear link can appear. */
  filtered: boolean;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      data-verify-unit="answer-filters"
      data-verify-filtered={filtered ? "true" : "false"}
      className="border-border bg-muted/30 flex flex-wrap items-end gap-x-3 gap-y-3 rounded-lg border px-3 py-3"
    >
      {children}

      <div className="ml-auto flex items-center gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {filtered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={action} data-verify-unit="clear-filters">
              Clear
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The engagement slug, on every one of the six screens.
 *
 * Free text rather than a dropdown of known slugs, and that is a real trade:
 * a dropdown could not be built without a second read that every screen would
 * pay for, and a slug that matches nothing is already distinguished from an
 * engagement with no rows by `engagementUnknown` on the payload. So a typo
 * produces a named "no engagement has this slug" notice rather than a silently
 * empty answer, which is the failure a free-text field would otherwise invite.
 */
export function EngagementFilter({ value }: { value: string | null }) {
  return (
    <Field id="filter-engagement" label="Engagement" className="w-44">
      <Input
        id="filter-engagement"
        name={PARAM.engagement}
        defaultValue={value ?? ""}
        placeholder="every engagement"
        autoComplete="off"
        spellCheck={false}
        className="ident"
      />
    </Field>
  );
}

/**
 * How many rows to show.
 *
 * Offered as a closed set whose largest member sits under the endpoint's own
 * `MAX_LIMIT`, so a screen cannot build a URL the API would refuse. It is not a
 * filter — it changes how much of the answer is shown, not which rows qualify —
 * and the screens say so by never counting it in `filtered`.
 */
export function LimitFilter({ value }: { value: number }) {
  return (
    <Field id="filter-limit" label="Rows" className="w-24">
      <NativeSelect
        id="filter-limit"
        name={PARAM.limit}
        defaultValue={String(value === DEFAULT_LIMIT ? DEFAULT_LIMIT : value)}
        className="ident"
      >
        {LIMITS.map((limit) => (
          <option key={limit} value={limit}>
            {limit}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/**
 * A closed-set dropdown whose "any" option carries the empty string.
 *
 * The empty value is what makes clearing one filter possible without clearing
 * them all: an empty parameter is dropped by the parser rather than rejected,
 * and every other value in the list is one the endpoint's own parser accepts.
 */
export function ChoiceFilter({
  id,
  label,
  name,
  value,
  options,
  width = "w-32",
}: {
  id: string;
  label: string;
  name: string;
  value: string | null;
  options: readonly string[];
  width?: string;
}) {
  return (
    <Field id={id} label={label} className={width}>
      <NativeSelect
        id={id}
        name={name}
        defaultValue={value ?? ""}
        className="ident"
      >
        <option value="">any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
