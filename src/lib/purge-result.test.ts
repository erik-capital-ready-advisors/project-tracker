import { describe, expect, it } from "vitest";

import { confirmationMatches, readPurgeResult } from "./purge-result";

/**
 * FR-61, the reading half. `app.purge_engagement()` answers with a jsonb
 * document rather than an exception, because a refusal is a normal outcome the
 * operator has to be told about in words — "this engagement is not archived" is
 * information, not an error.
 *
 * Every refusal the function can emit is named here. An unrecognised one becomes
 * `unparsed`, never a guess: this is the response to a request to DESTROY DATA,
 * and the two ways to be wrong about it are not symmetrical.
 */

describe("readPurgeResult", () => {
  it("reads a completed purge, largest table first", () => {
    const result = readPurgeResult({
      purged: true,
      slug: "delivery-ledger",
      engagement_id: "e1",
      counts: { engagement: 1, work_item: 20, requirement: 79, blocker: 0 },
      retained: ["audit_log", "test_result"],
    });

    expect(result).toEqual({
      kind: "purged",
      slug: "delivery-ledger",
      engagementId: "e1",
      destroyed: [
        { table: "requirement", rows: 79 },
        { table: "work_item", rows: 20 },
        { table: "engagement", rows: 1 },
      ],
      totalRows: 100,
      retained: ["audit_log", "test_result"],
    });
  });

  it("drops the tables that held nothing, rather than listing fifteen zeroes", () => {
    const result = readPurgeResult({
      purged: true,
      slug: "empty",
      engagement_id: "e2",
      counts: { engagement: 1, work_item: 0 },
      retained: [],
    });

    expect(result.kind === "purged" && result.destroyed).toEqual([
      { table: "engagement", rows: 1 },
    ]);
  });

  it("reads the archive-first refusal", () => {
    const result = readPurgeResult({
      purged: false,
      refusal: "not_archived",
      slug: "live-one",
      engagement_id: "e3",
    });

    expect(result).toEqual({
      kind: "refused",
      refusal: "not_archived",
      slug: "live-one",
      message:
        "live-one has not been archived. Archive it first — that step is reversible and " +
        "this one is not.",
    });
  });

  it("reads the missing-engagement refusal", () => {
    const result = readPurgeResult({ purged: false, refusal: "no_such_engagement", slug: "gone" });

    expect(result.kind === "refused" && result.message).toBe(
      "No engagement is registered under the slug gone.",
    );
  });

  it("refuses to interpret a refusal it does not recognise", () => {
    const result = readPurgeResult({ purged: false, refusal: "something_new", slug: "x" });

    expect(result.kind).toBe("unparsed");
    expect(result.kind === "unparsed" && result.reason).toContain("something_new");
  });

  it("refuses a result that says neither purged nor refused", () => {
    for (const raw of [null, undefined, {}, [], "purged", { purged: "yes" }]) {
      expect(readPurgeResult(raw).kind).toBe("unparsed");
    }
  });

  it("refuses a completed purge that reports no counts, rather than showing zero destroyed", () => {
    const result = readPurgeResult({ purged: true, slug: "x", engagement_id: "e", retained: [] });

    expect(result.kind).toBe("unparsed");
    expect(result.kind === "unparsed" && result.reason).toContain("counts");
  });
});

describe("confirmationMatches", () => {
  it("accepts the slug typed exactly", () => {
    expect(confirmationMatches("delivery-ledger", "delivery-ledger")).toBe(true);
  });

  it("forgives surrounding whitespace, which a paste adds and a person does not intend", () => {
    expect(confirmationMatches("delivery-ledger", "  delivery-ledger\n")).toBe(true);
  });

  it("refuses a near miss", () => {
    expect(confirmationMatches("delivery-ledger", "delivery ledger")).toBe(false);
    expect(confirmationMatches("delivery-ledger", "Delivery-Ledger")).toBe(false);
    expect(confirmationMatches("delivery-ledger", "")).toBe(false);
  });

  it("refuses an empty slug outright, so a missing value never confirms itself", () => {
    expect(confirmationMatches("", "")).toBe(false);
  });
});
