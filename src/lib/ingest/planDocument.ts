import { requirementRefs } from "./refs";
import type { WorkStatus } from "./types";

/**
 * FR-89 — the plan-document parser.
 *
 * A pure function over text. It reads no filesystem, opens no connection and
 * calls no clock, exactly like every other rule in this package.
 *
 * ## The two lines the Q12 ruling draws, which are different lines
 *
 * 1. **A document not of the plan shape is not a plan document.** It is
 *    rejected whole, as `{ kind: "not-a-plan" }`. It is *not* partially parsed
 *    and it does *not* produce a page of `unparsed` rows.
 * 2. **A line inside a genuine plan document that cannot be classified becomes
 *    `unparsed`** — never a guess, never a silent omission.
 *
 * ## The shape, scoped by Q12 to the `writing-plans` output and nothing else
 *
 * ```md
 * ### Task 5: Parse the work-unit table
 *
 * - [ ] **Step 1: Write the failing test**
 * - [x] **Step 2: Run it and watch it fail**
 * ```
 *
 * `### Task N: <title>` headings carrying `- [ ]` steps. That is what
 * `plan.md` in this repository already is and what the fleet already consumes,
 * so the parser targets a shape that exists rather than one invented for it.
 *
 * ## Candidates are recognised broadly and classified narrowly
 *
 * That direction is deliberate and it is the whole `unparsed` discipline. A
 * *candidate* is any heading whose text begins with the word `Task`, and any
 * bullet carrying a one-character bracket. A candidate that does not match the
 * exact shape is emitted with `status: "unparsed"` and its source line
 * verbatim. Widening the *classification* patterns to make a stubborn line
 * classify is the failure this module exists to prevent; the fix for a shape
 * the fleet really emits is to add that shape, not to loosen these.
 *
 * Body prose and fenced code are a task's content, not classification
 * candidates. `plan.md` embeds `### 6.1 Access` and whole markdown tables
 * inside fences (measured 2026-08-24: 2 fenced `###` headings, 13 unfenced
 * task headings, 82 unfenced steps, 0 fenced steps), so fence tracking is a
 * correctness requirement here and not a nicety.
 *
 * ## FR-90 / Q13 — the reconciliation id
 *
 * `planRef` is the explicit id the plan carries and the manifest echoes. It is
 * read where present and **recorded as `null` where absent**, which today is
 * everywhere: measured 2026-08-24, no artifact emits one. `taskNumber` is the
 * positional `N` in the heading, it shifts the moment a task is inserted, and
 * it is **never** a reconciliation key. Neither is `title`. Prose and title
 * similarity are excluded absolutely — falling back to them is the wrong
 * `done` that CR-005 was written to prevent.
 */

/** A checkbox step under a task heading. */
export interface PlanStep {
  /** 1-based line number in the source document. */
  line: number;
  /** The source line, verbatim (minus a trailing CR). */
  raw: string;
  /** The step's text as written. `null` when the line could not be classified. */
  text: string | null;
  /** `pending` for `- [ ]`, `done` for `- [x]`, `unparsed` for anything else. */
  status: WorkStatus;
}

/**
 * One `### Task N: <title>` heading and the steps beneath it.
 *
 * Not a `work_item` row — mapping this onto one is the persistence path's job
 * (FR-87/FR-88, unit i3). `title` and every `step.text` are client prose and
 * §7a classifies `work_item` prose `sensitive`; whatever column they land in
 * is encrypted at rest by the caller, never here.
 */
export interface PlanTask {
  /**
   * `<engagement>:plan:<source>:<ordinal>`. An identity for this row in this
   * parse. Positional, therefore **not** a reconciliation key.
   */
  id: string;
  engagement: string;
  /** The document name handed in, echoed back. */
  source: string;
  /** 1-based position of this heading among the task headings, in document order. */
  ordinal: number;
  /** 1-based line number of the heading. */
  line: number;
  /** The heading line, verbatim. What the artifact said. */
  rawHeading: string;
  /**
   * The `N` in `### Task N:`. **Positional numbering — it shifts when a task
   * is inserted, so it is never a reconciliation key (Q13).** `null` when the
   * heading could not be classified.
   */
  taskNumber: number | null;
  /**
   * The explicit reconciliation id the plan carries (FR-90, Q13), read from a
   * `**Plan-id:** <token>` line in the task body. **`null` records its
   * absence**, which is the only value any artifact produces today. Never
   * synthesised from `taskNumber` or `title`.
   */
  planRef: string | null;
  /** The heading's title text. `null` when the heading could not be classified. */
  title: string | null;
  /** `pending` for a task this parser understood, `unparsed` for one it did not. */
  status: WorkStatus;
  steps: PlanStep[];
  /** `FR-nn` references named in the title. The body is prose, not a claim. */
  implements: string[];
}

/** A document of the `writing-plans` shape. */
export interface ParsedPlan {
  kind: "plan";
  engagement: string;
  source: string;
  tasks: PlanTask[];
  /**
   * Steps outside any task — before the first task heading, or under a later
   * non-task section. They belong to no task, so they are neither dropped nor
   * forced into one they may not be part of.
   */
  orphanSteps: PlanStep[];
  /** Task headings this parser could not classify. */
  unparsedTasks: number;
  /** Step lines this parser could not classify, orphans included. */
  unparsedSteps: number;
  /** Tasks carrying an explicit FR-90 reconciliation id. */
  tasksWithPlanRef: number;
  /** Tasks carrying none. Today, by measurement, this is every task. */
  tasksWithoutPlanRef: number;
}

/**
 * Why a document was rejected whole.
 *
 * - `no-task-headings` — not one `### Task N: <title>` heading outside a fence.
 * - `no-checkbox-steps` — headings, but no task carries a `- [ ]` step.
 */
export type NotAPlanReason = "no-task-headings" | "no-checkbox-steps";

/** A document that is not of the plan shape. Q12: it is not partially parsed. */
export interface NotAPlan {
  kind: "not-a-plan";
  source: string;
  reason: NotAPlanReason;
}

/**
 * Discriminated on `kind`, whose arms are objects. A sentinel that is a bare
 * string literal beside a `string` arm does not discriminate — TypeScript
 * absorbs the literal into the primitive and the union silently loses an arm
 * (measured, run `eb2490`).
 */
export type PlanParseResult = ParsedPlan | NotAPlan;

/** Any heading whose text begins with the word `Task`. Deliberately broad. */
const TASK_CANDIDATE = /^#{1,6}[ \t]+task\b/i;
/** The one shape Q12 admits: exactly three hashes, one space, `Task N:`. */
const TASK_HEADING = /^### Task (\d+):(.*)$/;

/** Any bullet carrying a bracket of at most one character. Deliberately broad. */
const STEP_CANDIDATE = /^[ \t]*[-*+][ \t]+\[(.?)\](.*)$/;

/** Any `**Plan-id:**` line. Deliberately broad. */
const PLAN_ID_CANDIDATE = /^[ \t]*\*{2}plan-id:\*{2}/i;
/** The one shape admitted for the FR-90 reconciliation id. */
const PLAN_ID = /^\*\*Plan-id:\*\*[ \t]+`?([A-Za-z0-9][A-Za-z0-9._:-]*)`?[ \t]*$/;

/**
 * A top-level heading that is not a task ends the task above it. Measured
 * against `plan.md`: every mid-task `##` in it sits inside a fence, and the
 * only unfenced ones are the preamble and the closing `## Done when` — so a
 * checkbox under those trailing sections is an orphan, not Task 13's.
 */
const SECTION_HEADING = /^#{1,3}[ \t]/;

const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

interface Draft {
  task: PlanTask;
  /** Every `**Plan-id:**` candidate in the body. Two is as unclassifiable as none. */
  planIdLines: string[];
  /** The heading matched `### Task N: <title>`, whatever the body then did. */
  headingWellFormed: boolean;
}

function classifyStep(line: string, lineNumber: number): PlanStep {
  const match = STEP_CANDIDATE.exec(line);
  // Only ever called on a candidate.
  if (match === null) return { line: lineNumber, raw: line, text: null, status: "unparsed" };

  const [, marker, rest] = match;
  const unparsed: PlanStep = { line: lineNumber, raw: line, text: null, status: "unparsed" };

  if (marker !== " " && marker !== "x" && marker !== "X") return unparsed;
  // `- [ ]foo` is not a task-list item in any markdown dialect, and guessing
  // that it meant `foo` is exactly the guess this module refuses.
  if (rest !== "" && !/^[ \t]/.test(rest)) return unparsed;
  const text = rest.trim();
  if (text === "") return unparsed;

  return {
    line: lineNumber,
    raw: line,
    text,
    status: marker === " " ? "pending" : "done",
  };
}

function startDraft(
  line: string,
  lineNumber: number,
  ordinal: number,
  engagement: string,
  source: string,
): Draft {
  const match = TASK_HEADING.exec(line);
  const title = match === null ? "" : match[2].trim();
  const wellFormed = match !== null && title !== "";

  return {
    headingWellFormed: wellFormed,
    planIdLines: [],
    task: {
      id: `${engagement}:plan:${source}:${ordinal}`,
      engagement,
      source,
      ordinal,
      line: lineNumber,
      rawHeading: line,
      taskNumber: wellFormed && match !== null ? Number(match[1]) : null,
      planRef: null,
      title: wellFormed ? title : null,
      status: wellFormed ? "pending" : "unparsed",
      steps: [],
      implements: wellFormed ? requirementRefs(title) : [],
    },
  };
}

/**
 * Resolve the FR-90 id, and refuse to guess at it.
 *
 * A malformed or duplicated `**Plan-id:**` line makes the whole task
 * `unparsed`. This is the reconciliation key: a wrong one merges two rows that
 * are not the same work, which is the wrong `done` this product exists to
 * prevent. Its absence is ordinary and stays `pending`.
 */
function resolvePlanRef(draft: Draft): void {
  if (draft.planIdLines.length === 0) return;
  if (draft.planIdLines.length > 1) {
    draft.task.status = "unparsed";
    return;
  }
  const match = PLAN_ID.exec(draft.planIdLines[0].trim());
  if (match === null) {
    draft.task.status = "unparsed";
    return;
  }
  draft.task.planRef = match[1];
}

/**
 * Parse a plan document.
 *
 * @param text      the document, as text
 * @param engagement engagement slug the rows belong to (FR-87: always one)
 * @param source    the document's name, for identity and reporting
 */
export function parsePlanDocument(
  text: string,
  engagement: string,
  source: string,
): PlanParseResult {
  const drafts: Draft[] = [];
  const orphanSteps: PlanStep[] = [];
  let current: Draft | null = null;
  let fence: string | null = null;

  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const fenceMatch = FENCE.exec(line);
    if (fenceMatch !== null) {
      const [, marker, info] = fenceMatch;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && info.trim() === "") {
        fence = null;
      }
      return;
    }
    if (fence !== null) return;

    if (TASK_CANDIDATE.test(line)) {
      if (current !== null) resolvePlanRef(current);
      current = startDraft(line, lineNumber, drafts.length + 1, engagement, source);
      drafts.push(current);
      return;
    }

    if (SECTION_HEADING.test(line)) {
      if (current !== null) resolvePlanRef(current);
      current = null;
      return;
    }

    if (STEP_CANDIDATE.test(line)) {
      const step = classifyStep(line, lineNumber);
      if (current === null) orphanSteps.push(step);
      else current.task.steps.push(step);
      return;
    }

    if (current !== null && PLAN_ID_CANDIDATE.test(line)) current.planIdLines.push(line);
  });
  if (current !== null) resolvePlanRef(current);

  // Q12, line one: is this a plan document at all? Answered before any row is
  // handed out, so a document of another shape yields none rather than a page
  // of `unparsed`.
  const wellFormed = drafts.filter((draft) => draft.headingWellFormed);
  if (wellFormed.length === 0) return { kind: "not-a-plan", source, reason: "no-task-headings" };

  const carriesSteps = wellFormed.some((draft) =>
    draft.task.steps.some((step) => step.status !== "unparsed"),
  );
  if (!carriesSteps) return { kind: "not-a-plan", source, reason: "no-checkbox-steps" };

  const tasks = drafts.map((draft) => draft.task);
  const allSteps = [...orphanSteps, ...tasks.flatMap((task) => task.steps)];

  return {
    kind: "plan",
    engagement,
    source,
    tasks,
    orphanSteps,
    unparsedTasks: tasks.filter((task) => task.status === "unparsed").length,
    unparsedSteps: allSteps.filter((step) => step.status === "unparsed").length,
    tasksWithPlanRef: tasks.filter((task) => task.planRef !== null).length,
    tasksWithoutPlanRef: tasks.filter((task) => task.planRef === null).length,
  };
}
