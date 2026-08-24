import Link from "next/link";

import { EntityRef, EntityRefList } from "@/components/entity-ref";
import type { EntityRefItem } from "@/components/entity-ref";
import { resolvedId } from "@/lib/detail-load";
import type { RefResolution } from "@/lib/detail-load";
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
 *
 * ## FR-80 — two kinds of reference on this screen, resolved differently
 *
 * The **wait itself** carries its own uuid, so `<EntityRef kind="external_wait">`
 * needs no resolution and can never dangle. Its `label` is also its natural key
 * — `unique (engagement_id, label)` — which is why the label is the reference.
 *
 * The **work items it blocks** are the other case: `StoredWait.blocks` holds
 * *unit keys* and no ids, so those must be resolved. The page resolves every
 * block on the screen in one batch and passes the result down; this component
 * looks each one up through `resolvedId`, which builds the key with `refKey`
 * rather than spelling one out.
 *
 * A wait carries no run, so a unit key resolves only while the engagement holds
 * exactly one work item with it. `resolveRefs` refuses rather than guessing when
 * a second run defines the same unit, and the token then dangles — visibly,
 * which is the intent. `unparsed` is the only default and a link to the wrong
 * work item is the navigable form of a wrong `done`.
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

function WaitRow({
  wait,
  resolution,
}: {
  wait: StoredWait;
  resolution: RefResolution;
}) {
  const blocks: EntityRefItem[] = wait.blocks.map((unit) => ({
    kind: "work_item" as const,
    label: unit,
    id: resolvedId(resolution, {
      kind: "work_item",
      ref: unit,
      engagementId: wait.engagementId,
    }),
  }));

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
          {/* `text-sm font-medium` is what this heading has always drawn,
              restated so adopting the reference token keeps its size and
              weight. The wait's label IS its natural key, so it is the
              reference and needs no separate identifier beside it. */}
          <EntityRef
            kind="external_wait"
            label={wait.label}
            id={wait.id}
            className="text-sm font-medium"
          />
          {wait.engagementSlug === null ? null : (
            <Link
              href={`/registry/${wait.engagementSlug}`}
              data-verify-unit="engagement-link"
              data-verify-slug={wait.engagementSlug}
              className="ident text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              {wait.engagementSlug}
            </Link>
          )}
          {wait.ownerType === null ? null : (
            <span className="ident text-muted-foreground/85 text-xs">
              {wait.ownerType}
            </span>
          )}
          {wait.overdue ? <OverdueBadge days={wait.daysWaiting} /> : null}
        </div>

        {wait.reason === null ? null : (
          <p className="text-muted-foreground mt-1 text-sm">{wait.reason}</p>
        )}

        {blocks.length === 0 ? null : (
          <p className="text-muted-foreground mt-1 text-xs">
            blocks{" "}
            <EntityRefList
              refs={blocks}
              empty="This wait holds nothing up."
            />
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

export function WaitList({
  groups,
  resolution,
}: {
  groups: readonly WaitGroup[];
  /**
   * FR-80 — every unit key in every group's `blocks`, resolved in one batch by
   * the page. An **empty** map is the honest default: nothing was resolved, so
   * every blocked work item dangles rather than linking somewhere unchecked.
   */
  resolution: RefResolution;
}) {
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
              <WaitRow key={wait.id} wait={wait} resolution={resolution} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
