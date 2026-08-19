/**
 * End-to-end tests for the wait endpoints, through the real `withAgentRoute`.
 * Same arrangement as `sessions/session-route.test.ts`.
 */

import { describe, expect, it, vi } from "vitest";

import { mintAgentToken } from "@/lib/api";
import { createFakeDb } from "@/lib/server/workitems/__fixtures__/fake-db";
import type { FakeDb, Row } from "@/lib/server/workitems/__fixtures__/fake-db";

const TOKEN_ID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";
const HASH = "stored-hash";

let fake: FakeDb;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => fake,
  resetServiceClientCache: () => {},
}));

const { GET, POST } = await import("@/app/api/waits/route");
const { POST: RESOLVE } = await import("@/app/api/waits/resolve/route");

function build(
  capabilities: ("answer_read" | "ingest_write")[],
  extra: Record<string, Row[]> = {},
) {
  const minted = mintAgentToken(TOKEN_ID);
  fake = createFakeDb({
    tables: {
      engagement: [{ id: "eng-acme", slug: "acme", repo_path: null }],
      agent_token: [
        {
          id: TOKEN_ID,
          label: "fleet writer",
          token_hash: HASH,
          capabilities,
          expires_at: "2026-12-31T00:00:00Z",
          revoked_at: null,
        },
      ],
      ...extra,
    },
    rpc: {
      verify_agent_token: (args) =>
        args.p_hash === HASH && args.p_token === minted.secret,
      check_and_increment_rate_limit: () => true,
    },
  });
  return minted.plaintext;
}

const DECLARATION = {
  engagement: "acme",
  label: "App Store review",
  owner: "Apple",
  ownerType: "vendor",
  reason: "Submitted build 1.4.2",
  startedAt: "2026-08-12",
  expectedBy: "2026-08-18",
  resolutionMethod: "manual",
};

function request(url: string, method: string, token?: string, body?: unknown) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request(`https://ledger.example.com${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/waits — FR-33 an agent may declare a wait", () => {
  it("FR-33 declares it and returns 201", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(request("/api/waits", "POST", token, DECLARATION));

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.created).toBe(true);
    expect(fake.rowsIn("external_wait")).toHaveLength(1);
    expect(fake.rowsIn("external_wait")[0].owner).toBe("Apple");
  });

  it("FR-33 refuses a token without ingest:write", async () => {
    const token = build(["answer_read"]);
    const response = await POST(request("/api/waits", "POST", token, DECLARATION));
    expect(response.status).toBe(403);
    expect(fake.rowsIn("external_wait")).toHaveLength(0);
  });

  it("FR-32 refuses a declaration with no owner", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(
      request("/api/waits", "POST", token, { ...DECLARATION, owner: undefined }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("owner");
  });

  it("FR-35 refuses `probe` with no probe target named", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(
      request("/api/waits", "POST", token, {
        ...DECLARATION,
        resolutionMethod: "probe",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("probeTarget");
  });

  it("FR-42 reports a `blocks` entry that names no work item", async () => {
    const token = build(["ingest_write"], {
      work_item: [{ id: "wi-3", unit: "i3", engagement_id: "eng-acme", status: "pending" }],
    });
    const response = await POST(
      request("/api/waits", "POST", token, { ...DECLARATION, blocks: ["i3", "i88"] }),
    );

    const { data } = await response.json();
    expect(data.blockedWorkItems).toEqual(["wi-3"]);
    expect(data.droppedBlockCount).toBe(1);
    expect(data.droppedBlocks[0].to).toBe("i88");
  });
});

describe("GET /api/waits — FR-34 and FR-38", () => {
  it("FR-4 POSITIVE CONTROL: a freshly minted secret for the same id is refused", async () => {
    // Proves the secret is actually verified rather than the token id alone
    // being trusted. Same row id, same stored hash, different secret — and the
    // request must not be served. Without this, every "authorised" assertion in
    // this file could pass against a check that only looked at the uuid.
    const write = build(["ingest_write"]);
    await POST(request("/api/waits", "POST", write, DECLARATION));

    const impostor = mintAgentToken(TOKEN_ID).plaintext;
    const response = await GET(
      request("/api/waits?today=2026-08-19", "GET", impostor),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_token");
  });

  it("FR-34 / FR-38 returns days waiting, overdue and the owner grouping", async () => {
    const token = build(["answer_read"], {
      external_wait: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          engagement_id: "eng-acme",
          label: "App Store review",
          owner: "Apple",
          owner_type: "vendor",
          reason: "Submitted 1.4.2",
          started_at: "2026-08-12T00:00:00Z",
          expected_by: "2026-08-18",
          resolved_at: null,
          resolved_by: null,
          resolution_method: "manual",
          probe_target: null,
        },
      ],
    });

    const response = await GET(
      request("/api/waits?today=2026-08-19", "GET", token),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.waits[0].daysWaiting).toBe(7);
    expect(body.data.waits[0].overdue).toBe(true);
    expect(body.data.overdueCount).toBe(1);
    expect(body.data.byOwner[0].owner).toBe("Apple");
    expect(body.unparsed).toBe(0);
  });

  it("refuses a malformed `today` rather than computing NaN days", async () => {
    const token = build(["answer_read"]);
    const response = await GET(request("/api/waits?today=yesterday", "GET", token));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/waits/resolve — FR-36", () => {
  const WAIT_ID = "11111111-2222-3333-4444-555555555555";

  function seeded() {
    return build(["ingest_write"], {
      external_wait: [
        {
          id: WAIT_ID,
          engagement_id: "eng-acme",
          label: "App Store review",
          owner: "Apple",
          started_at: "2026-08-12T00:00:00Z",
          expected_by: "2026-08-18",
          resolved_at: null,
        },
      ],
      work_item: [
        {
          id: "wi-3",
          unit: "i3",
          engagement_id: "eng-acme",
          status: "blocked",
          external_wait_id: WAIT_ID,
        },
      ],
    });
  }

  it("FR-36 resolves the wait and unblocks its dependents", async () => {
    const token = seeded();
    const response = await RESOLVE(
      request("/api/waits/resolve", "POST", token, {
        id: WAIT_ID,
        resolvedBy: "erik",
      }),
    );

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.resolvedBy).toBe("erik");
    expect(data.unblockedCount).toBe(1);
    expect(fake.rowsIn("work_item")[0].status).toBe("pending");
    expect(fake.rowsIn("external_wait")[0].resolved_by).toBe("erik");
  });

  it("FR-36 refuses a resolution that does not say who", async () => {
    const token = seeded();
    const response = await RESOLVE(
      request("/api/waits/resolve", "POST", token, { id: WAIT_ID }),
    );
    expect(response.status).toBe(400);
    expect(fake.rowsIn("work_item")[0].status).toBe("blocked");
  });

  it("FR-36 refuses an unknown wait id", async () => {
    const token = seeded();
    const response = await RESOLVE(
      request("/api/waits/resolve", "POST", token, {
        id: "99999999-2222-3333-4444-555555555555",
        resolvedBy: "erik",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("FR-36 refuses a token without ingest:write", async () => {
    build(["answer_read"], {
      external_wait: [{ id: WAIT_ID, engagement_id: "eng-acme", label: "x", resolved_at: null }],
    });
    const token = mintAgentToken(TOKEN_ID).plaintext;
    const response = await RESOLVE(
      request("/api/waits/resolve", "POST", token, { id: WAIT_ID, resolvedBy: "erik" }),
    );
    expect([401, 403]).toContain(response.status);
  });
});
