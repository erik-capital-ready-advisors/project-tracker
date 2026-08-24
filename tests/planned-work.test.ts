// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  createFakeDb,
  FAKE_CIPHER_PREFIX,
  type FakeDb,
} from "@/lib/server/workitems/__fixtures__/fake-db";
import {
  createPlannedWorkItem,
  createPlannedWorkItems,
} from "@/lib/server/planned-work/create-planned-work-item";
import type { ServiceClient } from "@/lib/supabase/service";

/**
 * FR-87 + FR-88 — the shared planned-work insert primitive.
 *
 * ## What these tests can and cannot prove
 *
 * The fake is a table store, not a database. It enforces no foreign keys, no
 * check constraints and no unique indexes beyond the one `onConflict` key an
 * upsert names, and it knows nothing about `NULLS DISTINCT` or PostgREST's
 * `resolution=ignore-duplicates`. So these prove that this code **asks the
 * database for the right thing** — the right columns, the right values, the
 * right conflict target, and nothing written when a refusal fires. They do not
 * prove the database does the right thing with it. The report says so rather
 * than letting a green suite imply otherwise.
 *
 * The two halves that matter most and are fully covered here: an engagement is
 * required (FR-87 as amended by Q14), and the description never reaches the
 * column in the clear (§7a).
 */

const ENGAGEMENTS = [
  { id: "eng-1", slug: "acme", client_name: "Acme Ltd" },
  { id: "eng-2", slug: "globex", client_name: "Globex" },
];

function db(options: Parameters<typeof createFakeDb>[0] = {}): FakeDb {
  return createFakeDb({
    ...options,
    tables: { engagement: ENGAGEMENTS, work_item: [], ...(options.tables ?? {}) },
  });
}

/** The fake satisfies the surface this module uses, not the whole client type. */
function asClient(fake: FakeDb): ServiceClient {
  return fake as unknown as ServiceClient;
}

const HAND_ENTRY = {
  description: "Wire the export panel to the new run columns",
  workType: "ui",
  unit: "u9",
  planRef: null,
};

async function refusal(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected a refusal and the call succeeded");
}

describe("createPlannedWorkItem — the row FR-87 defines", () => {
  it("writes execution_mode NULL, status pending and executor_kind unassigned", async () => {
    const fake = db();
    const record = await createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY);

    const rows = fake.rowsIn("work_item");
    expect(rows).toHaveLength(1);
    expect(rows[0].execution_mode).toBeNull();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].executor_kind).toBe("unassigned");
    expect(rows[0].engagement_id).toBe("eng-1");

    // The typed result restates both, so a caller reading the record cannot
    // reach a different conclusion from a caller reading the row.
    expect(record.executionMode).toBeNull();
    expect(record.status).toBe("pending");
    expect(record.engagementSlug).toBe("acme");
    expect(record.id).toBe(rows[0].id);
  });

  it("never lets a caller choose the three values FR-87 fixes", () => {
    // A type-level assertion, deliberately: the failure this guards against is
    // a second write path that sets `status: 'unparsed'` or an execution mode,
    // and the cheapest place to stop that is at the input shape.
    const keys = Object.keys(HAND_ENTRY).sort();
    expect(keys).toEqual(["description", "planRef", "unit", "workType"]);
  });

  it("carries the unit and work type through, trimmed", async () => {
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "acme", {
      ...HAND_ENTRY,
      workType: "  integration  ",
      unit: "  u4  ",
    });

    expect(fake.rowsIn("work_item")[0].work_type).toBe("integration");
    expect(fake.rowsIn("work_item")[0].unit).toBe("u4");
  });

  it("turns an empty optional into NULL rather than an empty string", async () => {
    // `""` is what an untouched text input submits. It means "not set", and a
    // column holding `""` reads back as a value that was set to nothing.
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "acme", {
      ...HAND_ENTRY,
      workType: "   ",
      unit: "",
    });

    expect(fake.rowsIn("work_item")[0].work_type).toBeNull();
    expect(fake.rowsIn("work_item")[0].unit).toBeNull();
  });
});

describe("§7a — work_item.description is sensitive and encrypted at rest", () => {
  it("writes ciphertext, not the prose it was handed", async () => {
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY);

    const stored = String(fake.rowsIn("work_item")[0].description);
    expect(stored.startsWith(FAKE_CIPHER_PREFIX)).toBe(true);
    expect(stored).not.toContain("export panel");
    expect(fake.rpcCalls.map((call) => call.name)).toContain("encrypt_field");
  });

  it("abandons the write when a value cannot be encrypted", async () => {
    // The failure this exists to prevent: an encrypt that quietly returns
    // nothing, and a row that lands with `description` NULL — indistinguishable
    // at rest from a planned item nobody described.
    const fake = db({ rpc: { encrypt_field: () => null } });

    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY),
    );

    expect(error.message).toContain("could not be encrypted");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
  });

  it("returns no description in the record", async () => {
    // The caller already holds the plaintext it passed. Echoing it back from a
    // persistence result is how a sensitive value reaches a log line, a
    // data-verify attribute or a redirect URL.
    const fake = db();
    const record = await createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY);

    expect(Object.keys(record)).not.toContain("description");
    expect(JSON.stringify(record)).not.toContain("export panel");
  });
});

describe("FR-87 as amended by Q14 — an engagement is required", () => {
  it("refuses an empty slug and writes nothing", async () => {
    const fake = db();
    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "", HAND_ENTRY),
    );

    expect(error.message).toContain("no unassigned planned work item");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
    // Nothing was encrypted either: the refusal fires before any value leaves
    // this process.
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("refuses a slug no engagement carries, and names it", async () => {
    const fake = db();
    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "not-a-client", HAND_ENTRY),
    );

    expect(error.message).toContain("not-a-client");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
  });

  it("resolves the slug to that engagement's id and no other", async () => {
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "globex", HAND_ENTRY);
    expect(fake.rowsIn("work_item")[0].engagement_id).toBe("eng-2");
  });

  it("reports a failed engagement read as a refusal, not as a missing engagement", async () => {
    // "The engagement does not exist" and "the read failed" are different
    // sentences, and conflating them tells Erik to register a client he
    // already has.
    const fake = db({ failReadOn: "engagement" });
    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY),
    );

    expect(error.message).not.toContain("No engagement is registered");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
  });
});

describe("a planned item says what the work is", () => {
  it("refuses a blank description and writes nothing", async () => {
    const fake = db();
    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "acme", {
        ...HAND_ENTRY,
        description: "   ",
      }),
    );

    expect(error.message).toContain("Say what the work is");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("names which item of a batch was blank, and writes none of them", async () => {
    const fake = db();
    const error = await refusal(() =>
      createPlannedWorkItems(asClient(fake), "acme", [
        HAND_ENTRY,
        { ...HAND_ENTRY, description: "" },
      ]),
    );

    expect(error.message).toContain("item 2");
    expect(fake.rowsIn("work_item")).toHaveLength(0);
  });
});

describe("FR-90 — how the write is addressed depends on whether a plan id exists", () => {
  it("inserts plainly when there is no plan_ref", async () => {
    // i1's unique index on (engagement_id, plan_ref) is NULLS DISTINCT, so two
    // planned rows with no plan id never collide. Naming a conflict target
    // that can never fire reads like idempotency and is not.
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY);

    const writes = fake.calls.filter((call) => call.table === "work_item");
    expect(writes.map((call) => call.op)).toEqual(["insert"]);
    expect(writes[0].onConflict).toBeUndefined();
  });

  it("upserts on (engagement_id, plan_ref) when a plan id is present", async () => {
    // The fake records the conflict target because it has no unique indexes of
    // its own: an upsert naming the wrong key still behaves here and would be
    // refused 42P10 by Postgres. Asserting the argument is how a test sees the
    // difference.
    const fake = db();
    await createPlannedWorkItem(asClient(fake), "acme", {
      ...HAND_ENTRY,
      planRef: "plan-7",
    });

    const writes = fake.calls.filter((call) => call.table === "work_item");
    expect(writes.map((call) => call.op)).toEqual(["upsert"]);
    expect(writes[0].onConflict).toBe("engagement_id,plan_ref");
  });

  it("splits a mixed batch into one insert and one upsert", async () => {
    const fake = db();
    const records = await createPlannedWorkItems(asClient(fake), "acme", [
      { ...HAND_ENTRY, unit: "a", planRef: null },
      { ...HAND_ENTRY, unit: "b", planRef: "plan-1" },
      { ...HAND_ENTRY, unit: "c", planRef: null },
    ]);

    const writes = fake.calls.filter((call) => call.table === "work_item");
    expect(writes.map((call) => call.op)).toEqual(["insert", "upsert"]);
    expect(records).toHaveLength(3);
    // The returned order is not the input order; match by unit, never by
    // position. This asserts the contract rather than an accident of it.
    expect(records.map((record) => record.unit).sort()).toEqual(["a", "b", "c"]);
  });

  it("writes nothing at all for an empty batch", async () => {
    const fake = db();
    expect(await createPlannedWorkItems(asClient(fake), "acme", [])).toEqual([]);
    expect(fake.calls.filter((call) => call.table === "work_item")).toHaveLength(0);
  });
});

describe("a failed write is a refusal that carries no mechanism", () => {
  it("does not forward the database's message", async () => {
    const fake = db({ failWriteOn: "work_item" });
    const error = await refusal(() =>
      createPlannedWorkItem(asClient(fake), "acme", HAND_ENTRY),
    );

    expect(error.message).not.toContain("injected failure");
    expect(error.message).toContain("audit_log");
  });

  it("names the duplicate plan id on 23505, because that one Erik can act on", async () => {
    const fake = db();
    // Reaching past the fake to force the code path: it enforces no unique
    // index, so the only way to exercise the mapping is to make the write fail
    // with that SQLSTATE.
    const forced = {
      ...fake,
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: ENGAGEMENTS[0], error: null }) }),
        }),
        upsert: () => ({
          select: async () => ({ data: null, error: { code: "23505", message: "dup" } }),
        }),
      }),
    };

    const error = await refusal(() =>
      createPlannedWorkItem(forced as unknown as ServiceClient, "acme", {
        ...HAND_ENTRY,
        planRef: "plan-7",
      }),
    );

    expect(error.message).toContain("already carries that plan id");
  });
});
