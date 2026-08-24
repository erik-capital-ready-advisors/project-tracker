import Link from "next/link";

import { EngagementScopeNotice } from "@/components/engagement-scope-notice";
import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Button } from "@/components/ui/button";
import { readRefResolution } from "@/lib/detail-load";
import type { RefQuery, RefResolution } from "@/lib/detail-load";
import { engagementFilterFrom } from "@/lib/engagement-filter";
import type { SearchParamRecord } from "@/lib/engagement-filter";
import {
  engagementScopeBlocksRows,
  engagementScopeSlug,
  resolveEngagementFilter,
} from "@/lib/engagement-resolve";
import { withListFlag } from "@/lib/list-toggle-link";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";

import { declareWaitSafe } from "./actions";
import { DeclareWaitDialog } from "./_components/declare-wait-dialog";
import { WaitList } from "./_components/wait-list";
import { readEngagements, readWaits } from "./_lib/load";

const NAV = OPERATOR_ROUTES.find((item) => item.href === "/waits")!;

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-32 to FR-36 -- the external waits.
 *
 * ## What this screen is for, and what it is not
 *
 * It is the record: every dependency on somebody outside the studio, who owns
 * it, when it started, when it is expected back, and what it is holding. The
 * *answer* built on that record is the Blocked screen (FR-34, FR-38), which is
 * `i7`'s. So this screen does not rank, summarise or triage -- it lists, groups
 * by owner, and gives Erik the two writes the requirements name: declare one
 * (FR-32) and resolve one (FR-36).
 *
 * ## Open by default, resolved on request
 *
 * `listWaits` defaults to open waits and this screen keeps that default, because
 * a resolved wait is history and the screen is a work list. History is one click
 * away rather than gone: a resolved wait still carries who resolved it and when,
 * which is the record FR-36 exists to produce, and hiding it permanently would
 * make that record unreadable.
 *
 * ## FR-96 -- the filter narrows the list and deliberately not the form
 *
 * `?engagement=` scopes the *record*: which waits are listed. It does not touch
 * the declare-a-wait dialog's engagement options, and that is a decision rather
 * than an omission. FR-32's form is a write, not a view -- narrowing its picker
 * to the engagement currently being read would mean a filtered screen could only
 * declare a wait against one client, and the operator would have to clear a
 * filter to record something. A filter that changes what can be *created* is a
 * mode, and CR-005 §3.3 keeps this one to what is *shown*.
 *
 * An unresolvable slug renders FR-96c's explicit state with no rows, and
 * `withListFlag` keeps the "include resolved" toggle from dropping the filter on
 * the way past.
 */
export default async function WaitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const params = await searchParams;
  const rawResolved = Array.isArray(params.resolved)
    ? params.resolved[0]
    : params.resolved;
  const includeResolved = rawResolved === "1";
  const filter = engagementFilterFrom(params);

  const [waits, engagements] = await Promise.all([
    // Resolved inside the load wrapper so a gated visitor gets one refusal.
    loadForOperator(async () => {
      const scope = await resolveEngagementFilter(filter);
      return {
        scope,
        listing: engagementScopeBlocksRows(scope)
          ? null
          : await readWaits(includeResolved, engagementScopeSlug(scope)),
      };
    }),
    loadForOperator(() => readEngagements()),
  ]);

  const scope = waits.ok ? waits.data.scope : null;
  const listing = waits.ok ? waits.data.listing : null;

  // FR-80 — every unit key every wait blocks, resolved in ONE round trip for
  // the whole screen rather than one per row. `readRefResolution` decrypts
  // nothing, so making these navigable costs this screen no `decrypt_field`
  // call; B29-wise it is `i1`'s `service_role` read and this is a call site.
  //
  // A failed resolution leaves the map empty, which dangles every block. That
  // is the honest outcome: the waits still list, and a work item nobody could
  // resolve is shown rather than linked or hidden.
  const blockQueries: RefQuery[] =
    listing === null
      ? []
      : listing.waits.flatMap((wait) =>
          wait.blocks.map((unit) => ({
            kind: "work_item" as const,
            ref: unit,
            engagementId: wait.engagementId,
          })),
        );

  let resolution: RefResolution = new Map();
  if (blockQueries.length > 0) {
    const resolved = await loadForOperator(() => readRefResolution(blockQueries));
    if (resolved.ok) resolution = resolved.data;
  }

  // The server's calendar day, computed once here and passed down. A client
  // component that called `new Date()` would render one day on the server and
  // possibly another at hydration.
  const today = new Date().toISOString().slice(0, 10);

  const options = engagements.ok
    ? engagements.data
        .filter((engagement) => engagement.slug !== "unassigned")
        .map((engagement) => ({
          slug: engagement.slug,
          clientName: engagement.clientName,
        }))
    : [];

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={["FR-32", "FR-33", "FR-34", "FR-35", "FR-36"]}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          data-verify-unit="wait-summary"
          data-verify-open={listing === null ? "unknown" : listing.waits.length}
          data-verify-overdue={
            listing === null ? "unknown" : listing.overdueCount
          }
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 text-xs"
        >
          {listing === null ? (
            <span>
              counts unavailable
            </span>
          ) : (
            <>
              <span className="ident">
                {listing.waits.length}{" "}
                {includeResolved ? "listed" : "open"}
              </span>
              {/* FR-34: the overdue count is stated even when it is zero, so an
                  absence of overdue waits is a statement rather than a blank. */}
              <span
                className={
                  listing.overdueCount > 0 ? "text-state-blocked font-semibold" : ""
                }
              >
                <span className="ident">{listing.overdueCount}</span>
                {" overdue"}
              </span>
              {listing.truncated ? (
                <span className="text-state-carried">
                  This page is full, so there may be more.
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={withListFlag(
                "/waits",
                params,
                "resolved",
                !includeResolved,
              )}
              data-verify-unit="toggle-resolved"
              data-verify-including-resolved={includeResolved ? "true" : "false"}
            >
              {includeResolved ? "Open only" : "Include resolved"}
            </Link>
          </Button>

          {/* FR-32. The form is present whenever the engagement list could be
              read; without it there is nothing to declare a wait against, and
              offering a picker with no options would be a control that cannot
              succeed. */}
          {engagements.ok && options.length > 0 ? (
            <DeclareWaitDialog
              engagements={options}
              defaultStartedOn={today}
              onDeclare={declareWaitSafe}
            />
          ) : null}
        </div>
      </div>

      {waits.ok ? null : (
        <OperatorLoadNotice
          reason={waits.reason}
          detail={waits.detail}
          screen={NAV.label}
        />
      )}

      {waits.ok && !engagements.ok ? (
        <OperatorLoadNotice
          reason={engagements.reason}
          detail={engagements.detail}
          screen="Engagement list"
        />
      ) : null}

      {waits.ok && engagements.ok && options.length === 0 ? (
        <p
          data-verify-unit="no-engagements"
          className="text-muted-foreground text-sm"
        >
          A wait belongs to an engagement, and none is registered yet. Register
          one first.
        </p>
      ) : null}

      {/* FR-96c. Guarded by the same `engagementScopeBlocksRows` that nulled
          the listing above, so the notice never sits over a list of rows. */}
      {scope === null ? null : <EngagementScopeNotice resolution={scope} />}

      {listing === null ? null : listing.waits.length === 0 ? (
        <EmptyState
          headline={
            // Scoped and unscoped are different claims -- see `/questions` for
            // the same note. A filtered screen must not report the ledger.
            // The scope qualifier leads in the open-only line. Trailing it —
            // "waiting on anyone outside the studio for acme" — attaches to
            // "the studio" and reads as a claim about acme's studio. Same
            // sentence shape as `/questions`, deliberately.
            scope?.kind === "resolved"
              ? includeResolved
                ? `No external waits have been recorded for ${scope.slug}.`
                : `Nothing for ${scope.slug} is waiting on anyone outside the studio.`
              : includeResolved
                ? "No external waits have been recorded."
                : "Nothing is waiting on anyone outside the studio."
          }
          detail="Waits on people outside the studio appear here with the date they started, the date they are expected to clear, and the work items they hold."
        />
      ) : (
        <WaitList groups={listing.byOwner} resolution={resolution} />
      )}
    </Screen>
  );
}
