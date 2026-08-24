import type { EntityKind } from "@/lib/entity-routes";

import { fetchIn, requiredText, text } from "./rows";
import type { DetailDb, DetailRef } from "./types";
import { danglingRef, fallbackLabel, toRef } from "./types";

/**
 * FR-83's foundation: turning a reference **as it is rendered** into the row it
 * names, or into `null`.
 *
 * > **FR-83** A reference that resolves to nothing renders in FR-12's
 * > dangling-reference treatment and **is never a link**. It is not a 404, not a
 * > search, and not silently plain text.
 *
 * Wave A's `<EntityRef id={null}>` does the right thing with `null`. This module
 * is what produces the `id`, and the one rule it holds to is that **`null` is a
 * finding, not an error**. A reference this resolver cannot place does not throw,
 * does not fall back to a search, and is never dropped from a list — it comes
 * back `null` and the screen shows a reference that points at nothing, which is
 * exactly what FR-12 and FR-65 require to be *reported*.
 *
 * ## One round trip per kind, never one per reference
 *
 * Queries are grouped by kind. Each kind costs one paged read over the
 * engagements in scope, selecting only the natural-key columns, and the matching
 * happens in memory. A screen with forty references over five kinds pays five
 * reads. This is the same trade `loadShippedIndex` makes and it is correct at
 * this product's size — one operator, tens of engagements.
 *
 * **No column selected here is encrypted, on any kind.** Resolution never
 * decrypts anything, which is why `DetailOptions` does not reach this module at
 * all: the resolver must not pay a per-value RPC to answer "does this ref exist".
 *
 * ## The uniqueness rule, uniform across all eight kinds
 *
 * A reference resolves **only when exactly one row matches what the caller
 * supplied.** Zero matches is dangling. Two or more is *also* dangling, and that
 * is the deliberate part: `u4` names a different work item in every fleet run,
 * and a resolver that picked the most recent would produce a link that is right
 * most of the time and silently wrong the rest of it. Refusing is this product's
 * rule everywhere else — `unparsed` is the only default — and a link to the
 * wrong row is the navigable equivalent of a wrong `done`.
 *
 * The consequence, stated so it is not discovered: a `u4` that resolves today
 * becomes dangling the day a second run defines `u4`, unless the caller supplies
 * the run. That is visible, loud and correct. Supply `runId` and it stays exact.
 *
 * ## Natural keys, read off the migrations rather than assumed
 *
 * | kind | resolves by | uniqueness, as the schema states it |
 * |---|---|---|
 * | `work_item` | `(engagement_id, fleet_run_id, unit)` | `work_item_engagement_run_unit_key` — **plain** unique, NULLS DISTINCT, since `20260819170622` replaced the partial form |
 * | `defect` | `(engagement_id, ref)` | `unique (engagement_id, ref)` |
 * | `blocker` | `(engagement_id, ref)` | `unique nulls not distinct (engagement_id, ref)` |
 * | `requirement` | `(engagement_id, ref)` | `unique (engagement_id, ref)` |
 * | `open_question` | `(engagement_id, source_key)` | `open_question_source_key_idx` — see the note below |
 * | `external_wait` | `(engagement_id, label)` | `unique (engagement_id, label)` |
 * | `release` | `(engagement_id, identifier, environment)` | `unique (engagement_id, identifier, environment)` |
 * | `contract_milestone` | `(engagement_id, name)` | `unique (engagement_id, name)` |
 *
 * **`open_question` — two sources disagree, and both are recorded.** The table
 * comment in `20260819144331_schema_21_entities.sql` says "No natural unique key,
 * deliberately", and it was true when written. `20260819165903_i5_ingest_idempotency`
 * then added `source_key` — `<artifact filename>#<record ordinal>`, clear text —
 * and `20260819170622` made its unique index plain. So there IS a natural key,
 * and it is a *machine* key: no screen in this product renders an artifact
 * filename and an ordinal as a reference, and nothing in the schema holds a
 * foreign key to `open_question` at all. Resolution is therefore supported and
 * expected to go unused; see the report for the checkable form of that claim.
 *
 * ## Keys are built by `refKey`, never by hand
 *
 * `work_item` needs a run and `release` needs an environment, so a key spelled
 * out at a call site is a key that collides the first time either is supplied.
 * There is one function that builds them and Wave C calls it.
 */

/** A reference as it is rendered, plus what is known about its scope. */
export interface RefQuery {
  kind: EntityKind;
  /**
   * The reference as a human reads it: `FR-42`, `u4`, `D-7`, `dpl_1`, an
   * external wait's label, a milestone's name, an open question's `source_key`.
   */
  ref: string;
  engagementId: string;
  /**
   * `work_item` only — the `fleet_run.id` uuid the unit is scoped to.
   *
   * Supply it whenever the caller has it. Without it a unit id resolves only
   * when the engagement holds exactly one work item with that unit, which is the
   * common case today and stops being it the moment a second run lands.
   */
  runId?: string | null;
  /** `release` only — the environment, when the caller has it. */
  environment?: string | null;
}

/**
 * `null` means: resolved to nothing. A finding, never an error.
 *
 * A key **absent** from the map was never asked about, which is a different
 * thing again — check `resolution.has(refKey(query))` when the two need telling
 * apart. `resolvedId` collapses them to `null`, which is the safe direction:
 * an unasked reference renders dangling rather than as a link to nowhere.
 */
export type RefResolution = Map<string, string | null>;

/**
 * The one place a resolution key is spelled.
 *
 * The separator is `\0`, written as the **escape** and never as a raw byte.
 * `tests/source-hygiene.test.ts` records what a literal NUL cost this repository
 * once: `grep` and `git grep` treat the file as binary and silently return a
 * shorter list, and a reviewer wrote a remediation instruction on that basis.
 * That gate caught this function on its first run, which is the gate working.
 *
 * It is a NUL rather than a colon or a space because two of the five parts are
 * free text a person typed — an `external_wait` label is "App Store review", a
 * milestone name is "Phase 1 delivery". Any printable separator can occur inside
 * one of those and fuse two different tuples into one key. Nothing in a Postgres
 * `text` column reaching here can contain a NUL, which is why `ingest/plan.ts`
 * and `workitems/rules.ts` already use it for their composite keys.
 */
export function refKey(query: RefQuery): string {
  return [
    query.engagementId,
    query.kind,
    query.runId ?? "",
    query.environment ?? "",
    query.ref,
  ].join("\0");
}

/** The resolved id, or `null` for both "resolved to nothing" and "never asked". */
export function resolvedId(
  resolution: RefResolution,
  query: RefQuery,
): string | null {
  return resolution.get(refKey(query)) ?? null;
}

/** How each kind is looked up: the columns to read and the row's key parts. */
interface KindLookup {
  table: string;
  columns: string;
  /** The row's natural key, in the same order `candidateKey` builds a query's. */
  rowKey: (row: Record<string, unknown>) => (string | null)[];
  /** The query's natural key. `null` in a slot means "caller did not narrow on it". */
  queryKey: (query: RefQuery) => (string | null)[];
}

const LOOKUP: Readonly<Record<EntityKind, KindLookup>> = {
  work_item: {
    table: "work_item",
    columns: "id, engagement_id, fleet_run_id, unit",
    rowKey: (row) => [text(row.fleet_run_id), text(row.unit)],
    queryKey: (query) => [query.runId ?? null, query.ref],
  },
  defect: {
    table: "defect",
    columns: "id, engagement_id, ref",
    rowKey: (row) => [text(row.ref)],
    queryKey: (query) => [query.ref],
  },
  blocker: {
    table: "blocker",
    columns: "id, engagement_id, ref",
    rowKey: (row) => [text(row.ref)],
    queryKey: (query) => [query.ref],
  },
  requirement: {
    table: "requirement",
    columns: "id, engagement_id, ref",
    rowKey: (row) => [text(row.ref)],
    queryKey: (query) => [query.ref],
  },
  open_question: {
    table: "open_question",
    columns: "id, engagement_id, source_key",
    rowKey: (row) => [text(row.source_key)],
    queryKey: (query) => [query.ref],
  },
  external_wait: {
    table: "external_wait",
    columns: "id, engagement_id, label",
    rowKey: (row) => [text(row.label)],
    queryKey: (query) => [query.ref],
  },
  release: {
    table: "release",
    columns: "id, engagement_id, identifier, environment",
    rowKey: (row) => [text(row.identifier), text(row.environment)],
    queryKey: (query) => [query.ref, query.environment ?? null],
  },
  contract_milestone: {
    // §7a: operator only, agent tokens are refused this table entirely. Nothing
    // here decrypts — `name` is clear — and reaching this line through
    // `agentScopedDb` still throws `forbidden_table` at `from()`, because that
    // wrapper is a runtime Proxy and no compile-time type can remove it. FR-86
    // is unchanged by this module.
    table: "contract_milestone",
    columns: "id, engagement_id, name",
    rowKey: (row) => [text(row.name)],
    queryKey: (query) => [query.ref],
  },
};

/**
 * Resolve a batch of rendered references to row ids.
 *
 * Every query in `queries` gets an entry in the returned map — including the
 * ones that resolve to nothing, which is the whole point. A caller can count the
 * `null`s and report them; it cannot silently lose them.
 */
export async function resolveRefs(
  db: DetailDb,
  queries: readonly RefQuery[],
): Promise<RefResolution> {
  const resolution: RefResolution = new Map();
  if (queries.length === 0) return resolution;

  const byKind = new Map<EntityKind, RefQuery[]>();
  for (const query of queries) {
    const existing = byKind.get(query.kind);
    if (existing === undefined) byKind.set(query.kind, [query]);
    else existing.push(query);
    // Seeded as unresolved so that a kind whose read comes back empty still
    // produces an entry per query rather than a gap the caller reads as "not
    // asked". FR-83's case must be positively stated.
    resolution.set(refKey(query), null);
  }

  await Promise.all(
    [...byKind.entries()].map(async ([kind, kindQueries]) => {
      const lookup = LOOKUP[kind];
      const engagementIds = [
        ...new Set(kindQueries.map((query) => query.engagementId)),
      ].filter((id) => id !== "");
      if (engagementIds.length === 0) return;

      const rows = await fetchIn(
        db,
        lookup.table,
        lookup.columns,
        "engagement_id",
        engagementIds,
      );

      // engagement → the rows of this kind it holds, keyed for matching below.
      const indexed = new Map<string, { id: string; key: (string | null)[] }[]>();
      for (const row of rows) {
        const engagementId = requiredText(row.engagement_id);
        const entry = { id: requiredText(row.id), key: lookup.rowKey(row) };
        const existing = indexed.get(engagementId);
        if (existing === undefined) indexed.set(engagementId, [entry]);
        else existing.push(entry);
      }

      for (const query of kindQueries) {
        const candidates = indexed.get(query.engagementId) ?? [];
        const wanted = lookup.queryKey(query);

        // A `null` slot in the query key is a dimension the caller could not
        // narrow on, so it matches anything. A non-null slot must match exactly.
        const matches = candidates.filter((candidate) =>
          wanted.every(
            (part, index) => part === null || candidate.key[index] === part,
          ),
        );

        // Exactly one, or nothing. Two matches is ambiguity, and this product
        // refuses rather than guesses.
        resolution.set(refKey(query), matches.length === 1 ? matches[0].id : null);
      }
    }),
  );

  return resolution;
}

/**
 * The references that resolved to nothing, so a caller can report a count
 * rather than discover the gaps one rendered token at a time.
 *
 * FR-12 and FR-65 require a reference naming something that does not exist to be
 * *reported*. On a navigable surface the dangling treatment is that report for a
 * reader; this is the same fact in a form a screen can count.
 */
export function danglingQueries(
  resolution: RefResolution,
  queries: readonly RefQuery[],
): RefQuery[] {
  return queries.filter((query) => resolution.get(refKey(query)) == null);
}

/**
 * uuid → the human reference for that row, for the FKs a detail view follows in
 * the other direction (`blocker_id`, `fixing_work_item_id`, `depends_on_id`).
 *
 * One paged read per kind. A uuid with no row is **absent from the map**, not
 * mapped to an empty string: those are different facts and `toRef` needs to tell
 * them apart to decide between a link and the dangling treatment.
 *
 * A `null` value means the row exists and carries no reference of its own — a
 * hand-mode work item has no `unit`, a blocker's `ref` is nullable. `toRef`
 * turns that into `fallbackLabel`, which is the one place that decision lives.
 */
export async function labelEntities(
  db: DetailDb,
  kind: EntityKind,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>();
  const unique = [...new Set(ids)].filter((id) => id !== "");
  if (unique.length === 0) return labels;

  const lookup = LOOKUP[kind];
  const rows = await fetchIn(db, lookup.table, lookup.columns, "id", unique);

  for (const row of rows) {
    // The last key part is the human-facing one on every kind: `unit`,
    // `ref`, `source_key`, `label`, `name`; `release` is the exception and its
    // display name is the identifier, which is the FIRST part.
    const key = lookup.rowKey(row);
    labels.set(
      requiredText(row.id),
      kind === "release" ? key[0] : key[key.length - 1],
    );
  }

  return labels;
}

/**
 * One outbound foreign key, rendered.
 *
 * The three states are kept apart because two of them look identical if they
 * are not:
 *
 *   * the uuid names a row carrying a reference → a link, labelled with it;
 *   * the uuid names a row carrying none → a link, labelled by `fallbackLabel`;
 *   * the uuid names **no row** → `id: null`, the dangling treatment. On this
 *     stack that is rare but real: CR-002 and §7a state that identifiers in
 *     `audit_log` and `test_result` may outlive the rows they name, and "a
 *     reader must treat an unresolvable reference in them as the expected
 *     state, not as a defect".
 */
export function refFromId(
  kind: EntityKind,
  id: string,
  labels: Map<string, string | null>,
  title?: string,
): DetailRef {
  if (!labels.has(id)) {
    return danglingRef(
      kind,
      fallbackLabel(kind, id),
      title ??
        `No ${kind.replace(/_/g, " ")} with this id is stored. The reference is shown rather than hidden, and it is not a link.`,
    );
  }
  return toRef(kind, id, labels.get(id) ?? null, title);
}
