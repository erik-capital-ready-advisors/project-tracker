import type { SupabaseClient } from "@supabase/supabase-js";

import { apiError } from "@/lib/api";

/**
 * Writing a §7a-encrypted column from application code.
 *
 * ## Why it is an RPC per value
 *
 * `public.encrypt_field(text) returns bytea` is a scalar function, and PostgREST
 * exposes no way to apply one across a set. So a run's encrypted fields cost one
 * round trip each. §7a states the traffic shape this is sized against — "ingest
 * a few times per day, spiking to a few dozen during an active fleet run" — and
 * the reference corpus is 31 work items, so a full ingest is a few hundred
 * calls, bounded and concurrent. It is deliberately not optimised into a
 * bulk-insert stored procedure: that would move the record-shaping logic into
 * SQL, where none of it can be unit-tested, to save a fraction of a second on an
 * operation that runs a handful of times a day.
 *
 * ## What comes back
 *
 * `bytea` over PostgREST is a `\x`-prefixed hex string, NOT plaintext and NOT a
 * Buffer. That string is what goes into the column: Postgres's `bytea` input
 * accepts the same hex form it emits, so the value round-trips without ever
 * being decoded in TypeScript. A prior fleet run measured the emitted prefix as
 * `c30d0407` — an OpenPGP symmetric-key-encrypted-data packet — and that was
 * re-measured on this project before this file was written.
 *
 * Nothing here ever logs a plaintext, and nothing here ever returns one.
 */

/** How many encrypt calls are in flight at once. */
const CONCURRENCY = 20;

type Rpc = Pick<SupabaseClient, "rpc">;

async function mapWithLimit<In, Out>(
  values: In[],
  limit: number,
  fn: (value: In) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(values.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await fn(values[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

/**
 * Encrypt a list of plaintexts, preserving order and preserving nulls.
 *
 * A null stays null: an absent field must not become ciphertext of the empty
 * string, because those two read back identically and mean different things.
 */
export async function encryptAll(
  db: Rpc,
  plaintexts: (string | null)[],
): Promise<(string | null)[]> {
  return mapWithLimit(plaintexts, CONCURRENCY, async (plaintext) => {
    if (plaintext === null) return null;

    const { data, error } = await db.rpc("encrypt_field", { plaintext });

    if (error || data === null) {
      // Deliberately does not include `error.message`: a Postgres error can
      // quote the offending value, and the offending value here is §7a
      // `sensitive` client prose. The audit_log row carries the request.
      throw apiError(
        "internal_error",
        "A field could not be encrypted, so the ingest was abandoned rather " +
          "than written in the clear. Nothing was persisted for this record.",
      );
    }
    return data as unknown as string;
  });
}

/**
 * Decrypt a list of ciphertexts, preserving order and preserving nulls.
 *
 * Used by the registry's money path (§7a: totals are computed server-side after
 * decryption, because `contract_milestone.amount` is encrypted and there is
 * therefore no SQL aggregation over money).
 */
export async function decryptAll(
  db: Rpc,
  ciphertexts: (string | null)[],
): Promise<(string | null)[]> {
  return mapWithLimit(ciphertexts, CONCURRENCY, async (ciphertext) => {
    if (ciphertext === null) return null;

    const { data, error } = await db.rpc("decrypt_field", { ciphertext });

    if (error) {
      throw apiError(
        "internal_error",
        "A stored field could not be decrypted. This is reported rather than " +
          "rendered as an empty value, because an empty value here is " +
          "indistinguishable from a field that was never set.",
      );
    }
    return (data as unknown as string | null) ?? null;
  });
}
