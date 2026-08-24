/**
 * FR-21. A run's reported test counts and gate outcomes, read off its checkpoint
 * and its QA report.
 *
 * Pure: text in, records out.
 *
 * ## "Reported" is the load-bearing word
 *
 * Everything here is a claim the run made about itself. A `PASS` in this module
 * means the artifact says PASS, never that this product observed a passing gate.
 * The column comments carry the same warning, because a reported count that
 * reads as a measurement is precisely the wrong-`done` failure this product
 * exists to prevent, one level up.
 *
 * ## Both shapes are fixed by documents
 *
 *   * The checkpoint's `key: value` block is `project-lead.md` Phase 5 step 3.
 *   * `**Status:**`, the severity tally and `## Verification performed` are
 *     `qa-reviewer.md`'s own report template.
 *
 * Neither was inferred from a sample, which matters: a parser written against
 * one artifact it happened to see is a parser that classifies that artifact.
 */

export const GATE_OUTCOMES = ["PASS", "FAIL", "NOT_RUN", "unparsed"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

/**
 * The verdict words `qa-reviewer.md` writes on its `**Status:**` line. Anything
 * else is `unparsed` — this is the run's overall grade and guessing it is the
 * most expensive guess in this module.
 */
export const QA_VERDICTS = ["PASS", "ISSUES", "FAIL", "BLOCKED", "unparsed"] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

/**
 * Gate lines under `## Verification performed`, keyed by the label the template
 * writes. `Security checklist` is deliberately absent: its line states a ratio
 * (`12/14 items checked`) rather than an outcome word, so classifying it as
 * PASS or FAIL would be an invention.
 */
const GATE_LABELS = new Map<string, string>([
  ["build", "build"],
  ["type-check", "typecheck"],
  ["typecheck", "typecheck"],
  ["lint", "lint"],
  ["playwright", "playwright"],
  ["accessibility", "accessibility"],
]);

/**
 * Read the outcome WORD only, and never the reason excerpt behind it.
 *
 * The template writes `PASS | FAIL <excerpt> | NOT RUN <reason>`. The excerpt is
 * specialist prose, and specialist prose is what §7a classifies `sensitive` on
 * `work_item`. `fleet_run` is `internal`, so storing an excerpt there would push
 * a table past its own classification — which is a thing to notice at write
 * time, not at review time.
 */
function gateOutcome(value: string): GateOutcome {
  // B58, second layer. Every real report bolds the outcome word, so the raw
  // value arrives as `**PASS**, exit 0` and /^PASS\b/ never matches it. This
  // reads THROUGH the emphasis to the same word; it does not widen what counts
  // as a pass.
  const upper = stripEmphasis(value).toUpperCase();
  if (/^PASS\b/.test(upper)) return "PASS";
  if (/^FAIL\b/.test(upper)) return "FAIL";
  if (/^NOT[ _-]RUN\b/.test(upper)) return "NOT_RUN";
  return "unparsed";
}

export interface CheckpointFacts {
  /** Every `key: value` line in the checkpoint's front block, verbatim. */
  fields: Record<string, string>;
  runId: string | null;
  branch: string | null;
  mode: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** `build_after_phase1`, classified. */
  buildGate: GateOutcome | null;
}

/** `# Checkpoint zz01` -> `zz01`. */
const CHECKPOINT_TITLE = /^#\s+Checkpoint\s+(\S+)\s*$/m;
const KEY_VALUE = /^([a-z][a-z0-9_]*):[ \t]+(.+?)\s*$/;

/**
 * FR-21. The checkpoint's front block.
 *
 * Only lines before the first `## ` heading are read as fields, so a `key: value`
 * line appearing inside the best-guess-decisions prose cannot masquerade as one.
 */
export function parseCheckpoint(text: string): CheckpointFacts {
  const fields: Record<string, string> = {};

  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) break;
    const match = KEY_VALUE.exec(line);
    if (match && !(match[1] in fields)) fields[match[1]] = match[2];
  }

  const buildValue = fields.build_after_phase1;

  return {
    fields,
    runId: CHECKPOINT_TITLE.exec(text)?.[1] ?? null,
    branch: fields.branch ?? null,
    mode: fields.mode ?? null,
    startedAt: fields.started ?? null,
    endedAt: fields.phase1_completed ?? null,
    buildGate: buildValue === undefined ? null : gateOutcome(buildValue),
  };
}

export interface QaGateReport {
  verdict: QaVerdict;
  /** The `**Status:**` line exactly as written. */
  rawVerdict: string | null;
  /** Gate name -> outcome. The shape `fleet_run.gates` stores. */
  gates: Record<string, GateOutcome>;
  /** From the Playwright line. Null means the artifact stated no count. */
  testsPassed: number | null;
  testsFailed: number | null;
  testsSkipped: number | null;
  severity: { critical: number | null; important: number | null; minor: number | null };
  /** FR-58: gate lines present under the heading that did not classify. */
  unparsed: number;
}

const STATUS_LINE = /^\*\*Status:\*\*\s*(.+?)\s*$/m;
const SEVERITY_LINE =
  /\*\*Critical:\*\*\s*(\d+)[^\n]*?\*\*Important:\*\*\s*(\d+)[^\n]*?\*\*Minor:\*\*\s*(\d+)/;
/**
 * B58. Every real QA report bolds its gate labels, and the single unbolded
 * pattern this file used to carry matched **0 of 103** non-empty lines across
 * all four tracked reports -- silently, because the non-match was dropped by a
 * `continue` above the unparsed counter.
 *
 * These are the shapes the artifacts actually use, in the order they must be
 * tried. They were read off the corpus, not invented:
 *
 *   1. `- **Build (pnpm):** PASS`      colon INSIDE the bold span
 *   2. `- **Build** (pnpm): **PASS**`  colon OUTSIDE the bold span
 *   3. `- Build (pnpm): PASS`          the unbolded shape the template documents
 *
 * Shape 1 must be tried first: shape 2 would otherwise claim a shape-1 line and
 * take the value from the wrong side of the colon.
 */
const GATE_BULLET = /^[-*]\s+(.+)$/;
const GATE_SHAPES: readonly RegExp[] = [
  /^\*\*(.+?):\*\*\s*(.+?)\s*$/,
  /^\*\*(.+?)\*\*\s*(?:\([^)]*\))?\s*:\s*(.+?)\s*$/,
  /^([A-Za-z][A-Za-z -]*?)(?:\s*\([^)]*\))?:\s*(.+?)\s*$/,
];

/** Markdown emphasis and code ticks, removed so a WORD can be read. */
function stripEmphasis(value: string): string {
  return value.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

/**
 * A label as `GATE_LABELS` keys it: emphasis gone, a trailing parenthetical
 * qualifier gone (`Build (pnpm)` and `Playwright (mine)` are the same gates as
 * `Build` and `Playwright`), lowercased.
 *
 * A label this does not reduce to a known key is NOT guessed at -- it lands in
 * `unparsed`, which is the point. `Unit tests` and `pnpm gate:m27:e2e` are both
 * real gates in the corpus and both stay loud until someone decides to add them.
 */
function normaliseLabel(raw: string): string {
  return stripEmphasis(raw).replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function matchGateLine(body: string): { label: string; value: string } | null {
  for (const shape of GATE_SHAPES) {
    const found = shape.exec(body);
    if (found) return { label: found[1], value: found[2] };
  }
  return null;
}

/** `6 flows authored, 5 passed, 1 failed` — the template's own wording. */
const PASSED = /(\d+)\s+passed/i;
const FAILED = /(\d+)\s+failed/i;
const SKIPPED = /(\d+)\s+skipped/i;

/** The lines of `## Verification performed`, or `[]` when it is absent. */
function verificationLines(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Verification performed\s*$/.test(line));
  if (start === -1) return [];

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## ") || line.startsWith("# "));
  return end === -1 ? rest : rest.slice(0, end);
}

function count(pattern: RegExp, value: string): number | null {
  const match = pattern.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * FR-21. The QA report's verdict, gate outcomes and reported test counts.
 *
 * The counts come from the Playwright line because it is the only line in the
 * template that states any. A unit-test count is NOT read from the specialist
 * reports' own prose: those sentences are free-form and reading them would mean
 * inventing a pattern for a shape no template fixes.
 */
export function parseQaGates(text: string): QaGateReport {
  const rawVerdict = STATUS_LINE.exec(text)?.[1] ?? null;
  const verdictWord = rawVerdict?.trim().toUpperCase() ?? "";
  const verdict =
    (QA_VERDICTS as readonly string[]).includes(verdictWord) && verdictWord !== "unparsed"
      ? (verdictWord as QaVerdict)
      : "unparsed";

  const gates: Record<string, GateOutcome> = {};
  let unparsed = 0;
  let testsPassed: number | null = null;
  let testsFailed: number | null = null;
  let testsSkipped: number | null = null;

  for (const line of verificationLines(text)) {
    const bullet = GATE_BULLET.exec(line.trim());
    // Not a bullet at all -- prose, a blank, a table row. The heading holds
    // those too and they were never gate lines.
    if (!bullet) continue;

    const match = matchGateLine(bullet[1]);
    if (match === null) {
      // B58's silent half. A bullet under this heading that states no
      // `label: value` used to vanish here, ABOVE the counter meant to notice
      // it, so a report whose every gate line failed to parse reported
      // `unparsed: 0`. It is counted now.
      unparsed += 1;
      continue;
    }

    const label = normaliseLabel(match.label);
    const value = stripEmphasis(match.value);
    const key = GATE_LABELS.get(label);

    if (key === undefined) {
      // A bullet under the heading that names a gate this build does not know.
      // Counted rather than dropped, and never guessed at.
      unparsed += 1;
      continue;
    }

    if (key === "playwright") {
      testsPassed = count(PASSED, value);
      testsFailed = count(FAILED, value);
      testsSkipped = count(SKIPPED, value);
      // `6 flows authored, 5 passed, 1 failed` states counts, not an outcome
      // word, so the gate reads FAIL when any flow failed and PASS when none
      // did — derived from the counts the artifact gives, not from prose.
      gates[key] =
        testsPassed === null && testsFailed === null
          ? gateOutcome(value)
          : (testsFailed ?? 0) > 0
            ? "FAIL"
            : "PASS";
      continue;
    }

    const outcome = gateOutcome(value);
    gates[key] = outcome;
    if (outcome === "unparsed") unparsed += 1;
  }

  const severityMatch = SEVERITY_LINE.exec(text);

  return {
    verdict,
    rawVerdict,
    gates,
    testsPassed,
    testsFailed,
    testsSkipped,
    severity: {
      critical: severityMatch ? Number(severityMatch[1]) : null,
      important: severityMatch ? Number(severityMatch[2]) : null,
      minor: severityMatch ? Number(severityMatch[3]) : null,
    },
    unparsed,
  };
}
