import { describe, it, expect } from "vitest";
import { isShipped, parseReleaseRequirements, shippedIndex } from "./releases";
import type { Release } from "./types";

const release = (id: string, environment: string): Release => ({
  id, engagement: "tracker", identifier: `v1-${id}`, environment,
  url: "https://example.invalid", deployedAt: "2026-08-18",
  source: "declared", recordedBy: "erik",
});

describe("parseReleaseRequirements", () => {
  it("FR-74 expands ranges per the FR-19 rule rather than reading them literally", () => {
    expect(parseReleaseRequirements("r1", "FR-1 to FR-3")).toEqual([
      { releaseId: "r1", ref: "FR-1" },
      { releaseId: "r1", ref: "FR-2" },
      { releaseId: "r1", ref: "FR-3" },
    ]);
  });

  it("FR-74 handles the mixed list and en-dash shapes the manifests use", () => {
    expect(parseReleaseRequirements("r1", "FR-6, FR-9–FR-11").map((one) => one.ref))
      .toEqual(["FR-6", "FR-9", "FR-10", "FR-11"]);
  });

  it("FR-74 names nothing when the text names nothing", () => {
    expect(parseReleaseRequirements("r1", "hotfix, no requirements named")).toEqual([]);
  });
});

describe("shippedIndex", () => {
  const releases = [release("r1", "production"), release("r2", "preview")];
  const links = [
    { releaseId: "r1", ref: "FR-1" },
    { releaseId: "r2", ref: "FR-2" },
    { releaseId: "r2", ref: "FR-1" },
  ];

  it("FR-74 derives shipped from the releases naming a requirement", () => {
    const index = shippedIndex(releases, links);
    expect(isShipped(index, "FR-1")).toBe(true);
    expect(isShipped(index, "FR-3")).toBe(false);
  });

  it("FR-74 keeps the environments apart instead of collapsing them to a boolean", () => {
    // A preview deploy and a production deploy are different claims. The index
    // answers both questions; a boolean would answer neither honestly.
    const index = shippedIndex(releases, links);
    expect([...(index.get("FR-1") ?? [])].sort()).toEqual(["preview", "production"]);
    expect(isShipped(index, "FR-2", "production")).toBe(false);
    expect(isShipped(index, "FR-2", "preview")).toBe(true);
  });

  it("FR-74 ignores a link whose release is not in the set", () => {
    expect(isShipped(shippedIndex([], links), "FR-1")).toBe(false);
  });
});
