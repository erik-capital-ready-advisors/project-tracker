/**
 * §7a's encrypted columns, from the application side.
 *
 * i1 put the key in Supabase Vault and exposed exactly two `public` wrappers,
 * granted to `service_role` alone: `encrypt_field(text) -> bytea` and
 * `decrypt_field(bytea) -> text`. This module is the only place in unit `i6`
 * that calls them.
 *
 * ## The wire form, measured rather than assumed
 *
 * PostgREST serialises `bytea` as a JSON **string** in Postgres hex form —
 * `"\\xc30d040703…"` — and the generated types reflect that (`summary: string |
 * null`). Handing that same string straight back to an insert works because
 * Postgres casts the hex text form to `bytea`, and that cast is an identity
 * round trip. Observed on the project database before this module was written:
 *
 *     with e as (select public.encrypt_field('probe i6 round trip') as ct)
 *     select public.decrypt_field((ct::text)::bytea), (ct::text)::bytea = ct from e;
 *     -- 'probe i6 round trip', true
 *
 * That is worth having written down: if it were not an identity round trip, the
 * failure would be a column of silently corrupted ciphertext that only surfaces
 * the day someone tries to read it back.
 *
 * ## Why there is no batch form
 *
 * One RPC per value. That is a round trip per encrypted field, and it is the
 * honest cost of column encryption on a hosted Postgres reached over PostgREST.
 * The row counts here are a single operator's client book, so it does not
 * matter; the moment it does, the answer is a server-side function that takes a
 * row, not a loop that hides the count.
 */

import type { ServiceClient } from "@/lib/supabase/service";

/**
 * Encrypt one value for an encrypted column.
 *
 * `null` in, `null` out — an absent value stays absent rather than becoming the
 * ciphertext of an empty string, which would be indistinguishable from a real
 * value at rest and would defeat every `is null` filter.
 *
 * **Throws** rather than returning `null` on an RPC failure. A silent failure
 * here writes plaintext-shaped nothing into a column §7a requires to hold
 * ciphertext, and the write would otherwise succeed.
 */
export async function encryptField(
  db: ServiceClient,
  plaintext: string | null,
): Promise<string | null> {
  if (plaintext === null) return null;

  const { data, error } = await db.rpc("encrypt_field", { plaintext });

  if (error || typeof data !== "string" || data === "") {
    // The plaintext is NOT included. On this path it may be a work-session
    // summary, which §7a says can quote anything Erik was working on.
    throw new Error(
      "encrypt_field failed, so an encrypted column would have been written " +
        "without encryption. Refusing the write. Check that the Vault secret " +
        "named by APP_ENCRYPTION_KEY_NAME exists and is readable.",
    );
  }

  return data;
}

/**
 * Decrypt one value read from an encrypted column.
 *
 * Returns `null` when the column was null. Unlike the encrypt path this one
 * **does not throw** on failure: a read that cannot decrypt one row should not
 * take down a list of forty. It returns `null`, and the caller decides — every
 * caller in this unit renders that as absent rather than as an empty string, so
 * "could not decrypt" never looks like "there was nothing there".
 */
export async function decryptField(
  db: ServiceClient,
  ciphertext: string | null,
): Promise<string | null> {
  if (ciphertext === null || ciphertext === "") return null;

  const { data, error } = await db.rpc("decrypt_field", { ciphertext });
  if (error || typeof data !== "string") return null;
  return data;
}
