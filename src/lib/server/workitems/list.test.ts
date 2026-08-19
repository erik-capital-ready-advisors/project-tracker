import { describe, expect, it } from "vitest";

import type { ServiceClient } from "@/lib/supabase/service";

import { createFakeDb, fakeCiphertext } from "./__fixtures__/fake-db";
import type { FakeDb, Row } from "./__fixtures__/fake-db";
import { DECRYPT_ROW_CAP, listWorkItems } from "./list";

const db = (fake: FakeDb) => fake as unknown as ServiceClient;

function item(overrides: Row = {}): Row {
  return {
    id: `wi-${Math.random().toString(36).slice(2, 8)}`,
    engagement_id: "eng-acme",
    unit: null,
    execution_mode: "fleet",
    executor_kind: "agent",
    executor: "api-integrator",
    status: "done",
    work_type: "integration",
    phase: 1,
    disposition: null,
    unautomated_reason: null,
    evidence_scope: "asserted",
    not_verified_count: 0,
    blocker_id: null,
    external_wait_id: null,
    started_at: "2026-08-19T09:00:00Z",
    ended_at: null,
    description: null,
    ...overrides,
  };
}

function fixture(items: Row[]): FakeDb {
  return createFakeDb({
    tables: {
      engagement: [
        { id: "eng-acme", slug: "acme" },
        { id: "eng-other", slug: "other" },
      ],
      work_item: items,
    },
  });
}

describe("FR-44 one list across every mode and every engagement", () => {
  it("FR-44 returns fleet, hand and external items from the same query", async () => {
    const fake = fixture([
      item({ id: "a", execution_mode: "fleet" }),
      item({ id: "b", execution_mode: "hand", executor_kind: "erik" }),
      item({ id: "c", execution_mode: "external", executor_kind: "client" }),
    ]);
    const listing = await listWorkItems(db(fake));

    expect(listing.items.map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
    expect(new Set(listing.items.map((i) => i.executionMode))).toEqual(
      new Set(["fleet", "hand", "external"]),
    );
  });

  it("FR-44 spans engagements when none is named", async () => {
    const fake = fixture([
      item({ id: "a", engagement_id: "eng-acme" }),
      item({ id: "b", engagement_id: "eng-other" }),
    ]);
    expect((await listWorkItems(db(fake))).items).toHaveLength(2);
  });

  it("FR-44 filters to one engagement when one is named", async () => {
    const fake = fixture([
      item({ id: "a", engagement_id: "eng-acme" }),
      item({ id: "b", engagement_id: "eng-other" }),
    ]);
    const listing = await listWorkItems(db(fake), { engagementSlug: "acme" });
    expect(listing.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("FR-39 filters by execution mode and executor kind", async () => {
    const fake = fixture([
      item({ id: "a", execution_mode: "hand", executor_kind: "erik" }),
      item({ id: "b", execution_mode: "hand", executor_kind: "erik_gate" }),
      item({ id: "c", execution_mode: "fleet", executor_kind: "agent" }),
    ]);
    expect(
      (await listWorkItems(db(fake), { executionMode: "hand" })).items.map((i) => i.id),
    ).toEqual(["a", "b"]);
    expect(
      (await listWorkItems(db(fake), { executorKind: "erik_gate" })).items.map((i) => i.id),
    ).toEqual(["b"]);
  });

  it("FR-30 filters by disposition, so carried and closed are both reachable", async () => {
    const fake = fixture([
      item({ id: "a", disposition: "carried" }),
      item({ id: "b", disposition: "closed" }),
    ]);
    expect(
      (await listWorkItems(db(fake), { disposition: "carried" })).items.map((i) => i.id),
    ).toEqual(["a"]);
    expect(
      (await listWorkItems(db(fake), { disposition: "closed" })).items.map((i) => i.id),
    ).toEqual(["b"]);
  });

  it("FR-43 filters by evidence scope without merging two of them", async () => {
    const fake = fixture([
      item({ id: "a", evidence_scope: "observed_live" }),
      item({ id: "b", evidence_scope: "observed_elsewhere" }),
      item({ id: "c", evidence_scope: "asserted" }),
      item({ id: "d", evidence_scope: "not_verified" }),
    ]);
    for (const scope of [
      "observed_live",
      "observed_elsewhere",
      "asserted",
      "not_verified",
    ] as const) {
      const listing = await listWorkItems(db(fake), { evidenceScope: scope });
      expect(listing.items).toHaveLength(1);
      expect(listing.items[0].evidenceScope).toBe(scope);
    }
  });

  it("FR-34 filters to items held by an external wait", async () => {
    const fake = fixture([
      item({ id: "a", external_wait_id: "wait-1", status: "blocked" }),
      item({ id: "b" }),
    ]);
    const listing = await listWorkItems(db(fake), { blockedOnly: true });
    expect(listing.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("FR-44 sorts on a clear column in both directions", async () => {
    const fake = fixture([
      item({ id: "a", started_at: "2026-08-01T00:00:00Z" }),
      item({ id: "b", started_at: "2026-08-20T00:00:00Z" }),
    ]);
    expect(
      (await listWorkItems(db(fake), { sort: "started_at", direction: "asc" })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      (await listWorkItems(db(fake), { sort: "started_at", direction: "desc" })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["b", "a"]);
  });

  it("FR-44 pages, and says when a page filled", async () => {
    const fake = fixture(
      Array.from({ length: 5 }, (_, i) =>
        item({ id: `w${i}`, started_at: `2026-08-0${i + 1}T00:00:00Z` }),
      ),
    );
    const first = await listWorkItems(db(fake), { limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual(["w0", "w1"]);
    expect(first.truncated).toBe(true);

    const second = await listWorkItems(db(fake), { limit: 2, offset: 2 });
    expect(second.items.map((i) => i.id)).toEqual(["w2", "w3"]);

    const last = await listWorkItems(db(fake), { limit: 2, offset: 4 });
    expect(last.items.map((i) => i.id)).toEqual(["w4"]);
    expect(last.truncated).toBe(false);
  });
});

describe("FR-58 every listing reports its unparsed count", () => {
  it("FR-58 counts the rows that could not be classified", async () => {
    const fake = fixture([
      item({ id: "a", status: "done" }),
      item({ id: "b", status: "unparsed" }),
      item({ id: "c", status: "unparsed" }),
    ]);
    expect((await listWorkItems(db(fake))).unparsed).toBe(2);
  });

  it("FR-58 reports zero explicitly rather than omitting the count", async () => {
    const fake = fixture([item({ id: "a", status: "done" })]);
    const listing = await listWorkItems(db(fake));
    expect(listing.unparsed).toBe(0);
    expect("unparsed" in listing).toBe(true);
  });

  it("FR-40 counts the erik_gate rows for the Bottleneck answer", async () => {
    const fake = fixture([
      item({ id: "a", executor_kind: "erik_gate" }),
      item({ id: "b", executor_kind: "erik_gate" }),
      item({ id: "c", executor_kind: "agent" }),
    ]);
    expect((await listWorkItems(db(fake))).erikGateCount).toBe(2);
  });
});

describe("§7a the list is built on clear columns", () => {
  it("§7a does not decrypt the description unless asked", async () => {
    const fake = fixture([
      item({ id: "a", description: fakeCiphertext("client's private prose") }),
    ]);
    const listing = await listWorkItems(db(fake));

    expect(listing.items[0].description).toBeNull();
    expect(fake.rpcCalls.filter((c) => c.name === "decrypt_field")).toHaveLength(0);
  });

  it("§7a decrypts server-side when explicitly asked", async () => {
    const fake = fixture([
      item({ id: "a", description: fakeCiphertext("client's private prose") }),
    ]);
    const listing = await listWorkItems(db(fake), { includeDescription: true, limit: 10 });
    expect(listing.items[0].description).toBe("client's private prose");
  });

  it("§7a refuses to decrypt a whole page, which would be the search §7a closed", async () => {
    const fake = fixture([item({ id: "a" })]);
    await expect(
      listWorkItems(db(fake), { includeDescription: true, limit: DECRYPT_ROW_CAP + 1 }),
    ).rejects.toThrow(/limited to/);
  });

  it("§7a refuses a sort column outside the allowlist", async () => {
    const fake = fixture([item({ id: "a" })]);
    await expect(
      listWorkItems(db(fake), {
        sort: "description" as unknown as "started_at",
      }),
    ).rejects.toThrow(/not a sortable column/);
  });
});
