import { describe, it, expect } from "vitest";

import type { EngagementInput, MilestoneInput } from "./types";
import {
  unknownRequirementRefs,
  validateEngagement,
  validateMilestone,
  validateMilestoneDate,
} from "./validation";

const ENGAGEMENT: EngagementInput = {
  slug: "widget-co",
  clientName: "Widget Co",
  source: "upwork",
  contractType: "fixed price",
  status: null,
  repoPath: "/repo/widget",
  specPath: "/repo/widget/spec/spec-approved.md",
  fleetDir: "/repo/widget/.fleet",
  stacks: ["next.js", "supabase", "next.js"],
  dbOrg: null,
  dbProjectRef: null,
  hostingTeam: null,
  hostingProject: null,
  productionUrl: null,
};

const MILESTONE: MilestoneInput = {
  name: "M1 discovery",
  amount: 2500,
  currency: "usd",
  dueDate: "2026-09-01",
  notes: null,
  acceptance: ["fr-9", "FR-10"],
};

describe("validateEngagement", () => {
  it("FR-9 normalises the slug and de-duplicates the stacks", () => {
    const result = validateEngagement(ENGAGEMENT);
    expect(result.slug).toBe("widget-co");
    expect(result.stacks).toEqual(["next.js", "supabase"]);
  });

  it("FR-9 defaults an unstated status to active rather than to null", () => {
    expect(validateEngagement(ENGAGEMENT).status).toBe("active");
  });

  it("FR-9 keeps status, contract type and source as free text — no enum", () => {
    // Erik's decision: a closed set here is a guess at his business enforced by
    // the database, and a wrong guess is expensive to undo.
    const odd = validateEngagement({
      ...ENGAGEMENT,
      status: "paused pending client counsel",
      contractType: "hybrid retainer plus milestones",
      source: "referral from a former colleague",
    });
    expect(odd.status).toBe("paused pending client counsel");
    expect(odd.contractType).toBe("hybrid retainer plus milestones");
    expect(odd.source).toBe("referral from a former colleague");
  });

  it("FR-9 refuses a slug that is not URL-safe", () => {
    expect(() => validateEngagement({ ...ENGAGEMENT, slug: "Widget Co!" })).toThrow(
      /lowercase letters, digits and single hyphens/,
    );
  });

  it("FR-9 requires a client name", () => {
    expect(() => validateEngagement({ ...ENGAGEMENT, clientName: "   " })).toThrow(
      /`clientName` is required/,
    );
  });

  it("FR-77 refuses a production URL that is not https", () => {
    expect(() =>
      validateEngagement({ ...ENGAGEMENT, productionUrl: "http://widget.example" }),
    ).toThrow(/must begin with https/);
  });

  it("FR-78 does NOT reimplement the secret check in the application", () => {
    // The refusal is a database trigger, deliberately: it also covers a write
    // that never came through this function, and a second implementation here
    // would drift from the first. A JWT-shaped value passes validation and is
    // refused by Postgres, which `errors.ts` then reports.
    expect(() =>
      validateEngagement({
        ...ENGAGEMENT,
        dbProjectRef: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGQUtFIn0.NOT_REAL",
      }),
    ).not.toThrow();
  });

  it("turns an empty optional field into null rather than an empty string", () => {
    const result = validateEngagement({ ...ENGAGEMENT, source: "  ", repoPath: "" });
    expect(result.source).toBeNull();
    expect(result.repoPath).toBeNull();
  });
});

describe("validateMilestone", () => {
  it("FR-10 normalises the currency and the acceptance references", () => {
    const result = validateMilestone(MILESTONE);
    expect(result.currency).toBe("USD");
    expect(result.acceptance).toEqual(["FR-9", "FR-10"]);
  });

  it("FR-10 requires a name", () => {
    expect(() => validateMilestone({ ...MILESTONE, name: " " })).toThrow(/required/);
  });

  it("FR-10 refuses a negative or non-finite amount", () => {
    expect(() => validateMilestone({ ...MILESTONE, amount: -1 })).toThrow(/negative/);
    expect(() => validateMilestone({ ...MILESTONE, amount: Number.NaN })).toThrow(
      /finite/,
    );
  });

  it("FR-10 accepts a null amount — not every milestone carries money", () => {
    expect(validateMilestone({ ...MILESTONE, amount: null }).amount).toBeNull();
  });

  it("FR-12 refuses acceptance stated as prose rather than as a reference", () => {
    // Requirements are matched by `FR-nn` and never by text, because the text is
    // encrypted (§7a). Prose here would never resolve against anything.
    expect(() =>
      validateMilestone({ ...MILESTONE, acceptance: ["the login flow works"] }),
    ).toThrow(/not a requirement reference/);
  });

  it("FR-12 accepts a defect reference as acceptance", () => {
    expect(validateMilestone({ ...MILESTONE, acceptance: ["D-4"] }).acceptance).toEqual([
      "D-4",
    ]);
  });

  it("FR-10 refuses a due date that is not an ISO date", () => {
    expect(() => validateMilestone({ ...MILESTONE, dueDate: "next Friday" })).toThrow(
      /ISO date/,
    );
  });
});

describe("validateMilestoneDate", () => {
  it("FR-11 converts an ISO date to a timestamp", () => {
    expect(validateMilestoneDate("2026-09-01", "paidOn")).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("FR-11 treats null and empty as clearing the date", () => {
    expect(validateMilestoneDate(null, "paidOn")).toBeNull();
    expect(validateMilestoneDate("  ", "paidOn")).toBeNull();
  });

  it("FR-11 refuses anything that is not an ISO date", () => {
    expect(() => validateMilestoneDate("01/09/2026", "paidOn")).toThrow(/ISO date/);
  });
});

describe("unknownRequirementRefs", () => {
  it("FR-12 names the references that resolve against nothing", () => {
    expect(unknownRequirementRefs(["FR-9", "FR-99"], ["FR-9", "FR-10"])).toEqual([
      "FR-99",
    ]);
  });

  it("FR-12 reports nothing when every reference resolves", () => {
    expect(unknownRequirementRefs(["FR-9"], ["FR-9", "FR-10"])).toEqual([]);
  });

  it("FR-12 reports every reference when the engagement has ingested no spec", () => {
    // The failure this guards: acceptance quietly reads as satisfied because
    // there is nothing to contradict it.
    expect(unknownRequirementRefs(["FR-9", "FR-10"], [])).toEqual(["FR-9", "FR-10"]);
  });
});
