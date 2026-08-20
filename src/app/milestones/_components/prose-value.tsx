import type { ReactNode } from "react";

import type { Prose } from "@/lib/detail-load";

/**
 * A §7a-encrypted field, read back, rendered in all **four** of its states.
 *
 * ## Why four and not two
 *
 * `Prose` is `{ text, state }` and `state` is one of `present`, `absent`,
 * `unreadable`, `not-requested`. Collapsing it to "a string or nothing" makes
 * three of those four render identically, and two of the three are claims this
 * product must never make by accident:
 *
 *   * **`unreadable`** — ciphertext WAS stored and could not be read back.
 *     Rendering it blank states "there is nothing here" about a field that was
 *     lost. It is the prose form of `UNREADABLE_AMOUNT`, and it takes the same
 *     voice and the same treatment: the `blocked` family, stated, never blank.
 *   * **`not-requested`** — this path passed `withProse: false` and never asked.
 *     A view that renders that as empty is reporting on a field it declined to
 *     read.
 *
 * Only `absent` is genuinely "nothing was ever stored", and only `absent`
 * returns `undefined` — which hands the row back to `DetailField`'s required
 * `absent` prop, so the reason is stated rather than left as a blank cell.
 *
 * ## Why this is a function and not a component
 *
 * `DetailField` decides whether a value was recorded by testing its `children`
 * for `undefined`. A component always evaluates to a truthy element, so
 * `<ProseValue />` would defeat that test and print an empty `<dd>` for every
 * absent field. This is called at the call site instead.
 *
 * ## Where this ought to live
 *
 * `src/components/`, beside `EntityDetail`. It is here because M2.7's five Wave
 * C units own disjoint route directories and none of them owns a shared
 * component home, so the units rendering `Prose` will each write one of these.
 * Reported as a finding for a follow-up hoist rather than resolved by editing a
 * file this unit does not own.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="prose"
 *   data-verify-state   "unreadable" | "not-requested"  (the two rendered here)
 *
 * The attribute carries the STATE and never the text. Every field that reaches
 * this function is §7a `sensitive` or baseline-encrypted.
 */
export function renderProse(prose: Prose): ReactNode | undefined {
  if (prose.state === "present" && prose.text !== null && prose.text !== "") {
    // `whitespace-pre-wrap` because this is prose somebody typed, and the line
    // breaks they typed are part of what they wrote.
    return <p className="max-w-prose whitespace-pre-wrap">{prose.text}</p>;
  }

  if (prose.state === "unreadable") {
    return (
      <span
        data-verify-unit="prose"
        data-verify-state="unreadable"
        title="Ciphertext is stored in this field and could not be read back. This is a fault, not an empty field: something was written here and it is not readable now."
        className="ident text-state-blocked font-semibold"
      >
        unreadable
      </span>
    );
  }

  if (prose.state === "not-requested") {
    return (
      <span
        data-verify-unit="prose"
        data-verify-state="not-requested"
        title="This view did not ask for this field to be decrypted, so nothing here is a statement about whether it holds anything."
        className="text-muted-foreground/70 italic"
      >
        not read
      </span>
    );
  }

  // `absent`, and a `present` that decrypted to an empty string — nothing was
  // stored either way. `DetailField` states why.
  return undefined;
}
