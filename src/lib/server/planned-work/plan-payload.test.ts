import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { LIMITS } from "@/lib/server/ingest/payload";

import { parsePlanPayload } from "./plan-payload";

const VALID = { engagement: "widget", source: "plan.md", text: "### Task 1: x" };

const refusal = (body: unknown): string => {
  try {
    parsePlanPayload(body);
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(ApiError);
    return (thrown as ApiError).message;
  }
  throw new Error("expected a refusal");
};

describe("parsePlanPayload", () => {
  it("accepts a well-formed body", () => {
    expect(parsePlanPayload(VALID)).toEqual({
      engagementSlug: "widget",
      source: "plan.md",
      text: "### Task 1: x",
    });
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, "text", 7, ["a"]]) {
      expect(refusal(body)).toContain("must be a JSON object");
    }
  });

  /**
   * Before anything is read. A document posted under a key this route does not
   * recognise is a document silently not ingested, and the response would still
   * report success.
   */
  it("refuses an unrecognised key rather than ignoring it", () => {
    const message = refusal({ ...VALID, planText: "### Task 1: x" });
    expect(message).toContain("planText");
  });

  it("requires an engagement, in FR-9's slug shape", () => {
    expect(refusal({ ...VALID, engagement: undefined })).toContain("`engagement`");
    expect(refusal({ ...VALID, engagement: "" })).toContain("`engagement`");
    expect(refusal({ ...VALID, engagement: "Widget Co" })).toContain("slug");
    expect(refusal({ ...VALID, engagement: "widget_co" })).toContain("slug");
    expect(refusal({ ...VALID, engagement: "-widget" })).toContain("slug");
  });

  /** FR-87 as amended by Q14: there is no unassigned planned row. */
  it("says why an engagement is required", () => {
    expect(refusal({ ...VALID, engagement: "Nope!" })).toContain(
      "no unassigned planned work",
    );
  });

  it("requires a source name", () => {
    expect(refusal({ ...VALID, source: undefined })).toContain("`source`");
    expect(refusal({ ...VALID, source: "" })).toContain("`source`");
    expect(refusal({ ...VALID, source: 7 })).toContain("`source`");
  });

  /** FR-23. Ingest takes contents, never paths — it opens nothing. */
  it("refuses a source carrying a path separator", () => {
    for (const source of ["docs/plan.md", "..\\plan.md", "a\0b"]) {
      expect(refusal({ ...VALID, source })).toContain("bare filename");
    }
  });

  it("requires non-empty text", () => {
    expect(refusal({ ...VALID, text: undefined })).toContain("`text`");
    expect(refusal({ ...VALID, text: "" })).toContain("must not be empty");
    expect(refusal({ ...VALID, text: 7 })).toContain("must be a string");
  });

  /**
   * The payload IS the upload, and the parser is a per-line regex loop over it.
   * An unbounded body is an unbounded parse. Shared with the run route's caps
   * rather than a second set of numbers to keep in step.
   */
  it("bounds the document at the shared upload limit", () => {
    const text = "x".repeat(LIMITS.fileBytes + 1);
    expect(refusal({ ...VALID, text })).toContain(String(LIMITS.fileBytes));

    expect(() =>
      parsePlanPayload({ ...VALID, text: "x".repeat(LIMITS.fileBytes) }),
    ).not.toThrow();
  });

  it("bounds the slug and the source name", () => {
    expect(refusal({ ...VALID, engagement: "a".repeat(LIMITS.slugLength + 1) })).toContain(
      String(LIMITS.slugLength),
    );
    expect(refusal({ ...VALID, source: "a".repeat(LIMITS.nameLength + 1) })).toContain(
      String(LIMITS.nameLength),
    );
  });
});
