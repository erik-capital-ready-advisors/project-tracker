import { decryptAll } from "@/lib/server/ingest/encrypt";
import type { AnswerQuery } from "@/lib/server/answers/db";
import { IN_CHUNK, chunk, fetchAllRows } from "@/lib/server/answers/db";
import { LoadError } from "@/lib/server/answers/load";

import type { DetailDb, DetailEngagement, Prose } from "./types";
import { PROSE_ABSENT, PROSE_NOT_REQUESTED } from "./types";

/**
 * The reads every detail loader shares.
 *
 * ## Nothing here computes a rule
 *
 * This file fetches rows and turns ciphertext into `Prose`. FR-47's certifier
 * join, FR-49's unproven/uncovered distinction and FR-74's shipped state all
 * stay where they already live — in `src/lib/ingest/` and in
 * `src/lib/server/{answers,releases}/`. A detail view that re-derived any of
 * them would be a second implementation of a rule the requirements say has
 * exactly one, and the first distinction to collapse would be the one FR-49
 * exists to keep apart.
 *
 * ## Every read pages, including the ones that "obviously" return one row
 *
 * PostgREST answers **HTTP 206 with `error === null`** past its `max-rows` cap,
 * so a truncated read is indistinguishable from a complete one at the call site.
 * It has fired twice on live client work in this practice and produced
 * plausible, wrong, load-bearing numbers for months both times. Every read below
 * goes through `fetchAllRows`, which terminates on an exact count rather than on
 * a short page, and every `.in()` list is chunked.
 *
 * On a detail view the consequence is quieter than a wrong total and worse: a
 * truncated `work_item_dependency` read renders a work item as depending on
 * nothing, which reads as "ready to start".
 */

export type Row = Record<string, unknown>;

export function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function requiredText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A `text[]` column. Anything else — including a null — is an empty list. */
export function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Append to a `Map<string, T[]>`, creating the array on first use. */
export function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, [value]);
  else existing.push(value);
}

/**
 * Every row of `table` whose `column` is in `values`, chunked and paged.
 *
 * Chunked because an `.in()` of thousands of uuids is a URL PostgREST refuses on
 * length; paged because each chunk's response is still subject to the row cap.
 * The same helper `answers/load.ts` keeps privately — duplicated here rather
 * than exported from there, because widening that module's surface for this one
 * is a change to a file six answers depend on, and this is nine lines.
 */
export async function fetchIn(
  db: DetailDb,
  table: string,
  columns: string,
  column: string,
  values: readonly string[],
  orderColumn = "id",
): Promise<Row[]> {
  if (values.length === 0) return [];
  const rows: Row[] = [];

  for (const batch of chunk(values, IN_CHUNK)) {
    const result = await fetchAllRows(
      db,
      table,
      columns,
      (query) => (query as AnswerQuery).in(column, batch),
      orderColumn,
    );
    if (result.error) throw new LoadError(table, result.error);
    rows.push(...result.rows);
  }
  return rows;
}

/** Every row of `table` whose `column` equals `value`, paged. */
export async function fetchWhere(
  db: DetailDb,
  table: string,
  columns: string,
  column: string,
  value: string,
  orderColumn = "id",
): Promise<Row[]> {
  const result = await fetchAllRows(
    db,
    table,
    columns,
    (query) => query.eq(column, value),
    orderColumn,
  );
  if (result.error) throw new LoadError(table, result.error);
  return result.rows;
}

/**
 * One row by primary key, or `null` when no row has that id.
 *
 * **`null` is the answer Wave C turns into `notFound()`.** It is deliberately
 * not an exception: a detail route reached with a stale or hand-typed uuid is an
 * ordinary 404 and not a fault, and `src/app/registry/[slug]/page.tsx` already
 * takes exactly this shape. A read that FAILS still throws `LoadError`, because
 * "the database refused" and "there is no such row" are different claims and
 * this product does not collapse them.
 */
export async function fetchById(
  db: DetailDb,
  table: string,
  columns: string,
  id: string,
): Promise<Row | null> {
  if (id.trim() === "") return null;
  const rows = await fetchWhere(db, table, columns, "id", id);
  return rows[0] ?? null;
}

/** The engagement a row belongs to, for display and for scoping ref queries. */
export async function fetchEngagement(
  db: DetailDb,
  engagementId: string,
): Promise<DetailEngagement | null> {
  // The projection is written out and never `*`: §7a restricts `engagement` at
  // the column level, and a wildcard silently widens the day someone adds one.
  const row = await fetchById(db, "engagement", "id, slug, client_name", engagementId);
  if (row === null) return null;
  return {
    id: requiredText(row.id),
    slug: requiredText(row.slug),
    clientName: requiredText(row.client_name),
  };
}

type Decryptable = Parameters<typeof decryptAll>[0];

/**
 * Decrypt a list of §7a ciphertexts, degrading one value at a time.
 *
 * `decryptAll` throws on the first value it cannot read, which is right on the
 * ingest path it was written for — a run that cannot read a field it is about to
 * rewrite should abandon rather than write a corruption. **On a read path it is
 * the wrong shape**: one bad ciphertext would take down the whole detail view
 * instead of marking one field unreadable, and Erik would see a 500 where he
 * should see eleven readable fields and one fault.
 *
 * So the batch is attempted first, because that is what happens every time
 * nothing is wrong, and only a throw falls back to one call per value. This is
 * `answers/load.ts`'s `decryptAmounts` generalised from money to prose, and the
 * swallowed error is swallowed for the same reason: a Postgres error message can
 * quote the offending value, and the offending value here is §7a `sensitive`
 * client prose. Nothing on this path is logged.
 */
export async function decryptProse(
  db: DetailDb,
  ciphertexts: readonly (string | null)[],
  withProse: boolean,
): Promise<Prose[]> {
  if (!withProse) return ciphertexts.map(() => PROSE_NOT_REQUESTED);

  const values = [...ciphertexts];
  let plaintexts: (string | null)[];

  try {
    plaintexts = await decryptAll(db as unknown as Decryptable, values);
  } catch {
    plaintexts = await Promise.all(
      values.map(async (ciphertext) => {
        if (ciphertext === null) return null;
        try {
          return (await decryptAll(db as unknown as Decryptable, [ciphertext]))[0];
        } catch {
          return null;
        }
      }),
    );
  }

  return values.map((ciphertext, index) => {
    if (ciphertext === null || ciphertext === "") return PROSE_ABSENT;
    const plaintext = plaintexts[index];
    // Keyed on the CIPHERTEXT being present, exactly as `amountUnreadable` is: a
    // column that never held anything and a column whose value could not be read
    // both arrive as null, and only the second is a fault.
    return plaintext === null
      ? { text: null, state: "unreadable" as const }
      : { text: plaintext, state: "present" as const };
  });
}

/** One encrypted field, for the loaders that have exactly one. */
export async function decryptOne(
  db: DetailDb,
  ciphertext: string | null,
  withProse: boolean,
): Promise<Prose> {
  return (await decryptProse(db, [ciphertext], withProse))[0];
}
