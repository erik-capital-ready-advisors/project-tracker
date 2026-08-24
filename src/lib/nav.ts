/**
 * The navigation model for the whole product, in one place.
 *
 * The six answers come from spec FR-52 to FR-56 plus CR-001 FR-71, which added
 * the sixth (Broken). Spec section 5a still says "five answers" because it
 * predates the approved change request; six is correct.
 *
 * The end-user manual gate enumerates routes from the App Router tree, so every
 * entry here has a real route segment rendering a real page. None is a redirect
 * and none throws.
 */

export type NavItem = {
  /** Route segment. Must exist as a real page under src/app. */
  readonly href: string;
  /** Label as it appears in navigation and the command palette. */
  readonly label: string;
  /** One line describing what question this screen answers. */
  readonly question: string;
  /** Spec requirement refs this screen serves. Rendered in mono. */
  readonly requirements: readonly string[];
};

/** The six answers. Order is the order Erik reads them in. */
export const ANSWER_ROUTES: readonly NavItem[] = [
  {
    href: "/blocked",
    label: "Blocked",
    question: "What is stopped, who owns it, and for how long?",
    requirements: ["FR-52"],
  },
  {
    href: "/next",
    label: "Next",
    question: "What can be worked on right now with nothing in its way?",
    requirements: ["FR-53"],
  },
  {
    href: "/committed",
    label: "Committed",
    question: "What was promised to a client, for how much, and by when?",
    requirements: ["FR-54", "FR-75"],
  },
  {
    href: "/untested",
    label: "Untested",
    question: "Which requirements has nothing independently proven?",
    requirements: ["FR-55", "FR-48", "FR-49"],
  },
  {
    href: "/bottleneck",
    label: "Bottleneck",
    question: "What is waiting on Erik personally?",
    requirements: ["FR-56", "FR-40"],
  },
  {
    href: "/broken",
    label: "Broken",
    question: "What is defective or has regressed?",
    requirements: ["FR-71", "FR-69"],
  },
] as const;

/** Operator surfaces -- the records behind the answers. */
export const OPERATOR_ROUTES: readonly NavItem[] = [
  {
    href: "/registry",
    label: "Registry",
    question: "Engagements, contract milestones and acceptance criteria.",
    requirements: ["FR-8", "FR-77"],
  },
  {
    href: "/work-items",
    label: "Work items",
    question: "Every work item across every engagement and all three modes.",
    requirements: ["FR-44", "FR-39"],
  },
  {
    href: "/waits",
    label: "Waits",
    question: "External waits on people outside the studio.",
    requirements: ["FR-35", "FR-36"],
  },
  {
    href: "/settings/tokens",
    label: "Agent tokens",
    question: "Credentials an agent uses to read and write the ledger.",
    requirements: ["FR-4", "FR-5"],
  },
  {
    href: "/settings/export",
    label: "Export",
    question: "Every record in one file, for the day this system is not here.",
    requirements: ["FR-60"],
  },
  {
    // B36: zero foreign keys reference `open_question` and, before this
    // entry, nothing in navigation pointed at one -- the fleet queues
    // questions on every run and the product showed them nowhere. This is
    // the fix: a listing alongside the other two record surfaces, /waits and
    // /work-items, each row navigable to /questions/[id].
    //
    // Appended at the END of this array rather than inserted after /waits,
    // where it would read better: `registry/page.tsx`, `work-items/page.tsx`,
    // `waits/page.tsx`, `settings/tokens/page.tsx` and `settings/export/page.tsx`
    // all read their own nav metadata by POSITIONAL INDEX into this array
    // (`OPERATOR_ROUTES[0]` through `[4]`), and none of those five files is
    // this unit's to edit. Inserting in the middle would silently shift the
    // two settings pages to the wrong index and swap their titles -- a
    // regression this unit would have caused and not tested for, since it
    // would show up on a screen this run cannot reach (see the run's
    // verification note on the revoked operator session). Appending is the
    // only change to this file that cannot do that.
    href: "/questions",
    label: "Questions",
    question: "Every question the fleet queued for Erik, answered or not.",
    requirements: ["FR-18", "FR-81", "FR-83"],
  },
  {
    // CR-005 §3.2 / M2.8. The fleet's own runs were ingested from the day
    // Mode-1 ingest shipped and the product showed them on no screen: a
    // `fleet_run` row could be reached only by reading the database. FR-92 is
    // the listing that ends that.
    //
    // Appended at the END for the reason the /questions comment above spells
    // out at length, which has not changed and is now worse by one: SIX pages
    // read this array by POSITIONAL INDEX -- `OPERATOR_ROUTES[0]` through
    // `[5]`, the sixth being `/questions` itself. This entry is `[6]`.
    // Inserting it anywhere earlier would shift every one of those six and
    // render a screen under another screen's title and requirement list --
    // a wrong answer that does not crash, which is the worst kind.
    // `tests/nav-routes.test.ts` pins `[0]`-`[4]` and is a tripwire this unit
    // did not edit.
    //
    // This page does NOT add a seventh positional index. `runs/page.tsx` reads
    // its own entry with `OPERATOR_ROUTES.find((r) => r.href === "/runs")`,
    // which is B44's prescribed fix applied to the one call site this unit
    // owns. The other six are out of scope and stay as they are.
    href: "/runs",
    label: "Fleet runs",
    question: "Every fleet run ingested, and what each one claimed about itself.",
    requirements: ["FR-92", "FR-94", "FR-95"],
  },
  {
    // CR-007 §3 / M2.2. The register of every stack the ledger has observed,
    // the hours on each, and whether a fleet agent covers it.
    //
    // Appended at the END, index `[7]`.
    //
    // CORRECTION, run 9b85cd, measured rather than inherited. The two comments
    // above claim SIX pages read this array by POSITIONAL INDEX. That is FALSE
    // as of this commit and was already false at this run's merge base: all
    // eight app pages read their own entry with `.find((item) => item.href ===
    // ...)`. The only positional readers left in the repo are two TEST files --
    // `tests/nav-routes.test.ts` pins `[0]`-`[4]` and `tests/runs-list.test.tsx`
    // pins `[5]` -- and both are deliberate tripwires against silent reordering.
    //
    // The claim survived because every `OPERATOR_ROUTES[n]` occurrence in `src/`
    // is INSIDE A COMMENT, so a grep for the indexing form matches prose that
    // describes the hazard rather than code that has it. That is this repo's own
    // standing lesson: confirm at the return site, never on a bare identifier.
    //
    // Appending is still correct -- it is order-independent and it keeps the two
    // test tripwires green -- but it is correct for a weaker reason than the one
    // stated above, and B44 should not be held open on this sentence.
    //
    // Q26 RULED: the label is "Stacks" and the word `coverage` is not reused
    // anywhere on this surface. `src/lib/ingest/coverage.ts` already means
    // requirement and test coverage (FR-45 to FR-51).
    href: "/stacks",
    label: "Stacks",
    question:
      "Every technology the ledger has seen, the hours on it, and whether a fleet agent covers it.",
    requirements: ["FR-104", "FR-105", "FR-106", "FR-107", "FR-108", "FR-109"],
  },
] as const;

export const ALL_ROUTES: readonly NavItem[] = [
  ...ANSWER_ROUTES,
  ...OPERATOR_ROUTES,
];
