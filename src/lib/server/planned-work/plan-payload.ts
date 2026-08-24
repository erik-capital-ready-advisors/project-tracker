import { ApiError, apiError, unknownKeyProblems } from "@/lib/api";
import { LIMITS } from "@/lib/server/ingest/payload";

/**
 * Validation for `POST /api/ingest/plan`, at the boundary and before the parser
 * sees anything.
 *
 * ## The size cap is a control, not tidiness
 *
 * This endpoint's payload IS the upload: it carries a whole markdown document
 * as a string, and i2's parser is a set of regexes run per line over it. An
 * unbounded body is therefore an unbounded parse. The caps are `LIMITS`, shared
 * with `POST /api/ingest/run` rather than re-chosen here — a second set of
 * numbers for the same class of payload is a second thing to keep in step, and
 * `plan.md` in this repository is a few tens of kilobytes against a 2 MB
 * ceiling.
 *
 * Those numbers are a **baseline** control with a chosen value. §7a states the
 * request *rate* that FR-8's limiter is sized against and says nothing about
 * body size.
 */

/**
 * FR-9's slug shape, matching `engagement_slug_shape` in the schema.
 *
 * Stated again rather than imported: it is private to `ingest/payload.ts`, and
 * exporting it to share one line would widen that module's surface for less
 * than it costs. Both spellings are checks against the same schema constraint,
 * which is the thing that actually enforces it.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Every field this route reads, in wire spelling. */
const PLAN_BODY_FIELDS = ["engagement", "source", "text"] as const;

export interface PlanPayload {
  engagementSlug: string;
  /** The document's name. Identity and reporting only — nothing opens it. */
  source: string;
  text: string;
}

function bad(message: string): ApiError {
  return apiError("invalid_request", message);
}

/**
 * Parse and validate the request body.
 *
 * Throws `ApiError("invalid_request")` on anything malformed. The guard turns
 * that into a 400 and an `audit_log` row, so a rejected payload is still a
 * recorded request.
 */
export function parsePlanPayload(body: unknown): PlanPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw bad("The request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;

  // Before anything is read. A document posted under a key this route does not
  // recognise is a document silently not ingested, and the response would still
  // report success with a count that quietly omitted it.
  const unrecognised = unknownKeyProblems(record, PLAN_BODY_FIELDS);
  if (unrecognised.length > 0) throw bad(unrecognised.join(" "));

  const engagementSlug = record.engagement;
  if (typeof engagementSlug !== "string" || engagementSlug.length === 0) {
    throw bad("`engagement` must be a non-empty string.");
  }
  if (engagementSlug.length > LIMITS.slugLength) {
    throw bad(`\`engagement\` exceeds ${LIMITS.slugLength} characters.`);
  }
  if (!SLUG.test(engagementSlug)) {
    throw bad(
      "`engagement` must be a lowercase hyphenated slug. FR-87 as amended by " +
        "Q14: a planned row carries an engagement at creation, and there is no " +
        "unassigned planned work.",
    );
  }

  const source = record.source;
  if (typeof source !== "string" || source.length === 0) {
    throw bad("`source` must be a non-empty string.");
  }
  if (source.length > LIMITS.nameLength) {
    throw bad(`\`source\` exceeds ${LIMITS.nameLength} characters.`);
  }
  // The same bare-filename rule ingest already applies. Ingest takes document
  // CONTENTS, never paths — it does not open anything (FR-23) — and a separator
  // here would make the name ambiguous across directories for no gain.
  if (source.includes("/") || source.includes("\\") || source.includes("\0")) {
    throw bad(
      "`source` must be a bare filename. Ingest takes document CONTENTS, " +
        "never paths — it does not open anything (FR-23).",
    );
  }

  const text = record.text;
  if (typeof text !== "string") throw bad("`text` must be a string.");
  if (text.length === 0) throw bad("`text` must not be empty.");
  if (text.length > LIMITS.fileBytes) {
    throw bad(`\`text\` exceeds ${LIMITS.fileBytes} bytes.`);
  }

  return { engagementSlug, source, text };
}
