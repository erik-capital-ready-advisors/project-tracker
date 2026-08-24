import { StateBadge } from "@/components/state-badge";
import type { RenderedGate, RenderedGates } from "@/lib/runs-load";
import { cn } from "@/lib/utils";

import { Gap } from "./gap";

/**
 * FR-93's `gates` payload, **rendered rather than dumped**.
 *
 * ## What "dumped" would have been, and why it fails the requirement
 *
 * `<pre>{JSON.stringify(gates, null, 2)}</pre>` satisfies the letter of "shows
 * the payload" and none of it. It puts braces and quotes on a screen §5a
 * describes as an instrument panel, it gives a `FAIL` the same weight as a
 * `PASS`, it cannot say that a key held a non-string value, and it cannot say
 * that the payload was not an object at all — the three findings that are worth
 * more than the outcomes themselves. So this reads `i1`'s `RenderedGates` model
 * and lays out a fixed two-column strip: gate key on the left in mono, outcome
 * on the right in the same vocabulary the fleet's own gate output uses.
 *
 * §5a names that vocabulary explicitly — *"the fleet's own gate output (`ok` /
 * `FAIL` lines in a fixed column) as the vocabulary for status, since it is the
 * language Erik already reads"* — so the outcome word is printed as stored
 * (`PASS`, `FAIL`, `NOT_RUN`) and never relabelled.
 *
 * ## The colour rules, and the one that is load-bearing
 *
 * `unparsed` is the reserved hatched fuchsia via `StateBadge`, because that is
 * what the word means everywhere in this product and a gate outcome is not an
 * exception. An outcome that is **not** one of `GATE_OUTCOMES` is not fuchsia:
 * it takes the `blocked` family, because "the classifier failed on this" and
 * "this word is not in the vocabulary" are different findings that FR-94 counts
 * together and a reader should still be able to tell apart. `PASS` and `FAIL`
 * take the neutral ladder and the `blocked` family respectively — neither is a
 * new token.
 *
 * ## Three degenerate payloads, all stated
 *
 *   * **malformed** — `fleet_run.gates` is `jsonb`, so an array, a scalar or a
 *     literal `null` are all storable and Supabase's generated type permits
 *     them. That is a finding about the row and it is rendered as one.
 *   * **empty** — a `{}` payload. The column is `NOT NULL default '{}'`, so this
 *     is genuinely "the run reported no gate", which is a fact and renders as
 *     one. It is deliberately not phrased as "all gates passed".
 *   * **unrenderable keys** — a key whose value was not a string. Named, never
 *     dropped: a gate silently omitted reads as a gate that was never run.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-gates"
 *   data-verify-count         gates with a readable outcome
 *   data-verify-unrenderable  keys whose value was not a string
 *   data-verify-malformed     "true" | "false"
 *   data-verify-unparsed      this payload's contribution to FR-94
 *   data-verify-unit="run-gate"
 *   data-verify-gate          the key
 *   data-verify-outcome       the stored outcome, byte-for-byte
 *   data-verify-recognised    "true" | "false"
 */

/** Literal class strings; Tailwind cannot see one assembled at runtime. */
const OUTCOME_CLASS: Record<string, string> = {
  PASS: "border-foreground/40 bg-foreground/10 text-foreground font-medium",
  FAIL: "border-state-blocked/50 bg-state-blocked/10 text-state-blocked font-semibold",
  NOT_RUN: "border-border/60 text-muted-foreground/80 border-dashed",
};

const UNRECOGNISED_CLASS =
  "border-state-blocked/50 text-state-blocked border-dashed font-semibold";

function Outcome({ gate }: { gate: RenderedGate }) {
  if (gate.outcome === "unparsed") {
    return (
      <span
        data-verify-unit="run-gate-outcome"
        data-verify-outcome="unparsed"
        title="The gate line was found and its outcome word was not one this product recognises, so the classifier stored its loud default rather than guessing."
      >
        <StateBadge state="unparsed" />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-gate-outcome"
      data-verify-outcome={gate.outcome}
      className={cn(
        "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        gate.recognised
          ? (OUTCOME_CLASS[gate.outcome] ?? "border-border text-muted-foreground")
          : UNRECOGNISED_CLASS,
      )}
      title={
        gate.recognised
          ? undefined
          : "This is not one of the outcome words a fleet gate emits. It is shown exactly as stored, and it counts toward this run's unparsed total."
      }
    >
      {gate.outcome}
    </span>
  );
}

export function RunGates({ gates }: { gates: RenderedGates }) {
  const readable = gates.gates.length;

  return (
    <div
      data-verify-unit="run-gates"
      data-verify-count={readable}
      data-verify-unrenderable={gates.unrenderable.length}
      data-verify-malformed={gates.malformed ? "true" : "false"}
      data-verify-unparsed={gates.unparsedCount}
      className="flex flex-col gap-2 px-4 py-3"
    >
      {gates.malformed ? (
        <Gap
          field="gates-malformed"
          headline="the gates payload is not an object"
          detail="This run stored something in `gates` that is not a set of keyed outcomes — an array, a scalar, or a literal null. No gate could be read from it. That is a fault in what was written, not a run that reported no gates."
        />
      ) : null}

      {!gates.malformed && readable === 0 && gates.unrenderable.length === 0 ? (
        <p
          data-verify-unit="run-gates-empty"
          className="text-muted-foreground max-w-2xl text-xs"
        >
          This run recorded no gates. The payload is an empty object, which is
          what the column holds when nothing wrote to it — it is not a statement
          that every gate passed.
        </p>
      ) : null}

      {readable === 0 ? null : (
        <dl className="divide-border divide-y">
          {gates.gates.map((gate) => (
            <div
              key={gate.key}
              data-verify-unit="run-gate"
              data-verify-gate={gate.key}
              data-verify-outcome={gate.outcome}
              data-verify-recognised={gate.recognised ? "true" : "false"}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 first:pt-0 last:pb-0"
            >
              <dt className="ident text-foreground/80 min-w-0 text-xs break-all">
                {gate.key}
              </dt>
              <dd className="justify-self-end">
                <Outcome gate={gate} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {gates.unrenderable.length === 0 ? null : (
        <Gap
          field="gates-unrenderable"
          headline={`${gates.unrenderable.length} gate ${gates.unrenderable.length === 1 ? "key holds" : "keys hold"} a value that is not an outcome`}
          detail={`No outcome could be read from ${gates.unrenderable.join(", ")}. The keys are named rather than dropped: a gate omitted from this list would read as a gate that was never run.`}
        />
      )}
    </div>
  );
}
