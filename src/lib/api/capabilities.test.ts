import { describe, expect, it } from "vitest";

import {
  AGENT_FORBIDDEN_TABLES,
  ANSWER_READ,
  INGEST_WRITE,
  isAgentForbiddenTable,
  parseWireCapabilities,
  parseWireCapability,
  projectionReachesForbiddenTable,
  toStoredCapability,
  toWireCapability,
} from "./capabilities";

describe("capability spellings", () => {
  it("uses FR-5's wire spelling on the wire and the enum's in Postgres", () => {
    expect(ANSWER_READ).toBe("answer:read");
    expect(INGEST_WRITE).toBe("ingest:write");
    expect(toStoredCapability(ANSWER_READ)).toBe("answer_read");
    expect(toStoredCapability(INGEST_WRITE)).toBe("ingest_write");
  });

  it("round-trips both ways without drift", () => {
    for (const wire of [ANSWER_READ, INGEST_WRITE] as const) {
      expect(toWireCapability(toStoredCapability(wire))).toBe(wire);
    }
  });
});

describe("parseWireCapability — unparsed is the only default", () => {
  it("accepts the two that exist", () => {
    expect(parseWireCapability("answer:read")).toBe(ANSWER_READ);
    expect(parseWireCapability("ingest:write")).toBe(INGEST_WRITE);
  });

  it.each([
    ["the enum spelling, which is not the wire spelling", "answer_read"],
    ["a capability that does not exist", "admin:all"],
    ["close but wrong", "answer:write"],
    ["empty", ""],
    ["wrong case", "Answer:Read"],
  ])("returns null rather than guessing: %s", (_label, raw) => {
    expect(parseWireCapability(raw)).toBeNull();
  });

  it("returns null for non-strings", () => {
    for (const value of [null, undefined, 1, {}, ["answer:read"]]) {
      expect(parseWireCapability(value)).toBeNull();
    }
  });
});

describe("parseWireCapabilities", () => {
  it("accepts a list and de-duplicates it", () => {
    expect(parseWireCapabilities(["answer:read", "answer:read"])).toEqual([
      ANSWER_READ,
    ]);
  });

  it("refuses the WHOLE list if any member is unknown", () => {
    // Partial acceptance would silently issue a token with fewer capabilities
    // than the operator asked for, which reads as a bug in the product rather
    // than as a rejected input.
    expect(parseWireCapabilities(["answer:read", "admin:all"])).toBeNull();
  });

  it("refuses an empty list", () => {
    expect(parseWireCapabilities([])).toBeNull();
  });
});

describe("the FR-5 / §7a denylist", () => {
  it("holds every table §7a reserves to the operator", () => {
    expect([...AGENT_FORBIDDEN_TABLES].sort()).toEqual([
      "agent_token",
      "audit_log",
      "contract_milestone",
      "operator",
    ]);
  });

  it("recognises them and nothing else", () => {
    expect(isAgentForbiddenTable("contract_milestone")).toBe(true);
    expect(isAgentForbiddenTable("work_item")).toBe(false);
    expect(isAgentForbiddenTable("engagement")).toBe(false);
  });
});

describe("projectionReachesForbiddenTable", () => {
  it.each([
    ["a plain embed", "*, contract_milestone(*)", "contract_milestone"],
    ["an aliased embed", "id, money:contract_milestone(amount)", "contract_milestone"],
    ["nested deeper", "id, engagement(contract_milestone(amount))", "contract_milestone"],
    ["the operator table", "*, operator(email)", "operator"],
    ["the audit log", "*, audit_log(actor)", "audit_log"],
    [
      "a foreign-key constraint name, which carries no table name",
      "*, acceptance_criterion_milestone_id_fkey(*)",
      "contract_milestone",
    ],
  ])("catches %s", (_label, projection, expected) => {
    expect(projectionReachesForbiddenTable(projection)).toBe(expected);
  });

  it.each([
    ["an ordinary column list", "id, requirement_ref, milestone_id"],
    ["a column whose name merely starts with a table name", "contract_milestone_id"],
    ["a legitimate embed", "*, engagement(client_name, slug)"],
    ["everything", "*"],
  ])("does not trip on %s", (_label, projection) => {
    expect(projectionReachesForbiddenTable(projection)).toBeNull();
  });
});
