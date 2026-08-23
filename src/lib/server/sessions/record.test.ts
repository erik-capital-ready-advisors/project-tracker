import { describe, expect, it } from "vitest";

import type { ServiceClient } from "@/lib/supabase/service";
import {
  FAKE_CIPHER_PREFIX,
  createFakeDb,
} from "@/lib/server/workitems/__fixtures__/fake-db";
import type { FakeDb, Row } from "@/lib/server/workitems/__fixtures__/fake-db";

import { parseSessionPayload } from "./input";
import { ENGAGEMENT_SCAN_LIMIT, recordWorkSession } from "./record";

const NOW = new Date("2026-08-19T11:00:00Z");

function engagements(): Row[] {
  return [
    { id: "eng-unassigned", slug: "unassigned", repo_path: null },
    { id: "eng-acme", slug: "acme", repo_path: "/Users/erik/Projects/acme" },
  ];
}

function db(extra: Record<string, Row[]> = {}): FakeDb {
  return createFakeDb({
    tables: { engagement: engagements(), ...extra },
  });
}

function input(overrides: Record<string, unknown> = {}) {
  const parsed = parseSessionPayload({
    workingDirectory: "/Users/erik/Projects/acme",
    startedAt: "2026-08-19T09:00:00Z",
    endedAt: "2026-08-19T10:30:00Z",
    stack: "n8n",
    filesChanged: 12,
    commits: 3,
    summary: "Rebuilt the lead-router workflow for the client's CRM.",
    ...overrides,
  });
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.value;
}

async function record(fake: FakeDb, value = input()) {
  return recordWorkSession(fake as unknown as ServiceClient, value, NOW);
}

describe("FR-24 / FR-28 a session produces a work item in the one shared table", () => {
  it("FR-28 writes a work item with execution mode `hand` and executor Erik", async () => {
    const fake = db();
    await record(fake);

    const items = fake.rowsIn("work_item");
    expect(items).toHaveLength(1);
    expect(items[0].execution_mode).toBe("hand");
    expect(items[0].executor).toBe("erik");
    expect(items[0].executor_kind).toBe("erik");
    expect(items[0].engagement_id).toBe("eng-acme");
  });

  it("FR-28 writes it to `work_item`, not to a mode-2-only table", async () => {
    const fake = db();
    await record(fake);
    const written = new Set(fake.calls.filter((c) => c.op !== "select").map((c) => c.table));
    expect(written).toContain("work_item");
    expect([...written].filter((t) => /session_item|hand_item|mode2/.test(t))).toEqual([]);
  });

  it("FR-24 stores directory, times, files changed and commits", async () => {
    const fake = db();
    const result = await record(fake);

    const session = fake.rowsIn("work_session")[0];
    expect(session.working_directory).toBe("/Users/erik/Projects/acme");
    expect(session.started_at).toBe("2026-08-19T09:00:00.000Z");
    expect(session.ended_at).toBe("2026-08-19T10:30:00.000Z");
    expect(session.files_changed).toBe(12);
    expect(session.commits).toBe(3);
    expect(result.durationMinutes).toBe(90);
  });

  it("FR-31 attributes the session to a stack and dates the stack row", async () => {
    const fake = db();
    const result = await record(fake);

    const stack = fake.rowsIn("stack")[0];
    expect(stack.name).toBe("n8n");
    expect(stack.first_seen_at).toBe(NOW.toISOString());
    expect(stack.last_seen_at).toBe(NOW.toISOString());
    expect(result.stackId).toBe(stack.id);
    expect(fake.rowsIn("work_session")[0].stack_id).toBe(stack.id);
  });

  it("FR-31 reuses an existing stack instead of creating a second row", async () => {
    const fake = db({
      stack: [{ id: "stack-n8n", name: "n8n", first_seen_at: "2026-01-01T00:00:00Z" }],
    });
    await record(fake);

    expect(fake.rowsIn("stack")).toHaveLength(1);
    expect(fake.rowsIn("stack")[0].first_seen_at).toBe("2026-01-01T00:00:00Z");
    expect(fake.rowsIn("stack")[0].last_seen_at).toBe(NOW.toISOString());
  });
});

describe("§7a the session summary reaches Postgres as ciphertext", () => {
  it("§7a never writes the plaintext summary into the column", async () => {
    const fake = db();
    await record(fake);

    const summary = fake.rowsIn("work_session")[0].summary as string;
    expect(summary.startsWith(FAKE_CIPHER_PREFIX)).toBe(true);
    expect(summary).not.toBe("Rebuilt the lead-router workflow for the client's CRM.");
    expect(fake.rpcCalls.some((c) => c.name === "encrypt_field")).toBe(true);
  });

  it("§7a leaves a null summary null rather than encrypting an empty string", async () => {
    // Ciphertext-of-empty is indistinguishable from a real value at rest and
    // breaks every `is null` filter over the column.
    const fake = db();
    await record(fake, input({ summary: undefined }));
    expect(fake.rowsIn("work_session")[0].summary).toBeNull();
  });

  it("§7a encrypts the work item's description and raw status too", async () => {
    const fake = db();
    await record(fake, input({ workItem: { title: "Client CRM webhook retry", status: "done" } }));

    const item = fake.rowsIn("work_item")[0];
    expect(String(item.description).startsWith(FAKE_CIPHER_PREFIX)).toBe(true);
    expect(String(item.raw_status).startsWith(FAKE_CIPHER_PREFIX)).toBe(true);
    expect(item.description).not.toBe("Client CRM webhook retry");
  });

  it("§7a refuses the write rather than storing plaintext when encryption fails", async () => {
    const fake = createFakeDb({
      tables: { engagement: engagements() },
      rpc: { encrypt_field: () => null },
    });
    await expect(record(fake)).rejects.toThrow(/without encryption/);
    expect(fake.rowsIn("work_session")).toHaveLength(0);
  });
});

describe("FR-26 an unattributable session is stored, not discarded", () => {
  it("FR-26 files an unknown directory against the `unassigned` engagement", async () => {
    const fake = db();
    const result = await record(
      fake,
      input({ workingDirectory: "/Users/erik/Projects/brand-new-thing" }),
    );

    expect(result.engagementSlug).toBe("unassigned");
    expect(result.resolvedBy).toBe("unassigned");
    // The point of FR-26: the row exists.
    expect(fake.rowsIn("work_session")).toHaveLength(1);
    expect(fake.rowsIn("work_session")[0].engagement_id).toBe("eng-unassigned");
  });

  it("FR-26 refuses to guess when the engagement scan saturates its limit", async () => {
    // A truncated PostgREST read does not error; it just stops seeing rows, and
    // every session for an unseen engagement would silently become `unassigned`.
    const many = Array.from({ length: ENGAGEMENT_SCAN_LIMIT }, (_, i) => ({
      id: `eng-${i}`,
      slug: `e${i}`,
      repo_path: `/repo/${i}`,
    }));
    const fake = createFakeDb({ tables: { engagement: many } });
    await expect(record(fake)).rejects.toThrow(/cannot be trusted/);
  });
});

describe("FR-27 a session may be posted twice without doubling the hours", () => {
  it("FR-27 updates the mid-session record instead of inserting a second one", async () => {
    const fake = db();
    const midSession = await record(fake, input({ endedAt: undefined }));
    expect(fake.rowsIn("work_session")[0].duration_minutes).toBeNull();

    const final = await record(fake);

    expect(fake.rowsIn("work_session")).toHaveLength(1);
    expect(fake.rowsIn("work_item")).toHaveLength(1);
    expect(final.sessionId).toBe(midSession.sessionId);
    expect(final.workItemId).toBe(midSession.workItemId);
    expect(fake.rowsIn("work_session")[0].duration_minutes).toBe(90);
  });

  it("FR-27 upserts on the natural key i1 declared, not on some other column", async () => {
    // The in-memory store cannot detect a wrong conflict target — it is
    // single-threaded and has no unique indexes, so the prior-session lookup
    // above deduplicates regardless and the test passes either way. (Measured:
    // changing this argument to `engagement_id` left all other tests green.)
    // Real Postgres would refuse an upsert naming a non-unique target, so the
    // argument itself is asserted here, and the constraint's existence is
    // verified against the project database in this unit's report.
    const fake = db();
    await record(fake);
    const upsert = fake.calls.find(
      (c) => c.table === "work_session" && c.op === "upsert",
    );
    expect(upsert?.onConflict).toBe("engagement_id,working_directory,started_at");
  });
});

describe("FR-41 a no-agent-for-stack session is automatically an erik_gate", () => {
  it("FR-41 promotes the executor kind even though the payload said `erik`", async () => {
    const fake = db();
    await record(
      fake,
      input({ workItem: { unautomatedReason: "no-agent-for-stack", executorKind: "erik" } }),
    );

    const item = fake.rowsIn("work_item")[0];
    expect(item.unautomated_reason).toBe("no_agent_for_stack");
    expect(item.executor_kind).toBe("erik_gate");
  });

  it("FR-29 stores the other reason classes without promoting", async () => {
    const fake = db();
    await record(fake, input({ workItem: { unautomatedReason: "client-action" } }));
    expect(fake.rowsIn("work_item")[0].executor_kind).toBe("erik");
    expect(fake.rowsIn("work_item")[0].unautomated_reason).toBe("client_action");
  });

  it("FR-30 stores the disposition so both states are filterable", async () => {
    const fake = db();
    await record(fake, input({ workItem: { disposition: "closed" } }));
    expect(fake.rowsIn("work_item")[0].disposition).toBe("closed");
  });
});

describe("FR-42 dependency edges are stored, and drops are reported", () => {
  it("FR-42 stores an edge whose target exists in the same engagement", async () => {
    const fake = db({
      work_item: [{ id: "wi-1", unit: "i1", engagement_id: "eng-acme" }],
    });
    const result = await record(fake, input({ workItem: { dependsOn: ["i1"] } }));

    expect(result.storedEdgeCount).toBe(1);
    expect(result.droppedEdgeCount).toBe(0);
    expect(fake.rowsIn("work_item_dependency")).toEqual([
      { id: expect.any(String), work_item_id: result.workItemId, depends_on_id: "wi-1" },
    ]);
  });

  it("FR-42 drops an edge naming a unit that does not exist AND reports it", async () => {
    const fake = db({
      work_item: [{ id: "wi-1", unit: "i1", engagement_id: "eng-acme" }],
    });
    const result = await record(fake, input({ workItem: { dependsOn: ["i1", "i99"] } }));

    expect(result.storedEdgeCount).toBe(1);
    expect(result.droppedEdgeCount).toBe(1);
    expect(result.droppedEdges[0].to).toBe("i99");
    expect(result.droppedEdges[0].reason).toBe("unknown-target");
    expect(fake.rowsIn("work_item_dependency")).toHaveLength(1);
  });

  it("FR-42 does not reach across engagements to satisfy an edge", async () => {
    // A unit key is unique only within an engagement. An edge that resolved
    // across one would be a dependency on another client's work.
    const fake = db({
      work_item: [{ id: "wi-other", unit: "i1", engagement_id: "eng-unassigned" }],
    });
    const result = await record(fake, input({ workItem: { dependsOn: ["i1"] } }));

    expect(result.droppedEdgeCount).toBe(1);
    expect(fake.rowsIn("work_item_dependency")).toHaveLength(0);
  });
});
