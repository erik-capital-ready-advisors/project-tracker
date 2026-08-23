import { AlertTriangle, CircleHelp } from "lucide-react";

import type { UnparsedCensus } from "@/lib/server/answers/unparsed";
import { unparsedState } from "@/lib/unparsed-display";
import { cn } from "@/lib/utils";

/**
 * FR-58's count, broken down by where the unclassified records are.
 *
 * > *"A system that cannot classify something says so on every surface rather
 * > than on a diagnostics page."*
 *
 * ## Why this exists next to the shell badge rather than instead of it
 *
 * `@/components/unparsed-count` is the header badge: **the** number, mounted
 * once in the app shell so no screen can be built without reporting it. This
 * component answers the next question — *where* — and it is deliberately built
 * so it can never answer the first one differently:
 *
 *   * it takes the **same census object** the shell badge's total came from,
 *     read once per request through `readUnparsedCensus`;
 *   * it renders the total in the same three display states, from the same
 *     `unparsedState` rule;
 *   * it carries its own `data-verify-unit`, because the shell's contract
 *     assumes one badge per page.
 *
 * Two numbers for the same state is the failure the shared definition exists to
 * end, so the only safe way to show a breakdown is to derive it from the total's
 * own source. It is not recomputed here and it is not narrowed by the screen's
 * filters — the count is global by construction (see
 * `@/lib/server/answers/unparsed`), and a count that shrank when Erik filtered
 * to one clean engagement would read as "the system classified everything".
 *
 * ## The three states, and why the parts can be unknown while the total is not
 *
 * They cannot. `unparsedCensus` returns `total: null` if **any** component
 * failed, never a partial sum — so an unknown total is the honest report of a
 * partially failed count, and each part still says individually whether it was
 * read. A part that reads `—` beside a stated total would be a contradiction and
 * cannot occur.
 */

const PART_LABELS = [
  ["workItems", "work items"],
  ["defects", "defects"],
  ["testResults", "test results"],
] as const;

export function UnparsedBreakdown({
  census,
  className,
}: {
  census: UnparsedCensus;
  className?: string;
}) {
  const state = unparsedState(census.total);

  return (
    <div
      data-verify-unit="unparsed-breakdown"
      data-verify-state={state}
      {...(state === "unknown"
        ? {}
        : { "data-verify-total": census.total as number })}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-xs",
        state === "zero" && "border-border text-muted-foreground",
        state === "nonzero" &&
          "border-state-unparsed/40 bg-state-unparsed/5 text-state-unparsed",
        state === "unknown" &&
          "border-state-blocked/40 bg-state-blocked/5 text-state-blocked border-dashed",
        className,
      )}
    >
      <span className="ident inline-flex items-center gap-1.5 font-semibold">
        {state === "nonzero" ? (
          <AlertTriangle aria-hidden className="size-3.5" />
        ) : null}
        {state === "unknown" ? (
          <CircleHelp aria-hidden className="size-3.5" />
        ) : null}
        {state === "unknown"
          ? "unparsed count unavailable"
          : `${census.total as number} unparsed in the ledger`}
      </span>

      <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {PART_LABELS.map(([key, label]) => {
          const value = census[key];
          return (
            <span
              key={key}
              data-verify-unit="unparsed-part"
              data-verify-part={key}
              {...(value === null ? {} : { "data-verify-count": value })}
              className="ident"
            >
              {/* A part that could not be counted says so. It never reads 0. */}
              {value === null ? "—" : value} {label}
            </span>
          );
        })}
      </span>

      {state === "unknown" ? (
        <span className="text-muted-foreground basis-full">
          Nothing was counted, so this is not a claim that everything
          classified.
        </span>
      ) : null}
    </div>
  );
}
