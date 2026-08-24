import { Absent } from "@/components/answer-chips";
import type { Prose } from "@/lib/detail-load";
import { cn } from "@/lib/utils";

/**
 * B33 — the one renderer for a §7a-encrypted field, read back in all FOUR of
 * its states. Every one of FR-81's detail views that shows a `Prose` column
 * imports this.
 *
 * ## Why this file exists
 *
 * Before B33 this component existed in five copies —
 * `blockers/[id]/_components/blocker-detail-view.tsx`,
 * `defects/[id]/_components/defect-detail-view.tsx`,
 * `milestones/_components/prose-value.tsx`,
 * `requirements/_components/detail-prose.tsx`, and
 * `work-items/[id]/_components/work-item-detail-view.tsx` — because M2.7's
 * five Wave C units ran in parallel with no unit owning `src/components/`, and
 * a shared file created by whichever unit got there first would have been a
 * merge collision. That boundary was `project-lead`'s, taken deliberately to
 * stop a five-way conflict, and its cost — three incompatible verification
 * contracts, drifted before merge — is recorded against the boundary, not
 * against the units. See `spec/prod.md` blocker B33.
 *
 * ## The three contracts that existed, and which one won
 *
 * | | unit name | state attribute | field attribute | absent renders |
 * |---|---|---|---|---|
 * | blocker / defect / work-item (3 of 5) | `detail-prose` | `data-verify-prose-state` | yes | `—` (`Absent`) |
 * | milestones (1 of 5) | `prose` | `data-verify-state` | **no** — collapsed into `DetailField`'s own fallback, which carries no attribute at all | `—` (`Absent`, via that same fallback) |
 * | requirements / open-question (1 of 5, shared across two routes) | `prose` | `data-verify-state` | yes | `"not recorded"` (its own text, not `Absent`) |
 *
 * This component keeps **`detail-prose`** as the unit name — it is the
 * majority (3 of 5), and it matches this codebase's existing naming family for
 * detail-view state hooks (`detail-back`, `detail-engagement`), where `"prose"`
 * alone is a generic name a flat selector could collide with. It keeps
 * **`data-verify-state`** as the attribute name, dropping the `-prose-`
 * infix — the unit name already scopes what kind of state this is (the same
 * choice `entity-detail.tsx`'s `Identifier` fallback already made for its own
 * `unreadable` hook), so repeating it in the attribute is redundant. And it
 * keeps `data-verify-field`, because two of FR-81's kinds (`defect`,
 * `work_item`) render more than one `Prose` column on the same view and a
 * selector with no field cannot tell them apart.
 *
 * `absent` renders as `—` via the shared `Absent` primitive — the majority (4
 * of 5, once milestones' own delegation is counted) and the idiom this product
 * already uses everywhere else a value is genuinely absent (`entity-detail.tsx`'s
 * identity slot, every `DetailField`'s own fallback). `"not recorded"` is
 * dropped. **And every state, including `absent`, now publishes the state
 * attribute on this component's own wrapper** — closing the milestones gap
 * that let "no single selector covers all eight views" be true in the first
 * place.
 *
 * ## A fifth branch that is not a fifth state
 *
 * `ProseState` is `"present" | "absent" | "unreadable" | "not-requested"` —
 * four values, by the type. `requirements/_components/detail-prose.tsx` (now
 * folded in here) additionally guarded `state === "present"` arriving with
 * `text === null`: the two halves of one record disagreeing, which the type
 * does not forbid at runtime even though the type's own doc comment says
 * `text` is "non-null only when `state` is `present`". Rendering that
 * silently as blank text under `data-verify-state="present"` is exactly the
 * class of falsehood this whole component exists to refuse, so the guard is
 * kept as a defensive `"contradiction"` branch — not one of the four canonical
 * states, reached only when a caller's data violates the type it declares.
 *
 * ## Visual note — not a restyling, but not pixel-identical either
 *
 * §5a's design is approved and this unit does not restyle it. But the three
 * contracts above did not agree on typography for the same states either (a
 * `max-w-3xl text-xs` cap on requirements' copy that the other four did not
 * share), so *some* view's pixels move by unifying to one JSX tree regardless
 * of which naming won. This component keeps the majority's (3 of 5) plainer
 * treatment — no width cap, no forced text size — because that was the
 * majority and the simpler default; reported as a deviation in `u1.md` rather
 * than silently accepted.
 *
 * State contract for `qa-reviewer`, and the ONE selector that now covers every
 * `Prose` field across all eight FR-81 detail views (two of the eight —
 * `release`, `external_wait` — hold no `Prose` column and correctly match
 * nothing):
 *
 *   data-verify-unit="detail-prose"
 *   data-verify-field   the field's stable name (never its value)
 *   data-verify-state   "present" | "absent" | "unreadable" | "not-requested" | "contradiction"
 *
 * The attribute carries the STATE and never the text. §7a keeps the decrypted
 * content in the document body, where only an authenticated operator's
 * browser sees it — never in a `data-verify-*` attribute.
 */
export function ProseValue({
  field,
  prose,
  absent,
  notRequested,
  className,
}: {
  /** The field's stable name, for the state contract. Never its value. */
  field: string;
  prose: Prose;
  /** Why there may be nothing here, when nothing was ever stored. */
  absent: string;
  /** Why this view declined to decrypt, when it did. */
  notRequested?: string;
  className?: string;
}) {
  const state =
    prose.state === "present" && prose.text === null ? "contradiction" : prose.state;

  const body = (() => {
    switch (state) {
      case "present":
        return (
          <p className="text-foreground whitespace-pre-wrap">{prose.text}</p>
        );
      case "contradiction":
        // The loader reported this field as decrypted and returned no text.
        // Both facts are recorded here rather than one being chosen; neither
        // is treated as an empty field.
        return (
          <span
            className="ident text-state-blocked font-semibold"
            title="The loader reported this field as decrypted and returned no text. Both are recorded here rather than one being chosen; neither is treated as an empty field."
          >
            read as present, returned nothing
          </span>
        );
      case "unreadable":
        return (
          <span
            className="ident text-state-blocked font-semibold"
            title="The stored ciphertext did not decrypt. This field is not empty — its contents could not be read back."
          >
            unreadable
          </span>
        );
      case "not-requested":
        return (
          <span
            className="text-muted-foreground/85 text-xs italic"
            title={
              notRequested ??
              "This view did not ask for this field to be decrypted, so nothing here is a statement about what it holds."
            }
          >
            not read
          </span>
        );
      case "absent":
        return <Absent title={absent} />;
    }
  })();

  return (
    <div
      data-verify-unit="detail-prose"
      data-verify-field={field}
      data-verify-state={state}
      className={cn("min-w-0", className)}
    >
      {body}
    </div>
  );
}
