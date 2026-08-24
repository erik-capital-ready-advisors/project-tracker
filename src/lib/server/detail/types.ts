import type { EntityRefItem } from "@/components/entity-ref";
import type { EntityKind } from "@/lib/entity-routes";
import type { AnswerDb } from "@/lib/server/answers/db";

/**
 * The shapes M2.7's eight detail views and its reference resolution are built
 * on (CR-003 FR-80 to FR-86).
 *
 * ## The database slice is `AnswerDb`, not a ninth interface
 *
 * `releases/db.ts` defines the narrow client slice and the paging discipline;
 * `answers/db.ts` extends it with the three PostgREST verbs the answers needed.
 * This layer needs the same verbs and no others, so `DetailDb` is an alias and
 * not a new interface. **There is one paging helper in this repository and this
 * unit did not write a second.**
 *
 * ## `DetailRef` IS `EntityRefItem`, by definition rather than by resemblance
 *
 * Wave A's `<EntityRef kind label id title?>` is the markup contract FR-83 is
 * asserted against. A structurally-identical copy declared here would satisfy
 * every test on the day it was written and drift the first time either side
 * changed — so this is an alias, and the import is `import type`, which is
 * erased at compile time. No server module gains a runtime dependency on a
 * component, and no five-unit wave has to keep two definitions in step.
 *
 * `id: null` is the whole point of the type: **a reference that resolves to
 * nothing is `null`, and `null` is a finding.** It is never an exception, never
 * a `0`, and never quietly omitted from a list.
 */

export type DetailDb = AnswerDb;

/** Exactly `<EntityRef>`'s props. `id: null` renders FR-12's dangling treatment. */
export type DetailRef = EntityRefItem;

/**
 * A §7a-encrypted field, read back.
 *
 * Four states, and they are never collapsed into "a string or null", because
 * three of the four would then be indistinguishable from each other and from a
 * value that is genuinely the empty string:
 *
 *   * `present` — decrypted, and `text` is it.
 *   * `absent` — the column was null. Nothing was ever stored.
 *   * `unreadable` — ciphertext WAS stored and could not be read back. That is
 *     a fault to show, not a blank to render. `loadMilestones`' `amountUnreadable`
 *     is the precedent and the reasoning is identical: a milestone worth nothing
 *     and a milestone whose amount could not be read are different claims.
 *   * `not-requested` — the caller passed `withProse: false` and this path never
 *     asked. Loud on purpose: a screen that renders `not-requested` as empty is
 *     stating "there is nothing here" about a field it declined to read.
 *
 * This is `unparsed`'s rule applied to decryption. A wrong "nothing here" is the
 * same class of output as a wrong `done`.
 */
export type ProseState = "present" | "absent" | "unreadable" | "not-requested";

export interface Prose {
  /** Non-null only when `state` is `present`. */
  text: string | null;
  state: ProseState;
}

export const PROSE_NOT_REQUESTED: Prose = { text: null, state: "not-requested" };
export const PROSE_ABSENT: Prose = { text: null, state: "absent" };

/**
 * Whether a loader pays for §7a's decrypted prose.
 *
 * **Defaults to `true` on every detail loader**, and that is a deliberate
 * inversion of `answers/load.ts`'s default. The reasoning there — "a screen that
 * only needs status and identifiers must not pay a round trip per value" — is
 * the reason this one is opt-out: FR-81 asks for "every field the reading role
 * is permitted, **including decrypted prose**", so a detail view is precisely
 * the surface that does want it. It stays an explicit option rather than an
 * implicit cost, because `resolveRefs` must never pay it and because a caller
 * that wants only the identity of a row should be able to say so.
 *
 * The cost is one `decrypt_field` RPC per non-null encrypted value — the honest
 * price of column encryption on a hosted Postgres reached over PostgREST, as
 * `workitems/field-crypto.ts` records.
 */
export interface DetailOptions {
  withProse?: boolean;
}

/**
 * The label for a row that exists and carries no human reference of its own.
 *
 * Three of FR-81's eight kinds can be in this state: a `work_item` in `hand` or
 * `external` mode has no `unit`, a `blocker` has a nullable `ref`, and an
 * `open_question` has no clear human-facing key at all. `<EntityRef>` requires a
 * `label: string`, so a fallback has to exist somewhere — and if it is not
 * defined once here, five Wave C units define five of them.
 *
 * It is not a guess and it invents nothing: the uuid is the only identity the
 * row has, `id` is clear under §7a on every one of these tables, and the row is
 * genuinely navigable. Eight characters because the token is rendered in a mono
 * chip beside prose; this is a display label and never a key.
 */
export function fallbackLabel(kind: EntityKind, id: string): string {
  return `${kind.replace(/_/g, " ")} ${id.slice(0, 8)}`;
}

/**
 * Build a `DetailRef` for a row that certainly exists.
 *
 * `label` is what a human reads. `null` means the row carries no reference of
 * its own and `fallbackLabel` supplies one — never an empty string, which
 * `<EntityRef>` would render as an invisible link.
 */
export function toRef(
  kind: EntityKind,
  id: string,
  label: string | null,
  title?: string,
): DetailRef {
  return {
    kind,
    label: label === null || label.trim() === "" ? fallbackLabel(kind, id) : label,
    id,
    ...(title === undefined ? {} : { title }),
  };
}

/**
 * A reference whose target could not be found — FR-83's case, constructed
 * explicitly so it reads as a decision at the call site rather than as a
 * forgotten branch.
 */
export function danglingRef(
  kind: EntityKind,
  label: string,
  title?: string,
): DetailRef {
  return { kind, label, id: null, ...(title === undefined ? {} : { title }) };
}

/** The engagement a detail row belongs to. Not one of FR-81's eight kinds. */
export interface DetailEngagement {
  id: string;
  slug: string;
  /** §7a's stated exception: deliberately unencrypted, and B6 stays open. */
  clientName: string;
}
