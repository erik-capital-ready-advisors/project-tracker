import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Two surfaces sit under `/work-items`, and this is how the reader gets between
 * them.
 *
 * They are separate routes rather than in-page tabs because they list different
 * entities: the first lists work items (FR-44), the second lists **sessions**
 * that resolved to no engagement (FR-26). Folding sessions into the work-item
 * table would make the unified list mean two things, which is the opposite of
 * what FR-44 is for.
 *
 * Route links rather than a `Tabs` client component so each is bookmarkable and
 * middle-clickable, and so neither surface pays for the other's query.
 *
 * The queue tab deliberately carries **no count when the queue has not been
 * read**. A `0` beside it would say the queue is empty, and the list page does
 * not read the queue -- see the report's Best-guess decisions.
 */
export function WorkItemTabs({
  active,
  queueCount,
}: {
  active: "list" | "queue";
  /** Omit when unread. `null` is not `0` and never renders as one. */
  queueCount?: number | null;
}) {
  const tab =
    "rounded-md px-2.5 py-1 text-sm transition-colors border border-transparent";

  return (
    <nav
      data-verify-unit="work-item-tabs"
      data-verify-active={active}
      aria-label="Work item surfaces"
      className="flex items-center gap-1"
    >
      <Link
        href="/work-items"
        data-verify-unit="work-item-tab"
        data-verify-tab="list"
        aria-current={active === "list" ? "page" : undefined}
        className={cn(
          tab,
          active === "list"
            ? "border-border bg-muted text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        All work items
      </Link>
      <Link
        href="/work-items/unassigned"
        data-verify-unit="work-item-tab"
        data-verify-tab="queue"
        aria-current={active === "queue" ? "page" : undefined}
        className={cn(
          tab,
          active === "queue"
            ? "border-border bg-muted text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Unassigned sessions
        {queueCount === null || queueCount === undefined ? null : (
          <span className="ident text-muted-foreground ml-1.5 text-xs">
            {queueCount}
          </span>
        )}
      </Link>
    </nav>
  );
}
