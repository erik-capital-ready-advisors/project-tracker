import { ApiError, apiError, unknownKeyProblems } from "@/lib/api";

import type { RunArtifacts } from "./plan";

/**
 * Validation for `POST /api/ingest/run`, at the boundary and before anything
 * else touches the body.
 *
 * ## The limits are a control, not tidiness
 *
 * The baseline requires uploads to be bounded by size and count before they
 * reach a parser. This endpoint's payload IS the upload: it carries whole
 * markdown artifacts as strings, so an unbounded body is an unbounded parse,
 * and every parser downstream is a regex loop over it. The caps below are sized
 * an order of magnitude above the real corpus — the reference run's largest
 * manifest is a few tens of kilobytes and its largest spec is ~60 KB — so a
 * legitimate run is nowhere near them and a hostile one stops here.
 *
 * These numbers are mine. §7a states the request *rate* to size FR-8's limiter
 * against but says nothing about body size, so this is a baseline control with a
 * chosen number, and the report says so.
 */
export const LIMITS = {
  totalBytes: 8 * 1024 * 1024,
  files: 200,
  fileBytes: 2 * 1024 * 1024,
  nameLength: 512,
  slugLength: 128,
  runIdLength: 128,
} as const;

/** FR-9's slug shape, matching `engagement_slug_shape` in the schema. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A run id is a short token; it becomes part of a natural key. */
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function bad(message: string): ApiError {
  return apiError("invalid_request", message);
}

function asString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw bad(`\`${field}\` must be a string.`);
  if (value.length === 0) throw bad(`\`${field}\` must not be empty.`);
  if (value.length > maxLength) {
    throw bad(`\`${field}\` exceeds ${maxLength} characters.`);
  }
  return value;
}

function asOptionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw bad(`\`${field}\` must be a string or null.`);
  if (value.length > LIMITS.fileBytes) {
    throw bad(`\`${field}\` exceeds ${LIMITS.fileBytes} bytes.`);
  }
  return value;
}

/**
 * How the name field of a file list is constrained.
 *
 * `bare` — a filename and nothing else. `manifests` and `questionFiles` derive a
 * run id and an `open_question.source_key` from their names, so a separator
 * there makes a key ambiguous across directories.
 *
 * `relativePath` — a repo-relative path, directories kept. A test file's path is
 * stored as DATA (`test_result.file`) and `harnessFor` classifies a case by
 * looking for an `e2e` or `playwright` SEGMENT in it. Under the bare rule those
 * two requirements contradicted each other and `harness: "playwright"` was
 * unreachable, so every Playwright spec ingested as a unit test. Neither rule
 * relaxes FR-23: the payload still carries contents, and nothing here opens
 * anything.
 */
type NameRule = "bare" | "relativePath";

function checkName(name: string, field: string, rule: NameRule): void {
  if (rule === "bare") {
    if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
      throw bad(
        `\`${field}\` must be a bare filename. Ingest takes ` +
          `artifact CONTENTS, never paths — it does not open anything (FR-23).`,
      );
    }
    return;
  }

  // Rejected: absolute paths, Windows separators, NUL, and any segment that is
  // empty, `.` or `..`. What survives cannot name anything outside the tree it
  // was collected from — which matters for what the value MEANS, since nothing
  // downstream resolves it against a filesystem.
  const invalid =
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((segment) => segment === "" || segment === "." || segment === "..");

  if (invalid) {
    throw bad(
      `\`${field}\` must be a repo-relative path with no \`..\`, no leading ` +
        `slash and no backslash. Ingest takes artifact CONTENTS, never paths — ` +
        `it does not open anything (FR-23).`,
    );
  }
}

function asFileList(
  value: unknown,
  field: string,
  nameKey: "name" | "path",
  textKey: "text" | "source",
  rule: NameRule = "bare",
): { name: string; text: string }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad(`\`${field}\` must be an array.`);
  if (value.length > LIMITS.files) {
    throw bad(`\`${field}\` carries more than ${LIMITS.files} entries.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw bad(`\`${field}[${index}]\` must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const name = asString(record[nameKey], `${field}[${index}].${nameKey}`, LIMITS.nameLength);
    const text = record[textKey];
    if (typeof text !== "string") {
      throw bad(`\`${field}[${index}].${textKey}\` must be a string.`);
    }
    if (text.length > LIMITS.fileBytes) {
      throw bad(`\`${field}[${index}].${textKey}\` exceeds ${LIMITS.fileBytes} bytes.`);
    }
    checkName(name, `${field}[${index}].${nameKey}`, rule);
    return { name, text };
  });
}

/** Every field this route reads, in wire spelling. */
const RUN_BODY_FIELDS = [
  "engagement",
  "run",
  "manifests",
  "questionFiles",
  "testFiles",
  "specText",
  "prodMd",
  "checkpoint",
  "qaReport",
] as const;

/**
 * Parse and validate the request body into `RunArtifacts`.
 *
 * Throws `ApiError("invalid_request")` on anything malformed. The guard turns
 * that into a 400 and an `audit_log` row, so a rejected payload is still a
 * recorded request.
 */
export function parseRunPayload(body: unknown): RunArtifacts {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw bad("The request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;

  // Before anything is read. An artifact posted under a key this route does not
  // recognise is an artifact silently not ingested, and the response would still
  // report success with a count that quietly omitted it.
  const unrecognised = unknownKeyProblems(record, RUN_BODY_FIELDS);
  if (unrecognised.length > 0) throw bad(unrecognised.join(" "));

  const engagementSlug = asString(record.engagement, "engagement", LIMITS.slugLength);
  if (!SLUG.test(engagementSlug)) {
    throw bad("`engagement` must be a lowercase hyphenated slug.");
  }

  const runId = asString(record.run, "run", LIMITS.runIdLength);
  if (!RUN_ID.test(runId)) {
    throw bad("`run` must be an identifier — letters, digits, dot, dash, underscore.");
  }

  const manifests = asFileList(record.manifests, "manifests", "name", "text");

  // FR-16. One POST carries one run.
  //
  // `parseWorkUnits` scopes a unit id by the run it reads off the MANIFEST
  // FILENAME, while this route writes every work item against the single
  // `fleet_run` row for `run`. If a payload mixed manifests from two runs, both
  // runs' units would land under one fleet_run and two distinct `i1` records
  // would collide on the FR-16 key — which is the exact confusion FR-16 exists
  // to prevent, arriving through the ingest path instead of the schema.
  //
  // So it is refused here rather than reconciled. Post each run separately.
  for (const manifest of manifests) {
    const derived = manifest.name.replace(/\.md$/, "").split("-").at(-1);
    if (derived !== runId) {
      throw bad(
        `\`${manifest.name}\` belongs to run \`${derived}\` but this request ` +
          `declares run \`${runId}\`. One request carries one run — FR-16 keeps ` +
          `two runs' unit ids distinct, and merging them here would defeat it. ` +
          `Post each run separately.`,
      );
    }
  }
  const questionFiles = asFileList(record.questionFiles, "questionFiles", "name", "text");
  const testFileEntries = asFileList(
    record.testFiles,
    "testFiles",
    "path",
    "source",
    "relativePath",
  );

  const specText = asOptionalText(record.specText, "specText");
  const prodMdText = asOptionalText(record.prodMd, "prodMd");
  const checkpointText = asOptionalText(record.checkpoint, "checkpoint");
  const qaReportText = asOptionalText(record.qaReport, "qaReport");

  const totalBytes =
    [...manifests, ...questionFiles, ...testFileEntries].reduce(
      (sum, file) => sum + file.text.length + file.name.length,
      0,
    ) +
    (specText?.length ?? 0) +
    (prodMdText?.length ?? 0) +
    (checkpointText?.length ?? 0) +
    (qaReportText?.length ?? 0);

  if (totalBytes > LIMITS.totalBytes) {
    throw bad(`The payload exceeds ${LIMITS.totalBytes} bytes in total.`);
  }

  if (
    manifests.length === 0 &&
    questionFiles.length === 0 &&
    specText === null &&
    prodMdText === null &&
    checkpointText === null &&
    qaReportText === null
  ) {
    throw bad(
      "The payload carries no artifacts. Send at least one of `manifests`, " +
        "`questionFiles`, `specText`, `prodMd`, `checkpoint` or `qaReport`.",
    );
  }

  return {
    engagementSlug,
    runId,
    manifests,
    questionFiles,
    specText,
    testFiles: testFileEntries.map((file) => ({ path: file.name, source: file.text })),
    prodMdText,
    checkpointText,
    qaReportText,
  };
}
