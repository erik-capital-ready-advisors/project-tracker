import { cn } from "@/lib/utils";
import type { WaitGroup, StoredWait } from "@/lib/server/waits/store";

import { resolveWaitSafe } from "../actions";
import { elapsedDays, isoDay } from "@/lib/display-format";
import { ResolveWaitButton } from "./resolve-wait-button";

/**
 * FR-38 -- the waits, grouped by the person outside the studio who owns them.
 *
 * Grouping by owner rather than by engagement is the requirement's own choice
 * and it is the useful one: the studio's dependencies on other people read as
 * one list, so "I am waiting on three things from this reviewer" is visible
 * without cross-referencing anything. `i6`'s `listWaits` does the grouping; this
 * renders it.
 *
 * ## Overdue is a state, and it borrows the blocked colour deliberately
 *
 * FR-34: a wait past its expected-by date is flagged as overdue and appears in
 * Blocked with the elapsed count. It carries `state-blocked` rather than a
 * colour of its own, because an overdue wait *is* the thing making work blocked,
 * and spec 5a requires a state colour to mean the same thing on every surface it
 * appears on. A separate hue here would say it is a different kind of problem.
 *
 * ## A wait with no expected-by date is not overdue, and not on time either
 *
 * `isOverdue` is false for a wait nobody gave a date for, which is correct --
 * there is no date to be past. But rendering that as an unmarked row would read
 * as "on schedule". It gets its own quiet marker instead.
 */

function OverdueBadge({ days }: { days: number | null }) {
  const elapsed = elapsedDays(days);
  return (
    <span
      data-verify-unit="wait-overdue"
      data-verify-overdue="true"
      className="ident border-state-blocked/40 bg-state-blocked/10 text-state-blocked inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none font-semibold whitespace-nowrap"
    >
      {elapsed === null ? "overdue" : `overdue · ${elapsed} waiting`}
    </span>
  );
}

function WaitRow({ wait }: { wait: StoredWait }) {
  const started = isoDay(wait.startedOn);
  const expected = isoDay(wait.expectedBy);
  const resolvedOn = isoDay(wait.resolvedAt);
  const elapsed = elapsedDays(wait.daysWaiting);
  const resolved = wait.resolvedAt !== null;

  return (
    <li
      data-verify-unit="wait-row"
      data-verify-wait={wait.id}
      data-verify-overdue={wait.overdue ? "true" : "false"}
      data-verify-resolved={resolved ? "true" : "false"}
      data-verify-resolution-method={wait.resolutionMethod ?? "not-recorded"}
      data-verify-blocks={wait.blocks.length}
      className={cn(
        "border-border flex flex-wrap items-start gap-x-4 gap-y-2 border-t px-3 py-2.5 first:border-t-0",
        resolved && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-foreground text-sm font-medium">
            {wait.label}
          </span>
          {wait.engagementSlug === null ? null : (
            <span className="ident text-muted-foreground text-xs">
              {wait.engagementSlug}
            </span>
          )}
          {wait.ownerType === null ? null : (
            <span className="ident text-muted-foreground/70 text-xs">
              {wait.ownerType}
            </span>
          )}
          {wait.overdue ? <OverdueBadge days={wait.daysWaiting} /> : null}
        </div>

        {wait.reason === null ? null : (
          <p className="text-muted-foreground mt-1 text-sm">{wait.reason}</p>
        )}

        {wait.blocks.length === 0 ? null : (
          <p className="text-muted-foreground mt-1 text-xs">
            blocks{" "}
            <span className="ident text-foreground">
              {wait.blocks.join(" ")}
            </span>
          </p>
        )}
      </div>

      <dl className="text-muted-foreground grid shrink-0 grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs">
        <dt>started</dt>
        <dd className="ident text-right">{started ?? "not recorded"}</dd>

        <dt>expected</dt>
        <dd className="ident text-right">
          {expected ?? (
            <span title="Nobody has given a date, so this wait can never be flagged overdue.">
              no date given
            </span>
          )}
        </dd>

        {resolved ? (
          <>
            <dt>resolved</dt>
            <dd className="ident text-right">{resolvedOn ?? "unreadable"}</dd>
            <dt>by</dt>
            <dd className="ident max-w-40 truncate text-right">
              {wait.resolvedBy ?? "not recorded"}
            </dd>
          </>
        ) : (
          <>
            <dt>waiting</dt>
            <dd className="ident text-right">{elapsed ?? "not countable"}</dd>
          </>
        )}

        <dt>method</dt>
        <dd className="ident text-right">
          {wait.resolutionMethod === "probe"
            ? (wait.probeTarget ?? "probe")
            : (wait.resolutionMethod ?? "not recorded")}
        </dd>
      </dl>

      <div className="shrink-0">
        {resolved ? null : (
          <ResolveWaitButton
            waitId={wait.id}
            label={wait.label}
            blockedCount={wait.blocks.length}
            onResolve={resolveWaitSafe}
          />
        )}
      </div>
    </li>
  );
}

export function WaitList({ groups }: { groups: readonly WaitGroup[] }) {
  return (
    <div className="flex flex-col gap-4" data-verify-unit="wait-list">
      {groups.map((group) => (
        <section
          key={group.owner}
          data-verify-unit="wait-owner-group"
          data-verify-owner={group.owner}
          data-verify-overdue-count={group.overdueCount}
          className="border-border overflow-hidden rounded-lg border"
        >
          <header className="border-border bg-muted/40 flex items-center justify-between gap-3 border-b px-3 py-2">
            <h2 className="text-sm font-medium">{group.owner}</h2>
            <p className="text-muted-foreground ident text-xs">
              <span>{group.waits.length} open</span>
              {group.overdueCount > 0 ? (
                <span className="text-state-blocked ml-2 font-semibold">
                  {group.overdueCount} overdue
                </span>
              ) : null}
            </p>
          </header>
          <ul>
            {group.waits.map((wait) => (
              <WaitRow key={wait.id} wait={wait} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
