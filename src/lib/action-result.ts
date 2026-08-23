/**
 * What a server action hands back to the component that called it.
 *
 * ## Why an action returns a refusal instead of throwing one
 *
 * Next redacts a thrown Server Action error before it reaches the browser --
 * production sees a generic "An error occurred in the Server Components render"
 * and a digest, and nothing else. That is the right default, because an
 * unclassified throw may carry a Postgres message naming a table, a constraint,
 * or a row value, and this product's rows quote client systems.
 *
 * But it means a *deliberate* refusal -- "expectedBy is before startedAt",
 * "that wait is already resolved", "the expiry must be in the future" -- is
 * destroyed by the same mechanism. Those sentences are written for the operator
 * and are the entire value of the validation.
 *
 * So every action in this unit catches, decides whether the message is one it
 * wrote, and returns this shape. `ok: false` is a normal outcome the caller must
 * handle; a throw that reaches Next stays redacted, which is what should happen
 * to anything nobody classified.
 *
 * ## This module deliberately imports nothing
 *
 * It is imported by Client Components. An import chain that reaches
 * `server-only` from one is a build error rather than a runtime leak, which is
 * a good property to keep and an easy one to lose by adding a convenience
 * import here.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
