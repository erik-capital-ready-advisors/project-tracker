import { describe, expect, it } from "vitest";

import { resolveEngagement } from "./resolve-engagement";
import type { EngagementCandidate } from "./resolve-engagement";

const CANDIDATES: EngagementCandidate[] = [
  { id: "id-unassigned", slug: "unassigned", repoPath: null },
  { id: "id-acme", slug: "acme", repoPath: "/Users/erik/Projects/acme" },
  { id: "id-acme-admin", slug: "acme-admin", repoPath: "/Users/erik/Projects/acme/admin" },
  { id: "id-site", slug: "acme-site", repoPath: "/Users/erik/Projects/acme-site/" },
];

describe("FR-26 engagement resolution", () => {
  it("FR-26 matches the working directory to a registered repo path", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme", engagementSlug: null },
        CANDIDATES,
      ),
    ).toEqual({ engagementId: "id-acme", slug: "acme", source: "repo-path" });
  });

  it("FR-26 matches a subdirectory of a registered repo path", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme/src/lib", engagementSlug: null },
        CANDIDATES,
      ).slug,
    ).toBe("acme");
  });

  it("FR-26 gives the LONGEST matching prefix, not the first", () => {
    // Both `acme` and `acme-admin` are prefixes here. The nested one wins.
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme/admin/app", engagementSlug: null },
        CANDIDATES,
      ).slug,
    ).toBe("acme-admin");
  });

  it("FR-26 does not let one client's directory match another's engagement", () => {
    // `/…/acme-site` starts with `/…/acme` as a raw string. It is a different
    // client, and the session summary is that client's prose.
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme-site", engagementSlug: null },
        CANDIDATES,
      ).slug,
    ).toBe("acme-site");
  });

  it("FR-26 files a look-alike directory as unassigned when no engagement owns it", () => {
    // The isolating case for the path-boundary check. In the test above, the
    // longest-prefix tie-break happens to rescue a naive `startsWith` because
    // the right answer is also registered — so that test cannot detect the bug.
    // Here `acme-site` is NOT registered, so a `startsWith` that ignores the `/`
    // boundary files this session against a different client's engagement.
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme-site", engagementSlug: null },
        [
          { id: "id-unassigned", slug: "unassigned", repoPath: null },
          { id: "id-acme", slug: "acme", repoPath: "/Users/erik/Projects/acme" },
        ],
      ).slug,
    ).toBe("unassigned");
  });

  it("FR-26 ignores a trailing slash on either side", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme-site/", engagementSlug: null },
        CANDIDATES,
      ).slug,
    ).toBe("acme-site");
  });

  it("FR-26 stores an unmatched session against `unassigned` rather than discarding it", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/something-new", engagementSlug: null },
        CANDIDATES,
      ),
    ).toEqual({
      engagementId: "id-unassigned",
      slug: "unassigned",
      source: "unassigned",
    });
  });

  it("FR-26 prefers an explicit slug over the directory", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme", engagementSlug: "acme-site" },
        CANDIDATES,
      ),
    ).toEqual({
      engagementId: "id-site",
      slug: "acme-site",
      source: "explicit-slug",
    });
  });

  it("FR-26 sends an unknown explicit slug to the queue rather than falling back to the path", () => {
    // The caller asserted an engagement. If it does not exist, the assertion is
    // wrong; filing it under whatever the path happens to match would hide that.
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme", engagementSlug: "typo-slug" },
        CANDIDATES,
      ).slug,
    ).toBe("unassigned");
  });

  it("FR-26 fails loudly if the `unassigned` engagement is missing", () => {
    expect(() =>
      resolveEngagement(
        { workingDirectory: "/nowhere", engagementSlug: null },
        CANDIDATES.filter((c) => c.slug !== "unassigned"),
      ),
    ).toThrow(/unassigned/);
  });

  it("FR-26 ignores engagements with no repo path registered", () => {
    expect(
      resolveEngagement(
        { workingDirectory: "/Users/erik/Projects/acme", engagementSlug: null },
        [{ id: "id-unassigned", slug: "unassigned", repoPath: null },
         { id: "id-x", slug: "x", repoPath: "" }],
      ).slug,
    ).toBe("unassigned");
  });
});
