/**
 * The state a registry form carries between a submit and its answer.
 *
 * A separate module from `../actions.ts` because that file is `'use server'` and
 * such a module may export only async functions. Type-only exports are erased
 * before that check runs, but a `const` is not -- and a prior fleet run in this
 * practice measured that `tsc --noEmit` does NOT catch the violation, so the
 * only gate that would is `next build`, three units later. Keeping these here
 * means nobody has to know that.
 *
 * Every field is JSON-serialisable, because this value crosses the server/client
 * boundary in both directions through `useActionState`.
 */

export type FormStatus = "idle" | "success" | "error";

export interface RegistryFormState {
  status: FormStatus;
  /**
   * What happened, written for Erik. On failure this is an `ApiError.message`
   * composed by `@/lib/server/registry/errors` -- including FR-78's refusal,
   * which names the offending identifier column and says why it was refused.
   * Never a raw Postgres message.
   */
  message: string | null;
  /**
   * Non-fatal findings that ride along with a success. FR-12's dangling
   * acceptance references arrive here: reported, never swallowed, and never a
   * reason to reject the write.
   */
  warnings: string[];
  /**
   * Increments on every answer. `useActionState` hands back the same object
   * identity when a message repeats, so without this a second identical failure
   * looks to an effect like nothing happened.
   */
  seq: number;
}

export const EMPTY_FORM_STATE: RegistryFormState = {
  status: "idle",
  message: null,
  warnings: [],
  seq: 0,
};

export function failed(previous: RegistryFormState, message: string): RegistryFormState {
  return { status: "error", message, warnings: [], seq: previous.seq + 1 };
}

export function succeeded(
  previous: RegistryFormState,
  message: string,
  warnings: string[] = [],
): RegistryFormState {
  return { status: "success", message, warnings, seq: previous.seq + 1 };
}
