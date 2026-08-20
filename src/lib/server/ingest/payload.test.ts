import { describe, it, expect } from "vitest";

import { LIMITS, parseRunPayload } from "./payload";

const VALID = {
  engagement: "widget",
  run: "zz01",
  manifests: [{ name: "manifest-zz01.md", text: "## Work-units\n" }],
};

describe("parseRunPayload", () => {
  it("accepts a well-formed payload", () => {
    const parsed = parseRunPayload(VALID);
    expect(parsed.engagementSlug).toBe("widget");
    expect(parsed.runId).toBe("zz01");
    expect(parsed.manifests).toHaveLength(1);
  });

  it("refuses a body that is not a JSON object", () => {
    expect(() => parseRunPayload([])).toThrow(/must be a JSON object/);
    expect(() => parseRunPayload("nope")).toThrow(/must be a JSON object/);
    expect(() => parseRunPayload(null)).toThrow(/must be a JSON object/);
  });

  it("refuses an engagement that is not a slug", () => {
    expect(() => parseRunPayload({ ...VALID, engagement: "Widget Co" })).toThrow(
      /lowercase hyphenated slug/,
    );
  });

  it("refuses a run id carrying anything but identifier characters", () => {
    expect(() => parseRunPayload({ ...VALID, run: "../../etc" })).toThrow(
      /must be an identifier/,
    );
  });

  it("FR-23 refuses a filename carrying a path separator", () => {
    // Ingest takes contents, never paths. A name with a separator in it is the
    // shape a caller uses when they think this endpoint will open something.
    expect(() =>
      parseRunPayload({
        ...VALID,
        manifests: [{ name: ".fleet/manifest-zz01.md", text: "x" }],
      }),
    ).toThrow(/bare filename/);
  });

  it("FR-16 refuses a manifest belonging to a different run", () => {
    expect(() =>
      parseRunPayload({
        ...VALID,
        manifests: [
          { name: "manifest-zz01.md", text: "x" },
          { name: "manifest-zz99.md", text: "x" },
        ],
      }),
    ).toThrow(/One request carries one run/);
  });

  it("bounds the number of files", () => {
    const many = Array.from({ length: LIMITS.files + 1 }, (_, i) => ({
      name: `questions-${i}-zz01.jsonl`,
      text: "{}",
    }));
    expect(() => parseRunPayload({ ...VALID, questionFiles: many })).toThrow(
      /more than 200 entries/,
    );
  });

  it("bounds a single file's size", () => {
    expect(() =>
      parseRunPayload({
        ...VALID,
        manifests: [{ name: "manifest-zz01.md", text: "x".repeat(LIMITS.fileBytes + 1) }],
      }),
    ).toThrow(/exceeds/);
  });

  it("bounds the whole payload, not just each part", () => {
    // Each file is under the per-file cap; together they are over the total.
    const chunk = "x".repeat(LIMITS.fileBytes);
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `questions-${i}-zz01.jsonl`,
      text: chunk,
    }));
    expect(() => parseRunPayload({ ...VALID, questionFiles: files })).toThrow(
      /exceeds .* bytes in total/,
    );
  });

  it("refuses a payload carrying no artifacts at all", () => {
    expect(() => parseRunPayload({ engagement: "widget", run: "zz01" })).toThrow(
      /carries no artifacts/,
    );
  });

  it("maps testFiles from path/source onto the parser's shape", () => {
    const parsed = parseRunPayload({
      ...VALID,
      testFiles: [{ path: "shell.spec.ts", source: "it('FR-1', () => {})" }],
    });
    expect(parsed.testFiles).toEqual([
      { path: "shell.spec.ts", source: "it('FR-1', () => {})" },
    ]);
  });

  it("treats an absent optional artifact as null rather than an empty string", () => {
    const parsed = parseRunPayload(VALID);
    expect(parsed.specText).toBeNull();
    expect(parsed.prodMdText).toBeNull();
    expect(parsed.checkpointText).toBeNull();
    expect(parsed.qaReportText).toBeNull();
  });
});

/**
 * qa1 findings I2/I3 generalised, run b0952e.
 *
 * An artifact posted under a key this route does not read is an artifact
 * silently not ingested — and the response would still report success, with a
 * count that quietly omitted it. That is the `unparsed` discipline broken at the
 * API boundary rather than in a parser.
 */
describe("unrecognised body fields are refused rather than dropped", () => {
  const BASE = {
    engagement: "delivery-ledger",
    run: "b0952e",
    checkpoint: "# checkpoint",
  };

  it("accepts the documented shape", () => {
    expect(() => parseRunPayload(BASE)).not.toThrow();
  });

  it("refuses an artifact sent under an unread key", () => {
    // `manifest` rather than `manifests` would have ingested nothing and said 200.
    expect(() => parseRunPayload({ ...BASE, manifest: [] })).toThrow(/manifest/);
  });

  it("refuses a wholly invented key", () => {
    expect(() => parseRunPayload({ ...BASE, nonsense: 1 })).toThrow(/nonsense/);
  });

  it("names the field it meant when the spelling is close", () => {
    expect(() => parseRunPayload({ ...BASE, question_files: [] })).toThrow(
      /questionFiles/,
    );
  });
});
