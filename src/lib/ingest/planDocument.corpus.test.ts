// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parsePlanDocument, type ParsedPlan } from "./planDocument";

/**
 * The FR-89 parser against a real `writing-plans` artifact.
 *
 * `plan.md` at the repository root is the plan this very package was built
 * from. It is committed, so unlike the `fixtures-local/` corpus this tier runs
 * everywhere and **never skips** — a skipped oracle is indistinguishable from a
 * passing one. It carries this project's own tooling detail and no client
 * prose, so reading it here crosses no §7a boundary; it is not copied into a
 * fixture because there is no need to duplicate a file already in the tree.
 *
 * ## The oracle is independent of the parser
 *
 * The expected counts below were measured on 2026-08-24 with a line-anchored
 * `awk` pass over `plan.md` — a dumber reader than the parser, which is the
 * point: a check figure produced by the code under test checks nothing. A
 * parser that silently drops rows raises nothing at all, it just returns a
 * smaller and entirely plausible number.
 *
 *   13 `### Task N:` headings outside a fence
 *   82 `- [ ]` / `- [x]` steps outside a fence, 0 inside one
 *    0 steps belonging to no task
 *    2 `###` headings inside a fence, which are content and not markup
 *
 * If `plan.md` changes, re-measure with the same independent pass and update
 * these numbers. Do not adjust the parser to fit them, and do not edit
 * `plan.md` to fit the parser.
 */

const PLAN_PATH = join(process.cwd(), "plan.md");

const parsed = (): ParsedPlan => {
  const result = parsePlanDocument(readFileSync(PLAN_PATH, "utf8"), "tracker", "plan.md");
  if (result.kind !== "plan") {
    throw new Error(`plan.md is a writing-plans document, parsed as not-a-plan: ${result.reason}`);
  }
  return result;
};

describe("parsePlanDocument against the repository's own plan.md", () => {
  it("FR-89 finds the corpus document, so a green result is not an absent one", () => {
    expect(existsSync(PLAN_PATH)).toBe(true);
  });

  it("FR-89 recognises a real writing-plans document as a plan", () => {
    expect(parsed().kind).toBe("plan");
  });

  it("FR-89 reads all 13 task headings", () => {
    expect(parsed().tasks).toHaveLength(13);
  });

  it("FR-89 reads all 82 steps, and none of the ones inside fenced code", () => {
    const steps = parsed().tasks.reduce((total, task) => total + task.steps.length, 0);
    expect(steps).toBe(82);
  });

  it("FR-89 distributes the steps onto the task that carries each one", () => {
    expect(parsed().tasks.map((task) => task.steps.length)).toEqual([
      6, 7, 6, 6, 6, 6, 7, 6, 6, 6, 6, 6, 8,
    ]);
  });

  it("FR-89 numbers the tasks as the document numbers them", () => {
    expect(parsed().tasks.map((task) => task.taskNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it("FR-89 leaves no step belonging to no task", () => {
    expect(parsed().orphanSteps).toEqual([]);
  });

  it("FR-89 classifies every line of a real plan, so unparsed is 0", () => {
    const result = parsed();
    expect([result.unparsedTasks, result.unparsedSteps]).toEqual([0, 0]);
  });

  it("FR-90 finds no reconciliation id on any task, because no artifact emits one", () => {
    // Measured 2026-08-24 and recorded in CR-005 §3.1a. When the plan template
    // starts emitting an id this test goes red, which is the notification.
    const result = parsed();
    expect(result.tasksWithPlanRef).toBe(0);
    expect(result.tasksWithoutPlanRef).toBe(13);
  });
});
