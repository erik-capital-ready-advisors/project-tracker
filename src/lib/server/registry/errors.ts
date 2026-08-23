import { ApiError, apiError } from "@/lib/api";

/**
 * Turning a Postgres refusal into something Erik can act on.
 *
 * The default remains `errors.ts`'s rule — no mechanism leaks to the caller,
 * because a raw Postgres error names tables, constraints and sometimes row
 * values. The exceptions below are the constraints whose entire purpose is to be
 * *reported*: FR-78 says a secret-shaped identifier is "rejected and reported",
 * and a refusal the operator cannot see is a refusal that reads as a bug.
 *
 * Each branch matches a marker this build wrote into its own migrations, never
 * a Postgres-authored string, and each composes its own message rather than
 * forwarding the database's.
 */

/** The columns `app.reject_secret_shaped_identifiers()` guards, in trigger order. */
const IDENTIFIER_COLUMNS = [
  "db_org",
  "db_project_ref",
  "hosting_team",
  "hosting_project",
  "production_url",
] as const;

interface PostgresErrorish {
  code?: string | null;
  message?: string | null;
}

function asPostgresError(error: unknown): PostgresErrorish | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : null,
    message: typeof record.message === "string" ? record.message : null,
  };
}

/**
 * FR-78. Observed live on this project before this function was written:
 *
 *   ERROR 23514: delivery_ledger: engagement.db_project_ref refuses a
 *   secret-shaped value (FR-78)
 *
 * The column name is recovered from this build's own allowlist rather than
 * parsed out of the message, so a reworded trigger cannot make this report a
 * column that does not exist.
 */
function secretShapedColumn(message: string): string | null {
  if (!message.includes("refuses a secret-shaped value")) return null;
  return IDENTIFIER_COLUMNS.find((column) => message.includes(column)) ?? "an identifier";
}

/**
 * Map a Supabase/Postgres error onto an `ApiError`, or return a generic one.
 *
 * `context` names the operation in the fallback message and never carries user
 * input.
 */
export function registryError(error: unknown, context: string): ApiError {
  const postgres = asPostgresError(error);
  const message = postgres?.message ?? "";

  const column = secretShapedColumn(message);
  if (column !== null) {
    return apiError(
      "invalid_request",
      `\`${column}\` looks like a credential rather than an identifier, so it ` +
        `was refused and nothing was saved (FR-78). These fields hold account ` +
        `and project identifiers — a database project ref, a hosting team slug, ` +
        `a production URL. A key or token pasted here would be a credential ` +
        `stored in the database. If the value really is an identifier, it is too ` +
        `long or too key-shaped to be told apart from one.`,
    );
  }

  if (postgres?.code === "23505") {
    return apiError(
      "invalid_request",
      "A record with that identifier already exists. Names and slugs are unique " +
        "per engagement; edit the existing record rather than adding a second.",
    );
  }

  if (postgres?.code === "23503") {
    return apiError(
      "invalid_request",
      "That record references something that no longer exists. Reload and retry.",
    );
  }

  if (postgres?.code === "23514") {
    return apiError(
      "invalid_request",
      "A value failed a database constraint. Check the slug shape (lowercase, " +
        "hyphenated) and that any URL begins with https://.",
    );
  }

  if (postgres?.code === "23001" || message.includes("append-only")) {
    return apiError(
      "invalid_request",
      "That record is append-only and cannot be changed or removed. This is " +
        "absolute by design and has no override.",
    );
  }

  return apiError(
    "internal_error",
    `${context} failed. Nothing was saved. This response deliberately carries no ` +
      `database message; check the audit_log row for this request.`,
  );
}
