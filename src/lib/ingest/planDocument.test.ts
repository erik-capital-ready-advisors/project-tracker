import { describe, it, expect } from "vitest";
import { parsePlanDocument, type ParsedPlan } from "./planDocument";
import {
  NOT_A_PLAN_MANIFEST,
  NOT_A_PLAN_NO_HEADINGS,
  NOT_A_PLAN_NO_STEPS,
  NOT_A_PLAN_PROSE,
  PLAN,
  PLAN_WITH_DUPLICATE_PLAN_ID,
  PLAN_WITH_MALFORMED_PLAN_ID,
  PLAN_WITH_ORPHAN_STEPS,
  PLAN_WITH_PLAN_ID,
  PLAN_WITH_UNPARSEABLE_HEADINGS,
  PLAN_WITH_UNPARSEABLE_STEPS,
} from "./__fixtures__/planDocument";

/** Narrow to the plan arm, failing loudly rather than silently skipping. */
const plan = (text: string, source = "plan.md"): ParsedPlan => {
  const result = parsePlanDocument(text, "tracker", source);
  if (result.kind !== "plan") {
    throw new Error(`expected a plan document, got not-a-plan: ${result.reason}`);
  }
  return result;
};

describe("parsePlanDocument — the writing-plans shape", () => {
  it("FR-89 produces one task per `### Task N:` heading", () => {
    expect(plan(PLAN).tasks).toHaveLength(2);
  });

  it("FR-89 reads the positional task number and the title", () => {
    const [first] = plan(PLAN).tasks;
    expect(first.taskNumber).toBe(1);
    expect(first.title).toBe("Package skeleton and types");
  });

  it("FR-87 a well-formed task is planned work, so its status is pending", () => {
    expect(plan(PLAN).tasks.map((task) => task.status)).toEqual(["pending", "pending"]);
  });

  it("FR-89 collects the `- [ ]` steps under the heading that carries them", () => {
    expect(plan(PLAN).tasks.map((task) => task.steps.length)).toEqual([2, 2]);
  });

  it("FR-89 reads a checked step as done and an unchecked one as pending", () => {
    expect(plan(PLAN).tasks[0].steps.map((step) => step.status)).toEqual(["done", "pending"]);
  });

  it("FR-89 keeps the step text as written", () => {
    expect(plan(PLAN).tasks[0].steps[0].text).toBe("**Step 1: Write the failing test**");
  });

  it("FR-19 records the requirements a task title names", () => {
    expect(plan(PLAN).tasks[1].implements).toEqual(["FR-12", "FR-13", "FR-14"]);
  });

  it("FR-89 ignores headings and steps inside a fenced code block", () => {
    // The fence in Task 1 holds `### Task 99:`, a `- [ ]` line and a
    // `## Work-units` heading. All three are the task's content, not markup.
    const tasks = plan(PLAN).tasks;
    expect(tasks.map((task) => task.taskNumber)).toEqual([1, 2]);
    expect(tasks[0].steps).toHaveLength(2);
  });

  it("FR-89 ends a task at the next non-task section heading", () => {
    // `## Done when` closes Task 2 rather than swallowing the trailer.
    expect(plan(PLAN).tasks[1].steps.map((step) => step.text)).toEqual([
      "**Step 1: Write the failing test**",
      "**Step 2: Commit**",
    ]);
  });

  it("FR-89 reports zero unparsed for a document it fully understood", () => {
    const result = plan(PLAN);
    expect([result.unparsedTasks, result.unparsedSteps]).toEqual([0, 0]);
  });

  it("FR-16 scopes the row identity by engagement, document and position", () => {
    expect(plan(PLAN).tasks[0].id).toBe("tracker:plan:plan.md:1");
  });

  it("FR-89 records the line each task was read from", () => {
    expect(plan(PLAN).tasks.map((task) => task.line)).toEqual([14, 32]);
  });
});

describe("parsePlanDocument — `unparsed` is the only default", () => {
  it("FR-89 marks every task heading it cannot classify unparsed rather than guessing", () => {
    const result = plan(PLAN_WITH_UNPARSEABLE_HEADINGS);
    expect(result.tasks).toHaveLength(6);
    expect(result.unparsedTasks).toBe(5);
  });

  it("FR-89 invents no task number for `### Task Twelve:`", () => {
    const [, twelve] = plan(PLAN_WITH_UNPARSEABLE_HEADINGS).tasks;
    expect(twelve.status).toBe("unparsed");
    expect(twelve.taskNumber).toBeNull();
    expect(twelve.title).toBeNull();
  });

  it("FR-89 keeps the heading verbatim on a row it could not classify", () => {
    const [, twelve] = plan(PLAN_WITH_UNPARSEABLE_HEADINGS).tasks;
    expect(twelve.rawHeading).toBe("### Task Twelve: A number the parser will not invent");
  });

  it("FR-89 emits a row for an unclassifiable heading rather than omitting it", () => {
    // Silent omission is the other half of the failure `unparsed` prevents.
    const raw = plan(PLAN_WITH_UNPARSEABLE_HEADINGS).tasks.map((task) => task.rawHeading);
    expect(raw).toContain("## Task 4: The wrong heading level");
    expect(raw).toContain("#### Task 5: Also the wrong heading level");
    expect(raw).toContain("### Task 6 — no colon at all");
  });

  it("FR-89 marks a heading with an empty title unparsed", () => {
    const three = plan(PLAN_WITH_UNPARSEABLE_HEADINGS).tasks[2];
    expect(three.rawHeading).toBe("### Task 3:");
    expect(three.status).toBe("unparsed");
  });

  it("FR-89 marks every step line it cannot classify unparsed", () => {
    const result = plan(PLAN_WITH_UNPARSEABLE_STEPS);
    expect(result.tasks[0].steps).toHaveLength(6);
    expect(result.unparsedSteps).toBe(4);
  });

  it("FR-89 names which step shapes it refused, so a real shape can be added", () => {
    const refused = plan(PLAN_WITH_UNPARSEABLE_STEPS)
      .tasks[0].steps.filter((step) => step.status === "unparsed")
      .map((step) => step.raw);
    expect(refused).toEqual([
      "- [~] A mark nobody has defined",
      "- [] An empty bracket",
      "- [ ]",
      "- [ ]NoSpaceAfterTheBracket",
    ]);
  });

  it("FR-89 reads an asterisk bullet with a capital X as done", () => {
    const last = plan(PLAN_WITH_UNPARSEABLE_STEPS).tasks[0].steps[5];
    expect(last.status).toBe("done");
    expect(last.text).toBe("An asterisk bullet, checked");
  });

  it("FR-89 holds steps that belong to no task rather than attaching them to one", () => {
    const result = plan(PLAN_WITH_ORPHAN_STEPS);
    expect(result.tasks[0].steps).toHaveLength(1);
    expect(result.orphanSteps.map((step) => step.text)).toEqual([
      "**Step 0: A step before any task**",
      "**Step 9: A step under a trailing section**",
    ]);
  });
});

describe("parsePlanDocument — FR-90 reconciliation id", () => {
  it("FR-90 reads an explicit plan id where the document carries one", () => {
    expect(plan(PLAN_WITH_PLAN_ID).tasks[1].planRef).toBe("wp-2f7a");
  });

  it("FR-90 records the absence of an id as null, never as the task number", () => {
    const result = plan(PLAN);
    expect(result.tasks.map((task) => task.planRef)).toEqual([null, null]);
    expect(result.tasksWithoutPlanRef).toBe(2);
    expect(result.tasksWithPlanRef).toBe(0);
  });

  it("FR-90 counts which tasks carry an id, so the caller need not infer it", () => {
    const result = plan(PLAN_WITH_PLAN_ID);
    expect([result.tasksWithPlanRef, result.tasksWithoutPlanRef]).toEqual([1, 1]);
  });

  it("FR-90 refuses an id it cannot read rather than guessing the key that merges rows", () => {
    const [, task] = plan(PLAN_WITH_MALFORMED_PLAN_ID).tasks;
    expect(task.status).toBe("unparsed");
    expect(task.planRef).toBeNull();
  });

  it("FR-90 refuses two ids in one task, because ambiguity on the key is not resolvable", () => {
    const [, task] = plan(PLAN_WITH_DUPLICATE_PLAN_ID).tasks;
    expect(task.status).toBe("unparsed");
    expect(task.planRef).toBeNull();
  });

  it("FR-90 never derives the id from the title", () => {
    // Title similarity is excluded absolutely; the whole read side depends on it.
    const titles = plan(PLAN).tasks.map((task) => task.title);
    const refs = plan(PLAN).tasks.map((task) => task.planRef);
    expect(titles.every((title) => title !== null)).toBe(true);
    expect(refs).toEqual([null, null]);
  });
});

describe("parsePlanDocument — a document of another shape is not a plan", () => {
  // Q12: rejected whole. NOT partially parsed, and NOT a page of `unparsed` rows.

  it("FR-89 rejects a fleet manifest rather than parsing it as a plan", () => {
    const result = parsePlanDocument(NOT_A_PLAN_MANIFEST, "tracker", "manifest-zz01.md");
    expect(result.kind).toBe("not-a-plan");
  });

  it("FR-89 rejects prose that mentions no task at all", () => {
    const result = parsePlanDocument(NOT_A_PLAN_PROSE, "tracker", "notes.md");
    expect(result).toEqual({
      kind: "not-a-plan",
      source: "notes.md",
      reason: "no-task-headings",
    });
  });

  it("FR-89 rejects a checklist carrying steps under no task heading", () => {
    const result = parsePlanDocument(NOT_A_PLAN_NO_HEADINGS, "tracker", "checklist.md");
    expect(result.kind === "not-a-plan" && result.reason).toBe("no-task-headings");
  });

  it("FR-89 rejects task headings that carry no steps", () => {
    const result = parsePlanDocument(NOT_A_PLAN_NO_STEPS, "tracker", "outline.md");
    expect(result.kind === "not-a-plan" && result.reason).toBe("no-checkbox-steps");
  });

  it("FR-89 hands back no rows at all for a document of another shape", () => {
    // The failure this guards: a manifest yielding 8 `unparsed` rows, which
    // reads on screen as eight things nobody has classified rather than as one
    // file that was never a plan.
    for (const text of [NOT_A_PLAN_MANIFEST, NOT_A_PLAN_PROSE, NOT_A_PLAN_NO_HEADINGS]) {
      const result = parsePlanDocument(text, "tracker", "x.md");
      expect(Object.keys(result)).toEqual(["kind", "source", "reason"]);
    }
  });

  it("FR-89 rejects an empty document", () => {
    expect(parsePlanDocument("", "tracker", "empty.md").kind).toBe("not-a-plan");
  });

  it("FR-89 is unaffected by CRLF line endings", () => {
    const crlf = PLAN.split("\n").join("\r\n");
    expect(plan(crlf).tasks.map((task) => task.title)).toEqual([
      "Package skeleton and types",
      "The reader. FR-12 to FR-14",
    ]);
  });

  it("FR-89 is deterministic — the same text parses to the same records twice", () => {
    expect(parsePlanDocument(PLAN, "tracker", "plan.md")).toEqual(
      parsePlanDocument(PLAN, "tracker", "plan.md"),
    );
  });
});
