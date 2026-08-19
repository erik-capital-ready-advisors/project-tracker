/**
 * The one error and response shape every API route in this product reuses.
 *
 * It exists so that i5, i6, i8 and every later route do not each invent one.
 * Two rules it encodes:
 *
 *   * **No mechanism leaks to the caller.** A raw Postgres error carries table
 *     names, constraint names and sometimes row values. Callers get a stable
 *     code and a sentence that says what to do.
 *   * **No enumeration before proof of possession.** An unknown token id and a
 *     wrong secret both answer `invalid_token`. Only once the secret has
 *     verified does the caller learn `token_expired` or `token_revoked` — at
 *     which point they already hold the credential and the distinction is
 *     diagnostic rather than a probe.
 */

/**
 * Every code this API can return, with its HTTP status.
 *
 * `unparsed` discipline note: this is a closed set on purpose. Anything that
 * does not map to one of these is `internal_error`, which is loud, rather than
 * a guessed 400.
 */
export const API_ERROR_STATUS = {
  /** No `Authorization` header at all. */
  missing_authorization: 401,
  /** Header present but not `Bearer dl_<uuid>_<hex>`. */
  malformed_authorization: 401,
  /** Unknown token id OR wrong secret. Deliberately not distinguished. */
  invalid_token: 401,
  /** Secret verified; `expires_at` is in the past. */
  token_expired: 401,
  /** Secret verified; `revoked_at` is set. */
  token_revoked: 401,
  /** Authenticated, but the token does not name the capability this route needs. */
  insufficient_capability: 403,
  /** FR-5: an agent route reached for a table agent tokens are refused. */
  forbidden_table: 403,
  /** FR-8: the token's rate limit for this window is used up. */
  rate_limited: 429,
  /** The request body or query string failed validation at the boundary. */
  invalid_request: 400,
  /** Anything else. Never carries a database message. */
  internal_error: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Says what happened and what to do. Never says how the check works. */
    message: string;
  };
}

/**
 * A refusal, carried as a value rather than thrown.
 *
 * The auth path returns these instead of throwing so that the guard can write
 * the audit row for the refusal (FR-6) before converting it to a `Response`.
 * A thrown error would have to be caught and re-classified, and a re-classified
 * refusal is how a 403 becomes a 500 in the audit log.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }

  toResponse(headers?: HeadersInit): Response {
    return Response.json(this.toBody(), { status: this.status, headers });
  }
}

/** Convenience constructor so call sites read as one line. */
export function apiError(code: ApiErrorCode, message: string): ApiError {
  return new ApiError(code, message);
}

/**
 * The success shape.
 *
 * FR-58 requires every endpoint to report the current `unparsed` count, so the
 * envelope carries a slot for it rather than leaving each of the six answer
 * routes to bolt one on. `unparsed` is **optional and omitted** when a route has
 * not counted it — an omitted count reads as "not counted", where a `0` would
 * assert that everything classified. That is the same rule the app shell already
 * follows for its own badge.
 */
export interface ApiOkBody<T> {
  data: T;
  unparsed?: number;
}

export function apiOk<T>(
  data: T,
  options?: { unparsed?: number; status?: number; headers?: HeadersInit },
): Response {
  const body: ApiOkBody<T> = { data };
  if (options?.unparsed !== undefined) body.unparsed = options.unparsed;
  return Response.json(body, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });
}

/**
 * Turn an unknown thrown value into a safe `Response`.
 *
 * An `ApiError` keeps its code and message because those were written for the
 * caller. Anything else becomes `internal_error` with a fixed sentence: a
 * Postgres error's `message` names the table and the constraint, and a stack
 * trace names the file, and neither belongs in a client response.
 */
export function toErrorResponse(thrown: unknown): Response {
  if (thrown instanceof ApiError) return thrown.toResponse();
  return apiError(
    "internal_error",
    "The request could not be completed. If it keeps happening, check the " +
      "server logs for the matching audit_log row.",
  ).toResponse();
}
