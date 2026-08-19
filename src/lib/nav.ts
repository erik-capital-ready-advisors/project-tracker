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
] as const;

export const ALL_ROUTES: readonly NavItem[] = [
  ...ANSWER_ROUTES,
  ...OPERATOR_ROUTES,
];
