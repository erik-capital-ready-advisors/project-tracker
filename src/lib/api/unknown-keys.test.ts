import { describe, expect, it } from "vitest";

import { findUnknownKeys, unknownKeyProblems } from "./unknown-keys";

/**
 * Regression cover for two measured defects, both of which returned 201 and
 * stored the wrong thing (run b0952e, qa1 findings I2 and I3).
 */
describe("findUnknownKeys", () => {
  const ACCEPTED = ["engagement", "identifier", "deployed_at"] as const;

  it("says nothing about a body that uses only accepted fields", () => {
    expect(findUnknownKeys({ engagement: "acme", deployed_at: null }, ACCEPTED)).toEqual([]);
  });

  it("catches a wholly invented field", () => {
    expect(findUnknownKeys({ totallyMadeUp: 1 }, ACCEPTED)).toEqual([
      { key: "totallyMadeUp", didYouMean: null },
    ]);
  });

  it("points `deployedAt` at `deployed_at` — the I3 defect", () => {
    expect(findUnknownKeys({ deployedAt: "2026-08-19" }, ACCEPTED)).toEqual([
      { key: "deployedAt", didYouMean: "deployed_at" },
    ]);
  });

  it("points `engagementSlug` at `engagement` — the I2 defect", () => {
    // Posting this filed a session with a correct, registered slug against
    // `unassigned`, and answered 201.
    expect(findUnknownKeys({ engagementSlug: "acme" }, ["engagement"])).toEqual([
      { key: "engagementSlug", didYouMean: null },
    ]);
  });

  it("matches across separators and case, in both directions", () => {
    for (const key of ["deployedat", "Deployed_At", "DEPLOYED-AT"]) {
      expect(findUnknownKeys({ [key]: 1 }, ACCEPTED)[0]?.didYouMean).toBe("deployed_at");
    }
  });

  it("never accepts the near-miss, it only names the right spelling", () => {
    // Accepting `deployedAt` here would be this module inventing a wire
    // contract, which is the same overreach as dropping it silently.
    expect(findUnknownKeys({ deployedAt: 1 }, ACCEPTED)).toHaveLength(1);
  });

  it("reports every unknown key, not the first", () => {
    expect(findUnknownKeys({ a: 1, b: 2, deployedAt: 3 }, ACCEPTED)).toHaveLength(3);
  });
});

describe("unknownKeyProblems", () => {
  it("names the field it meant, so the caller does not have to guess", () => {
    const [problem] = unknownKeyProblems({ deployedAt: 1 }, ["deployed_at"]);
    expect(problem).toContain("`deployedAt`");
    expect(problem).toContain("`deployed_at`");
  });

  it("lists what is accepted when there is no near miss", () => {
    const [problem] = unknownKeyProblems({ nonsense: 1 }, ["engagement", "run"]);
    expect(problem).toContain("`engagement`");
    expect(problem).toContain("`run`");
  });

  it("prefixes a nested path", () => {
    const [problem] = unknownKeyProblems({ ttile: 1 }, ["title"], { path: "workItem" });
    expect(problem).toContain("`workItem.ttile`");
    expect(problem).toContain("`workItem.title`");
  });
});
