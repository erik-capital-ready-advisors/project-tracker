// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AGENT_FORBIDDEN_TABLES } from "@/lib/api/capabilities";
import {
  ENTITY_BASE_PATH,
  ENTITY_KINDS,
  ENTITY_LABEL,
  entityHref,
  isEntityKind,
  OPERATOR_ONLY_KINDS,
  type EntityKind,
} from "@/lib/entity-routes";

/**
 * `tests/m27-gate.test.ts` is the acceptance gate and it asserts the four facts
 * the eight detail views cannot be built without. This file is the unit test
 * beneath it: it covers the cases the gate does not reach, and — where it
 * overlaps — it fails with a message about the mechanism rather than about the
 * milestone.
 */

describe("FR-81 — the closed set of kinds", () => {
  it("names exactly eight kinds and recognises each of them", () => {
    expect(ENTITY_KINDS).toHaveLength(8);
    for (const kind of ENTITY_KINDS) expect(isEntityKind(kind)).toBe(true);
  });

  it("refuses a kind that is not one of them", () => {
    for (const value of ["", "work item", "workitem", "engagement", "operator"]) {
      expect(isEntityKind(value)).toBe(false);
    }
  });

  it("gives every kind a base path and a label, and no two kinds the same path", () => {
    for (const kind of ENTITY_KINDS) {
      expect(ENTITY_BASE_PATH[kind]).toMatch(/^\/[a-z-]+$/);
      expect(ENTITY_LABEL[kind]).not.toBe("");
    }
    expect(new Set(Object.values(ENTITY_BASE_PATH)).size).toBe(ENTITY_KINDS.length);
    expect(new Set(Object.values(ENTITY_LABEL)).size).toBe(ENTITY_KINDS.length);
  });
});

describe("FR-80 — where a reference points", () => {
  it("builds a detail href under the kind's own base path", () => {
    for (const kind of ENTITY_KINDS) {
      expect(entityHref(kind, "d4f0c2a6-0000-4000-8000-000000000001")).toBe(
        `${ENTITY_BASE_PATH[kind]}/d4f0c2a6-0000-4000-8000-000000000001`,
      );
    }
  });

  it("encodes the id into the path segment rather than trusting it", () => {
    // Not a uuid, and that is the point: an id that reached this function from
    // untyped data must not be able to add a path segment or a query string.
    expect(entityHref("work_item", "a/b")).toBe("/work-items/a%2Fb");
    expect(entityHref("work_item", "a b?c=1")).toBe("/work-items/a%20b%3Fc%3D1");
  });

  it("trims an id before encoding it, because whitespace is not part of a uuid", () => {
    expect(entityHref("defect", "  abc  ")).toBe("/defects/abc");
  });
});

describe("FR-83 — a reference to nothing is refused a destination", () => {
  it("returns null for an empty or whitespace-only id", () => {
    for (const id of ["", " ", "\t", "\n  "]) {
      expect(entityHref("requirement", id)).toBeNull();
    }
  });

  it("returns null for a kind it does not recognise, rather than guessing a route", () => {
    for (const kind of ["not_an_entity", "", "WORK_ITEM", "engagement"]) {
      expect(entityHref(kind, "abc")).toBeNull();
    }
  });

  it("never returns a string for a case it cannot honestly resolve", () => {
    // The type-level claim, asserted at runtime: the return type is nullable
    // precisely so a caller cannot render a link to a reference that dangles.
    // A model that always returned a string would make FR-83 unenforceable.
    expect(entityHref("release", "")).not.toBe("/releases/");
    expect(entityHref("release", "")).toBeNull();
  });
});

describe("FR-86 — the operator-only rule is derived, not copied", () => {
  it("is exactly the intersection of AGENT_FORBIDDEN_TABLES with FR-81's kinds", () => {
    const expected = (AGENT_FORBIDDEN_TABLES as readonly string[]).filter((table) =>
      (ENTITY_KINDS as readonly string[]).includes(table),
    );
    expect([...OPERATOR_ONLY_KINDS].sort()).toEqual([...expected].sort());
  });

  it("holds contract_milestone, which FR-5 refuses to agent tokens outright", () => {
    expect(OPERATOR_ONLY_KINDS).toContain("contract_milestone");
  });

  it("is measured to be contract_milestone ALONE on the current §7a table", () => {
    // §7a also makes `operator`, `agent_token` and `audit_log` operator-only and
    // they are already in AGENT_FORBIDDEN_TABLES — but none of them is one of
    // FR-81's eight kinds, so none of them has a detail view to withhold. This
    // asserts the measurement rather than the assumption, and it will fail
    // loudly if a later CR gives one of them a detail view.
    expect([...OPERATOR_ONLY_KINDS]).toEqual(["contract_milestone"]);
  });

  it("contains nothing AGENT_FORBIDDEN_TABLES does not, which is what makes it a derivation", () => {
    for (const kind of OPERATOR_ONLY_KINDS) {
      expect(AGENT_FORBIDDEN_TABLES as readonly string[]).toContain(kind);
    }
  });

  it("still gives contract_milestone an operator route, because FR-81 requires one", () => {
    // FR-86 withholds the entity from an AGENT token; it does not remove the
    // operator's detail view. Conflating the two would delete a requirement.
    const kind: EntityKind = "contract_milestone";
    expect(entityHref(kind, "abc")).toBe("/milestones/abc");
  });
});
