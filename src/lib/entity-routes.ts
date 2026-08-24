import { AGENT_FORBIDDEN_TABLES } from "@/lib/api/capabilities";

/**
 * The one place that decides where an entity reference points (FR-80, FR-83).
 *
 * ## Why this is a module and not eight good intentions
 *
 * FR-83 is a rule with teeth: "a reference that resolves to nothing renders in
 * FR-12's dangling-reference treatment and **is never a link**. It is not a 404,
 * not a search, and not silently plain text." That has to hold across eight
 * detail views written by five work-units, and a rule that lives in five heads
 * is not a rule. So the decision is made once, here, and `entityHref` returns
 * `null` rather than a string whenever it cannot honestly produce a destination.
 *
 * A model that always returns a string cannot express the dangling case at all,
 * and a caller handed one will render a link to it — which is the exact
 * weakening FR-83 forbids.
 *
 * ## What this module may and may not import
 *
 * It is pure and it stays importable outside a React Server Component: no
 * `server-only`, no database, no filesystem, no `next/*`. `tests/m27-gate.test.ts`
 * loads it by absolute file URL under vitest, and `entity-ref.tsx` uses it in a
 * component that renders on both sides of the boundary. Its one import is
 * `@/lib/api/capabilities`, which is itself pure and whose only other import is
 * a type.
 */

/** CR-003 FR-81 — the eight entities that get a detail view. A closed set. */
export const ENTITY_KINDS = [
  "work_item",
  "defect",
  "blocker",
  "requirement",
  "open_question",
  "external_wait",
  "release",
  "contract_milestone",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/**
 * Where each kind's detail view lives.
 *
 * Decided once by project-lead so five units cannot each pick a different path,
 * and exported so the detail routes themselves can be checked against it rather
 * than against a path someone retyped. `/work-items` and `/waits` already exist
 * as listing screens; the remaining six base paths are claimed here and their
 * `[id]` segments are built by the units that own those views.
 */
export const ENTITY_BASE_PATH: Readonly<Record<EntityKind, string>> = {
  work_item: "/work-items",
  defect: "/defects",
  blocker: "/blockers",
  requirement: "/requirements",
  open_question: "/questions",
  external_wait: "/waits",
  release: "/releases",
  contract_milestone: "/milestones",
};

/**
 * What a kind is called in front of a person.
 *
 * Here rather than in each view, for the same reason the paths are: eight views
 * that each invent a label produce eight spellings of `open_question`.
 */
export const ENTITY_LABEL: Readonly<Record<EntityKind, string>> = {
  work_item: "work item",
  defect: "defect",
  blocker: "blocker",
  requirement: "requirement",
  open_question: "open question",
  external_wait: "external wait",
  release: "release",
  contract_milestone: "contract milestone",
};

/**
 * The href for one entity, or `null` when there is honestly no destination.
 *
 * `id` is the **database** id (a uuid), never the human reference string.
 * `FR-42` and `u4` are what a reader sees; they are not what a route resolves,
 * and passing one here would produce a link to a row that does not exist —
 * a broken link, which is precisely what FR-83 refuses to allow a navigable
 * surface to introduce.
 *
 * `null` for exactly two reasons, and both are the dangling case:
 *
 *   * a `kind` this module does not recognise — no route is guessed from it;
 *   * an empty or whitespace-only `id` — a reference that resolved to nothing.
 *
 * The id is trimmed before encoding: surrounding whitespace is never part of a
 * uuid, and encoding it would produce a `%20`-padded path that 404s.
 */
export function entityHref(kind: string, id: string): string | null {
  if (!isEntityKind(kind)) return null;

  const trimmed = id.trim();
  if (trimmed === "") return null;

  return `${ENTITY_BASE_PATH[kind]}/${encodeURIComponent(trimmed)}`;
}

/**
 * FR-86 / §7a — the kinds an agent token may never reach, **derived** from the
 * single source of that fact rather than copied.
 *
 * `AGENT_FORBIDDEN_TABLES` in `@/lib/api/capabilities` is where §7a's refusal is
 * recorded and enforced. A hand-written array here would pass the same
 * assertions on the day it was written and drift the first time §7a changed —
 * which is the whole failure mode the gate for FR-86 exists to catch. So this is
 * an intersection computed at module load and there is no second list.
 *
 * The intersection is measured, not assumed: `AGENT_FORBIDDEN_TABLES` holds
 * `contract_milestone`, `operator`, `agent_token` and `audit_log`, and only the
 * first is one of FR-81's eight kinds. The other three are operator-only §7a
 * rows that have no detail view at all, so they fall out of this list by
 * construction rather than by anyone remembering to leave them out.
 *
 * The cast is what lets a type guard over `string` filter a tuple of narrower
 * literals; it widens the input and narrows the output, and the same idiom is
 * used in `capabilities.ts` itself.
 */
export const OPERATOR_ONLY_KINDS: readonly EntityKind[] = (
  AGENT_FORBIDDEN_TABLES as readonly string[]
).filter(isEntityKind);
