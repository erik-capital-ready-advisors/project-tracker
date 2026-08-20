/**
 * M1.7 — the unified work-item model, as pure functions.
 *
 * FR-39 to FR-43 live here and nowhere else. Everything in this file is a pure
 * function over plain values: no database, no clock, no environment. That is
 * what lets the two rules this product is most likely to get subtly wrong —
 * FR-42's dropped-edge counting and FR-43's evidence scopes — be proven by test
 * rather than asserted in a report.
 *
 * ## Two spellings, and why both are load-bearing
 *
 * The same closed sets are spelled two ways, exactly as `@/lib/api/capabilities`
 * does for capabilities:
 *
 *   * **On the wire and in `@/lib/ingest`** — hyphenated: `observed-live`,
 *     `no-agent-for-stack`. This is the spelling the spec writes (FR-29, FR-43)
 *     and therefore what an agent posts and what a report prints.
 *   * **In Postgres** — underscored: `observed_live`, `no_agent_for_stack`,
 *     because that is what i1's enums hold.
 *
 * Converting by hand at each call site is how the two drift, and a drifted
 * evidence scope is a *collapsed* evidence scope. Every conversion goes through
 * this file.
 *
 * ## The unparsed discipline, applied to enums
 *
 * Every `parse*` function here returns `null` for anything it does not
 * recognise. It never falls back to a "sensible" member. Widening one of these
 * to make a stubborn payload classify is the same move as widening a regex to
 * make a stubborn row classify, and it is the failure the whole product exists
 * to prevent — `asserted` and `observed-live` are different claims, and a parser
 * that quietly rounds one to the other has destroyed the distinction FR-43
 * exists to keep.
 */

import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export type StoredExecutionMode = Enums["execution_mode"];
export type StoredExecutorKind = Enums["executor_kind"];
export type StoredEvidenceScope = Enums["evidence_scope"];
export type StoredDisposition = Enums["work_disposition"];
export type StoredUnautomatedReason = Enums["unautomated_reason"];
export type StoredWorkStatus = Enums["work_status"];
export type StoredResolutionMethod = Enums["wait_resolution_method"];

/**
 * Build a `parse` for a closed set given its wire↔stored table.
 *
 * One helper rather than six hand-written switches, because six hand-written
 * switches is six chances to add a permissive `default:` branch.
 */
function closedSet<Stored extends string>(
  pairs: Readonly<Record<string, Stored>>,
): {
  parse: (raw: unknown) => Stored | null;
  toWire: (stored: Stored) => string;
  wireValues: readonly string[];
} {
  const toWireMap = new Map<Stored, string>();
  for (const [wire, stored] of Object.entries(pairs) as [string, Stored][]) {
    // The first wire spelling listed for a stored value is its canonical one, so
    // an alias may be accepted on input without changing what is printed.
    if (!toWireMap.has(stored)) toWireMap.set(stored, wire);
  }

  return {
    parse(raw: unknown): Stored | null {
      if (typeof raw !== "string") return null;
      return Object.prototype.hasOwnProperty.call(pairs, raw)
        ? pairs[raw]
        : null;
    },
    toWire(stored: Stored): string {
      return toWireMap.get(stored) ?? stored;
    },
    wireValues: Object.keys(pairs),
  };
}

/** FR-39. */
export const EXECUTION_MODE = closedSet<StoredExecutionMode>({
  fleet: "fleet",
  hand: "hand",
  external: "external",
  // The spec's prose says "hand-prompted" (FR-28) while its enum says `hand`
  // (FR-39). Accepted as an alias on input so a hook written from the prose does
  // not silently fail; `hand` is what is stored and printed.
  "hand-prompted": "hand",
});

/** FR-39, FR-40. `erik_gate` is a first-class kind, not a note. */
export const EXECUTOR_KIND = closedSet<StoredExecutorKind>({
  agent: "agent",
  erik: "erik",
  erik_gate: "erik_gate",
  "erik-gate": "erik_gate",
  client: "client",
  vendor: "vendor",
  unassigned: "unassigned",
});

/**
 * FR-43. Four states, and the system never collapses them.
 *
 * `asserted` means someone wrote it down. `observed-live` means someone watched
 * it happen in the running system. `observed-elsewhere` means it was watched
 * somewhere that is not this deployment. `not-verified` means nobody checked.
 * A product whose whole purpose is refusing to report a wrong `done` cannot
 * treat any two of those as the same value.
 */
export const EVIDENCE_SCOPE = closedSet<StoredEvidenceScope>({
  "observed-live": "observed_live",
  "observed-elsewhere": "observed_elsewhere",
  asserted: "asserted",
  "not-verified": "not_verified",
});

/** FR-30. `carried` means Erik still owns the gap; `closed` means it was decided against. */
export const DISPOSITION = closedSet<StoredDisposition>({
  carried: "carried",
  closed: "closed",
});

/** FR-29. The six reason classes, closed by the spec. */
export const UNAUTOMATED_REASON = closedSet<StoredUnautomatedReason>({
  "no-agent-for-stack": "no_agent_for_stack",
  "credential-absent": "credential_absent",
  "human-judgment": "human_judgment",
  "client-action": "client_action",
  "out-of-scope": "out_of_scope",
  budget: "budget",
});

export const WORK_STATUS = closedSet<StoredWorkStatus>({
  pending: "pending",
  in_flight: "in_flight",
  "in-flight": "in_flight",
  done: "done",
  blocked: "blocked",
  superseded: "superseded",
  not_dispatched: "not_dispatched",
  "not-dispatched": "not_dispatched",
  unparsed: "unparsed",
});

/** FR-35. A named probe for Phase 2 automation, or `manual`. */
export const RESOLUTION_METHOD = closedSet<StoredResolutionMethod>({
  probe: "probe",
  manual: "manual",
});

/**
 * FR-41 — work blocked because no agent exists for its stack **is** an
 * `erik_gate`.
 *
 * Applied here as a derivation rather than left to each caller, and enforced a
 * second time by `work_item_no_agent_implies_erik_gate` in the schema. Two
 * layers because the check constraint refuses the row (loudly, at 3 a.m., with a
 * Postgres error nobody wanted) while this function makes the row correct in the
 * first place. The constraint is the proof that no ingest path can route around
 * this one.
 *
 * Deliberately one-directional: `no_agent_for_stack` forces `erik_gate`, but an
 * `erik_gate` may exist for any of the other five reasons — a provisioning
 * decision, an account transfer, a judgment call an agent must not make (FR-40).
 */
export function applyErikGateRule(item: {
  executorKind: StoredExecutorKind;
  unautomatedReason: StoredUnautomatedReason | null;
}): StoredExecutorKind {
  return item.unautomatedReason === "no_agent_for_stack"
    ? "erik_gate"
    : item.executorKind;
}

/** Why an edge was not stored. Each value is reported; none is silent. */
export type DroppedEdgeReason =
  | "unknown-target"
  | "unknown-source"
  | "self-reference"
  | "duplicate";

export interface DependencyEdge {
  /** The unit key of the item that depends on something. */
  from: string;
  /** The unit key of the thing it depends on. */
  to: string;
}

export interface DroppedEdge extends DependencyEdge {
  reason: DroppedEdgeReason;
}

export interface ResolvedEdges {
  /** Rows to write to `work_item_dependency`. Both ends are real row ids. */
  resolved: { workItemId: string; dependsOnId: string }[];
  /** Edges that were **not** stored, each with the reason. Never empty silently. */
  dropped: DroppedEdge[];
  /** `dropped.length`, carried explicitly because FR-42 asks for a count. */
  droppedCount: number;
}

/**
 * FR-42 — resolve dependency edges against the work items that actually exist,
 * and **count what was dropped**.
 *
 * ## Why the count is the whole requirement
 *
 * `work_item_dependency` has real foreign keys at both ends, so an edge naming a
 * unit that does not exist *cannot* be stored — the database would refuse it.
 * The requirement is therefore not "do not store it"; the database already
 * guarantees that. The requirement is that dropping it is **visible**.
 *
 * A dropped edge that is not counted is indistinguishable from an edge that was
 * never declared, and those are opposite facts: the first means a manifest
 * names a dependency the run never produced (a real finding about the run), the
 * second means there was nothing to say. Silently swallowing the first is how a
 * work item shows as ready when something it needs was never built.
 *
 * So this function never throws and never filters quietly. Every input edge
 * comes out in exactly one of the two lists.
 *
 * @param edges  Edges as declared, in unit-key space.
 * @param known  Unit key → work-item row id, for the items that exist.
 */
export function resolveDependencyEdges(
  edges: readonly DependencyEdge[],
  known: ReadonlyMap<string, string>,
): ResolvedEdges {
  const resolved: { workItemId: string; dependsOnId: string }[] = [];
  const dropped: DroppedEdge[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}`;

    if (edge.from === edge.to) {
      // `work_item_dependency_no_self` would refuse this too. Reported rather
      // than filtered, because a manifest declaring a unit depends on itself is
      // a defect in the manifest and Erik should see it.
      dropped.push({ ...edge, reason: "self-reference" });
      continue;
    }
    if (seen.has(key)) {
      dropped.push({ ...edge, reason: "duplicate" });
      continue;
    }

    const workItemId = known.get(edge.from);
    const dependsOnId = known.get(edge.to);

    if (workItemId === undefined) {
      dropped.push({ ...edge, reason: "unknown-source" });
      continue;
    }
    if (dependsOnId === undefined) {
      dropped.push({ ...edge, reason: "unknown-target" });
      continue;
    }

    seen.add(key);
    resolved.push({ workItemId, dependsOnId });
  }

  return { resolved, dropped, droppedCount: dropped.length };
}

/**
 * FR-44's sort keys — **clear columns only**.
 *
 * §7a encrypts `work_item.description` and `raw_status`, and states the
 * consequence in writing: "there is no cross-engagement full-text search over
 * work items in v1." A sort or filter on either would mean decrypting every row
 * in the table to order it, which is that search by another name. This list is
 * the enforcement of that sentence, and it is an allowlist rather than a
 * denylist so that a column added later is excluded until someone decides
 * otherwise.
 */
export const WORK_ITEM_SORT_COLUMNS = [
  "started_at",
  "ended_at",
  "status",
  "executor_kind",
  "execution_mode",
  "phase",
  "unit",
  "not_verified_count",
] as const;

export type WorkItemSortColumn = (typeof WORK_ITEM_SORT_COLUMNS)[number];

export function parseSortColumn(raw: unknown): WorkItemSortColumn | null {
  if (typeof raw !== "string") return null;
  return (WORK_ITEM_SORT_COLUMNS as readonly string[]).includes(raw)
    ? (raw as WorkItemSortColumn)
    : null;
}

export function parseSortDirection(raw: unknown): "asc" | "desc" | null {
  if (raw === "asc" || raw === "desc") return raw;
  return null;
}
