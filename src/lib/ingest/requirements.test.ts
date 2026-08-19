import { describe, it, expect } from "vitest";
import { parseRequirements } from "./requirements";

const SPEC = `## 6. Functional Requirements

### 6.1 Access
- **FR-1** The application has no public signup.
- **FR-2** MFA is required and enforced in row-level security.

### 6.2 Ingest
- **FR-10** The system parses the work-unit table.
- **FR-3** Referenced again later: FR-1 must not be overwritten.
`;

describe("parseRequirements", () => {
  it("FR-12 finds every distinct requirement", () => {
    expect(parseRequirements(SPEC, "tracker")).toHaveLength(4);
  });

  it("FR-12 scopes identifiers by engagement", () => {
    expect(parseRequirements(SPEC, "tracker")[0].id).toBe("tracker:FR-1");
  });

  it("FR-12 orders numerically rather than lexically", () => {
    expect(parseRequirements(SPEC, "tracker").map((r) => r.ref)).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-10",
    ]);
  });

  it("FR-12 keeps the first mention's text", () => {
    const first = parseRequirements(SPEC, "tracker")[0];
    expect(first.text).toContain("no public signup");
  });

  it("FR-12 carries text on every requirement", () => {
    expect(parseRequirements(SPEC, "tracker").every((r) => r.text !== "")).toBe(true);
  });
});
