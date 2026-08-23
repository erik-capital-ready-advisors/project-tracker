/**
 * M1.8 — traceability persistence. FR-45 and FR-46.
 *
 * > **FR-45** A test declares the requirements it covers by naming them in its
 * > own title. The system reads that mapping from test files in the source
 * > repository.
 * > **FR-46** A test record carries its harness, its author and its certifier.
 * > Harnesses in Phase 1 are vitest, Playwright and database probe.
 *
 * This module writes the two tables FR-47 through FR-51 are computed from, and
 * it is the only thing in the tree that writes `test_result` at all.
 *
 * ---
 *
 * ## `covers` is read from the title by ONE rule, and there is a test that says so
 *
 * i2's `parseTestTags` reads `FR-nn` out of a title when the mapping is
 * extracted from source files. This module reads it out of a title that arrived
 * over the wire. **Two readers of the same field is how a `covers` value comes
 * to depend on which door the record walked in through** — so `coversInTitle`
 * below is the single rule, `parseTestTags`'s regex is identical to it, and
 * `qa.test.ts` asserts the two agree on the same titles rather than leaving a
 * comment saying they should.
 *
 * It deliberately does **not** expand FR-19 ranges. A title reading
 * "FR-1 to FR-3" yields `["FR-1", "FR-3"]`, exactly as `parseTestTags` yields,
 * because the alternative is that the same test file produces different coverage
 * depending on whether it was scanned or posted. If range expansion in test
 * titles is wanted it belongs in `parseTestTags`, where both paths inherit it.
 *
 * ## `test_result` is append-only, and that is enforced in Postgres
 *
 * i1 put `before update or delete` and `before truncate` triggers on the table,
 * because FR-69 derives regressions from the history and an UPDATE would erase
 * the evidence a regression is computed from. So this module **only inserts**.
 * There is no update path here, no upsert, and no "correct the last result"
 * helper — a wrong result is superseded by a later one, which is what an
 * append-only history means.
 *
 * A consequence worth stating rather than discovering: posting the same run
 * twice writes two rows. That is not idempotent and it is correct — two
 * identical results *are* two runs that both passed. FR-69 reads the latest, so
 * a duplicate changes no derived answer.
 *
 * ## What is NOT wired, stated plainly
 *
 * **There is no HTTP route in front of this module.** `src/app/api/ingest/**`
 * belongs to another unit's ownership and adding a write endpoint under it —
 * with its own `ingest:write` surface and its own abuse profile — is not a
 * decision this unit gets to make in passing. The functions are complete,
 * validated and tested; wiring them is three lines of the shape i8's
 * `release/route.ts` already has, and the exact call shape is documented on
 * `recordTestRun`.
 *
 * **So FR-47 through FR-51 compute correctly and have no production data path
 * yet.** That is a real gap in M1.8 and it is queued, not implied away.
 */

import { apiError } from "@/lib/api";

import type { RpcDb } from "@/lib/server/answers/db";
import { chunk, fetchAllRows, IN_CHUNK } from "@/lib/server/answers/db";
import type { ParsedTestRun, WireTestResult } from "./input";

/**
 * The `FR-nn` references a test title names.
 *
 * Byte-identical in behaviour to the pattern in `src/lib/ingest/testTags.ts`.
 * `qa.test.ts` asserts that, so the two cannot drift silently.
 */
export function coversInTitle(title: string): string[] {
  return title.match(/\bFR-\d+\b/g) ?? [];
}

export interface TestRunResult {
  engagementId: string;
  /** `test_case` rows created or updated. */
  testCases: number;
  /** `test_result` rows appended. */
  results: number;
  /**
   * Results whose title named no `FR-nn` at all.
   *
   * Recorded in full — the test record and its result are both written — and
   * counted, because a test that covers nothing is a real and useful thing to
   * see. It is not an error and it is not silently dropped.
   */
  coveringNothing: number;
  /**
   * Results that carried no certifier.
   *
   * FR-47 cannot grant coverage without one, so these establish nothing. They
   * are still stored: what happened is what happened. The count is here so a
   * caller can see at once why its coverage did not move.
   */
  withoutCertifier: number;
}

export type PersistFailure = { failed: string };

export function isFailure(value: unknown): value is PersistFailure {
  return typeof value === "object" && value !== null && "failed" in value;
}

/**
 * Record a test run: upsert the test records (FR-45, FR-46), then append their
 * results.
 *
 * ## The call shape a future route or CI reporter uses
 *
 * ```json
 * {
 *   "engagement": "delivery-ledger",
 *   "recorded_by": "fleet:b0952e/qa",
 *   "results": [
 *     {
 *       "file": "src/lib/server/answers/answers.test.ts",
 *       "title": "FR-47 refuses coverage when the certifier built the work",
 *       "harness": "vitest",
 *       "status": "pass",
 *       "evidence_scope": "observed-live",
 *       "evidence_ref": "run b0952e, 583 passed",
 *       "certified_by": "qa-reviewer",
 *       "authored_by": "api-integrator",
 *       "run_at": "2026-08-19T14:31:51Z"
 *     }
 *   ]
 * }
 * ```
 *
 * Field notes, in the order they will bite:
 *
 *   * **`engagement` is the slug.** An unknown slug fails the whole run rather
 *     than filing results under `unassigned`. FR-26's fallback is written for a
 *     *session*, which resolves to an engagement by heuristic; a test run names
 *     its engagement outright.
 *   * **`(file, title)` is the test's identity**, matching the
 *     `unique (engagement_id, file, title)` index i1 declared and the conflict
 *     target i6's ingest already upserts against. Rename a test and you get a
 *     new test record with no history — which is honest, because a renamed test
 *     may be a different test.
 *   * **`certified_by` on the result is what FR-47 reads**, not
 *     `test_case.certified_by`. See `recordResults` for why.
 *   * **Nothing is idempotent** and nothing needs to be. See the note above.
 */
export async function recordTestRun(
  db: RpcDb,
  run: ParsedTestRun,
): Promise<TestRunResult | PersistFailure> {
  const engagement = await db
    .from("engagement")
    .select("id, slug")
    .eq("slug", run.engagement)
    .maybeSingle();

  if (engagement.error) return { failed: "engagement" };
  if (engagement.data === null) {
    throw apiError(
      "invalid_request",
      `No engagement has the slug \`${run.engagement}\`. Test results are not ` +
        `filed under a placeholder engagement — the run names its engagement ` +
        `outright, so an unknown slug is a mistake rather than a default.`,
    );
  }
  const engagementId = String((engagement.data as Record<string, unknown>).id);

  const cases = await upsertTestCases(db, engagementId, run.results);
  if (isFailure(cases)) return cases;

  const results = await recordResults(db, engagementId, run.results);
  if (isFailure(results)) return results;

  return {
    engagementId,
    testCases: cases.count,
    results: results.count,
    coveringNothing: run.results.filter(
      (one) => coversInTitle(one.title).length === 0,
    ).length,
    withoutCertifier: run.results.filter((one) => one.certifiedBy === null).length,
  };
}

/**
 * FR-45 and FR-46 — the test records.
 *
 * One row per distinct `(file, title)` in the run. Upserted on
 * `engagement_id,file,title`, which is a **plain** unique index in i1's
 * migration — a partial one would fail `42P10` on the second post, which is
 * exactly the idempotency case nobody exercises before shipping.
 *
 * `authored_by` and `certified_by` are only written when the run states them.
 * An absent value must not overwrite a value already on the row: a CI reporter
 * that does not know who wrote a test would otherwise erase an author somebody
 * recorded by hand. Rows with nothing new to say are left alone entirely.
 */
async function upsertTestCases(
  db: RpcDb,
  engagementId: string,
  results: WireTestResult[],
): Promise<{ count: number } | PersistFailure> {
  const byKey = new Map<string, WireTestResult>();
  for (const result of results) {
    const key = `${result.file}\0${result.title}`;
    const existing = byKey.get(key);
    // Later entries win only where they add an actor the earlier one lacked.
    if (existing === undefined) {
      byKey.set(key, result);
      continue;
    }
    byKey.set(key, {
      ...existing,
      authoredBy: existing.authoredBy ?? result.authoredBy,
      certifiedBy: existing.certifiedBy ?? result.certifiedBy,
    });
  }

  const rows = [...byKey.values()].map((result) => ({
    engagement_id: engagementId,
    harness: result.harness,
    file: result.file,
    title: result.title,
    covers: coversInTitle(result.title),
    ...(result.authoredBy === null ? {} : { authored_by: result.authoredBy }),
    ...(result.certifiedBy === null ? {} : { certified_by: result.certifiedBy }),
  }));

  for (const batch of chunk(rows, IN_CHUNK)) {
    const { error } = await db
      .from("test_case")
      .upsert(batch, { onConflict: "engagement_id,file,title" });
    if (error) return { failed: "test_case" };
  }

  return { count: rows.length };
}

/**
 * FR-46's results, appended.
 *
 * ## `test_result.certified_by`, not `test_case.certified_by`
 *
 * FR-47 reads "that test's certifier". The schema offers both columns and this
 * path writes the result's, which is what `indexCoverage` joins on.
 *
 * The reasoning, because it is a judgement and it is queued: **a certification
 * is an act performed on a particular run.** A certifier recorded on the test
 * *record* would silently certify every future run of that test, including the
 * ones that go red after somebody edits the code it covers — which is a standing
 * grant of coverage rather than an observation, and standing grants of coverage
 * are the thing FR-47 exists to refuse.
 *
 * Note the direction of the risk if that judgement is wrong: a result with no
 * certifier establishes no coverage at all (`indexCoverage` skips it), so this
 * reading can only ever withhold coverage. The permissive reading — falling back
 * to the test record's certifier when the result names none — is the one that
 * could turn an uncertified run into a billable milestone, and it is not
 * implemented here.
 */
async function recordResults(
  db: RpcDb,
  engagementId: string,
  results: WireTestResult[],
): Promise<{ count: number } | PersistFailure> {
  const files = [...new Set(results.map((one) => one.file))];

  // Read back the ids of the rows just upserted. Paged, because a large
  // engagement's test_case table crosses PostgREST's cap long before anything
  // else in this schema does — one row per test, and this repository alone
  // holds several hundred.
  const idByKey = new Map<string, string>();
  for (const batch of chunk(files, IN_CHUNK)) {
    const read = await fetchAllRows(
      db,
      "test_case",
      "id, file, title",
      (query) => query.eq("engagement_id", engagementId).in("file", batch),
    );
    if (read.error) return { failed: "test_case (read back)" };
    for (const row of read.rows) {
      idByKey.set(`${String(row.file)}\0${String(row.title)}`, String(row.id));
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const id = idByKey.get(`${result.file}\0${result.title}`);
    if (id === undefined) {
      // Unreachable: the upsert above wrote this exact key in this transaction's
      // sequence. Refused loudly rather than skipped, because a silently dropped
      // result is a test whose red run never reached the ledger — and the whole
      // of FR-69 is built on the history being complete.
      return { failed: "test_case (id missing after upsert)" };
    }
    rows.push({
      test_case_id: id,
      status: result.status,
      ...(result.evidenceScope === null ? {} : { evidence_scope: result.evidenceScope }),
      ...(result.evidenceRef === null ? {} : { evidence_ref: result.evidenceRef }),
      ...(result.certifiedBy === null ? {} : { certified_by: result.certifiedBy }),
      ...(result.runAt === null ? {} : { run_at: result.runAt }),
    });
  }

  for (const batch of chunk(rows, IN_CHUNK)) {
    const { error } = await db.from("test_result").insert(batch);
    if (error) return { failed: "test_result" };
  }

  return { count: rows.length };
}
