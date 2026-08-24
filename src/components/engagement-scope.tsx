"use client";

import { Filter } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { UnparsedCount } from "@/components/unparsed-count";
import {
  ENGAGEMENT_PARAM,
  engagementFilterFrom,
  engagementFilterSlug,
  isEngagementFilterable,
  preservedEngagementParams,
} from "@/lib/engagement-filter";
import type { EngagementRoster } from "@/lib/engagement-roster";

/**
 * FR-96a and FR-96b — the engagement filter's control and the badge that says
 * what it did not narrow, side by side in the app shell's header.
 *
 * ## Why the two are one component
 *
 * They read the same fact. FR-96b puts one picker in the chrome instead of
 * eleven copies on eleven screens, and FR-96a makes the unparsed count state
 * its scope **when a filter is active** — so both need to know whether one is.
 * Splitting them would mean two client boundaries subscribing to the same URL
 * and two chances for them to disagree about whether the screen is filtered,
 * which is the disagreement FR-96a exists to prevent.
 *
 * ## Why this is a Client Component when nothing else in the shell needs to be
 *
 * The filter's entire state is the URL, and **a Server Component in the root
 * layout cannot read it.** A layout receives no `searchParams` prop, and it is
 * not re-executed on a client-side navigation, so anything it derived about the
 * current URL would be correct on the first load and quietly wrong from the
 * second onwards — a picker showing the previous screen's engagement. A Client
 * Component's `useSearchParams()` is backed by router context that updates on
 * every navigation, and on a dynamically rendered route (this app's root layout
 * awaits `headers()`, so every route is dynamic) it is already populated during
 * SSR. So the markup below is correct in the first byte of HTML, before any
 * JavaScript runs.
 *
 * ## Why it is a GET form and not a router push
 *
 * `answer-filter-bar.tsx` made this argument for the six answer screens and it
 * holds here: the CSP carries `upgrade-insecure-requests`, and a browser that
 * applies it to a local HTTP origin gets no client bundle at all. A native
 * `<select>` inside a `<form method="get">` navigates with no JavaScript, the
 * back button steps through filter changes correctly, and the filtered view is
 * a link — which is FR-96's own stated point.
 *
 * A bare GET form REPLACES the query string with its own fields, so every other
 * parameter is re-emitted as a hidden input. Without them, choosing an
 * engagement on `/broken?severity=critical` would silently widen the list back
 * to every severity — the same shape of failure as a widened regex.
 *
 * ## State contract for qa-reviewer
 *
 *   data-verify-unit="engagement-picker"
 *   data-verify-filter="<slug>" | "none"   what the URL selected
 *   data-verify-roster="ok" | "unavailable"  whether the client list was read
 *   data-verify-options="<n>"              active engagements offered
 *
 * The badge's own contract is unchanged and documented on `UnparsedCount`;
 * FR-96a adds `data-verify-scope`.
 *
 * **No value from this control is persisted anywhere.** CR-005 §3.3 point 3:
 * no cookie, no session storage, no remembered last filter. The URL is the
 * entire state, because a filter that persisted invisibly would mean two
 * operators on one URL see different data.
 */
export function EngagementScope({
  unparsedCount,
  roster,
}: {
  /** `null` means the count was not read. Never renders as 0 — see `UnparsedCount`. */
  unparsedCount: number | null;
  /** Active engagements, or the fact that they could not be read. */
  roster: EngagementRoster;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * A filter is active only where the screen below honours it.
   *
   * `?engagement=acme` sitting on a detail view narrows nothing — CR-005 §3.3
   * point 1 keeps `[id]` views out, because a detail view already is one record.
   * Labelling the badge "(whole ledger)" there would announce a scope that is
   * not in force, and offering the picker there would let Erik set one that
   * does nothing. Both are the same lie in opposite directions.
   */
  const filterable = isEngagementFilterable(pathname);
  const slug = filterable
    ? engagementFilterSlug(engagementFilterFrom(searchParams))
    : null;

  return (
    <>
      {filterable ? (
        <EngagementPicker
          pathname={pathname}
          searchParams={searchParams}
          slug={slug}
          roster={roster}
        />
      ) : null}

      {/* FR-58: stated on every surface, because the shell wraps them all.
          FR-96a: ledger-wide always, and it says so when a filter is on. */}
      <UnparsedCount
        count={unparsedCount}
        scope={slug === null ? "none" : "whole-ledger"}
      />
    </>
  );
}

function EngagementPicker({
  pathname,
  searchParams,
  slug,
  roster,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  slug: string | null;
  roster: EngagementRoster;
}) {
  const options = roster.status === "ok" ? roster.options : [];
  const known = options.some((one) => one.slug === slug);

  /**
   * A control that cannot change anything is not rendered.
   *
   * `gated` is the case that made this rule explicit rather than incidental.
   * Served and looked at, an anonymous request to any of the eleven screens
   * rendered a dropdown whose only entry was "every engagement", above the
   * operator gate panel, on every route — a control offering a choice to
   * someone who may not read a single row.
   *
   * The other two states reach the same test honestly: a fresh deployment has
   * `ok` with no engagements and nothing to filter by, and a failed read with
   * no filter already in the URL has nothing to preserve. The moment there IS
   * something to offer or something to clear, the picker renders — including
   * under a failed read, which must never strand a filter in the URL with no
   * way out.
   */
  if (options.length === 0 && slug === null) return null;

  return (
    <form
      method="get"
      // Explicit rather than omitted: an `action`-less GET form submits to the
      // current URL, which is the same path but drags the old query string's
      // semantics along in ways that differ between browsers on edge cases.
      action={pathname}
      data-verify-unit="engagement-picker"
      data-verify-filter={slug ?? "none"}
      data-verify-roster={roster.status}
      data-verify-options={options.length}
      /*
       * Progressive enhancement, and the emphasis is on *enhancement*: a
       * `<select>` always submits its name, so clearing the filter without
       * JavaScript lands on `?engagement=`. That is handled correctly
       * everywhere in this product -- `engagementFilterFrom` and both existing
       * screen parsers read an empty value as "no filter" -- but it is not the
       * clean link FR-96 promises, and the six *endpoints* refuse an empty
       * parameter outright (`optionalText` in the answers' filter parser), so a
       * screen URL pasted at an endpoint would 400 on a filter nobody set.
       *
       * Dropping the field's name when it is empty makes the cleared URL the
       * bare path. With JavaScript off this handler never runs and the form
       * still submits and still clears -- which is why it is written as a
       * tidy-up rather than as the mechanism.
       */
      onSubmit={(event) => {
        const select = event.currentTarget.elements.namedItem(
          ENGAGEMENT_PARAM,
        );
        if (select instanceof HTMLSelectElement && select.value === "") {
          select.removeAttribute("name");
        }
      }}
      className="flex min-w-0 items-center gap-1"
    >
      {/*
        Every other filter on the screen below, carried across. A GET form
        replaces the whole query string with its own fields, so anything not
        re-emitted here is silently dropped — and a picker that reset
        `?severity=critical` on its way past would widen the list while looking
        like it narrowed it. `page` is deliberately NOT among them: changing the
        filter returns to page one, because staying on page seven of a list that
        just got shorter renders an empty page that reads like an empty ledger.
      */}
      {preservedEngagementParams(searchParams).map(([key, value], index) => (
        <input
          key={`${key}:${index}`}
          type="hidden"
          name={key}
          value={value}
        />
      ))}

      <NativeSelect
        name={ENGAGEMENT_PARAM}
        defaultValue={slug ?? ""}
        // No visible label: the header is read in ten-second glances and the
        // options say what they are. The accessible name carries the whole
        // sentence, including the fact that the unparsed badge beside it is not
        // affected.
        aria-label="Filter every list by engagement. The unparsed count beside this stays ledger-wide."
        title={
          roster.status === "unavailable"
            ? "The engagement list could not be read, so only the filter already in the URL is offered."
            : "Filter every list by engagement. The unparsed count stays ledger-wide."
        }
        className="ident h-7 w-36 text-xs"
      >
        {/* One wording for one concept: `answer-filter-bar` already spells the
            unfiltered case "every engagement", and a second phrasing here would
            let the shell picker and the six answer screens disagree about what
            the default view is called. Lowercase fragment, no full stop — this
            product's convention for a control label as against a statement. */}
        <option value="">every engagement</option>

        {options.map((one) => (
          <option key={one.slug} value={one.slug}>
            {one.clientName}
          </option>
        ))}

        {/*
          The URL names an engagement the active list does not carry. Two ways
          that happens and both must stay selectable rather than being snapped
          back to "every engagement":

            * it is archived-but-not-purged, and CR-005 §3.3 point 2 says the
              permalink still resolves and still filters — the picker lists
              active engagements, it does not invalidate the others;
            * it matches nothing at all, and FR-96c requires the screen below to
              say so with no rows. Silently resetting the control to "every
              engagement" while the list renders scoped-and-empty would make the
              chrome and the screen disagree about what is being shown.
        */}
        {slug !== null && !known ? (
          // A fact about the LIST, not a claim about the ledger — because the
          // picker cannot tell the two cases above apart. "not active" would
          // assert archived; "no such engagement" is FR-96c's sentence and
          // belongs to the screen below, which did the lookup. The slug leads so
          // that a native select truncating the option still shows it.
          <option value={slug}>{slug} — not in the active list</option>
        ) : null}
      </NativeSelect>

      <Button type="submit" size="icon-sm" variant="outline">
        <Filter aria-hidden />
        {/* The icon carries no name, so this is the button's whole accessible
            name. Verb first, and it names the ACT of applying rather than
            repeating the select's own label two elements away. */}
        <span className="sr-only">Apply the engagement filter</span>
      </Button>
    </form>
  );
}
