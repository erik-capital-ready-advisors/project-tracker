import Link from "next/link";

import { EngagementScopeNotice } from "@/components/engagement-scope-notice";
import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Button } from "@/components/ui/button";
import {
  engagementScopeBlocksRows,
  resolveEngagementSlug,
} from "@/lib/engagement-resolve";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { isoToday } from "@/lib/today";
import { loadForOperator } from "@/lib/operator-load";

import { WorkItemFilterBar } from "./_components/filter-bar";
import { ListingUnparsed } from "./_components/listing-unparsed";
import { WorkItemTable } from "./_components/work-item-table";
import { WorkItemTabs } from "./_components/work-item-tabs";
import { readWorkItems } from "./_lib/load";
import { PAGE_SIZE, parseWorkItemQuery, withParams } from "./_lib/query";
import type { SearchParams } from "./_lib/query";

const NAV = OPERATOR_ROUTES[1];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-44 -- work items listed, filtered and sorted across every engagement in
 * one view.
 *
 * **This is the screen the product exists for.** From `CLAUDE.md`: the three
 * execution modes "share one `work_item` table, one set of views, and one set of
 * screens. Splitting them yields three lists Erik has to merge in his head,
 * which is the state this product exists to end." So there is one table on this
 * page, mode is a column and a filter, and there is no tab strip separating
 * fleet work from hand work from external work.
 *
 * Three things this page refuses to do, each of them the easy version of a rule:
 *
 *   * It does not render an empty state when the read failed. `loadForOperator`
 *     returns a failure that renders as a failure -- "No work items recorded."
 *     after a refused query is a clean-ledger claim nobody checked.
 *   * It does not silently ignore a filter value it could not parse. Rejected
 *     values are named above the table, because a screen that quietly drops
 *     `?executor=bob` shows more rows than were asked for while looking like it
 *     answered the question.
 *   * It does not report `0 unparsed` when it has no listing. The count comes
 *     from the listing when there is one and is `null` otherwise, and `null`
 *     renders "unavailable".
 *
 * ## FR-96c -- a fourth refusal, added in M2.9
 *
 * This screen has filtered by engagement slug since M2.7, and until now a slug
 * naming nothing produced "No work items match these filters." That sentence is
 * true and it is not the answer: an engagement with no work items and an
 * engagement that does not exist render byte-identically under it, and only one
 * of them means Erik mistyped a slug. So the slug is resolved before the listing
 * is read, and an unresolvable one renders FR-96c's explicit state with **no
 * rows** rather than an empty-looking scoped list.
 */
export default async function WorkItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseWorkItemQuery(await searchParams);

  // Resolved INSIDE the load wrapper, so a gated visitor gets one refusal from
  // the machinery that owns it rather than a sign-in notice and an engagement
  // notice about the same missing session. See `@/lib/engagement-resolve`.
  const result = await loadForOperator(async () => {
    const scope = await resolveEngagementSlug(query.engagementSlug);
    return {
      scope,
      listing: engagementScopeBlocksRows(scope)
        ? null
        : await readWorkItems(query),
    };
  });

  const scope = result.ok ? result.data.scope : null;
  const listing = result.ok ? result.data.listing : null;
  const items = listing?.items ?? [];

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={[...NAV.requirements, "FR-30", "FR-43"]}
    >
      {/* FR-88's hand-entry path is reached from the listing it belongs to,
          exactly as /registry/new is reached from /registry. It is not a nav
          entry: a creation form is not one of the product's surfaces, it is a
          thing you do to one. */}
      <div className="flex flex-wrap items-center gap-3">
        <WorkItemTabs active="list" />
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <Link href="/work-items/new" data-verify-unit="planned-work-new-link">
            Plan work item
          </Link>
        </Button>
      </div>

      <WorkItemFilterBar query={query} />

      {query.rejected.length > 0 ? (
        // Amber, not fuchsia. Fuchsia is reserved **exclusively** for
        // `unparsed`, and Erik approved that reservation. A filter value the
        // system did not recognise is close enough to that idea to be tempting
        // -- it is the system saying it could not classify an input -- but
        // `unparsed` in this product means a *record* the classifier could not
        // place, and borrowing the colour for a second meaning is how a scale
        // stops meaning one thing. This was painted fuchsia until the running
        // app was looked at. Queued for Erik.
        <output
          data-verify-unit="rejected-filters"
          data-verify-count={query.rejected.length}
          className="border-state-carried/40 bg-state-carried/5 block rounded-lg border px-3 py-2.5 text-sm"
        >
          <p className="text-foreground font-medium">
            These filter values were not recognised.
          </p>
          <ul className="text-muted-foreground mt-1 space-y-0.5">
            {query.rejected.map((rejected) => (
              <li key={`${rejected.field}:${rejected.value}`} className="ident text-xs">
                {rejected.field}={rejected.value}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1.5 text-xs">
            The list below is not narrowed by them, so it is showing more rows
            than the filters name. Dropping them without saying so would present an
            unfiltered list as a filtered one.
          </p>
        </output>
      ) : null}

      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {/* FR-96c. Renders only for the two unresolvable states, and the same
          `engagementScopeBlocksRows` that produced `listing === null` above is
          what guarantees there is nothing beneath it. */}
      {scope === null ? null : <EngagementScopeNotice resolution={scope} />}

      {listing === null ? null : items.length === 0 ? (
        <EmptyState
          headline={
            query.filtered
              ? "No work items match these filters."
              : "No work items recorded."
          }
          detail={
            query.filtered
              ? "The read succeeded and returned nothing. Clear the filters to see the whole ledger."
              : "Every work item across every engagement appears here in one list, whether it came from the fleet, a hand-prompted session, or an external wait."
          }
        />
      ) : (
        <>
          <div
            data-verify-unit="work-item-summary"
            data-verify-rows={items.length}
            data-verify-erik-gate={listing.erikGateCount}
            data-verify-truncated={listing.truncated ? "true" : "false"}
            className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          >
            <span className="ident">
              {items.length} on this page
            </span>

            {/* FR-58 for the rows on screen. It sits in this strip rather than
                up beside the shell's global badge, because side by side the two
                read as one duplicated warning -- observed on the running app,
                where both said "unavailable" in the same colour a few
                centimetres apart. Here it reads as a fact about these rows,
                which is what it is. It renders only when there ARE rows: no
                listing means nothing to report about one, and the shell's badge
                already states the ledger-wide count. */}
            <ListingUnparsed count={listing.unparsedOnPage} />

            {/* FR-40: an `erik_gate` is a first-class executor kind, so the
                count of them is stated on the list rather than left to be
                counted by eye. */}
            <Link
              href="/bottleneck"
              data-verify-unit="erik-gate-count"
              className="hover:text-foreground underline underline-offset-2"
            >
              <span className="ident">{listing.erikGateCount}</span>
              {" only Erik can do"}
            </Link>

            {listing.truncated ? (
              <span className="text-state-carried">
                This page is full, so there may be more.
              </span>
            ) : null}
          </div>

          <WorkItemTable items={items} query={query} asOf={isoToday()} />

          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground ident text-xs">
              page {query.page}
            </div>
            <div className="flex items-center gap-2">
              <Button
                asChild={query.page > 1}
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
              >
                {query.page > 1 ? (
                  <Link
                    href={withParams(query, { page: query.page - 1 })}
                    data-verify-unit="page-previous"
                  >
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button
                asChild={items.length === PAGE_SIZE}
                variant="outline"
                size="sm"
                disabled={items.length < PAGE_SIZE}
              >
                {items.length === PAGE_SIZE ? (
                  <Link
                    href={withParams(query, { page: query.page + 1 })}
                    data-verify-unit="page-next"
                  >
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
