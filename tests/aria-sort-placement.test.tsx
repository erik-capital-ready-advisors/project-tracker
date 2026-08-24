import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkItemTable } from "@/app/work-items/_components/work-item-table";
import { parseWorkItemQuery } from "@/app/work-items/_lib/query";

afterEach(cleanup);

/**
 * B55. `aria-sort` sat on the `<a>` inside each sortable header, which axe
 * grades `aria-allowed-attr`, **impact: critical**, 7 nodes.
 *
 * The seven nodes are the seven `<SortableHead>` calls in ONE file. The blocker
 * named three files; the other two carry `aria-sort` on `<TableHead>`, which
 * renders a `<th>` and is where the attribute belongs. Checked before changing
 * anything, because fixing two correct files would have been the worse outcome.
 *
 * `aria-sort` is only valid on an element with a `columnheader` / `rowheader`
 * role. An `<a>` has neither, so a screen reader was told the sort state by an
 * attribute it is required to ignore -- i.e. the sort state was announced to
 * nobody while appearing, in the markup, to have been handled.
 */
describe("aria-sort sits on the column header, not the link (B55)", () => {
  const query = parseWorkItemQuery({});

  it("no anchor carries aria-sort", () => {
    const { container } = render(<WorkItemTable items={[]} query={query} asOf="2026-08-24" />);
    expect(container.querySelectorAll("a[aria-sort]")).toHaveLength(0);
  });

  it("every sortable column header carries it instead", () => {
    const { container } = render(<WorkItemTable items={[]} query={query} asOf="2026-08-24" />);
    // Seven sortable columns; this is the count axe reported as 7 violating
    // nodes, so it doubles as the guard that none went missing in the move.
    expect(container.querySelectorAll("th[aria-sort]")).toHaveLength(7);
  });

  it("the sort links themselves survive the move", () => {
    const { container } = render(<WorkItemTable items={[]} query={query} asOf="2026-08-24" />);
    expect(
      container.querySelectorAll('[data-verify-unit="sort-link"]').length,
    ).toBe(7);
  });
});
