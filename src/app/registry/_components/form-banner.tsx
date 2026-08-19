import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { RegistryFormState } from "../_lib/form-state";

/**
 * What a registry form says after it has been submitted.
 *
 * Three things it has to get right, all of them for the same reason:
 *
 *   1. **A refusal is shown, never a generic failure.** FR-78's rejection of a
 *      secret-shaped identifier arrives here as a sentence naming the column and
 *      saying why. Rendering that as "something went wrong" would turn a working
 *      control into what looks like a bug in the form.
 *   2. **A warning survives a success.** FR-12's dangling acceptance references
 *      ride back alongside a saved milestone. They are rendered next to the
 *      success, not instead of it, because the record really did save and the
 *      finding really does need acting on.
 *   3. **It announces.** `role="alert"` comes from `Alert`; the wrapper is a
 *      live region so a result reaches a screen reader without a focus move.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="form-banner"
 *   data-verify-status="idle" | "success" | "error"
 *   data-verify-warnings="<count>"
 */
export function FormBanner({ state }: { state: RegistryFormState }) {
  const hasWarnings = state.warnings.length > 0;

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-2 empty:hidden"
      data-verify-unit="form-banner"
      data-verify-status={state.status}
      data-verify-warnings={state.warnings.length}
    >
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" className="px-3 py-2.5">
          <CircleAlert aria-hidden />
          <AlertTitle className="text-sm">Not saved</AlertTitle>
          <AlertDescription className="max-w-prose text-sm">
            {state.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" && state.message ? (
        <Alert className="border-state-verified/40 bg-state-verified/10 px-3 py-2.5">
          <CircleCheck aria-hidden className="text-state-verified" />
          <AlertTitle className="text-sm">{state.message}</AlertTitle>
        </Alert>
      ) : null}

      {hasWarnings ? (
        <Alert
          className="border-state-carried/50 bg-state-carried/10 px-3 py-2.5"
          data-verify-unit="form-warning"
        >
          <TriangleAlert aria-hidden className="text-state-carried" />
          <AlertTitle className="text-sm">
            Saved, and there is something to fix
          </AlertTitle>
          <AlertDescription className="max-w-prose text-sm">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
