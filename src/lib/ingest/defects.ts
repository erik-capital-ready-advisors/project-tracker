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


/**
 * A QA report is written once and then EDITED IN PLACE as findings are fixed,
 * so a finding carries its own current state in a bracketed marker. Measured on
 * `qa-report-b0952e.md` when this parser was first wired into ingest: 15
 * findings, three titled with a marker instead of a title, four that the report
 * says are closed or withdrawn, and every one of them stored `open`. The screen
 * would have reported two critical defects open when the report says the one
 * critical is fixed and re-verified — a confident wrong answer, in the flagship
 * answer of a product built to refuse them.
 *
 * Two spellings, both in that one report:
 *
 *     1. **[CLOSED at `abc123`]** **The real title** — a separate bold span
 *     1. **[NEW at `abc123`] The real title** — folded into the title's span
 *
 * The vocabulary is NOT closed. A marker this table does not know maps the
 * status to `unparsed` and keeps the marker in `rawSeverity`'s spirit — loud,
 * never guessed. Adding a synonym here to make a stubborn marker classify is
 * the same failure as widening a severity regex.
 */
const STATUS_MARKER = /^\s*\*\*\[([A-Z]+)\b([^\]]*)\]\*\*\s*/;
const STATUS_MARKER_INLINE = /^\[([A-Z]+)\b([^\]]*)\]\s*/;

const STATUS_BY_MARKER: ReadonlyMap<string, DefectStatus> = new Map([
  ["CLOSED", "fixed"],
  ["FIXED", "fixed"],
  ["NEW", "open"],
]);

/**
 * A finding the author RETRACTED, and a struck-through entry that repeats a
 * finding recorded in full below it.
 *
 * Neither is ingested. A withdrawal is the author saying the defect was never
 * real — storing it as one asserts a claim nobody stands behind — and a
 * struck-through closure record is a second row for a defect that already has
 * one, which would report the same critical twice. Both are counted and handed
 * back so the drop is visible rather than silent.
 */
const RETRACTED_MARKERS = new Set(["WITHDRAWN", "RETRACTED"]);
const STRUCK_THROUGH = /^\s*~~/;

/**
 * A closure header does not always bracket its marker. The one in run b0952e's
 * report reads:
 *
 *     1. ~~**Mode-1 ingest is inoperable**~~ — **CLOSED at `c65e44d`, re-verified …**
 *
 * so the status is a bold span whose FIRST WORD is a status word, sitting after
 * the struck title rather than before it. Scanned only on struck-through
 * entries, because that is the only place this spelling appears — looking for a
 * bare `CLOSED` anywhere in any finding would match a sentence describing one.
 */
const BOLD_SPANS = /\*\*(.+?)\*\*/g;

function statusFromClosureLine(line: string): DefectStatus | null {
  for (const span of line.matchAll(BOLD_SPANS)) {
    const word = /^([A-Z]+)\b/.exec(span[1].trim())?.[1];
    if (word === undefined) continue;
    if (RETRACTED_MARKERS.has(word)) return null;
    const status = STATUS_BY_MARKER.get(word);
    if (status !== undefined) return status;
  }
  return null;
}

interface FindingStatus {
  status: DefectStatus;
  /** The line with its marker removed, so the title can be read from it. */
  body: string;
  retracted: boolean;
}

function statusOf(body: string): FindingStatus {
  const separate = STATUS_MARKER.exec(body);
  const inline = separate === null ? STATUS_MARKER_INLINE.exec(body) : null;
  const match = separate ?? inline;
  if (match === null) return { status: "open", body, retracted: false };

  const word = match[1];
  const rest = body.slice(match[0].length);
  if (RETRACTED_MARKERS.has(word)) {
    return { status: "open", body: rest, retracted: true };
  }
  return {
    status: STATUS_BY_MARKER.get(word) ?? "unparsed",
    body: rest,
    retracted: false,
  };
}

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
  const raw = FINDING_START.exec(startLine)?.[1] ?? startLine;
  // The marker is removed BEFORE the bold run is read. Taking the first bold
  // span off `**[CLOSED at abc]** **The real title**` yields the marker and
  // drops the title, which is how three findings in run b0952e's report came
  // to be titled `[CLOSED at c65e44d]`.
  const body = statusOf(raw).body;
  const bold = BOLD_TITLE.exec(body);
  // A marker folded into the title's own bold span survives the strip above,
  // so it is taken off the extracted title too.
  const extracted = (bold?.[1] ?? body).trim();
  const inner = STATUS_MARKER_INLINE.exec(extracted);
  // The title is free text, not a classified field, so falling back to the
  // line itself is a transcription rather than a guess. The classified field
  // is `severity`, and that carries the unparsed discipline.
  return (inner === null ? extracted : extracted.slice(inner[0].length))
    .trim()
    .slice(0, MAX_TITLE);
}

export interface QaFindings {
  defects: Defect[];
  /** FR-58: how many findings this parser could not grade. */
  unparsed: number;
  /**
   * Findings deliberately NOT turned into defects: a withdrawal, and a
   * struck-through closure record that repeats a finding below it. Counted so
   * the drop is reported rather than silent.
   */
  retracted: number;
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
  const raw = findings(text).map((finding, index) => {
    const first = FINDING_START.exec(finding.lines[0])?.[1] ?? finding.lines[0];
    const struck = STRUCK_THROUGH.test(first);
    const marked = statusOf(struck ? first.replace(STRUCK_THROUGH, "") : first);
    if (struck) {
      const closure = statusFromClosureLine(first);
      if (closure !== null) marked.status = closure;
    }
    return { finding, index, struck, marked, title: titleOf(finding.lines[0]) };
  });

  /**
   * A struck-through entry carries the closure and says so in words — "Original
   * finding retained below as the record" — so the STATUS lives on the struck
   * line and the DETAIL lives on the full one. Dropping the struck entry alone
   * would lose the closure and report a fixed critical as open, which is the
   * failure this whole change exists to remove.
   *
   * The pairing is deliberately narrow: same severity heading, and the full
   * finding's title must START WITH the struck one's. That is the shape the
   * corpus uses (`Mode-1 ingest is inoperable` then `Mode-1 ingest is
   * inoperable: service_role cannot execute …`). Nothing looser — an unmatched
   * struck entry stays a defect in its own right rather than being discarded,
   * because a dropped finding nobody counted is worse than a duplicate.
   */
  const absorbed = new Set<number>();
  for (const entry of raw) {
    if (!entry.struck) continue;
    const match = raw.find(
      (other) =>
        !other.struck &&
        other.finding.heading === entry.finding.heading &&
        entry.title.length > 0 &&
        other.title.startsWith(entry.title),
    );
    if (match === undefined) continue;
    match.marked = { ...match.marked, status: entry.marked.status };
    absorbed.add(entry.index);
  }

  const defects: Defect[] = [];
  let retracted = 0;

  for (const { finding, index, struck, marked, title } of raw) {
    if (absorbed.has(index) || marked.retracted) {
      retracted += 1;
      continue;
    }
    // An unabsorbed struck entry is still a finding; it just found no twin.
    void struck;

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
      title,
      description: description === "" ? null : description,
      status: marked.status,
      wontFixReason: null,
      requirementRef: FR_REF.exec(whole)?.[0] ?? null,
      fixingWorkItem: null,
      reportedAt: null,
      reportedBy: null,
    });
  }

  return {
    defects,
    unparsed: defects.filter((defect) => defect.severity === "unparsed").length,
    retracted,
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
