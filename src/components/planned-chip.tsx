import { plannedStaleness } from "@/lib/server/workitems/planned";
import type { PlannedItem, PlannedStaleness } from "@/lib/server/workitems/planned";
import { cn } from "@/lib/utils";

/**
 * FR-91 — "a planned row that no run has claimed is visibly distinguishable on
 * every screen that shows it, so *nobody has started this* never reads as *this
 * is in flight*", extended by the Q15 ruling of 2026-08-24: a planned row
 * untouched for thirty days surfaces as STALE.
 *
 * ## This component derives nothing
 *
 * The rule lives in `@/lib/server/workitems/planned`, which is a pure function
 * over plain values with no clock in it, and this calls it. `asOf` is passed in
 * for the same reason `plannedStaleness` takes it: a component that read
 * `new Date()` would make FR-91 untestable and would answer differently on the
 * server and in the browser for a row sitting on the boundary.
 *
 * **Staleness is derived, never stored.** There is no `stale` column and no job
 * that transitions a row into one, so CR-002's append-only ruling is untouched.
 *
 * ## The four states, and why `unknown` is drawn at all
 *
 * `not-planned` renders nothing — every row on these screens would otherwise
 * carry a chip saying what it is not. The other three all render:
 *
 *   * **fresh** — the quiet case. A plan that is young is the *normal* condition
 *     of a plan, so it takes the neutral ladder (`WorkStatusChip`'s treatment
 *     for the five statuses the semantic scale does not name) and no state
 *     colour at all. Dashed, because the row is an intention rather than work.
 *   * **stale** — the loud case, and the only one that earns a semantic colour.
 *   * **unknown** — `updated_at` could not be read, so the age is not known.
 *     i4 made this a deliberate fourth state and it must not collapse into
 *     either neighbour: rendering it `fresh` hides a row that may have sat for a
 *     year, rendering it `stale` cries wolf, and either one is the same class of
 *     lie as a wrong `done`. It gets the dotted treatment this repository
 *     already uses for a gap in the record (`EvidenceScopeChip` with no scope).
 *
 * ## Colour: STALE borrows `--state-contested`, and introduces nothing
 *
 * Spec 5a's recorded B11 decision fixes a 16-token state scale and reserves
 * fuchsia for `unparsed` alone. No token is added here. STALE takes
 * `--state-contested` (orange 700 / orange 400), which is the only warm token in
 * the scale that **never renders on a work-item row** — it belongs to CR-001
 * FR-79's contested defect status, which appears on Broken. So no work-item
 * column ends up showing one hue for two meanings, which is the property spec 5a
 * actually asks for. Amber was the near miss: `carried` is amber and
 * `DispositionChip` can draw it in the same row, and two amber chips a cell
 * apart meaning different things is exactly the collapse the scale forbids.
 */

/** The age segment reads in days, monospace, so ages compare down a column. */
function ageLabel(staleness: PlannedStaleness): string {
  return staleness.daysUntouched === null ? "age?" : `${staleness.daysUntouched}d`;
}

const CHIP_BASE =
  "ident inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 " +
  "text-xs leading-none whitespace-nowrap";

/** Written out literally: Tailwind cannot see a class name assembled at runtime. */
const CHIP_CLASS: Record<"fresh" | "stale" | "unknown", string> = {
  fresh: "border-border border-dashed text-muted-foreground bg-transparent",
  stale:
    "border-state-contested/50 bg-state-contested/10 text-state-contested-ink font-medium",
  unknown: "border-dotted border-border text-muted-foreground bg-transparent",
};

const CHIP_TEXT: Record<"fresh" | "stale" | "unknown", string> = {
  fresh: "planned",
  stale: "planned stale",
  unknown: "planned",
};

/**
 * The age, as a sentence. Four cases, because `daysUntouched` has four shapes a
 * single template gets wrong.
 *
 * `${days} days` alone reads "untouched for 1 days" the day after a row is
 * planned, and "untouched for -2 days" under the clock skew `daysUntouched`
 * deliberately reports rather than clamping. On an instrument panel the whole
 * claim to be believed is precision, and prose that cannot count to one spends
 * it. `0` gets its own wording too: "untouched for 0 days" is an odd way to say
 * the row was touched today.
 *
 * The chip's own age token stays `${days}d` for all of them — `-2d` is terse and
 * honest in a fixed column, and it is the tooltip that has to read as English.
 */
function ageSentence(days: number): string {
  if (days < 0) {
    return (
      "Planned work. Its last-touched date is later than the date being asked " +
      "about, so its age is not stated."
    );
  }
  if (days === 0) return "Planned work, touched today.";
  if (days === 1) return "Planned work, untouched for 1 day.";
  return `Planned work, untouched for ${days} days.`;
}

function title(staleness: PlannedStaleness): string {
  switch (staleness.state) {
    case "stale":
      return (
        `${ageSentence(staleness.daysUntouched)} ` +
        `No run has claimed it; it is not in flight. FR-91 surfaces a planned ` +
        `row as STALE at 30 days untouched. Derived from work_item.updated_at, ` +
        `not stored — nothing has transitioned and nothing has been deleted.`
      );
    case "fresh":
      return (
        `${ageSentence(staleness.daysUntouched)} ` +
        `No run has claimed it, so it is not in flight.`
      );
    default:
      return (
        `Planned work. work_item.updated_at could not be read, so how long it ` +
        `has sat is unknown — which is not the same as fresh, and not the same ` +
        `as stale.`
      );
  }
}

/**
 * @param item  A row that already recorded FR-87's `planned` and `updatedAt`.
 *              Both are read from the raw columns at load time, because
 *              `execution_mode` is the signal and the domain object no longer
 *              distinguishes a NULL from an unreadable value.
 * @param asOf  `YYYY-MM-DD`. The caller's clock, never this component's.
 */
export function PlannedChip({
  item,
  asOf,
  className,
}: {
  item: PlannedItem;
  asOf: string;
  className?: string;
}) {
  const staleness = plannedStaleness(item, asOf);
  if (staleness.state === "not-planned") return null;

  return (
    <span
      data-verify-unit="planned"
      data-verify-planned="true"
      data-verify-planned-state={staleness.state}
      data-verify-days-untouched={
        staleness.daysUntouched === null ? "unknown" : String(staleness.daysUntouched)
      }
      title={title(staleness)}
      className={cn(CHIP_BASE, CHIP_CLASS[staleness.state], className)}
    >
      {CHIP_TEXT[staleness.state]}
      <span className="tabular-nums opacity-85">{ageLabel(staleness)}</span>
    </span>
  );
}
