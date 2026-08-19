import type {
  Defect,
  DefectSeverity,
  DefectStatus,
  Engagement,
  Requirement,
  TestCase,
  TestResult,
  WorkItem,
} from "./types";

/** `D-1`, `D-12` — read out of a test title the same way FR-45 reads `FR-nn`. */
const DEFECT_REF = /\bD-\d+\b/g;
const FR_REF = /\bFR-\d+\b/;

const ISSUES_HEADING = /^##\s+Issues\b/;
const SUB_HEADING = /^###\s+(.*\S)\s*$/;
const TOP_HEADING = /^##?\s+/;
const FINDING_START = /^\s*\d+\.\s+(.*)$/;
const BOLD_TITLE = /\*\*(.+?)\*\*/;

const MAX_TITLE = 200;

/**
 * The QA report grades findings `Critical` / `Important` / `Minor`; FR-63 fixes
 * the defect severity enum as `critical` / `major` / `minor`. The two
 * vocabularies are Erik's and they disagree, so the mapping is written out by
 * name and the artifact's own word is kept verbatim in `rawSeverity` — emit
 * what the artifact says, and where two artifacts disagree, record both.
 *
 * Every entry here was read off the report template in
 * `~/.claude/agents/qa-reviewer.md`. Anything else is `unparsed`, reported
 * rather than defaulted. Adding a synonym to make a stubborn heading classify
 * is the failure this table exists to prevent.
 */
const SEVERITY_BY_HEADING: ReadonlyMap<string, DefectSeverity> = new Map([
  ["critical", "critical"],
  ["important", "major"],
  ["major", "major"],
  ["minor", "minor"],
]);

interface RawFinding {
  heading: string | null;
  lines: string[];
}

/** Split the `## Issues` section into findings, tagged with the heading above each. */
function findings(text: string): RawFinding[] {
  const collected: RawFinding[] = [];
  let inIssues = false;
  let heading: string | null = null;
  let current: RawFinding | null = null;

  const flush = () => {
    if (current !== null) collected.push(current);
    current = null;
  };

  for (const line of text.split("\n")) {
    if (ISSUES_HEADING.test(line)) {
      inIssues = true;
      heading = null;
      continue;
    }
    if (!inIssues) continue;

    const sub = SUB_HEADING.exec(line);
    if (sub !== null) {
      flush();
      heading = sub[1];
      continue;
    }
    if (TOP_HEADING.test(line)) {
      flush();
      inIssues = false;
      continue;
    }

    if (FINDING_START.test(line)) {
      flush();
      current = { heading, lines: [line] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  flush();
  return collected;
}

function titleOf(startLine: string): string {
  const body = FINDING_START.exec(startLine)?.[1] ?? startLine;
  const bold = BOLD_TITLE.exec(body);
  // The title is free text, not a classified field, so falling back to the
  // line itself is a transcription rather than a guess. The classified field
  // is `severity`, and that carries the unparsed discipline.
  return (bold?.[1] ?? body).trim().slice(0, MAX_TITLE);
}

export interface QaFindings {
  defects: Defect[];
  /** FR-58: how many findings this parser could not grade. */
  unparsed: number;
}

/**
 * FR-64. Parse a fleet QA report's `## Issues` section into defects.
 *
 * Pure: text in, records out. `ref` is left null — `D-nn` is allocated per
 * engagement and a pure function cannot know the high-water mark.
 * `fixingWorkItem` is left null too: the report template carries no such
 * field, and inventing a regex for a shape the artifact does not use is
 * exactly the move the unparsed discipline forbids.
 */
export function parseQaFindings(
  text: string,
  engagement: string,
  reportName: string,
): QaFindings {
  const defects: Defect[] = [];

  findings(text).forEach((finding, index) => {
    const heading = finding.heading;
    const severity =
      heading === null
        ? "unparsed"
        : SEVERITY_BY_HEADING.get(heading.toLowerCase()) ?? "unparsed";

    const description = finding.lines.slice(1).join("\n").trim();
    const whole = finding.lines.join("\n");

    defects.push({
      id: `${engagement}:${reportName}:${index}`,
      engagement,
      ref: null,
      source: "qa_agent",
      severity,
      rawSeverity: heading,
      title: titleOf(finding.lines[0]),
      description: description === "" ? null : description,
      status: "open",
      wontFixReason: null,
      requirementRef: FR_REF.exec(whole)?.[0] ?? null,
      fixingWorkItem: null,
      reportedAt: null,
      reportedBy: null,
    });
  });

  return {
    defects,
    unparsed: defects.filter((defect) => defect.severity === "unparsed").length,
  };
}

/**
 * FR-65. A defect may name the requirement it violates and the work item that
 * fixes it. A reference to something that does not exist is reported, never
 * silently accepted — the same rule FR-12 states for work items.
 */
export function checkDefectRefs(
  defects: Defect[],
  requirements: Requirement[],
  workItems: WorkItem[],
): string[] {
  const knownRefs = new Set(requirements.map((requirement) => requirement.ref));
  const knownItems = new Set(workItems.map((item) => item.id));
  const errors: string[] = [];

  for (const defect of defects) {
    const id = defect.ref ?? defect.id;
    if (defect.requirementRef !== null && !knownRefs.has(defect.requirementRef)) {
      errors.push(`defect ${id}: requirement ${defect.requirementRef} does not exist`);
    }
    if (defect.fixingWorkItem !== null && !knownItems.has(defect.fixingWorkItem)) {
      errors.push(`defect ${id}: fixing work item ${defect.fixingWorkItem} does not exist`);
    }
  }
  return errors;
}

export type VerificationBlock =
  | "no-passing-test"
  | "no-fixing-executor"
  | "self-certified";

export interface DefectVerdict {
  status: DefectStatus;
  /** Test ids whose certifier is the executor of the fixing work item. */
  selfCertified: string[];
  /** Why `verified` was withheld, or null when it was granted. */
  blockedBy: VerificationBlock | null;
}

export interface DefectVerificationInput {
  defects: Defect[];
  workItems: WorkItem[];
  tests: TestCase[];
  results: TestResult[];
}

/**
 * FR-66. `verified` is computed and nothing sets it.
 *
 * The join runs: defect -> its fixing work item -> that work item's executor,
 * and the certifier is compared against **that executor and nothing else**.
 * Comparing against every executor in the engagement looks equivalent and is
 * not: on a real fleet run `qa-reviewer` is itself a work-unit executor, so the
 * widened form rejects every legitimate QA certification and leaves defects
 * permanently unverifiable. This is the same join shape as FR-47's in
 * coverage.ts, and it fails the same way.
 *
 * A defect with no fixing work item — or one whose executor is unknown — cannot
 * be verified at all: there is no party for the certifier to be independent of,
 * so the independence condition is vacuous rather than satisfied. Reported as
 * `no-fixing-executor` rather than waved through.
 */
export function deriveDefectStatuses(
  input: DefectVerificationInput,
): Map<string, DefectVerdict> {
  const executorOf = new Map(
    input.workItems.map((item) => [item.id, item.executor] as const),
  );
  const testsById = new Map(input.tests.map((test) => [test.id, test]));

  /** D-ref -> the ids of tests naming it that passed, with their certifier. */
  const passesByRef = new Map<string, { testId: string; certifiedBy: string | null }[]>();
  for (const result of input.results) {
    if (result.status !== "pass") continue;
    const test = testsById.get(result.testId);
    if (test === undefined) continue;
    for (const ref of test.title.match(DEFECT_REF) ?? []) {
      const passes = passesByRef.get(ref) ?? [];
      passes.push({ testId: test.id, certifiedBy: result.certifiedBy });
      passesByRef.set(ref, passes);
    }
  }

  const verdicts = new Map<string, DefectVerdict>();
  for (const defect of input.defects) {
    verdicts.set(defect.id, verdictFor(defect, executorOf, passesByRef));
  }
  return verdicts;
}

function verdictFor(
  defect: Defect,
  executorOf: Map<string, string | null>,
  passesByRef: Map<string, { testId: string; certifiedBy: string | null }[]>,
): DefectVerdict {
  // FR-67: a stated decision, not a gap. Nothing downstream re-opens it.
  if (defect.status === "wont_fix") {
    return { status: "wont_fix", selfCertified: [], blockedBy: null };
  }

  const passes = defect.ref === null ? [] : passesByRef.get(defect.ref) ?? [];
  if (passes.length === 0) {
    return { status: defect.status, selfCertified: [], blockedBy: "no-passing-test" };
  }

  const fixer =
    defect.fixingWorkItem === null ? null : executorOf.get(defect.fixingWorkItem) ?? null;
  if (fixer === null) {
    return { status: defect.status, selfCertified: [], blockedBy: "no-fixing-executor" };
  }

  const selfCertified = passes
    .filter((pass) => pass.certifiedBy === fixer)
    .map((pass) => pass.testId);
  const independent = passes.some(
    (pass) => pass.certifiedBy !== null && pass.certifiedBy !== fixer,
  );

  if (independent) return { status: "verified", selfCertified, blockedBy: null };
  return {
    status: defect.status,
    selfCertified,
    blockedBy: selfCertified.length > 0 ? "self-certified" : "no-passing-test",
  };
}

/** Neither resolved nor waived. `unparsed` counts as unresolved, deliberately. */
export function isUnresolved(status: DefectStatus): boolean {
  return status !== "verified" && status !== "wont_fix";
}

export interface Reactivation {
  engagement: string;
  /** Defect ids still unresolved against an archived engagement. */
  defects: string[];
}

/**
 * FR-68. A defect may be recorded against an archived engagement, and an
 * archived engagement carrying an unresolved defect is surfaced for
 * reactivation rather than left where nobody looks.
 */
export function reactivations(
  engagements: Engagement[],
  defects: Defect[],
  verdicts: Map<string, DefectVerdict>,
): Reactivation[] {
  const archived = new Set(
    engagements.filter((one) => one.archivedAt !== null).map((one) => one.slug),
  );

  const bySlug = new Map<string, string[]>();
  for (const defect of defects) {
    if (!archived.has(defect.engagement)) continue;
    const status = verdicts.get(defect.id)?.status ?? defect.status;
    if (!isUnresolved(status)) continue;
    const ids = bySlug.get(defect.engagement) ?? [];
    ids.push(defect.id);
    bySlug.set(defect.engagement, ids);
  }

  return [...bySlug.entries()]
    .map(([engagement, ids]) => ({ engagement, defects: ids }))
    .sort((a, b) => a.engagement.localeCompare(b.engagement));
}
