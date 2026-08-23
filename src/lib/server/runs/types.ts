import type {
  Disposition,
  EvidenceScope,
  ExecutionMode,
  ExecutorKind,
  WorkStatus,
} from "@/lib/ingest/types";
import type { DetailDb, DetailEngagement, DetailRef } from "@/lib/server/detail/types";
import type {
  DispatchUsage,
  RenderedGates,
  RunDuration,
  RunUnparsed,
  RunVerdictModel,
  TestTriple,
} from "@/lib/runs-display";

/**
 * The shapes M2.8's two run screens are built on (CR-005 §3.2, FR-92 to FR-95).
 *
 * ## The database slice is `DetailDb`, not a new interface
 *
 * `releases/db.ts` defines the narrow client slice and the paging discipline,
 * `answers/db.ts` extends it with the PostgREST verbs the answers needed, and
 * `detail/types.ts` aliases that as `DetailDb`. This layer needs the same verbs
 * and no others. **There is one paging helper in this repository and this unit
 * did not write a second.**
 *
 * ## References are `DetailRef`, and `fleet_run` is not one
 *
 * `entity-routes.ts` declares a **closed set of eight** entity kinds — FR-81's —
 * and `tests/m27-gate.test.ts` and `tests/entity-routes.test.ts` both pin it at
 * exactly eight. `fleet_run` is not among them and this unit does not add it:
 * `/runs/[run-id]` is keyed by the human run id rather than a uuid, so it is not
 * an `entityHref` destination in the first place, and widening a set two gates
 * assert on to gain nothing would be a change made in passing to a rule five
 * views depend on.
 *
 * Everything a run *points at*, though, is one of the eight — work items,
 * questions, defects and requirements — so all four are rendered as `DetailRef`
 * and reuse Wave A's `<EntityRef>` contract rather than a run-local link shape.
 */

export type RunsDb = DetailDb;

/** A run's identity, without any of the derived display models. */
export interface RunIdentity {
  /** The `fleet_run.id` uuid. Not the route key. */
  id: string;
  /**
   * The human run id (`b0952e`) — the `[run-id]` segment.
   *
   * **Unique per engagement, not globally**: the migration's constraint is
   * `unique (engagement_id, run_id)`. See {@link RunDetailResult}'s `ambiguous`
   * state, which exists because of that.
   */
  runId: string;
  engagement: DetailEngagement | null;
  branch: string | null;
  mode: string | null;
}

/** One row of FR-92's listing. */
export interface ListedRun extends RunIdentity {
  startedAt: string | null;
  endedAt: string | null;
  /** FR-95. Byte-for-byte, with its sources enumerated. */
  verdict: RunVerdictModel;
  /** FR-92. A measured zero renders `0m`; a missing timestamp does not. */
  duration: RunDuration;
  /** FR-92. `unknown` on every run today — see `dispatchUsage`'s producer note. */
  dispatches: DispatchUsage;
  /** FR-92. Reported by the artifact, never observed by this product. */
  tests: TestTriple;
  /** FR-94. This row's own count, with its components and its gaps. */
  unparsed: RunUnparsed;
}

/**
 * FR-92's listing.
 *
 * ## There is no page limit here, and that is deliberate
 *
 * `@/lib/questions-load` caps its read and reports `truncated`, because
 * `open_question` holds 96 rows for a single run and PostgREST silently
 * truncates an unbounded read at 1000 rows with `error === null`. `fleet_run`
 * is the opposite shape: **one row per fleet run ever executed**, one today.
 *
 * FR-92 says "lists **every** ingested fleet run", so a cap would be a
 * requirement violation rather than a safeguard. `fetchAllRows` is used instead,
 * which pages to an exact count and reports a stalled read as an error rather
 * than as a short page — so this listing is exhaustive or it fails loudly, and
 * there is no third outcome for a caller to mistake for completeness.
 */
export interface RunListing {
  runs: readonly ListedRun[];
  /**
   * Rows whose `verdict` column recorded nothing at all. Distinct from a verdict
   * of `unparsed`, which is a recorded classification and a much louder fact.
   */
  noVerdictCount: number;
  /** Rows whose reported test triple was wholly absent. */
  noTestCountsCount: number;
  /**
   * True when the per-run unparsed work-item counts could not be read, so every
   * row's `unparsed.workItems` is `null` rather than a number. The listing still
   * renders; one column degrades. `exactCount`'s precedent, for its reason.
   */
  unparsedCountsUnavailable: boolean;
}

/** One of a run's work units, for FR-93. No decrypted prose — see `columns.ts`. */
export interface RunWorkUnit {
  /** Navigable to `/work-items/<uuid>`, labelled with `unit` or a fallback. */
  ref: DetailRef;
  unit: string | null;
  status: WorkStatus;
  executionMode: ExecutionMode;
  executorKind: ExecutorKind;
  executor: string | null;
  workType: string | null;
  phase: number | null;
  disposition: Disposition | null;
  evidenceScope: EvidenceScope | null;
  notVerifiedCount: number;
  startedAt: string | null;
  endedAt: string | null;
}

/** One of the questions a run queued, for FR-93. Clear columns only. */
export interface RunQuestion {
  /** Navigable to `/questions/<uuid>`. */
  ref: DetailRef;
  unit: string | null;
  section: string | null;
  /** `low | med | high | null`. Never coerced into one of the three. */
  confidence: string | null;
  status: string;
  answeredBy: string | null;
  answeredAt: string | null;
}

/**
 * FR-93's "the defects it opened", answered honestly.
 *
 * ## `opened` is `null` and it is typed `null`, not `DetailRef[]`
 *
 * **No defect in this ledger links to a run, and no schema edge could express
 * it.** `defect` carries no run column at all; its only path to a `fleet_run` is
 * `fixing_work_item_id -> work_item -> fleet_run`, and that edge says a run
 * *fixed* a defect, which is a different claim from FR-93's *opened*. Measured
 * 2026-08-23: `fixing_work_item_id` is NULL on all 13 defect rows.
 *
 * So the field is `null` rather than `[]`, and the type says `null` rather than
 * `DetailRef[] | null`, because a UI handed `[]` renders "this run opened no
 * defects" — a sentence nothing in the ledger checked, and precisely the wrong-
 * `done` this product exists to prevent. `null` plus {@link openedUnavailable}
 * gives the screen something true to say instead.
 *
 * The edge was **not** inferred from `defect.reported_by`, `source_key`, `ref`
 * prefixes or timestamp proximity to the run window. Any of those would be the
 * regex-widening failure under a different name.
 */
export interface RunDefects {
  /** Always `null`. There is no opened-by edge to read. */
  opened: null;
  /** Why. A typed code; the UI writes the sentence. */
  openedUnavailable: "no_opened_by_edge";
  /**
   * The edge that IS modelled: defects whose `fixing_work_item_id` points at one
   * of this run's work items. Genuinely queried, and genuinely empty today.
   */
  fixed: readonly DetailRef[];
}

/** FR-93's "the requirements it touched". */
export interface RunRequirements {
  /**
   * Distinct `requirement_ref`s reached through this run's work items, resolved
   * to links where the requirement exists and to FR-12's dangling treatment
   * where it does not. Sorted for a stable column.
   *
   * §7a keeps `requirement.text` encrypted while `ref` stays clear, so
   * requirements are matched and reported by `FR-nn` and never by their text.
   * This list is refs, as FR-93 asks.
   */
  refs: readonly DetailRef[];
  /** References that resolved to no stored requirement. A finding, not an error. */
  danglingCount: number;
}

/** FR-93's whole payload for one run. */
export interface RunDetail extends RunIdentity {
  startedAt: string | null;
  endedAt: string | null;
  verdict: RunVerdictModel;
  duration: RunDuration;
  dispatches: DispatchUsage;
  tests: TestTriple;
  /** FR-93 — rendered rather than dumped. */
  gates: RenderedGates;
  /** FR-94. */
  unparsed: RunUnparsed;

  workUnits: readonly RunWorkUnit[];
  questions: readonly RunQuestion[];
  defects: RunDefects;
  requirements: RunRequirements;
}

/**
 * What `loadRunDetail` can honestly return.
 *
 * ## Why `ambiguous` exists rather than a `.single()`
 *
 * `fleet_run`'s uniqueness constraint is `unique (engagement_id, run_id)`, so a
 * run id is unique **within an engagement** and not across the ledger. FR-92
 * makes `/runs` cross-engagement (Q16, resolved at CR-005's approval), which
 * means `/runs/[run-id]` can be reached with an id that names a row in more than
 * one engagement the moment two engagements share one — and fleet run ids are
 * six hex characters, so that is a collision waiting rather than a theoretical.
 *
 * Taking the first match would render one engagement's run under an id that also
 * belongs to another's, with nothing on the screen saying so. That is a wrong
 * answer that looks checked, so it is a state instead. Queued for Erik: whether
 * the route should carry an engagement scope.
 */
export type RunDetailResult =
  | { state: "found"; run: RunDetail }
  | { state: "not_found" }
  | { state: "ambiguous"; matches: readonly RunIdentity[] };
