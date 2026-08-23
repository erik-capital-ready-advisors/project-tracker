import { duration } from "@/lib/display-format";
import { GATE_OUTCOMES, QA_VERDICTS } from "@/lib/ingest/runReport";

/**
 * M2.8 / CR-005 §3.2 — the pure half of the fleet-run read layer.
 *
 * **Nothing here reads a file, a database or the clock.** That is the rule
 * `@/lib/ingest/*` is built on and it is here for the same reason: these are the
 * derivations that decide what a run *claims about itself*, and a derivation
 * that can only be exercised against a live row is one nobody tests against the
 * shape it does not recognise. Every function below takes plain values and
 * returns plain values, so `runs-display.test.ts` can feed each one something
 * from outside its expected set and assert it says so instead of guessing.
 *
 * Two consumers depend on this module and they are built in parallel with each
 * other: `/runs` (FR-92, FR-94, FR-95) and `/runs/[run-id]` (FR-93, FR-94,
 * FR-95). The exported types are their contract.
 *
 * ---
 *
 * ## The one rule every model here is shaped by
 *
 * `spec-approved.md`: *a wrong `done` is the worst output this product can
 * produce.* Its arithmetic corollary, which `@/lib/unparsed-display` states for
 * the FR-58 count and which this module applies to four more values:
 * **an unknown must never render as a zero.**
 *
 * Concretely, on the one run in the ledger today (`b0952e`, measured 2026-08-23):
 *
 *   * `started_at` and `ended_at` are the **same instant**, so the duration is
 *     genuinely `0m` and renders as `0m`. A run with a NULL timestamp has no
 *     duration at all and must not also render `0m`. Those are different claims
 *     and {@link runDuration} keeps them apart by construction.
 *   * `dispatch_cap` and `dispatches_used` are both NULL. "0 of 20 dispatches"
 *     would be a sentence nothing in the ledger supports — see the producer note
 *     on {@link dispatchUsage}, which is the more serious half of that finding.
 *   * `tests_passed`, `tests_failed` and `tests_skipped` are all NULL. A test
 *     triple of `0 / 0 / 0` states that a suite ran and found nothing; the
 *     artifact stated no counts at all.
 *
 * None of these is hypothetical. All three are the actual state of the only row
 * `/runs` will render on the day this ships.
 */

/* -------------------------------------------------------------------------- */
/* FR-95 — a verdict, and whether its sources agree                            */
/* -------------------------------------------------------------------------- */

/**
 * One source that recorded a verdict for a run.
 *
 * `verdict` is the stored string **exactly as recorded** — never title-cased,
 * never mapped to a friendlier word, and never suppressed when it is
 * `unparsed`. FR-95 says "emitted exactly as the artifact recorded it", and the
 * only way to be sure of that at a call site is for this layer never to own a
 * transformation in the first place.
 */
export interface VerdictSource {
  /** Stable machine key. The UI labels it; this module does not write prose. */
  origin: string;
  /** Byte-for-byte as stored. */
  verdict: string;
  /**
   * Whether the word is one `qa-reviewer.md`'s template can emit
   * (`@/lib/ingest/runReport`'s `QA_VERDICTS`). Derived, never a second list.
   *
   * `false` does **not** license rewriting the value — it is a flag the UI can
   * mark, exactly as `unparsed` is a loud value rather than a hidden one.
   */
  recognised: boolean;
}

/**
 * Why a run exposes fewer than two verdict sources.
 *
 * A typed code rather than a sentence, so `ui-designer` writes the wording once
 * in the house voice and this module ships no copy. It exists at all because
 * "one source agreed with itself" and "two sources agreed" must not render
 * identically: the first has not tested FR-95's condition at all.
 */
export type SoleVerdictReason =
  /** The `verdict` column is NULL or empty. No source recorded one. */
  | "no_verdict_recorded"
  /**
   * The schema stores exactly one verdict per run.
   *
   * `fleet_run` carries a single `verdict` column, written by
   * `@/lib/server/ingest/plan.ts` from the QA report's `**Status:**` line. The
   * `gates` jsonb beside it holds **gate outcomes**, which are a different kind
   * of fact — `build_after_phase1: PASS` is not a verdict on the run. So a
   * manifest/checkpoint disagreement of the kind FR-95 describes is not
   * detectable from this row, and the UI must say so rather than let a single
   * agreeing source read as a corroborated one.
   */
  | "one_verdict_column";

export type VerdictAgreement =
  /** No source recorded a verdict. */
  | "none"
  /** Exactly one source. FR-95's condition is untested, not satisfied. */
  | "single"
  /** Two or more sources, all byte-identical. */
  | "agreed"
  /** Two or more sources that differ. **Render every one of them.** */
  | "disagreed";

export interface RunVerdictModel {
  agreement: VerdictAgreement;
  /** Every source present, in the order they were enumerated. */
  sources: readonly VerdictSource[];
  /** Distinct verdict strings, first-seen order. `disagreed` iff length > 1. */
  distinct: readonly string[];
  /** Set when `agreement` is `none` or `single`; `null` otherwise. */
  soleReason: SoleVerdictReason | null;
}

function isRecognisedVerdict(value: string): boolean {
  return (QA_VERDICTS as readonly string[]).includes(value);
}

/**
 * Decide whether a run's verdict sources agree, and never reconcile them.
 *
 * Exported and tested independently of {@link runVerdict} on purpose. Today's
 * schema can only ever hand it one source, so the `agreed` and `disagreed`
 * branches are unreachable from real data — and unreachable code that nothing
 * exercises is indistinguishable from code that does not work. The tests drive
 * this function with fabricated two-source input so FR-95's both-shown state is
 * live, proven code on the day a second source appears, rather than a branch
 * that has never once run.
 *
 * **This function never picks a winner.** Where sources differ it reports every
 * one of them and says they differ. `manifest-cd414c.md` marking `u4` pending
 * while `checkpoint-cd414c.md` says it merged is the standing example, and the
 * standing rule is that the disagreement is the data.
 */
export function reconcileVerdicts(
  sources: readonly VerdictSource[],
): RunVerdictModel {
  const distinct: string[] = [];
  for (const source of sources) {
    if (!distinct.includes(source.verdict)) distinct.push(source.verdict);
  }

  if (sources.length === 0) {
    return {
      agreement: "none",
      sources: [],
      distinct: [],
      soleReason: "no_verdict_recorded",
    };
  }

  if (sources.length === 1) {
    return {
      agreement: "single",
      sources,
      distinct,
      soleReason: "one_verdict_column",
    };
  }

  return {
    agreement: distinct.length === 1 ? "agreed" : "disagreed",
    sources,
    distinct,
    soleReason: null,
  };
}

/** The machine key for the `fleet_run.verdict` column as a verdict source. */
export const VERDICT_SOURCE_QA_REPORT = "qa_report_status_line";

/**
 * Enumerate the verdict sources actually present on a `fleet_run` row.
 *
 * Today that is at most one, and this function **does not invent a second**.
 * D1 is explicit that the `gates` payload is a build gate rather than a verdict,
 * and manufacturing a source out of it to make FR-95's "both are shown" branch
 * light up would be the regex-widening failure wearing a different hat: a
 * disagreement this product reported would then be an artefact of its own
 * modelling rather than something two artifacts actually said.
 *
 * A verdict of `""` or whitespace is treated as *absent* rather than as a source
 * carrying an empty string — an invisible verdict chip is not a rendered
 * verdict. The non-empty value is passed through **untrimmed**, because FR-95's
 * "exactly as recorded" governs the value and this check only governs presence.
 */
export function runVerdict(row: { verdict: string | null }): RunVerdictModel {
  const raw = row.verdict;
  if (raw === null || raw.trim() === "") return reconcileVerdicts([]);

  return reconcileVerdicts([
    {
      origin: VERDICT_SOURCE_QA_REPORT,
      verdict: raw,
      recognised: isRecognisedVerdict(raw),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* FR-92 — duration                                                            */
/* -------------------------------------------------------------------------- */

export type DurationUnknownReason =
  /** `started_at` is NULL or unparseable. */
  | "no_start"
  /** `ended_at` is NULL or unparseable — the run may still be running. */
  | "no_end"
  /** `ended_at` precedes `started_at`. Nonsense, and never clamped to zero. */
  | "ends_before_start";

export type RunDuration =
  /** `minutes` may legitimately be `0`. `label` is `@/lib/display-format`'s. */
  | { state: "known"; minutes: number; label: string }
  | { state: "unknown"; reason: DurationUnknownReason };

/**
 * How long a run took, from its two timestamps.
 *
 * The zero case is the one that matters and it is not theoretical: run `b0952e`
 * carries `started_at = ended_at = 2026-08-19 00:00:00+00`, because
 * `@/lib/server/ingest/plan.ts` reads both from checkpoint header fields that
 * happened to state the same day. **That is a real, measured zero and it renders
 * as `0m`.** A run missing either timestamp has no duration and renders as
 * unknown. Collapsing the two into one output would let "we did not record when
 * this finished" read as "this finished instantly".
 *
 * `ends_before_start` is reported rather than clamped, for the reason
 * `unparsedState` gives for refusing to clamp a negative count: a nonsense value
 * turned into a clean-looking `0` is a wrong answer that looks checked.
 *
 * The rendering itself is `@/lib/display-format`'s `duration()`. There is one
 * duration formatter in this repository and this unit did not write a second.
 */
export function runDuration(
  startedAt: string | null,
  endedAt: string | null,
): RunDuration {
  const start = parseInstant(startedAt);
  if (start === null) return { state: "unknown", reason: "no_start" };

  const end = parseInstant(endedAt);
  if (end === null) return { state: "unknown", reason: "no_end" };

  if (end < start) return { state: "unknown", reason: "ends_before_start" };

  const minutes = Math.round((end - start) / 60_000);
  const label = duration(minutes);
  // `duration()` returns null only for negative or non-finite input, both
  // excluded above. The branch is a type narrowing, not a fallback value.
  if (label === null) return { state: "unknown", reason: "ends_before_start" };

  return { state: "known", minutes, label };
}

function parseInstant(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/* -------------------------------------------------------------------------- */
/* FR-92 — dispatches used against cap                                         */
/* -------------------------------------------------------------------------- */

export type DispatchUsage =
  /** Both recorded. `used` and `cap` may each legitimately be `0`. */
  | { state: "known"; used: number; cap: number; label: string }
  /** Exactly one recorded. The missing half is `null` and stays `null`. */
  | { state: "partial"; used: number | null; cap: number | null }
  /** Neither recorded. This is the state of every run in the ledger today. */
  | { state: "unknown" };

/**
 * FR-92's "dispatches used against cap".
 *
 * ## The measured finding this function cannot fix, and must not hide
 *
 * `dispatch_cap` and `dispatches_used` exist in
 * `20260819144331_schema_21_entities.sql` and in `database.types.ts`, and a grep
 * across `src/`, `tests/` and `e2e/` finds **no other occurrence**. No ingest
 * path writes either column: `@/lib/server/ingest/plan.ts` builds the `fleet_run`
 * payload and names neither. This is the **consumer half of a seam whose
 * producer half was never built** — FR-92 asks for a number nothing in the
 * product records.
 *
 * The consequence is that `unknown` is not a degraded state this function
 * returns on bad input; it is the *only* state it will ever return until an
 * ingest path starts writing those columns. That is exactly the shape
 * `Knowledge/A consumer rule with no producer rule ships inert` describes: a
 * graceful fallback has no failing state, so it looks correct forever and
 * nothing surfaces the gap.
 *
 * This function therefore does the one honest thing available to it — returns
 * `unknown` rather than `0 of 0` — and the gap is escalated as a question rather
 * than absorbed here. **Do not "fix" a future NULL by defaulting the cap to the
 * manifest's budget.** The manifest is not in the database, and a cap this
 * product inferred is not a cap the run ran under.
 */
export function dispatchUsage(
  used: number | null,
  cap: number | null,
): DispatchUsage {
  const cleanUsed = countOrNull(used);
  const cleanCap = countOrNull(cap);

  if (cleanUsed === null && cleanCap === null) return { state: "unknown" };
  if (cleanUsed === null || cleanCap === null) {
    return { state: "partial", used: cleanUsed, cap: cleanCap };
  }
  return {
    state: "known",
    used: cleanUsed,
    cap: cleanCap,
    label: `${cleanUsed} of ${cleanCap}`,
  };
}

/**
 * A non-negative finite count, or `null`.
 *
 * A negative or non-finite value is nonsense rather than zero and is reported
 * unknown, matching `unparsedState`'s treatment exactly rather than inventing a
 * second convention for the same question.
 */
function countOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/* -------------------------------------------------------------------------- */
/* FR-92 — the test triple                                                     */
/* -------------------------------------------------------------------------- */

export interface TestTriple {
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  /**
   * `known` when all three were recorded, `partial` when some were, `unknown`
   * when none were. The three fields stay individually nullable regardless, so
   * a caller can never read a missing count as a zero by looking at the wrong
   * field.
   */
  state: "known" | "partial" | "unknown";
  /** `"5 passed, 1 failed, 0 skipped"` when `known`; `null` otherwise. */
  label: string | null;
}

/**
 * The reported test counts, which are a **claim the artifact made**, never an
 * observation this product performed — `@/lib/ingest/runReport`'s header carries
 * the same warning and the column comments repeat it.
 *
 * All three are NULL on run `b0952e`: that run's QA report stated no Playwright
 * line, so `parseQaGates` returned nulls and stored nulls. `0 / 0 / 0` would
 * assert that a suite ran and reported nothing, which is a different and false
 * statement.
 */
export function testTriple(
  passed: number | null,
  failed: number | null,
  skipped: number | null,
): TestTriple {
  const p = countOrNull(passed);
  const f = countOrNull(failed);
  const s = countOrNull(skipped);
  const present = [p, f, s].filter((one) => one !== null).length;

  const state = present === 3 ? "known" : present === 0 ? "unknown" : "partial";

  return {
    passed: p,
    failed: f,
    skipped: s,
    state,
    label: state === "known" ? `${p} passed, ${f} failed, ${s} skipped` : null,
  };
}

/* -------------------------------------------------------------------------- */
/* FR-93 — the `gates` payload, rendered rather than dumped                    */
/* -------------------------------------------------------------------------- */

export interface RenderedGate {
  key: string;
  /** The stored value, byte-for-byte. Never mapped to a friendlier word. */
  outcome: string;
  /**
   * Whether `outcome` is one of `@/lib/ingest/runReport`'s `GATE_OUTCOMES`.
   * Derived from that constant rather than copied, so the two cannot drift.
   *
   * Note `"unparsed"` is itself a recognised outcome — it is the classifier's
   * loud default, not an unrecognised value. The two are distinguished here and
   * counted together by {@link RenderedGates.unparsedCount}.
   */
  recognised: boolean;
}

export interface RenderedGates {
  /** Every string-valued key, sorted by key. See the ordering note below. */
  gates: readonly RenderedGate[];
  /**
   * Keys whose value was not a string, so no outcome could be read from them.
   * Named rather than dropped — a gate silently omitted is a gate that reads as
   * one that was never run.
   */
  unrenderable: readonly string[];
  /** The payload was not a JSON object at all (an array, a scalar, or null). */
  malformed: boolean;
  /**
   * Gates whose outcome is literally `unparsed` **or** is not a recognised
   * outcome word, plus every `unrenderable` key. This is the `gates`
   * contribution to FR-94 and it is deliberately inclusive: a value nobody can
   * classify and a value the classifier explicitly failed on are the same fact
   * from a reader's point of view.
   */
  unparsedCount: number;
}

/**
 * Turn a stored `gates` jsonb into something a screen can lay out.
 *
 * ## Why the input is `unknown` and every branch is defensive
 *
 * `fleet_run.gates` is typed `Json` by Supabase codegen — `NOT NULL default
 * '{}'`, but the generated type permits an array, a scalar or a null, and a
 * jsonb column accepts all of them. A renderer that assumed an object would
 * throw inside a Server Component and take the whole route down. Every
 * non-object shape therefore lands in `malformed` and renders as a finding.
 *
 * ## Ordering is alphabetical because insertion order does not survive `jsonb`
 *
 * Postgres `jsonb` does not preserve key order — it stores keys sorted by length
 * then bytewise — so the order `plan.ts` wrote them in is already gone by the
 * time this reads them. Alphabetical is the only ordering stable across reads,
 * and a stable order is what makes two runs comparable down a column.
 */
export function renderGates(payload: unknown): RenderedGates {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { gates: [], unrenderable: [], malformed: true, unparsedCount: 0 };
  }

  const gates: RenderedGate[] = [];
  const unrenderable: string[] = [];

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof value !== "string") {
      unrenderable.push(key);
      continue;
    }
    gates.push({
      key,
      outcome: value,
      recognised: (GATE_OUTCOMES as readonly string[]).includes(value),
    });
  }

  gates.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  unrenderable.sort();

  const unparsedCount =
    gates.filter((gate) => !gate.recognised || gate.outcome === "unparsed").length +
    unrenderable.length;

  return { gates, unrenderable, malformed: false, unparsedCount };
}

/* -------------------------------------------------------------------------- */
/* FR-94 — a run's own unparsed count                                          */
/* -------------------------------------------------------------------------- */

/**
 * A population FR-58's global census counts that **cannot be scoped to a run**.
 *
 * Named rather than omitted, because "this run has no unparsed defects" and
 * "nothing in the schema can say which defects this run opened" are different
 * statements and only the second is true.
 */
export interface RunUnparsedGap {
  /** The census population that could not be narrowed. */
  population: "defect" | "test_result";
  reason: "no_run_edge";
}

/**
 * Measured 2026-08-23 against `onpvolboecjpdkvurjaf`, and the reason D2 exists.
 *
 *   * `defect` has **no run column at all**. Its only path to a run is
 *     `fixing_work_item_id -> work_item -> fleet_run`, which is NULL on all 13
 *     defect rows — and that edge means "a run *fixed* this defect" rather than
 *     "a run *opened* it" in any case.
 *   * `test_result` reaches a run through `test_case`, and `test_case` carries
 *     `engagement_id`, `harness`, `file`, `title` and a `covers` text array —
 *     **no work item and no run**. There is no path at all, and the table holds
 *     0 rows today regardless.
 */
export const RUN_UNPARSED_GAPS: readonly RunUnparsedGap[] = [
  { population: "defect", reason: "no_run_edge" },
  { population: "test_result", reason: "no_run_edge" },
];

export interface RunUnparsed {
  /**
   * `work_item.status = 'unparsed'` narrowed to this run — FR-58's population,
   * scoped. `null` when the count could not be read, never `0`.
   */
  workItems: number | null;
  /** Unparsed or unrecognised entries in this run's `gates` payload. */
  gates: number;
  /** Whether `fleet_run.verdict` is literally the word `unparsed`. */
  verdictUnparsed: boolean;
  /**
   * The number FR-94 asks each row and detail view to state.
   *
   * `null` when `workItems` could not be read — a partial total understates, and
   * an understated unparsed count is indistinguishable from a healthy one.
   * `@/lib/server/answers/unparsed` makes exactly this trade for the global
   * census and the reasoning is not re-litigated here.
   */
  total: number | null;
  /** Census populations this run cannot narrow. See {@link RUN_UNPARSED_GAPS}. */
  gaps: readonly RunUnparsedGap[];
}

/**
 * FR-94's per-run count.
 *
 * ## This is a different population from FR-58's global census, on purpose
 *
 * `@/lib/server/answers/unparsed` **owns the definition** of the global count
 * and this module does not touch it, redefine it, or feed into it. What it does
 * is narrow one of that census's three predicates to a run and add two facts the
 * census cannot hold — and the difference is worth stating plainly, because the
 * two numbers **disagree on today's data**:
 *
 *   * The app-shell badge reads `0 unparsed`. Measured: 0 unparsed work items,
 *     0 unparsed defects, 0 `test_result` rows at all.
 *   * Run `b0952e`'s own count reads `1`, because `fleet_run.verdict` is
 *     literally `'unparsed'` — `parseQaGates` found no `**Status:**` line it
 *     recognised and stored its loud default.
 *
 * That divergence is real and it is not a bug in either number. The census
 * counts three tables whose enums carry an `unparsed` member; `fleet_run` is not
 * one of them, so a run's own failed classification is currently counted
 * **nowhere** — which is precisely the "a classifier default that is never
 * counted is a silent one" argument the census's own author used to justify
 * adding `test_result`.
 *
 * Whether `fleet_run.verdict` and unparsed `gates` should join FR-58's global
 * population is a question about a module this unit must not unilaterally
 * change, so it is **queued for Erik** rather than decided here
 * (`.fleet/questions-i1-9a320b.jsonl`). Until he rules, the breakdown below is
 * returned in full so a screen states its components rather than a bare number
 * that appears to contradict the badge.
 */
export function runUnparsed(input: {
  unparsedWorkItems: number | null;
  gates: RenderedGates;
  verdict: string | null;
}): RunUnparsed {
  const workItems = countOrNull(input.unparsedWorkItems);
  const gates = input.gates.unparsedCount;
  const verdictUnparsed = input.verdict === "unparsed";

  return {
    workItems,
    gates,
    verdictUnparsed,
    total: workItems === null ? null : workItems + gates + (verdictUnparsed ? 1 : 0),
    gaps: RUN_UNPARSED_GAPS,
  };
}
