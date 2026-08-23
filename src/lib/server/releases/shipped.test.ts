// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeReleaseDb, resetFakeIds } from "./__fixtures__/fake-release-db";
import { loadShippedIndex } from "./shipped";

const ENG = "eng-1";

function releaseRow(id: string, environment: string): Record<string, unknown> {
  return {
    id,
    engagement_id: ENG,
    identifier: id,
    environment,
    url: null,
    deployed_at: null,
    source: "ingested",
    recorded_by: null,
  };
}

beforeEach(() => {
  resetFakeIds();
});

describe("loadShippedIndex", () => {
  it("returns an empty index and no error when nothing has shipped", async () => {
    const loaded = await loadShippedIndex(createFakeReleaseDb(), ENG);
    expect(loaded.error).toBeNull();
    expect(loaded.index.size).toBe(0);
  });

  it("reports the failure instead of an empty index when the read fails", async () => {
    // An empty index reads as "nothing has shipped", which is a positive claim.
    const fake = createFakeReleaseDb({ fail: { release: { message: "boom" } } });
    const loaded = await loadShippedIndex(fake, ENG);
    expect(loaded.error).toBe("boom");
    expect(loaded.index.size).toBe(0);
  });

  it("keeps preview and production apart rather than collapsing them (FR-75)", async () => {
    const fake = createFakeReleaseDb({
      release: [releaseRow("r1", "preview"), releaseRow("r2", "production")],
      release_requirement: [
        { id: "l1", release_id: "r1", requirement_ref: "FR-73" },
        { id: "l2", release_id: "r1", requirement_ref: "FR-74" },
        { id: "l3", release_id: "r2", requirement_ref: "FR-73" },
      ],
    });

    const loaded = await loadShippedIndex(fake, ENG);
    expect([...(loaded.index.get("FR-73") ?? [])].sort()).toEqual([
      "preview",
      "production",
    ]);
    expect([...(loaded.index.get("FR-74") ?? [])]).toEqual(["preview"]);
    expect(loaded.index.has("FR-75")).toBe(false);
  });

  it("ignores links belonging to another engagement's release", async () => {
    const fake = createFakeReleaseDb({
      release: [releaseRow("r1", "preview")],
      release_requirement: [
        { id: "l1", release_id: "r1", requirement_ref: "FR-73" },
        { id: "l2", release_id: "other-engagement-release", requirement_ref: "FR-99" },
      ],
    });

    const loaded = await loadShippedIndex(fake, ENG);
    expect(loaded.index.has("FR-99")).toBe(false);
  });

  it("pages past PostgREST's row cap rather than silently truncating", async () => {
    // The cap answers 206 with `error === null`, so a truncated read is
    // indistinguishable from a complete one at the call site. Measured twice in
    // this practice. The fake enforces the same cap so the paging is real.
    const cap = 25;
    const releases = Array.from({ length: 60 }, (_unused, index) =>
      releaseRow(`r${String(index).padStart(3, "0")}`, "preview"),
    );
    const links = releases.map((release, index) => ({
      id: `l${String(index).padStart(3, "0")}`,
      release_id: release.id,
      requirement_ref: `FR-${index + 1}`,
    }));

    const fake = createFakeReleaseDb({
      release: releases,
      release_requirement: links,
      maxRows: cap,
    });

    const loaded = await loadShippedIndex(fake, ENG);
    expect(loaded.error).toBeNull();
    expect(loaded.releases).toHaveLength(60);
    expect(loaded.index.size).toBe(60);
    expect(loaded.index.has("FR-60")).toBe(true);
  });
});
