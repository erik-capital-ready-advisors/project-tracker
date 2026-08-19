/**
 * End-to-end tests for this unit's route handlers.
 *
 * They run the **real** `withAgentRoute` — authentication, the FR-5 capability
 * check, the FR-8 rate limiter and the FR-6 audit writer — against an in-memory
 * database, by replacing `createServiceClient` at the module boundary. Nothing
 * about the guard is stubbed, so a route that forgot its capability, or one
 * whose validation let a bad body through, fails here.
 *
 * They live under `src/lib/server/sessions/` rather than beside `route.ts`
 * because a `*.test.ts` inside `src/app/` sits in Next's route tree, and the
 * route tree is not a place to put files that are not routes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mintAgentToken } from "@/lib/api";
import {
  FAKE_CIPHER_PREFIX,
  createFakeDb,
  fakeCiphertext,
} from "@/lib/server/workitems/__fixtures__/fake-db";
import type { FakeDb, Row } from "@/lib/server/workitems/__fixtures__/fake-db";

const TOKEN_ID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";
const HASH = "stored-hash";

let fake: FakeDb;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => fake,
  resetServiceClientCache: () => {},
}));

const { POST } = await import("@/app/api/ingest/session/route");
const { GET } = await import("@/app/api/session/unassigned/route");

function build(capabilities: ("answer_read" | "ingest_write")[], extra: Record<string, Row[]> = {}) {
  const minted = mintAgentToken(TOKEN_ID);
  fake = createFakeDb({
    tables: {
      engagement: [
        { id: "eng-unassigned", slug: "unassigned", repo_path: null },
        { id: "eng-acme", slug: "acme", repo_path: "/Users/erik/Projects/acme" },
      ],
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
      verify_agent_token: (args) => args.p_hash === HASH && args.p_token === minted.secret,
      check_and_increment_rate_limit: () => true,
    },
  });
  return minted.plaintext;
}

function post(body: unknown, authorization?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization) headers.set("authorization", `Bearer ${authorization}`);
  return new Request("https://ledger.example.com/api/ingest/session", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  workingDirectory: "/Users/erik/Projects/acme",
  // Named explicitly because §7a refuses an agent token `engagement.repo_path`,
  // so directory resolution is unavailable on this route. See the
  // `readEngagementCandidates` header and the queued question.
  engagement: "acme",
  startedAt: "2026-08-19T09:00:00Z",
  endedAt: "2026-08-19T10:30:00Z",
  stack: "n8n",
  filesChanged: 4,
  commits: 2,
  summary: "Rebuilt the lead-router workflow for the client's CRM.",
};

describe("POST /api/ingest/session — the guard is really in the path", () => {
  beforeEach(() => {
    build(["ingest_write"]);
  });

  it("FR-4 refuses a request with no Authorization header", async () => {
    const response = await POST(post(VALID_BODY));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("missing_authorization");
    expect(fake.rowsIn("work_session")).toHaveLength(0);
  });

  it("FR-4 refuses a token whose secret does not verify", async () => {
    const wrong = mintAgentToken(TOKEN_ID).plaintext;
    const response = await POST(post(VALID_BODY, wrong));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_token");
  });

  it("FR-5 refuses a token that holds only answer:read", async () => {
    const token = build(["answer_read"]);
    const response = await POST(post(VALID_BODY, token));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("insufficient_capability");
    expect(fake.rowsIn("work_session")).toHaveLength(0);
  });

  it("FR-6 writes exactly one audit row for a refusal", async () => {
    await POST(post(VALID_BODY));
    expect(fake.rowsIn("audit_log")).toHaveLength(1);
    expect(fake.rowsIn("audit_log")[0].outcome).toBe("refused");
  });

  it("§7a the audit row carries no record contents", async () => {
    const token = build(["ingest_write"]);
    await POST(post(VALID_BODY, token));
    const audit = JSON.stringify(fake.rowsIn("audit_log"));
    expect(audit).not.toContain("lead-router");
    expect(audit).not.toContain("CRM");
    expect(audit).not.toContain("/Users/erik/Projects/acme");
  });
});

describe("POST /api/ingest/session — FR-24 with a valid token", () => {
  it("FR-24 records the session and returns 201", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(post(VALID_BODY, token));

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.engagement).toBe("acme");
    expect(data.resolvedBy).toBe("explicit-slug");
    expect(data.durationMinutes).toBe(90);
    expect(fake.rowsIn("work_session")).toHaveLength(1);
    expect(fake.rowsIn("work_item")).toHaveLength(1);
  });

  it("FR-26 reports `unassigned` so the caller knows it went to the queue", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(
      post(
        { ...VALID_BODY, engagement: undefined, workingDirectory: "/somewhere/unknown" },
        token,
      ),
    );
    const { data } = await response.json();
    expect(data.engagement).toBe("unassigned");
    expect(data.resolvedBy).toBe("unassigned");
    expect(fake.rowsIn("work_session")).toHaveLength(1);
  });

  it("§7a degrades to the queue rather than reading engagement.repo_path", async () => {
    // The observed boundary: `agentScopedDb` refuses `repo_path` to an agent
    // token, so a session that names no engagement cannot be matched to one by
    // directory even when a matching repo_path exists. FR-26's queue is the
    // spec's own answer for that, and the record is kept either way.
    const token = build(["ingest_write"]);
    const response = await POST(
      post(
        {
          ...VALID_BODY,
          engagement: undefined,
          workingDirectory: "/Users/erik/Projects/acme",
        },
        token,
      ),
    );

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.resolvedBy).toBe("unassigned");
    // Nothing was lost: the session is stored and queued for attribution.
    expect(fake.rowsIn("work_session")).toHaveLength(1);
  });

  it("FR-42 returns the dropped edges by name in the response body", async () => {
    const token = build(["ingest_write"], {
      work_item: [{ id: "wi-1", unit: "i1", engagement_id: "eng-acme" }],
    });
    const response = await POST(
      post({ ...VALID_BODY, workItem: { dependsOn: ["i1", "i99"] } }, token),
    );

    const { data } = await response.json();
    expect(data.storedEdges).toBe(1);
    expect(data.droppedEdgeCount).toBe(1);
    expect(data.droppedEdges[0].to).toBe("i99");
  });

  it("refuses a malformed body with 400 and does not write", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(post({ startedAt: "yesterday" }, token));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("workingDirectory");
    expect(fake.rowsIn("work_session")).toHaveLength(0);
  });

  it("refuses a body that is not JSON at all", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(post("{not json", token));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });

  it("§7a stores the summary as ciphertext through the real route", async () => {
    const token = build(["ingest_write"]);
    await POST(post(VALID_BODY, token));

    const summary = fake.rowsIn("work_session")[0].summary as string;
    expect(summary.startsWith(FAKE_CIPHER_PREFIX)).toBe(true);
    expect(summary).not.toContain("lead-router");
  });

  it("§7a does not echo the summary back in the response", async () => {
    const token = build(["ingest_write"]);
    const response = await POST(post(VALID_BODY, token));
    expect(JSON.stringify(await response.json())).not.toContain("lead-router");
  });
});

describe("GET /api/session/unassigned", () => {
  function get(authorization?: string, query = "") {
    const headers = new Headers();
    if (authorization) headers.set("authorization", `Bearer ${authorization}`);
    return new Request(
      `https://ledger.example.com/api/session/unassigned${query}`,
      { method: "GET", headers },
    );
  }

  it("FR-5 refuses a token that holds only ingest:write", async () => {
    const token = build(["ingest_write"]);
    const response = await GET(get(token));
    expect(response.status).toBe(403);
  });

  it("FR-26 returns the queue under answer:read", async () => {
    const token = build(["answer_read"], {
      work_session: [
        {
          id: "sess-1",
          engagement_id: "eng-unassigned",
          work_item_id: null,
          working_directory: "/Users/erik/Projects/mystery",
          started_at: "2026-08-19T09:00:00Z",
          summary: fakeCiphertext("Wired their Webflow form to the CRM."),
        },
      ],
    });
    const response = await GET(get(token));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.count).toBe(1);
    expect(body.data.sessions[0].summary).toBe("Wired their Webflow form to the CRM.");
    // FR-58: the count is present on every endpoint.
    expect(body.unparsed).toBe(0);
  });

  it("refuses a limit outside the allowed range", async () => {
    const token = build(["answer_read"]);
    const response = await GET(get(token, "?limit=100000"));
    expect(response.status).toBe(400);
  });
});
