// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TRIGGER_THRESHOLDS, evaluateTrigger, isActionable } from "@/lib/server/stacks/rule";
import type { StackRow } from "@/lib/stacks-load";

import {
  NO_AGENT_RECORDED,
  TRIGGER_LABEL,
  formatHours,
  hoursUnderstatedNote,
  triggerPresentation,
  triggerRowSentence,
} from "./display";

/**
 * The `/stacks` screen's formatting, tested without a DOM.
 *
 * ## Every fixture runs through the real rule
 *
 * `evaluateTrigger` and `isActionable` are the functions `loadStackRegister`
 * uses, and every `StackRow` below is built by calling them rather than by
 * hand-writing `{ outcome: "earned" }`. A hand-shaped literal would let this
 * suite stay green against a trigger the read layer can no longer produce, which
 * is the failure a fixture exists to prevent.
 *
 * ## What is deliberately NOT re-tested here
 *
 * The rule itself. `rule.test.ts` owns FR-106's thresholds and FR-107's
 * actionable predicate, and a second set of expectations about the same
 * comparison on this side of the boundary is exactly the drift a single
 * evaluator exists to prevent. What is tested here is the **sentence** — that
 * the screen states the rule per row, and that it never states a claim the
 * product cannot make.
 */

/** A row, with the trigger derived rather than asserted. */
function row(over: {
  name?: string;
  minutes?: number;
  engagements?: number;
  agentCovering?: string | null;
  sessionsWithoutDuration?: number;
}): StackRow {
  const minutes = over.minutes ?? 0;
  const engagements = over.engagements ?? 0;
  const agentCovering = over.agentCovering ?? null;
  const trigger = evaluateTrigger({ minutes, engagements });

  return {
    id: `stack-${over.name ?? "x"}`,
    name: over.name ?? "x",
    agentCovering,
    firstSeenAt: null,
    lastSeenAt: null,
    minutes,
    hours: minutes / 60,
    sessions: 0,
    sessionsWithoutDuration: over.sessionsWithoutDuration ?? 0,
    engagements,
    trigger,
    actionable: isActionable(trigger, agentCovering),
  };
}

describe("FR-105 — formatting hours from the minutes the database holds", () => {
  it("states a measured zero as a zero, plainly", () => {
    // `nextjs-supabase` carries a recorded 0, not a NULL. Refusing to say `0h`
    // would be the same mistake as rendering an unknown count as zero, in the
    // opposite direction.
    expect(formatHours(0)).toBe("0h");
  });

  it("renders sub-hour totals in minutes rather than rounding them to 0h", () => {
    expect(formatHours(1)).toBe("1m");
    expect(formatHours(45)).toBe("45m");
  });

  it("never rounds a near-miss up across the threshold", () => {
    // The whole subject of this screen is a threshold at eight hours. `7h 59m`
    // reading as `8h` would put a stack over a line it is under.
    expect(formatHours(TRIGGER_THRESHOLDS.minHours * 60 - 1)).toBe("7h 59m");
    expect(formatHours(TRIGGER_THRESHOLDS.minHours * 60)).toBe("8h");
  });

  it("drops the minutes only when there are none", () => {
    expect(formatHours(60)).toBe("1h");
    expect(formatHours(90)).toBe("1h 30m");
    expect(formatHours(605)).toBe("10h 5m");
  });

  it("does not throw on a value the schema should never produce", () => {
    expect(formatHours(Number.NaN)).toBe("0h");
  });
});

describe("FR-107 — three presentations, never two", () => {
  it("calls an earned and uncovered stack actionable", () => {
    const actionable = row({ minutes: 480, engagements: 2 });

    expect(actionable.actionable).toBe(true);
    expect(triggerPresentation(actionable)).toBe("actionable");
  });

  it("calls an earned and covered stack settled, not actionable", () => {
    const settled = row({
      minutes: 480,
      engagements: 2,
      agentCovering: "api-integrator",
    });

    expect(settled.trigger.outcome).toBe("earned");
    expect(triggerPresentation(settled)).toBe("settled");
  });

  it("never calls an uncovered undetermined stack actionable", () => {
    // Uncovered, but nothing established it earned anything. Asking Erik to act
    // on it would be asking him to act on a clause nothing evaluated.
    expect(triggerPresentation(row({ minutes: 0, engagements: 1 }))).toBe(
      "undetermined",
    );
  });

  it("labels the actionable state with the two facts that make it actionable", () => {
    expect(TRIGGER_LABEL.actionable).toContain("earned");
    expect(TRIGGER_LABEL.actionable).toContain("no agent");
  });

  it("writes the word 'unearned' on no label at all (Q27, i1's TriggerOutcome)", () => {
    for (const label of Object.values(TRIGGER_LABEL)) {
      expect(label.toLowerCase()).not.toContain("unearned");
    }
  });
});

describe("FR-106 — the rule stated per row", () => {
  it("states both halves of clause 1 against their own thresholds", () => {
    const sentence = triggerRowSentence(
      row({ minutes: 0, engagements: 1 }),
      TRIGGER_THRESHOLDS,
    );

    expect(sentence).toContain(`1 of ${TRIGGER_THRESHOLDS.minEngagements} engagements`);
    expect(sentence).toContain(`0h of ${TRIGGER_THRESHOLDS.minHours}h`);
  });

  it("says clause 2 was never evaluated on an undetermined row, and never says 'not earned'", () => {
    const sentence = triggerRowSentence(
      row({ minutes: 0, engagements: 1 }),
      TRIGGER_THRESHOLDS,
    );

    expect(sentence).toContain("clause 2 never evaluated");
    expect(sentence.toLowerCase()).not.toContain("unearned");
    // "clause 1 not met" is a claim about the clause the product DID evaluate,
    // which is exactly the claim it is entitled to make.
    expect(sentence).toContain("clause 1 not met");
  });

  it("says nothing about clause 2 on an earned row, because clause 1 settled it", () => {
    const sentence = triggerRowSentence(
      row({ minutes: 480, engagements: 2 }),
      TRIGGER_THRESHOLDS,
    );

    expect(sentence).not.toContain("clause 2");
    expect(sentence).toContain(`2 of ${TRIGGER_THRESHOLDS.minEngagements} engagements`);
    expect(sentence).toContain(`8h of ${TRIGGER_THRESHOLDS.minHours}h`);
  });

  it("takes its numbers from the thresholds it is handed, not from a literal", () => {
    // CONTROL: if the sentence were built from a hard-coded 2 and 8, this would
    // still read "of 2 engagements" and the assertion would fail.
    const sentence = triggerRowSentence(row({ minutes: 0, engagements: 1 }), {
      minEngagements: 5,
      minHours: 40,
    });

    expect(sentence).toContain("of 5 engagements");
    expect(sentence).toContain("of 40h");
  });
});

describe("FR-105 — the understatement caveat is attached only where it is true", () => {
  it("says nothing when every session on the stack recorded a duration", () => {
    expect(hoursUnderstatedNote(row({ minutes: 480 }))).toBeNull();
  });

  it("states the shortfall in words once a session carries no duration", () => {
    const note = hoursUnderstatedNote(row({ sessionsWithoutDuration: 1 }));

    expect(note).not.toBeNull();
    expect(note).toContain("1 session ");
    expect(note).toContain("understate");
  });

  it("agrees with itself on plurals", () => {
    expect(hoursUnderstatedNote(row({ sessionsWithoutDuration: 3 }))).toContain(
      "3 sessions",
    );
  });
});

describe("FR-109 — an unset agent is nobody having said, not an absent agent", () => {
  it("states who has not spoken rather than drawing a dash", () => {
    // A dash would read as "no agent covers this", which is a claim about
    // `~/.claude/agents/` — a directory this product cannot read.
    expect(NO_AGENT_RECORDED).toContain("said");
    expect(NO_AGENT_RECORDED).not.toBe("—");
    expect(NO_AGENT_RECORDED).not.toBe("-");
  });
});

describe("Q26 — the word this surface does not reuse", () => {
  it("appears in no label or copy this module exports", () => {
    const strings = [NO_AGENT_RECORDED, ...Object.values(TRIGGER_LABEL)];

    for (const value of strings) {
      expect(value.toLowerCase()).not.toContain("coverage");
    }

    expect(
      triggerRowSentence(row({ minutes: 0, engagements: 1 }), TRIGGER_THRESHOLDS).toLowerCase(),
    ).not.toContain("coverage");
    expect(hoursUnderstatedNote(row({ sessionsWithoutDuration: 1 }))?.toLowerCase()).not.toContain(
      "coverage",
    );
  });
});
