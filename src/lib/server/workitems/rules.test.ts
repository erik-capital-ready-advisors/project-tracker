import { describe, expect, it } from "vitest";

import {
  DISPOSITION,
  EVIDENCE_SCOPE,
  EXECUTION_MODE,
  EXECUTOR_KIND,
  RESOLUTION_METHOD,
  UNAUTOMATED_REASON,
  WORK_ITEM_SORT_COLUMNS,
  applyErikGateRule,
  parseSortColumn,
  parseSortDirection,
  resolveDependencyEdges,
} from "./rules";

describe("FR-43 evidence scopes are four distinct states", () => {
  it("FR-43 maps each wire spelling to its own stored value", () => {
    expect(EVIDENCE_SCOPE.parse("observed-live")).toBe("observed_live");
    expect(EVIDENCE_SCOPE.parse("observed-elsewhere")).toBe("observed_elsewhere");
    expect(EVIDENCE_SCOPE.parse("asserted")).toBe("asserted");
    expect(EVIDENCE_SCOPE.parse("not-verified")).toBe("not_verified");
  });

  it("FR-43 never collapses two scopes onto one stored value", () => {
    const stored = EVIDENCE_SCOPE.wireValues.map((wire) =>
      EVIDENCE_SCOPE.parse(wire),
    );
    expect(new Set(stored).size).toBe(stored.length);
    expect(stored.length).toBe(4);
  });

  it("FR-43 round-trips every scope back to the spelling it came from", () => {
    for (const wire of EVIDENCE_SCOPE.wireValues) {
      const stored = EVIDENCE_SCOPE.parse(wire);
      expect(stored).not.toBeNull();
      expect(EVIDENCE_SCOPE.toWire(stored as never)).toBe(wire);
    }
  });

  it("FR-43 returns null for a scope it does not recognise, never a default", () => {
    expect(EVIDENCE_SCOPE.parse("observed")).toBeNull();
    expect(EVIDENCE_SCOPE.parse("verified")).toBeNull();
    expect(EVIDENCE_SCOPE.parse("OBSERVED-LIVE")).toBeNull();
    expect(EVIDENCE_SCOPE.parse("")).toBeNull();
    expect(EVIDENCE_SCOPE.parse(null)).toBeNull();
    expect(EVIDENCE_SCOPE.parse(3)).toBeNull();
  });

  it("FR-43 does not let a prototype key masquerade as a member", () => {
    expect(EVIDENCE_SCOPE.parse("toString")).toBeNull();
    expect(EVIDENCE_SCOPE.parse("constructor")).toBeNull();
    expect(EVIDENCE_SCOPE.parse("__proto__")).toBeNull();
  });
});

describe("FR-29 reason classes are the spec's closed set", () => {
  it("FR-29 accepts all six and nothing else", () => {
    expect(UNAUTOMATED_REASON.wireValues).toEqual([
      "no-agent-for-stack",
      "credential-absent",
      "human-judgment",
      "client-action",
      "out-of-scope",
      "budget",
    ]);
    expect(UNAUTOMATED_REASON.parse("no_agent_for_stack")).toBeNull();
    expect(UNAUTOMATED_REASON.parse("no-agent")).toBeNull();
  });
});

describe("FR-30 dispositions", () => {
  it("FR-30 carries both values and refuses a third", () => {
    expect(DISPOSITION.parse("carried")).toBe("carried");
    expect(DISPOSITION.parse("closed")).toBe("closed");
    expect(DISPOSITION.parse("open")).toBeNull();
  });
});

describe("FR-39 execution modes and executor kinds", () => {
  it("FR-39 stores the three execution modes", () => {
    expect(EXECUTION_MODE.parse("fleet")).toBe("fleet");
    expect(EXECUTION_MODE.parse("hand")).toBe("hand");
    expect(EXECUTION_MODE.parse("external")).toBe("external");
  });

  it("FR-28 accepts the spec's prose spelling `hand-prompted` as `hand`", () => {
    expect(EXECUTION_MODE.parse("hand-prompted")).toBe("hand");
    // …and still prints the canonical one.
    expect(EXECUTION_MODE.toWire("hand")).toBe("hand");
  });

  it("FR-40 treats erik_gate as a first-class kind", () => {
    expect(EXECUTOR_KIND.parse("erik_gate")).toBe("erik_gate");
    expect(EXECUTOR_KIND.parse("erik-gate")).toBe("erik_gate");
    expect(EXECUTOR_KIND.wireValues).toContain("erik_gate");
  });

  it("FR-35 resolution methods are probe or manual", () => {
    expect(RESOLUTION_METHOD.parse("probe")).toBe("probe");
    expect(RESOLUTION_METHOD.parse("manual")).toBe("manual");
    expect(RESOLUTION_METHOD.parse("auto")).toBeNull();
  });
});

describe("FR-41 no-agent-for-stack is automatically an erik_gate", () => {
  it("FR-41 promotes an unassigned item to erik_gate", () => {
    expect(
      applyErikGateRule({
        executorKind: "unassigned",
        unautomatedReason: "no_agent_for_stack",
      }),
    ).toBe("erik_gate");
  });

  it("FR-41 promotes even an item explicitly posted as an agent's", () => {
    expect(
      applyErikGateRule({
        executorKind: "agent",
        unautomatedReason: "no_agent_for_stack",
      }),
    ).toBe("erik_gate");
  });

  it("FR-41 leaves every other reason's executor kind alone", () => {
    for (const reason of [
      "credential_absent",
      "human_judgment",
      "client_action",
      "out_of_scope",
      "budget",
    ] as const) {
      expect(
        applyErikGateRule({ executorKind: "erik", unautomatedReason: reason }),
      ).toBe("erik");
    }
    expect(
      applyErikGateRule({ executorKind: "erik", unautomatedReason: null }),
    ).toBe("erik");
  });

  it("FR-40 leaves an erik_gate declared for another reason as an erik_gate", () => {
    expect(
      applyErikGateRule({
        executorKind: "erik_gate",
        unautomatedReason: "human_judgment",
      }),
    ).toBe("erik_gate");
  });
});

describe("FR-42 dependency edges are resolved, and drops are counted", () => {
  const known = new Map([
    ["i1", "id-1"],
    ["i2", "id-2"],
    ["i3", "id-3"],
  ]);

  it("FR-42 resolves an edge whose both ends exist", () => {
    const result = resolveDependencyEdges([{ from: "i2", to: "i1" }], known);
    expect(result.resolved).toEqual([{ workItemId: "id-2", dependsOnId: "id-1" }]);
    expect(result.dropped).toEqual([]);
    expect(result.droppedCount).toBe(0);
  });

  it("FR-42 drops an edge naming a unit that does not exist AND counts it", () => {
    const result = resolveDependencyEdges(
      [
        { from: "i2", to: "i1" },
        { from: "i2", to: "i99" },
      ],
      known,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.droppedCount).toBe(1);
    expect(result.dropped).toEqual([
      { from: "i2", to: "i99", reason: "unknown-target" },
    ]);
  });

  it("FR-42 says WHICH edge was dropped, not merely how many", () => {
    // A bare count tells Erik something is wrong and nothing about what. The
    // dropped edge names the unit the manifest expected and the run never made.
    const result = resolveDependencyEdges([{ from: "iX", to: "i1" }], known);
    expect(result.dropped[0]).toEqual({
      from: "iX",
      to: "i1",
      reason: "unknown-source",
    });
  });

  it("FR-42 accounts for EVERY input edge in exactly one list", () => {
    const edges = [
      { from: "i2", to: "i1" },
      { from: "i3", to: "i99" },
      { from: "iX", to: "i1" },
      { from: "i1", to: "i1" },
      { from: "i2", to: "i1" },
    ];
    const result = resolveDependencyEdges(edges, known);
    expect(result.resolved.length + result.dropped.length).toBe(edges.length);
  });

  it("FR-42 drops a self-reference with its own reason", () => {
    const result = resolveDependencyEdges([{ from: "i1", to: "i1" }], known);
    expect(result.resolved).toEqual([]);
    expect(result.dropped).toEqual([
      { from: "i1", to: "i1", reason: "self-reference" },
    ]);
  });

  it("FR-42 drops a repeated edge rather than writing it twice", () => {
    const result = resolveDependencyEdges(
      [
        { from: "i2", to: "i1" },
        { from: "i2", to: "i1" },
      ],
      known,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.dropped).toEqual([
      { from: "i2", to: "i1", reason: "duplicate" },
    ]);
  });

  it("FR-42 returns an empty result rather than throwing on no edges", () => {
    expect(resolveDependencyEdges([], known)).toEqual({
      resolved: [],
      dropped: [],
      droppedCount: 0,
    });
  });
});

describe("FR-44 sorting is restricted to clear columns", () => {
  it("FR-44 accepts every allowlisted column", () => {
    for (const column of WORK_ITEM_SORT_COLUMNS) {
      expect(parseSortColumn(column)).toBe(column);
    }
  });

  it("§7a refuses to sort on an encrypted column", () => {
    // Sorting on ciphertext would mean decrypting the table to order it, which
    // is the cross-engagement search §7a rules out for v1 under another name.
    expect(parseSortColumn("description")).toBeNull();
    expect(parseSortColumn("raw_status")).toBeNull();
  });

  it("FR-44 refuses an injected order expression", () => {
    expect(parseSortColumn("id; drop table work_item")).toBeNull();
    expect(parseSortColumn("started_at.desc,description")).toBeNull();
    expect(parseSortDirection("asc; --")).toBeNull();
    expect(parseSortDirection("asc")).toBe("asc");
    expect(parseSortDirection("desc")).toBe("desc");
  });
});
