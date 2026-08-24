"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

/**
 * FR-109 — which fleet agent covers a stack is **set by the operator, never
 * inferred**.
 *
 * ## Why there is no "detect" button here, and never will be
 *
 * FR-109's premise is that the fleet's agent roster is a fact about
 * `~/.claude/agents/` — a directory outside this repository and unreadable from
 * a build worktree. A value this product derived would be a claim about a
 * directory it cannot see, which is the same class of mistake as a wrong `done`.
 * So this control types a value in and nothing validates it against a list of
 * agents that exist; an unrecognised name is stored exactly as typed.
 *
 * ## Clearing is a first-class operation
 *
 * An empty field clears the value. That is how the operator says an agent no
 * longer covers this stack, and it moves the row back into FR-107's actionable
 * set if the trigger has fired for it. `normaliseAgentCovering` turns `''` into
 * `null` rather than storing an empty string, which would render as covered by
 * nobody and still count toward `stacksCovered`.
 *
 * ## The write arrives as a prop
 *
 * `onSave` is `setStackAgentCoveringAction`, passed down by the Server
 * Component. That keeps this file free of any import from `@/lib/server/*` —
 * the whole interaction is exercisable in a test with no database, no operator
 * session and no `'use server'` boundary, and what the test asserts is the
 * payload that reaches the action and what the operator is told when it refuses.
 *
 * ## No length attribute on the input, on purpose
 *
 * The 96-character ceiling lives in `normaliseAgentCovering` and is enforced
 * there. A `maxLength` here would silently truncate a paste, and a name stored
 * short and wrong is worse than a name refused with a sentence saying why. The
 * refusal is returned rather than thrown for exactly that reason
 * (`@/lib/action-result`), so it survives Next's redaction and is rendered
 * below verbatim.
 *
 * ## Q26 RULED — the word this file does not use
 *
 * `coverage` appears nowhere in this component: not in the filename, the
 * symbols, the labels or the button copy. The column is `stack.agent_covering`
 * and everything here says **covering** or **agent** after it.
 *
 * ## Nothing here puts the value in an attribute
 *
 * `stack` is §7a `internal` and an agent name is not a secret, but the state
 * contract carries counts and statuses and never content — the same rule the
 * audit row follows, which records that the value changed and not what it
 * changed to. `data-verify-covered` is a boolean.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="agent-covering-trigger"  data-verify-stack,
 *                                               data-verify-covered="true"|"false"
 *   data-verify-unit="agent-covering-dialog"   data-verify-stack
 *   data-verify-unit="agent-covering-save"
 *   data-verify-unit="agent-covering-error"
 */
export function AgentCoveringDialog({
  stackId,
  stackName,
  current,
  onSave,
}: {
  stackId: string;
  /** The stack's own name, so the dialog and the trigger both say what is being set. */
  stackName: string;
  /** `null` means nobody has said, which is not the same as "no agent covers it". */
  current: string | null;
  onSave: (
    stackId: string,
    agentCovering: string | null,
  ) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(current ?? "");

  const covered = current !== null;
  const fieldId = `agent-covering-${stackId}`;

  function change(next: boolean) {
    if (next) {
      // Reopening after a refusal must not greet the operator with the previous
      // attempt's error, and must not keep an edit they abandoned.
      setValue(current ?? "");
      setError(null);
    }
    setOpen(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(stackId, value);
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setError(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          data-verify-unit="agent-covering-trigger"
          data-verify-stack={stackId}
          data-verify-covered={covered}
          // The visible label is two words; the accessible name says which stack,
          // because a table of these renders one identical label per row and a
          // screen reader user would otherwise hear "Set agent" eight times.
          aria-label={`${covered ? "Change" : "Set"} the agent covering ${stackName}`}
        >
          {covered ? "Change" : "Set agent"}
        </Button>
      </DialogTrigger>

      <DialogContent data-verify-unit="agent-covering-dialog" data-verify-stack={stackId}>
        <DialogHeader>
          <DialogTitle>Which agent covers this stack?</DialogTitle>
          <DialogDescription>
            <span className="ident text-foreground">{stackName}</span>
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          This is recorded, not detected. The fleet&rsquo;s agent roster lives
          outside this product and it cannot be read from here, so whatever you
          type is stored as typed &mdash; including a name no agent answers to.
        </p>

        <Field
          id={fieldId}
          label="Agent covering this stack"
          hint="Leave it empty to clear it. Clearing is how you say no agent covers this any more."
        >
          <Input
            id={fieldId}
            value={value}
            autoComplete="off"
            disabled={pending}
            aria-describedby={`${fieldId}-hint`}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>

        {error === null ? null : (
          <p
            role="alert"
            data-verify-unit="agent-covering-error"
            className="text-state-blocked text-xs"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => change(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={save}
            data-verify-unit="agent-covering-save"
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
