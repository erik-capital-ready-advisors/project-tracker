// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import {
  createFakeAnswerDb,
  resetFakeAnswerIds,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";
import type { FakeAnswerDb } from "@/lib/server/answers/__fixtures__/fake-answer-db";
import { ledger } from "@/lib/server/answers/__fixtures__/ledger";
import type { RpcDb } from "@/lib/server/answers/db";

import { isProblems, parseTestRun } from "./input";
import type { ParsedTestRun } from "./input";
import { coversInTitle, isFailure, recordTestRun } from "./persist";

function client(overrides = {}): FakeAnswerDb {
  return createFakeAnswerDb({ tables: { ...ledger() }, ...overrides });
}

function parsed(body: unknown): ParsedTestRun {
  const result = parseTestRun(body);
  if (isProblems(result)) {
    throw new Error(`expected a valid parse, got: ${result.problems.join("; ")}`);
  }
  return result;
}

const RESULT = {
  file: "src/new.test.ts",
  title: "FR-9 the new rule holds",
  harness: "vitest",
  status: "pass",
  evidence_scope: "observed-live",
  certified_by: "qa-reviewer",
  authored_by: "api-integrator",
  run_at: "2026-08-19T12:00:00Z",
};

beforeEach(() => {
  resetFakeAnswerIds();
});

// ---------------------------------------------------------------------------
// FR-45 — the covers rule
// ---------------------------------------------------------------------------

describe("FR-45 reads the covered requirements out of the test's own title", () => {
  it("reads every FR-nn a title names", () => {
    expect(coversInTitle("FR-9 the new rule holds")).toEqual(["FR-9"]);
    expect(coversInTitle("FR-1 and FR-2 together")).toEqual(["FR-1", "FR-2"]);
  });

  it("returns nothing rather than guessing when a title names no requirement", () => {
    expect(coversInTitle("the sidebar renders")).toEqual([]);
  });

  it("does NOT expand an FR-19 range, matching parseTestTags exactly", () => {
    // A title reading "FR-1 to FR-3" yields two refs, not three. Expanding here
    // and not in parseTestTags would make the same test file produce different
    // coverage depending on whether it was scanned or posted.
    expect(coversInTitle("FR-1 to FR-3 the range shape")).toEqual(["FR-1", "FR-3"]);
  });
});

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

describe("the boundary refuses what it cannot classify", () => {
  it("refuses an unrecognised status rather than defaulting it either way", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [{ ...RESULT, status: "flaky" }],
    });
    expect(isProblems(result)).toBe(true);
    expect((result as { problems: string[] }).problems.join(" ")).toContain(
      "must be one of pass, fail, skipped, unparsed",
    );
  });

  it("refuses an unrecognised harness", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [{ ...RESULT, harness: "jest" }],
    });
    expect(isProblems(result)).toBe(true);
  });

  it("refuses an unrecognised evidence scope, which feeds FR-49 directly", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [{ ...RESULT, evidence_scope: "probably-fine" }],
    });
    expect(isProblems(result)).toBe(true);
  });

  it("accepts both the hyphenated and the underscored evidence spellings", () => {
    expect(
      parsed({ engagement: "acme", results: [{ ...RESULT, evidence_scope: "not-verified" }] })
        .results[0].evidenceScope,
    ).toBe("not_verified");
    expect(
      parsed({ engagement: "acme", results: [{ ...RESULT, evidence_scope: "not_verified" }] })
        .results[0].evidenceScope,
    ).toBe("not_verified");
  });

  it("refuses a certifier that looks like a credential, without echoing it back", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [
        { ...RESULT, certified_by: "sk_live_0123456789abcdef0123456789abcdef" },
      ],
    });
    expect(isProblems(result)).toBe(true);
    const message = (result as { problems: string[] }).problems.join(" ");
    // The offending value must not be reflected — the error body is the part of
    // this exchange most likely to reach a CI log.
    expect(message).not.toContain("sk_live");
    expect(message).toContain("looks like a credential");
  });

  it("reports every problem in the payload at once", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [{ ...RESULT, status: "flaky", harness: "jest" }],
    });
    expect((result as { problems: string[] }).problems.length).toBeGreaterThan(1);
  });

  it("refuses an unreadable run_at rather than storing null", () => {
    const result = parseTestRun({
      engagement: "acme",
      results: [{ ...RESULT, run_at: "last Tuesday" }],
    });
    expect(isProblems(result)).toBe(true);
  });

  it("accepts a run with no certifier — that is a fact, not an error", () => {
    const run = parsed({
      engagement: "acme",
      results: [{ ...RESULT, certified_by: undefined }],
    });
    expect(run.results[0].certifiedBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FR-45 / FR-46 — persistence
// ---------------------------------------------------------------------------

describe("FR-46 persists the test record with its harness, author and certifier", () => {
  it("creates the test case and appends its result", async () => {
    const db = client();
    const outcome = await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [RESULT],
    }));

    expect(isFailure(outcome)).toBe(false);
    const created = db.tables.test_case.find((row) => row.file === "src/new.test.ts");
    expect(created?.harness).toBe("vitest");
    expect(created?.authored_by).toBe("api-integrator");
    expect(created?.certified_by).toBe("qa-reviewer");
    expect(created?.covers).toEqual(["FR-9"]);

    const appended = db.tables.test_result.filter(
      (row) => row.test_case_id === created?.id,
    );
    expect(appended.length).toBe(1);
    expect(appended[0].status).toBe("pass");
    expect(appended[0].certified_by).toBe("qa-reviewer");
    expect(appended[0].evidence_scope).toBe("observed_live");
  });

  it("appends a second result rather than updating the first", async () => {
    const db = client();
    const run = parsed({ engagement: "acme", results: [RESULT] });
    await recordTestRun(db as unknown as RpcDb, run);
    await recordTestRun(
      db as unknown as RpcDb,
      parsed({
        engagement: "acme",
        results: [{ ...RESULT, status: "fail", run_at: "2026-08-19T13:00:00Z" }],
      }),
    );

    const testCase = db.tables.test_case.find((row) => row.file === "src/new.test.ts");
    // One test record, two results. `test_result` is append-only in Postgres —
    // FR-69 derives regressions from this history, and an UPDATE would erase the
    // evidence a regression is computed from.
    expect(db.tables.test_case.filter((row) => row.file === "src/new.test.ts").length).toBe(1);
    expect(
      db.tables.test_result.filter((row) => row.test_case_id === testCase?.id).length,
    ).toBe(2);
  });

  it("does not erase a recorded author when a later run omits one", async () => {
    const db = client();
    await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [RESULT],
    }));
    await recordTestRun(
      db as unknown as RpcDb,
      parsed({
        engagement: "acme",
        results: [{ ...RESULT, authored_by: undefined, run_at: "2026-08-19T14:00:00Z" }],
      }),
    );

    const created = db.tables.test_case.find((row) => row.file === "src/new.test.ts");
    // A CI reporter that does not know who wrote a test must not erase an author
    // somebody recorded by hand.
    expect(created?.authored_by).toBe("api-integrator");
  });

  it("refuses an unknown engagement rather than filing under a placeholder", async () => {
    const db = client();
    await expect(
      recordTestRun(db as unknown as RpcDb, parsed({
        engagement: "not-a-client",
        results: [RESULT],
      })),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });

    expect(db.tables.test_result.length).toBe(ledger().test_result.length);
  });

  it("counts a result whose title covers nothing rather than dropping it", async () => {
    const db = client();
    const outcome = await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [{ ...RESULT, title: "the sidebar renders" }],
    }));

    expect(isFailure(outcome)).toBe(false);
    if (isFailure(outcome)) return;
    expect(outcome.coveringNothing).toBe(1);
    // Still stored: a test that covers nothing is a real and useful thing to see.
    expect(outcome.results).toBe(1);
    expect(
      db.tables.test_case.find((row) => row.title === "the sidebar renders")?.covers,
    ).toEqual([]);
  });

  it("counts results that carried no certifier, because they establish no coverage", async () => {
    const db = client();
    const outcome = await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [{ ...RESULT, certified_by: undefined }],
    }));
    if (isFailure(outcome)) throw new Error("expected success");
    expect(outcome.withoutCertifier).toBe(1);
  });

  it("reports a write failure rather than reporting success over it", async () => {
    const db = client({ fail: { test_result: { message: "boom" } } });
    const outcome = await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [RESULT],
    }));
    expect(isFailure(outcome)).toBe(true);
  });

  it("writes one test record for repeated results of the same test in one run", async () => {
    const db = client();
    const outcome = await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [RESULT, { ...RESULT, run_at: "2026-08-19T12:05:00Z" }],
    }));
    if (isFailure(outcome)) throw new Error("expected success");

    expect(outcome.testCases).toBe(1);
    expect(outcome.results).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The read path sees what the write path wrote
// ---------------------------------------------------------------------------

describe("a recorded run reaches the coverage rules", () => {
  it("a passing independently-certified result covers its requirement", async () => {
    const db = client();
    await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [
        {
          ...RESULT,
          title: "FR-4 the last requirement holds",
          certified_by: "qa-reviewer",
        },
      ],
    }));

    const { untestedAnswer } = await import("@/lib/server/answers/untested");
    const answer = await untestedAnswer(db as never, { engagement: "acme" });
    const acme = answer.engagements[0];

    // FR-4 was uncovered in the base ledger. w4 (its implementer) was built by
    // `api-integrator`; the certifier is `qa-reviewer`, so FR-47's independence
    // condition holds and the requirement moves to covered.
    expect(acme.uncovered).not.toContain("FR-4");
  });

  it("a result certified by the executor who built the work does NOT cover it", async () => {
    const db = client();
    await recordTestRun(db as unknown as RpcDb, parsed({
      engagement: "acme",
      results: [
        {
          ...RESULT,
          title: "FR-4 the last requirement holds",
          // w4 was built by `api-integrator`. Certifying your own work is a
          // finding, not coverage.
          certified_by: "api-integrator",
        },
      ],
    }));

    const { untestedAnswer } = await import("@/lib/server/answers/untested");
    const answer = await untestedAnswer(db as never, { engagement: "acme" });
    const acme = answer.engagements[0];

    expect(acme.uncovered).toContain("FR-4");
    expect(acme.selfCertified.length).toBeGreaterThan(0);
  });
});
