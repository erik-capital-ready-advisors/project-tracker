import { StrictMode } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import { OPERATOR_ROUTES } from "@/lib/nav";
import {
  createFakeAnswerDb,
  resetFakeAnswerIds,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";
import type { FakeRow } from "@/lib/server/answers/__fixtures__/fake-answer-db";
import { loadStackRegister } from "@/lib/server/stacks/list";
// The db slice is the read layer's own type, not part of the screen's module
// boundary — `@/lib/stacks-load` deliberately re-exports the render shapes and
// not the client slice, and only this fixture needs the latter.
import type { StacksDb } from "@/lib/server/stacks/types";
// Types only — `vi.mock` replaces a module's runtime exports, never its types,
// so this stays the boundary the route itself is written against.
import type { StackRegister } from "@/lib/stacks-load";

/**
 * M2.2 u1 — `/stacks`, CR-007 §3, FR-104 to FR-109.
 *
 * Mirrors `tests/runs-list.test.tsx`: the async Server Component is called
 * directly and the returned element is rendered under `<StrictMode>`, with
 * `readStackRegister` and `getOperatorContext` mocked so every outcome — a
 * failed read and each of FR-108's three register states — is reachable without
 * a database. `next.config.ts` sets `reactStrictMode: true`, so mounting bare
 * would test the screen in a mode the product never runs it in.
 *
 * ## The fixtures are produced by the real read layer, not hand-shaped
 *
 * Every `StackRegister` below comes out of `loadStackRegister` run against the
 * shared PostgREST fake, from raw `stack` and `work_session` rows. Nothing here
 * writes `{ outcome: "earned" }` or `{ state: "no-stacks" }` by hand. A
 * hand-written register would let this suite stay green against a shape the read
 * layer can no longer produce — and worse, would let the screen's FR-107
 * treatment be asserted against an `actionable` flag no rule ever set.
 *
 * ## Why FR-107's actionable row is driven deliberately
 *
 * The live ledger's actionable set is **empty**, and that is the correct answer
 * rather than a bug (`i1`, and the run's Phase 0 measurement). So a screen built
 * only against today's data would ship FR-107's one distinct treatment as code
 * that has never once rendered. The `earned` fixtures below feed the real
 * `evaluateTrigger` the volume that fires clause 1, so the treatment is live,
 * exercised code.
 *
 * ## What this file does NOT re-test
 *
 * The rule, the counts and the §7a projection guarantees. `rule.test.ts`,
 * `stacks.test.ts` and `columns.test.ts` own those and each is driven against
 * the same fake. This file asserts what reaches the screen.
 */

const mocks = vi.hoisted(() => ({
  readStackRegister: vi.fn(),
  operatorContext: vi.fn(),
  setAgentCovering: vi.fn(),
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
}));

vi.mock("@/lib/stacks-load", () => ({
  readStackRegister: () => mocks.readStackRegister(),
}));

// The action is a `'use server'` module reaching a service-role client. Mocked
// so this file needs neither. Its own behaviour is covered by `stacks.test.ts`
// (`setAgentCovering`), the control that calls it is covered by
// `tests/agent-covering-dialog.test.tsx`, and that it is a REACHABLE server
// action is proved by `pnpm build`, which is the only thing that can prove it.
vi.mock("@/lib/server/stacks/actions", () => ({
  setStackAgentCoveringAction: (stackId: string, agentCovering: string | null) =>
    mocks.setAgentCovering(stackId, agentCovering),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/stacks",
}));

const StacksPage = (await import("@/app/stacks/page")).default;

const OPERATOR: OperatorContext = {
  userId: "user-1",
  email: "erik@example.com",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.com", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

const STACK_NEXT = "stack-nextjs-supabase";
const ENG_LEDGER = "eng-delivery-ledger";

/** Build a register the way the product does: raw rows through the real reader. */
async function register(tables: Record<string, FakeRow[]>): Promise<StackRegister> {
  resetFakeAnswerIds();
  const fake = createFakeAnswerDb({
    tables: { stack: [], work_session: [], audit_log: [], ...tables },
  });
  return loadStackRegister(fake as unknown as StacksDb);
}

/**
 * The ledger as measured live on 2026-08-24 — one stack with a **recorded** zero
 * duration, and one session naming no stack at all. 50% of the denominator.
 */
function liveLedger(): Record<string, FakeRow[]> {
  return {
    stack: [
      {
        id: STACK_NEXT,
        name: "nextjs-supabase",
        agent_covering: null,
        first_seen_at: "2026-08-20 12:00:00+00",
        last_seen_at: "2026-08-22 09:30:00+00",
      },
    ],
    work_session: [
      {
        id: "ws-1",
        engagement_id: ENG_LEDGER,
        stack_id: STACK_NEXT,
        duration_minutes: 0,
        summary: "enc:whatever Erik was working on",
        source: "session-hook",
      },
      {
        id: "ws-2",
        engagement_id: ENG_LEDGER,
        stack_id: null,
        duration_minutes: 0,
        summary: "enc:whatever Erik was working on",
        source: "session-hook",
      },
    ],
  };
}

/** A stack over both halves of clause 1: two engagements and eight hours. */
function earnedLedger(agentCovering: string | null): Record<string, FakeRow[]> {
  return {
    stack: [
      {
        id: "stack-swift",
        name: "swift-ios",
        agent_covering: agentCovering,
        first_seen_at: "2026-05-01 00:00:00+00",
        last_seen_at: "2026-08-01 00:00:00+00",
      },
    ],
    work_session: [
      {
        id: "ws-a",
        engagement_id: "eng-a",
        stack_id: "stack-swift",
        duration_minutes: 300,
        summary: "enc:x",
        source: "session-hook",
      },
      {
        id: "ws-b",
        engagement_id: "eng-b",
        stack_id: "stack-swift",
        duration_minutes: 200,
        summary: "enc:x",
        source: "session-hook",
      },
    ],
  };
}

async function mount(): Promise<void> {
  const element = await StacksPage();
  render(<StrictMode>{element}</StrictMode>);
}

function unit(name: string): HTMLElement {
  const found = document.querySelector(`[data-verify-unit="${name}"]`);
  if (found === null) throw new Error(`no [data-verify-unit="${name}"] on the screen`);
  return found as HTMLElement;
}

function units(name: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(`[data-verify-unit="${name}"]`));
}

function figure(key: string): HTMLElement {
  const found = document.querySelector(`[data-verify-figure="${key}"]`);
  if (found === null) throw new Error(`no blindness figure "${key}" on the screen`);
  return found as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ---------------------------------------------------------------------- */
/* Q26 — the route, the title, and the word that is not reused             */
/* ---------------------------------------------------------------------- */

describe("Q26 — /stacks, titled Stacks, and `coverage` reused nowhere", () => {
  it("is wired into navigation as /stacks with the label Stacks", () => {
    const entry = OPERATOR_ROUTES.find((item) => item.href === "/stacks");

    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Stacks");
  });

  it("titles the screen Stacks", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(screen.getByRole("heading", { level: 1, name: "Stacks" })).toBeInTheDocument();
  });

  it("renders the word `coverage` nowhere on the screen, in text or in markup", async () => {
    // Checked by observation rather than by intention, the way `i1` checked the
    // read layer. The markup sweep catches a class name, a data attribute or an
    // id that the text sweep alone would miss.
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(document.body.textContent?.toLowerCase()).not.toContain("coverage");
    expect(document.body.innerHTML.toLowerCase()).not.toContain("coverage");
  });

  it("CONTROL — the same sweep is not blind: it finds words the screen does render", async () => {
    // A sweep pointed at an empty document returns "not found" for every term
    // and is indistinguishable from a real pass. This proves it can see.
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(document.body.textContent?.toLowerCase()).toContain("covering");
    expect(document.body.textContent?.toLowerCase()).toContain("nextjs-supabase");
    expect(document.body.innerHTML.toLowerCase()).toContain("agent covering");
  });
});

/* ---------------------------------------------------------------------- */
/* Three outcomes, not two                                                 */
/* ---------------------------------------------------------------------- */

describe("a failed read is not an empty register", () => {
  it("renders the load notice and no table, no empty state, no blindness figures", async () => {
    mocks.operatorContext.mockResolvedValue({ ...OPERATOR, profile: null });
    await mount();

    expect(unit("load-notice").dataset.verifyReason).toBe("no-role");
    expect(unit("load-notice").dataset.verifyScreen).toBe("Stacks");
    expect(units("stack-table")).toHaveLength(0);
    expect(units("empty-state")).toHaveLength(0);
    expect(units("register-blindness")).toHaveLength(0);
    // The screen must not state a register state it never read.
    expect(units("register-state")).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------- */
/* FR-108 — the three register states are three different claims           */
/* ---------------------------------------------------------------------- */

describe("FR-108 — `no-sessions`: nothing has been captured", () => {
  it("says so rather than rendering an empty table", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const empty = await register({});
    expect(empty.state).toBe("no-sessions");
    mocks.readStackRegister.mockResolvedValue(empty);
    await mount();

    expect(unit("register-state").dataset.verifyState).toBe("no-sessions");
    expect(unit("empty-state")).toBeInTheDocument();
    expect(units("stack-table")).toHaveLength(0);
  });

  it("distinguishes itself, in words, from a register reporting nothing earned", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register({}));
    await mount();

    const text = unit("empty-state").textContent ?? "";
    expect(text).toContain("different claim");
    expect(text.toLowerCase()).toContain("nothing in it");
  });

  it("renders no grid of zeros, which would restate the absence as a measurement", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register({}));
    await mount();

    expect(units("register-blindness")).toHaveLength(0);
    expect(units("blindness-figure")).toHaveLength(0);
  });

  it("still carries Q27's unevaluated clause, which is true whatever the data", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register({}));
    await mount();

    expect(unit("limb-two-unmet")).toBeInTheDocument();
  });
});

describe("FR-108 — `no-stacks`: work seen, none of it attributable", () => {
  const sessionsOnly = {
    work_session: [
      {
        id: "ws-1",
        engagement_id: ENG_LEDGER,
        stack_id: null,
        duration_minutes: 40,
        summary: "enc:x",
        source: "session-hook",
      },
      {
        id: "ws-2",
        engagement_id: ENG_LEDGER,
        stack_id: null,
        duration_minutes: 20,
        summary: "enc:x",
        source: "session-hook",
      },
    ] as FakeRow[],
  };

  it("is a third state the read layer really produces, distinct from the other two", async () => {
    const reg = await register(sessionsOnly);

    expect(reg.state).toBe("no-stacks");
    expect(reg.blindness.sessionsTotal).toBe(2);
  });

  it("states what it has seen and what it cannot place, and renders no table", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(sessionsOnly));
    await mount();

    expect(unit("register-state").dataset.verifyState).toBe("no-stacks");
    const notice = unit("no-stacks-notice");
    expect(notice.textContent).toContain("Not one of them names a stack");
    expect(notice.textContent).toContain("not an empty register");
    expect(units("stack-table")).toHaveLength(0);
    // Distinct from `no-sessions`: this state does not borrow that empty state.
    expect(units("empty-state")).toHaveLength(0);
  });

  it("still reports its blindness, because there is now something to be blind about", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(sessionsOnly));
    await mount();

    expect(unit("register-blindness")).toBeInTheDocument();
    expect(figure("sessions-without-stack").dataset.verifyValue).toBe("2");
    expect(figure("sessions-with-stack").dataset.verifyValue).toBe("0");
  });
});

describe("FR-108 — `observed`: the blindness is the answer, not the footer", () => {
  it("leads with the count of sessions the register could not place", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const headline = unit("blindness-headline");
    expect(headline.dataset.verifySessionsWithoutStack).toBe("1");
    expect(headline.dataset.verifySessionsTotal).toBe("2");
    expect(headline.textContent).toContain("1 of 2");
    expect(headline.textContent).toContain("50%");
    expect(headline.textContent).toContain("no stack at all");
  });

  it("renders every figure in FR-108's denominator, including the ones at zero", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    // A figure that appears only once it is non-zero is a figure nobody has
    // ever seen work.
    expect(figure("sessions-total").dataset.verifyValue).toBe("2");
    expect(figure("sessions-with-stack").dataset.verifyValue).toBe("1");
    expect(figure("sessions-without-stack").dataset.verifyValue).toBe("1");
    expect(figure("sessions-without-duration").dataset.verifyValue).toBe("0");
    expect(figure("sessions-on-unknown-stack").dataset.verifyValue).toBe("0");
    expect(figure("stacks-total").dataset.verifyValue).toBe("1");
    expect(figure("stacks-covered").dataset.verifyValue).toBe("0");
    expect(figure("stacks-earned").dataset.verifyValue).toBe("0");
    expect(figure("stacks-actionable").dataset.verifyValue).toBe("0");
  });

  it("sits above the table in the document, not beneath it", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const position = unit("register-blindness").compareDocumentPosition(
      unit("stack-table"),
    );
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("says nothing has earned a specialist, narrowly, on the clause it can evaluate", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const text = unit("nothing-earned").textContent ?? "";
    expect(text).toContain("clause 1, the only clause this register evaluates");
    expect(text).toContain("different claim from a register with nothing in it");
  });

  it("retires that note the moment a stack crosses clause 1", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(earnedLedger(null)));
    await mount();

    expect(units("nothing-earned")).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------- */
/* Q25 — the Mode 2 capture claim, where a reader of the hours sees it     */
/* ---------------------------------------------------------------------- */

describe("Q25 — every session counted is stated to be Mode 2 capture", () => {
  it("states it in body text, above the table, not in a tooltip or a footnote", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const claim = unit("mode-2-capture-claim");
    expect(claim.textContent).toContain("Mode 2 capture");
    expect(claim.textContent).toContain("session hook");

    // Not a tooltip: the sentence is in the document's text, not in a `title`.
    expect(claim.getAttribute("title")).toBeNull();
    expect(claim.textContent?.length ?? 0).toBeGreaterThan(80);

    // Above the table, so a reader of the hours passes it.
    const position = claim.compareDocumentPosition(unit("stack-table"));
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("states that nothing is filtered, which is what makes the claim falsifiable", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const text = unit("mode-2-capture-claim").textContent ?? "";
    expect(text).toContain("no filter by executor");
    expect(text).toContain("execution mode");
    expect(text).toContain("source");
  });

  it("sits beside the session denominator it is a claim about", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    // More than one match is the point: the claim is made once in full and
    // repeated on the session denominator's own label, so a reader who only
    // scans the tiles still meets it.
    expect(
      within(unit("register-blindness")).getAllByText(/Mode 2 capture/).length,
    ).toBeGreaterThanOrEqual(2);
  });
});

/* ---------------------------------------------------------------------- */
/* FR-106 / Q27 — the rule stated, and its second clause visibly unmet     */
/* ---------------------------------------------------------------------- */

describe("FR-106 — the trigger rule is stated on the screen", () => {
  it("states both halves of clause 1 from the register's own thresholds", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const reg = await register(liveLedger());
    mocks.readStackRegister.mockResolvedValue(reg);
    await mount();

    const rule = unit("trigger-rule");
    expect(rule.dataset.verifyMinEngagements).toBe(String(reg.thresholds.minEngagements));
    expect(rule.dataset.verifyMinHours).toBe(String(reg.thresholds.minHours));
    expect(rule.textContent).toContain("2 or more engagements");
    expect(rule.textContent).toContain("8 or more of Erik’s hours");
  });
});

describe("Q27 — clause 2 ships visibly UNMET", () => {
  it("renders the reason verbatim from the read layer, as a visible notice", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const reg = await register(liveLedger());
    mocks.readStackRegister.mockResolvedValue(reg);
    await mount();

    expect(unit("limb-two-unmet").textContent).toBe(reg.blockingMilestone.reason);
  });

  it("marks the clause as unevaluated rather than as false", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const clauses = units("trigger-clause");
    const two = clauses.find((el) => el.dataset.verifyClause === "2");
    expect(two?.dataset.verifyEvaluated).toBe("false");
    expect(two?.textContent).toContain("Not evaluated");
    expect(two?.textContent).toContain("nothing has checked this one");
    expect(two?.textContent).toContain("clause 2 has never run");

    // The distinction the whole ruling turns on: never CHECKED, not checked and
    // found false. A clause rendered as failing would be a claim about a
    // contract milestone nothing evaluated.
    expect(two?.textContent).not.toContain("not met");
    expect(two?.textContent?.toLowerCase()).not.toContain("failed clause 2");
  });

  it("says an undetermined stack is not a stack established to have earned nothing", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(unit("trigger-rule").textContent).toContain(
      "is not a stack this product has established did",
    );
  });

  it("writes the word `unearned` nowhere on the screen", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(document.body.textContent?.toLowerCase()).not.toContain("unearned");
  });
});

/* ---------------------------------------------------------------------- */
/* FR-104 / FR-105 — the row, on the ledger as it actually is              */
/* ---------------------------------------------------------------------- */

describe("FR-104 / FR-105 — the register's one row today", () => {
  it("renders the stack with its hours, sessions, engagements and both dates", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const row = unit("stack-row");
    expect(row.dataset.verifyStack).toBe("nextjs-supabase");
    expect(row.dataset.verifyOutcome).toBe("undetermined");
    expect(row.dataset.verifyActionable).toBe("false");
    expect(row.dataset.verifyCovered).toBe("false");

    expect(within(row).getByText("nextjs-supabase")).toBeInTheDocument();
    expect(within(row).getByText("2026-08-20")).toBeInTheDocument();
    expect(within(row).getByText("2026-08-22")).toBeInTheDocument();
  });

  it("states a measured zero as `0h` rather than hiding it", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const hours = unit("stack-hours");
    expect(hours.dataset.verifyMinutes).toBe("0");
    expect(hours.dataset.verifyUnderstated).toBe("false");
    expect(hours.textContent).toContain("0h");
  });

  it("flags an understated total once a session on the stack records no duration", async () => {
    const tables = liveLedger();
    tables.work_session = [
      ...tables.work_session,
      {
        id: "ws-3",
        engagement_id: ENG_LEDGER,
        stack_id: STACK_NEXT,
        duration_minutes: null,
        summary: "enc:x",
        source: "session-hook",
      },
    ];

    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(tables));
    await mount();

    const hours = unit("stack-hours");
    expect(hours.dataset.verifyUnderstated).toBe("true");
    expect(hours.textContent).toContain("understate");
    expect(figure("sessions-without-duration").dataset.verifyValue).toBe("1");
  });

  it("states the rule per row, both halves, against the thresholds", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const trigger = unit("stack-trigger");
    expect(trigger.dataset.verifyPresentation).toBe("undetermined");
    expect(trigger.textContent).toContain("1 of 2 engagements");
    expect(trigger.textContent).toContain("0h of 8h");
    expect(trigger.textContent).toContain("clause 2 never evaluated");
  });

  it("renders the rows in the order the read layer gave them, unsorted", async () => {
    const tables = liveLedger();
    tables.stack = [
      { id: "s-z", name: "zig", agent_covering: null, first_seen_at: null, last_seen_at: null },
      { id: "s-a", name: "astro", agent_covering: null, first_seen_at: null, last_seen_at: null },
      ...tables.stack,
    ];

    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const reg = await register(tables);
    mocks.readStackRegister.mockResolvedValue(reg);
    await mount();

    const rendered = units("stack-row").map((el) => el.dataset.verifyStack);
    expect(rendered).toEqual(reg.stacks.map((stack) => stack.name));
    // And the read layer's order is by name, which the screen did not re-derive.
    expect(rendered).toEqual(["astro", "nextjs-supabase", "zig"]);
  });

  it("states an unset agent as nobody having said, never as a dash", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const agent = unit("stack-agent");
    expect(agent.dataset.verifyCovered).toBe("false");
    expect(agent.textContent).toContain("nobody has said");
  });
});

/* ---------------------------------------------------------------------- */
/* FR-107 — the one actionable state, driven deliberately                  */
/* ---------------------------------------------------------------------- */

describe("FR-107 — earned and uncovered is visually distinct from every other row", () => {
  it("marks the row actionable and gives the chip the one borrowed hue", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const reg = await register(earnedLedger(null));
    expect(reg.stacks[0].actionable).toBe(true);
    mocks.readStackRegister.mockResolvedValue(reg);
    await mount();

    const row = unit("stack-row");
    expect(row.dataset.verifyActionable).toBe("true");
    expect(row.dataset.verifyOutcome).toBe("earned");
    expect(row.dataset.verifyCovered).toBe("false");
    expect(row.className).toContain("bg-state-carried/5");

    const trigger = unit("stack-trigger");
    expect(trigger.dataset.verifyPresentation).toBe("actionable");
    expect(trigger.textContent).toContain("earned · no agent");
  });

  it("carries the amber rule on the row's first cell, and transparent on every other", async () => {
    const tables = earnedLedger(null);
    tables.stack = [
      ...tables.stack,
      { id: "s-q", name: "quiet", agent_covering: null, first_seen_at: null, last_seen_at: null },
    ];

    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(tables));
    await mount();

    const rows = units("stack-row");
    const actionable = rows.find((el) => el.dataset.verifyActionable === "true");
    const other = rows.find((el) => el.dataset.verifyActionable === "false");

    expect(actionable?.firstElementChild?.className).toContain("border-l-state-carried");
    expect(other?.firstElementChild?.className).toContain("border-l-transparent");
    // Alignment survives: both rows carry a rule of the same width.
    expect(other?.firstElementChild?.className).toContain("border-l-2");
  });

  it("does NOT treat earned-and-covered as actionable — that row is settled", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    const reg = await register(earnedLedger("api-integrator"));
    expect(reg.stacks[0].trigger.outcome).toBe("earned");
    expect(reg.stacks[0].actionable).toBe(false);
    mocks.readStackRegister.mockResolvedValue(reg);
    await mount();

    const row = unit("stack-row");
    expect(row.dataset.verifyActionable).toBe("false");
    expect(row.className).not.toContain("bg-state-carried/5");
    expect(unit("stack-trigger").textContent).toContain("earned · covered");
    expect(unit("stack-agent").textContent).toContain("api-integrator");
  });

  it("gives the three presentations three different chip treatments", async () => {
    const tables = earnedLedger(null);
    tables.stack = [
      ...tables.stack,
      { id: "s-c", name: "covered", agent_covering: "ui-designer", first_seen_at: null, last_seen_at: null },
      { id: "s-u", name: "undetermined-one", agent_covering: null, first_seen_at: null, last_seen_at: null },
    ];
    tables.work_session = [
      ...tables.work_session,
      { id: "ws-c1", engagement_id: "eng-a", stack_id: "s-c", duration_minutes: 300, summary: "enc:x", source: "session-hook" },
      { id: "ws-c2", engagement_id: "eng-b", stack_id: "s-c", duration_minutes: 200, summary: "enc:x", source: "session-hook" },
      { id: "ws-u1", engagement_id: "eng-a", stack_id: "s-u", duration_minutes: 10, summary: "enc:x", source: "session-hook" },
    ];

    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(tables));
    await mount();

    const presentations = units("stack-trigger").map(
      (el) => el.dataset.verifyPresentation,
    );
    expect(new Set(presentations)).toEqual(
      new Set(["actionable", "settled", "undetermined"]),
    );

    // The distinction is in the class, not only in the attribute: three rows,
    // three different chip class strings.
    const chipClasses = units("stack-trigger").map(
      (el) => el.firstElementChild?.className ?? "",
    );
    expect(new Set(chipClasses).size).toBe(3);
  });

  it("lights the actionable tile only once the set is non-empty", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();
    expect(figure("stacks-actionable").className).not.toContain("border-state-carried/50");

    cleanup();
    mocks.readStackRegister.mockResolvedValue(await register(earnedLedger(null)));
    await mount();
    expect(figure("stacks-actionable").dataset.verifyValue).toBe("1");
    expect(figure("stacks-actionable").className).toContain("border-state-carried/50");
  });
});

/* ---------------------------------------------------------------------- */
/* FR-109 — the operator control is on every row, and named                */
/* ---------------------------------------------------------------------- */

describe("FR-109 — the operator sets the value, and the control says so", () => {
  it("offers one control per row, wired to the server action", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    const trigger = unit("agent-covering-trigger");
    expect(trigger.dataset.verifyStack).toBe(STACK_NEXT);
    expect(trigger.dataset.verifyCovered).toBe("false");
  });

  it("gives the control an accessible name that says which stack it sets", async () => {
    // Two accessibility defects are open from run d4000f. A table of identical
    // "Set agent" labels would be a third.
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(
      screen.getByRole("button", { name: "Set the agent covering nextjs-supabase" }),
    ).toBeInTheDocument();
  });

  it("reads Change once an agent has been named", async () => {
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(earnedLedger("api-integrator")));
    await mount();

    expect(unit("agent-covering-trigger").dataset.verifyCovered).toBe("true");
    expect(
      screen.getByRole("button", { name: "Change the agent covering swift-ios" }),
    ).toBeInTheDocument();
  });

  it("puts no agent name into any data-verify attribute", async () => {
    // The state contract carries counts and statuses, never content — the same
    // rule the audit row follows.
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(earnedLedger("api-integrator")));
    await mount();

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      for (const name of element.getAttributeNames()) {
        if (!name.startsWith("data-verify-")) continue;
        expect(element.getAttribute(name)).not.toContain("api-integrator");
      }
    }
  });
});

/* ---------------------------------------------------------------------- */
/* §7a — nothing sensitive reaches this screen                             */
/* ---------------------------------------------------------------------- */

describe("§7a — `work_session.summary` reaches no part of this screen", () => {
  it("renders neither the ciphertext marker nor the column name", async () => {
    // Every fixture session above carries a `summary`, so a projection that
    // widened to include it would show up here.
    mocks.operatorContext.mockResolvedValue(OPERATOR);
    mocks.readStackRegister.mockResolvedValue(await register(liveLedger()));
    await mount();

    expect(document.body.innerHTML).not.toContain("enc:");
    expect(document.body.innerHTML).not.toContain("summary");
    expect(document.body.innerHTML).not.toContain("whatever Erik was working on");
  });

  it("CONTROL — the fixture really does carry a summary, so the sweep can fail", async () => {
    const reg = await register(liveLedger());
    // The register itself has never held it; that is `columns.test.ts`'s
    // assertion. What this proves is that the fixture rows feeding it do, so a
    // widened projection would have had something to leak.
    expect(JSON.stringify(reg)).not.toContain("enc:");
    expect(JSON.stringify(liveLedger())).toContain("enc:");
  });
});
