import type { Prose } from "@/lib/detail-load";
import { NOT_RECORDED, UNREADABLE_AMOUNT } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * A §7a-encrypted field, read back, in **four** states — plus the one that says
 * the two halves of the record disagree.
 *
 * ## Why four branches and not two
 *
 * `Prose` is `{ text: string | null; state: ProseState }` and i1 made the state
 * explicit precisely so a view could not collapse it to `string | null`:
 *
 *   * **present**       — decrypted, and this is the text.
 *   * **absent**        — nothing was ever stored. A blank is honest here.
 *   * **unreadable**    — ciphertext **was** stored and did not come back.
 *     Rendering this blank states "there is nothing here" about a spec paragraph
 *     that was lost, which is the same class of lie as rendering an
 *     undecryptable milestone amount as `$0`. So it takes the same treatment
 *     `MilestoneTable` gives that amount — the blocked family, in mono, with the
 *     word `unreadable` — rather than a new colour.
 *   * **not-requested** — the loader was told not to decrypt. Distinct from
 *     `absent` because the difference is *who declined*: the store has nothing,
 *     versus this page did not ask.
 *
 * The fifth branch is a contradiction, not a state: `state === "present"` with
 * `text === null` means the two halves of one record disagree. This product's
 * rule for that is to record both rather than pick one, so it is stated on the
 * page instead of falling through to whichever branch happens to be last.
 *
 * ## Where this lives, and why it is not in `src/components/`
 *
 * Five of Wave C's eight detail views render a `Prose` field and the five units
 * building them run in parallel with no way to talk. A shared component created
 * by whoever got there first is a merge collision, so this one stays inside the
 * work-unit that owns it. **It should be lifted to
 * `src/components/detail-prose.tsx` once Wave C is merged** — queued as a
 * question, and flagged here so the duplication is visible rather than
 * discovered.
 *
 * ## §5a
 *
 * Nothing new: `state-blocked` is the existing unreadable treatment, the muted
 * italic is `formatIdentifier`'s "not recorded" voice, and the wording reuses
 * `NOT_RECORDED` and `UNREADABLE_AMOUNT` rather than spelling new strings.
 * Fuchsia is not spent here — an unreadable field is not an `unparsed` row.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="prose"
 *   data-verify-field   which field this is (`requirement-text`, `question`, …)
 *   data-verify-state   "present" | "absent" | "unreadable" | "not-requested"
 *                       | "contradiction"
 *
 * No decrypted text is ever published into a `data-verify-*` attribute. The
 * contract carries the state and the field name; §7a keeps the content in the
 * document body where only an authenticated operator's browser sees it.
 */
export function DetailProse({
  prose,
  field,
  absent,
  notRequested,
  className,
}: {
  prose: Prose;
  /** Which field this is, for the state contract. Never the content. */
  field: string;
  /** What "nothing was ever stored" means for this particular field. */
  absent: string;
  /** Why the page declined to decrypt, when it did. */
  notRequested?: string;
  className?: string;
}) {
  const { state, text } = prose;

  if (state === "present" && text !== null) {
    return (
      <p
        data-verify-unit="prose"
        data-verify-field={field}
        data-verify-state="present"
        className={cn("max-w-3xl text-sm whitespace-pre-wrap", className)}
      >
        {text}
      </p>
    );
  }

  if (state === "present") {
    // Two halves of one record disagreeing. Both are recorded rather than one
    // being chosen: the loader says it read a value and no value arrived.
    return (
      <p
        data-verify-unit="prose"
        data-verify-field={field}
        data-verify-state="contradiction"
        className={cn(
          "ident text-state-blocked max-w-3xl text-xs font-semibold",
          className,
        )}
        title="The loader reported this field as decrypted and returned no text. Both are recorded here rather than one being chosen; neither is treated as an empty field."
      >
        read as present, returned nothing
      </p>
    );
  }

  if (state === "unreadable") {
    return (
      <p
        data-verify-unit="prose"
        data-verify-field={field}
        data-verify-state="unreadable"
        className={cn(
          "ident text-state-blocked max-w-3xl text-xs font-semibold",
          className,
        )}
        title="Ciphertext is stored for this field and it did not decrypt. This is not an empty field — something was written here and cannot be read back."
      >
        {UNREADABLE_AMOUNT}
      </p>
    );
  }

  if (state === "not-requested") {
    return (
      <p
        data-verify-unit="prose"
        data-verify-field={field}
        data-verify-state="not-requested"
        className={cn(
          "text-muted-foreground/70 max-w-3xl text-xs italic",
          className,
        )}
        title={
          notRequested ??
          "This page did not ask for this field to be decrypted. Whether anything is stored is unknown from here."
        }
      >
        not read
      </p>
    );
  }

  return (
    <p
      data-verify-unit="prose"
      data-verify-field={field}
      data-verify-state="absent"
      className={cn(
        "text-muted-foreground/70 max-w-3xl text-xs italic",
        className,
      )}
      title={absent}
    >
      {NOT_RECORDED}
    </p>
  );
}
