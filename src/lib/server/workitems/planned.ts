/**
 * FR-87 and FR-91 — planned work, and when a planned row goes STALE.
 *
 * Everything here is a pure function over plain values: no database, no
 * environment, and above all **no clock**. FR-91 says so in terms:
 *
 * > The 30-day boundary is computed from a date passed in, never from
 * > `new Date()` inside, so the rule stays testable and deterministic like every
 * > other rule in `src/lib/ingest/`.
 *
 * ## Staleness is derived, never stored
 *
 * There is no `stale` column, no `stale` status member and no job that
 * transitions a row into one. A planned row that nobody has touched for thirty
 * days is *the same row* it was on day twenty-nine; only the question being
 * asked of it has changed. That is what keeps CR-002's append-only ruling
 * intact, and it is why this file exists instead of a migration.
 *
 * ## Why `planned` is read from the raw columns and not from the domain object
 *
 * `fromExecutionMode` is lossy about the one thing FR-87 defines planned work
 * by, so by the time a row has become a `LoadedWorkItem` that signal is
 * **gone**. `isPlannedRow` therefore takes the raw `work_item` columns, spelled
 * snake_case so a caller cannot pass a domain object to it by accident, and each
 * read path records the answer as a field before the lossy conversion happens.
 *
 * **Corrected 2026-08-24 by d4000f's u4, and the conclusion is unchanged.** This
 * paragraph used to say `fromExecutionMode(null)` returns `"fleet"`, and it did
 * — that was defect D-1, and a planned row reading as fleet work was precisely
 * the misread FR-91 forbids. It now returns the explicit `unparsed` sentinel, so
 * the *fabrication* is gone. What is not gone is the *loss*: the sentinel is
 * returned for a SQL NULL and for an unreadable value alike, and only the NULL
 * is planned. So the domain object still cannot answer FR-87's question and this
 * module still must not read one.
 *
 * Nothing here changed behaviour when D-1 was fixed, and nothing here routes
 * through the fixed function.
 *
 * ## Days, not instants, and the boundary is inclusive
 *
 * Both sides are reduced to a UTC calendar day with `toIsoDay` and differenced
 * with `daysBetween` — the one piece of whole-day arithmetic this repository
 * has, and the one `toIsoDay`'s own comment exists to keep safe from `NaN`. So
 * `updated_at` is truncated to its day: a row touched at `23:59Z` and one
 * touched at `00:01Z` on the same date are the same age here. That is a
 * deliberate choice for a signal that only ever *surfaces* something — it
 * deletes nothing and transitions nothing — and it matches how every other
 * elapsed count in this product is computed.
 *
 * **Exactly thirty days untouched is STALE.** A row last touched on 2026-07-25
 * is stale when asked on 2026-08-24 and fresh when asked on 2026-08-23. The
 * boundary is inclusive because "untouched for 30 days" is true at thirty days,
 * and a rule whose boundary is left to the reader is a rule two callers will
 * implement two ways.
 *
 * ## An unreadable timestamp is `unknown`, never `fresh`
 *
 * `updated_at` is `not null default now()` with a `BEFORE UPDATE` trigger behind
 * it, so a planned row with no readable timestamp should not exist. If one
 * arrives anyway — a projection that forgot the column, most likely — the answer
 * is `unknown`, not a guess in either direction. Guessing `fresh` hides a row
 * that may have sat for a year; guessing `stale` cries wolf. This is the
 * `unparsed`-only-default rule applied to a date.
 */

import { daysBetween } from "@/lib/ingest/waits";
import { toIsoDay } from "@/lib/server/waits/input";

import { WORK_STATUS } from "./rules";
import type { StoredWorkStatus } from "./rules";

/** FR-91, as ruled at Q15 on 2026-08-24. Inclusive — see the note above. */
export const PLANNED_STALE_AFTER_DAYS = 30;

/** FR-87's half of the planned predicate that is not "no execution mode". */
export const PLANNED_STATUS: StoredWorkStatus = "pending";

/**
 * FR-87 — is this `work_item` row planned work?
 *
 * `execution_mode IS NULL AND status = 'pending'`, and nothing else. Reads the
 * **raw** column values; see the file comment for why it may not read a domain
 * object.
 *
 * Two directions are refused on purpose:
 *
 *   * An `execution_mode` this build does not recognise is **not** planned.
 *     Only an explicit SQL `NULL` is. Rounding an unreadable mode into planned
 *     would put a PLANNED chip on real fleet work.
 *   * A `status` that is absent, unrecognised, or anything other than `pending`
 *     is **not** planned, via the same `WORK_STATUS` table every other status
 *     read in this repository goes through.
 *
 * `undefined` — the shape a projection that omitted the column produces — is
 * treated as not planned, because a page of false PLANNED chips is the louder
 * wrong answer. The other direction, a projection that quietly stops selecting
 * `execution_mode` and turns every planned row invisible, is caught by the
 * projection assertions in the read-path tests rather than by hope.
 */
export function isPlannedRow(row: {
  execution_mode: unknown;
  status: unknown;
}): boolean {
  if (row.execution_mode !== null) return false;
  return WORK_STATUS.parse(row.status) === PLANNED_STATUS;
}

/**
 * Whole UTC calendar days between `updatedAt` and `asOf`, or null.
 *
 * Null whenever either side cannot be read as a date — never `0`, which would be
 * indistinguishable from "touched today".
 *
 * Negative when `updatedAt` is after `asOf` (clock skew, or a caller asking
 * about the past). Reported as it is rather than clamped: a negative age is a
 * fact about the inputs, and a silent `0` would hide it.
 */
export function daysUntouched(updatedAt: string | null, asOf: string): number | null {
  if (updatedAt === null) return null;
  const from = toIsoDay(updatedAt);
  const to = toIsoDay(asOf);
  if (from === null || to === null) return null;
  const days = daysBetween(from, to);
  return Number.isFinite(days) ? days : null;
}

/** The two facts a read path records so this rule can be applied later. */
export interface PlannedItem {
  /** FR-87, decided at read time by `isPlannedRow` over the raw columns. */
  planned: boolean;
  /** `work_item.updated_at`. FR-91's timestamp. */
  updatedAt: string | null;
}

export type PlannedStalenessState = "not-planned" | "fresh" | "stale" | "unknown";

/**
 * FR-91's four answers. `daysUntouched` is present on every member so a caller
 * can render the age without narrowing first.
 */
export type PlannedStaleness =
  | { state: "not-planned"; daysUntouched: null }
  | { state: "fresh"; daysUntouched: number }
  | { state: "stale"; daysUntouched: number }
  | { state: "unknown"; daysUntouched: null };

/**
 * FR-91 — derive staleness from a timestamp and a date passed in.
 *
 * @param item  A row that has already recorded `planned` and `updatedAt`.
 * @param asOf  The reference date, `YYYY-MM-DD` or a full ISO instant. **The
 *              caller's clock, never this function's.**
 */
export function plannedStaleness(item: PlannedItem, asOf: string): PlannedStaleness {
  if (!item.planned) return { state: "not-planned", daysUntouched: null };
  const days = daysUntouched(item.updatedAt, asOf);
  if (days === null) return { state: "unknown", daysUntouched: null };
  return days >= PLANNED_STALE_AFTER_DAYS
    ? { state: "stale", daysUntouched: days }
    : { state: "fresh", daysUntouched: days };
}

/**
 * The planned rows out of a loaded set, for a screen that wants only those.
 *
 * A named helper rather than an inline `.filter` at each screen, so "planned"
 * has exactly one definition on the read side as well as at the row level.
 */
export function selectPlanned<T extends { planned: boolean }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.planned);
}
