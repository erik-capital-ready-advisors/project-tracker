import Link from "next/link";

import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Button } from "@/components/ui/button";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";

import { declareWaitSafe } from "./actions";
import { DeclareWaitDialog } from "./_components/declare-wait-dialog";
import { WaitList } from "./_components/wait-list";
import { readEngagements, readWaits } from "./_lib/load";

const NAV = OPERATOR_ROUTES[2];

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
 */
export default async function WaitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawResolved = Array.isArray(params.resolved)
    ? params.resolved[0]
    : params.resolved;
  const includeResolved = rawResolved === "1";

  const [waits, engagements] = await Promise.all([
    loadForOperator(() => readWaits(includeResolved)),
    loadForOperator(() => readEngagements()),
  ]);

  const listing = waits.ok ? waits.data : null;

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
              {/* COPY: shown in the summary strip when nothing could be read */}
              counts unavailable
            </span>
          ) : (
            <>
              <span className="ident">
                {/* COPY: open-wait count */}
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
                {/* COPY: overdue count label */}
                {" overdue"}
              </span>
              {listing.truncated ? (
                <span className="text-state-carried">
                  {/* COPY: warning that the wait page filled */}
                  This page is full, so there may be more.
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={includeResolved ? "/waits" : "/waits?resolved=1"}
              data-verify-unit="toggle-resolved"
              data-verify-including-resolved={includeResolved ? "true" : "false"}
            >
              {/* COPY: the toggle between open waits and all waits */}
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
          {/* COPY: shown when there is no engagement to declare a wait against */}
          A wait belongs to an engagement, and none is registered yet. Register
          one first.
        </p>
      ) : null}

      {listing === null ? null : listing.waits.length === 0 ? (
        // COPY: empty-state headline and detail for the waits screen
        <EmptyState
          headline={
            includeResolved
              ? "No external waits have been recorded."
              : "Nothing is waiting on anyone outside the studio."
          }
          detail="Waits on people outside the studio appear here with the date they started, the date they are expected to clear, and the work items they hold."
        />
      ) : (
        <WaitList groups={listing.byOwner} />
      )}
    </Screen>
  );
}
