/**
 * FR-61's result, read as a pure function over what `app.purge_engagement()`
 * returned.
 *
 * The database function answers with a document rather than raising, because a
 * refusal is a normal outcome that has to reach the operator in words. "This
 * engagement is not archived" is information; turning it into a 500 would tell
 * them only that something went wrong.
 *
 * ## This module lives at `src/lib/` and deliberately imports nothing
 *
 * The same reason `action-result.ts` does: `confirmationMatches` and the
 * `PurgeResult` type are both read by a Client Component. Under
 * `src/lib/server/` the directory would invite a later edit to add a
 * `server-only` import, and that turns the delete dialog into a build error at
 * `next build` — never at `tsc --noEmit`.
 *
 * **An unrecognised refusal becomes `unparsed`.** This is the response to a
 * request to destroy data, and the two ways of being wrong about it are not
 * symmetrical: reading an unknown refusal optimistically would report a purge
 * that did not happen, and this product's worst possible output is a confident
 * wrong answer about state.
 */

export interface DestroyedTable {
  table: string;
  rows: number;
}

/** Every refusal `app.purge_engagement()` can emit. Closed on purpose. */
const REFUSALS = {
  not_archived: (slug: string) =>
    `${slug} has not been archived. Archive it first — that step is reversible and ` +
    `this one is not.`,
  no_such_engagement: (slug: string) => `No engagement is registered under the slug ${slug}.`,
} as const;

export type PurgeRefusal = keyof typeof REFUSALS;

export type PurgeResult =
  | {
      kind: "purged";
      slug: string;
      engagementId: string;
      /** Only the tables that actually held rows, largest first. */
      destroyed: DestroyedTable[];
      totalRows: number;
      /** CR-002 §2.2 — what a deletion does not reach, named by the function itself. */
      retained: string[];
    }
  | { kind: "refused"; refusal: PurgeRefusal; slug: string; message: string }
  | { kind: "unparsed"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((one): one is string => typeof one === "string") : [];
}

export function readPurgeResult(raw: unknown): PurgeResult {
  if (!isRecord(raw) || typeof raw.purged !== "boolean") {
    return {
      kind: "unparsed",
      reason:
        "The deletion returned something that is not a purge result. Nothing can be " +
        "said about what was or was not destroyed; check the audit log before acting.",
    };
  }

  const slug = typeof raw.slug === "string" ? raw.slug : "an unnamed engagement";

  if (!raw.purged) {
    const refusal = raw.refusal;
    if (typeof refusal !== "string" || !(refusal in REFUSALS)) {
      return {
        kind: "unparsed",
        reason:
          `The deletion was refused for the reason ${JSON.stringify(refusal ?? null)}, ` +
          "which this version does not recognise. Nothing was destroyed — a refusal " +
          "happens before the delete — but the reason is not being guessed at.",
      };
    }
    const known = refusal as PurgeRefusal;
    return { kind: "refused", refusal: known, slug, message: REFUSALS[known](slug) };
  }

  if (!isRecord(raw.counts)) {
    return {
      kind: "unparsed",
      reason:
        "The deletion reports that it completed and carries no counts, so what it " +
        "destroyed is unknown. Reporting zero here would be a confident wrong answer.",
    };
  }

  const destroyed: DestroyedTable[] = [];
  for (const [table, value] of Object.entries(raw.counts)) {
    if (typeof value !== "number" || value <= 0) continue;
    destroyed.push({ table, rows: value });
  }
  // Largest first, then by name: the operator is reading this to check that the
  // blast radius matches the engagement they meant.
  destroyed.sort((a, b) => b.rows - a.rows || a.table.localeCompare(b.table));

  return {
    kind: "purged",
    slug,
    engagementId: typeof raw.engagement_id === "string" ? raw.engagement_id : "",
    destroyed,
    totalRows: destroyed.reduce((sum, one) => sum + one.rows, 0),
    retained: stringsOf(raw.retained),
  };
}

/**
 * FR-61's "never the default", at the point a person acts on it.
 *
 * Surrounding whitespace is forgiven because a paste adds it and nobody means
 * it. Case is not: the slug constraint is lower-case-only, so a capital letter
 * is a person typing a different string, and this is the last gate before the
 * rows are gone.
 */
export function confirmationMatches(slug: string, typed: string): boolean {
  if (slug.trim() === "") return false;
  return typed.trim() === slug;
}
