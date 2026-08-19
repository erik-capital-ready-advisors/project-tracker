// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { agentScopedDb } from "@/lib/api";

import type { ReleaseDb } from "./db";
import { createFakeReleaseDb, resetFakeIds } from "./__fixtures__/fake-release-db";
import type { FakeDbOptions, FakeReleaseDb } from "./__fixtures__/fake-release-db";
import { handleReleaseIngest } from "./handler";
import { loadShippedIndex } from "./shipped";

const ENGAGEMENT_ID = "eng-1";

function db(overrides: FakeDbOptions = {}): FakeReleaseDb {
  return createFakeReleaseDb({
    engagement: [{ id: ENGAGEMENT_ID, slug: "delivery-ledger", client_name: "Erik" }],
    requirement: [
      { id: "req-73", engagement_id: ENGAGEMENT_ID, ref: "FR-73" },
      { id: "req-74", engagement_id: ENGAGEMENT_ID, ref: "FR-74" },
      { id: "req-76", engagement_id: ENGAGEMENT_ID, ref: "FR-76" },
    ],
    work_item: [
      { id: "wi-1", engagement_id: ENGAGEMENT_ID, status: "unparsed" },
      { id: "wi-2", engagement_id: ENGAGEMENT_ID, status: "unparsed" },
      { id: "wi-3", engagement_id: ENGAGEMENT_ID, status: "done" },
    ],
    ...overrides,
  });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://ledger.example.com/api/ingest/release", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BODY = {
  engagement: "delivery-ledger",
  identifier: "dpl_9xKq2mVn",
  environment: "preview",
  url: "https://dl-9xkq.vercel.app",
  deployed_at: "2026-08-19T18:04:11Z",
  recorded_by: "fleet:b0952e/d1",
  requirement_refs: ["FR-73", "FR-74 to FR-76"],
};

async function json(response: Response): Promise<Record<string, never>> {
  return (await response.json()) as Record<string, never>;
}

beforeEach(() => {
  resetFakeIds();
});

describe("POST /api/ingest/release — FR-73, FR-76", () => {
  it("records the deploy and answers 201 with the row it wrote", async () => {
    const fake = db();
    const response = await handleReleaseIngest(post(BODY), fake);
    const body = (await json(response)) as never as {
      data: { release: Record<string, unknown>; created: boolean };
      unparsed: number;
    };

    expect(response.status).toBe(201);
    expect(body.data.created).toBe(true);
    expect(body.data.release.environment).toBe("preview");
    expect(body.data.release.source).toBe("ingested");
    expect(fake.tables.release).toHaveLength(1);
    expect(fake.tables.release[0]).toMatchObject({
      engagement_id: ENGAGEMENT_ID,
      identifier: "dpl_9xKq2mVn",
      environment: "preview",
      source: "ingested",
      recorded_by: "fleet:b0952e/d1",
    });
  });

  it("pins `source` to ingested even when the body claims `declared`", async () => {
    const fake = db();
    await handleReleaseIngest(post({ ...BODY, source: "declared" }), fake);
    expect(fake.tables.release[0].source).toBe("ingested");
  });

  it("reports the current unparsed count per FR-58", async () => {
    const response = await handleReleaseIngest(post(BODY), db());
    const body = (await json(response)) as never as { unparsed: number };
    expect(body.unparsed).toBe(2);
  });

  it("omits the unparsed count rather than sending 0 when it cannot be read", async () => {
    const fake = db({ fail: { work_item: { message: "boom" } } });
    const response = await handleReleaseIngest(post(BODY), fake);
    const body = (await json(response)) as never as Record<string, unknown>;
    expect(response.status).toBe(201);
    expect("unparsed" in body).toBe(false);
  });
});

describe("idempotency — observed, not asserted", () => {
  it("posting the same release twice creates one row and answers 200 the second time", async () => {
    const fake = db();

    const first = await handleReleaseIngest(post(BODY), fake);
    const second = await handleReleaseIngest(post(BODY), fake);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(fake.tables.release).toHaveLength(1);
    expect(fake.tables.release_requirement).toHaveLength(4);

    const body = (await json(second)) as never as {
      data: { created: boolean; requirement_refs: { links_created: number; links_existing: number } };
    };
    expect(body.data.created).toBe(false);
    expect(body.data.requirement_refs.links_created).toBe(0);
    expect(body.data.requirement_refs.links_existing).toBe(4);
  });

  it("the same identifier in a different environment is a different release", async () => {
    const fake = db();
    await handleReleaseIngest(post(BODY), fake);
    const other = await handleReleaseIngest(
      post({ ...BODY, environment: "production" }),
      fake,
    );

    expect(other.status).toBe(201);
    expect(fake.tables.release).toHaveLength(2);
  });

  it("a repost updates the mutable fields rather than adding a row", async () => {
    const fake = db();
    await handleReleaseIngest(post(BODY), fake);
    await handleReleaseIngest(
      post({ ...BODY, url: "https://dl-9xkq-corrected.vercel.app" }),
      fake,
    );

    expect(fake.tables.release).toHaveLength(1);
    expect(fake.tables.release[0].url).toBe("https://dl-9xkq-corrected.vercel.app/");
  });
});

describe("referential honesty — FR-12 / FR-65 applied to a release", () => {
  it("reports a ref naming no requirement and creates no requirement for it", async () => {
    const fake = db();
    const response = await handleReleaseIngest(post(BODY), fake);
    const body = (await json(response)) as never as {
      data: { requirement_refs: { resolved: string[]; unresolved: string[] } };
    };

    expect(body.data.requirement_refs.resolved).toEqual(["FR-73", "FR-74", "FR-76"]);
    expect(body.data.requirement_refs.unresolved).toEqual(["FR-75"]);
    // The reference is reported, and no requirement was invented to make it fit.
    expect(fake.tables.requirement).toHaveLength(3);
    expect(fake.tables.requirement.map((row) => row.ref)).not.toContain("FR-75");
  });

  it("reports an entry it could not classify and stores nothing for it", async () => {
    const fake = db();
    const response = await handleReleaseIngest(
      post({ ...BODY, requirement_refs: ["FR-73", "the checkout rewrite"] }),
      fake,
    );
    const body = (await json(response)) as never as {
      data: { requirement_refs: { unparsed: string[] } };
    };

    expect(body.data.requirement_refs.unparsed).toEqual(["the checkout rewrite"]);
    expect(fake.tables.release_requirement.map((row) => row.requirement_ref)).toEqual([
      "FR-73",
    ]);
  });

  it("refuses an unknown engagement slug rather than filing it under `unassigned`", async () => {
    const fake = db();
    const response = await handleReleaseIngest(
      post({ ...BODY, engagement: "not-a-client" }),
      fake,
    );
    const body = (await json(response)) as never as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("not-a-client");
    expect(fake.tables.release).toHaveLength(0);
  });
});

describe("credential hygiene at the boundary", () => {
  it("strips a protection-bypass token from the stored URL and says so", async () => {
    const fake = db();
    const response = await handleReleaseIngest(
      post({
        ...BODY,
        url: "https://dl-9xkq.vercel.app/?x-vercel-protection-bypass=abcdef0123456789abcdef0123456789",
      }),
      fake,
    );
    const body = (await json(response)) as never as {
      data: { url_params_stripped: string[] };
    };

    expect(body.data.url_params_stripped).toEqual(["x-vercel-protection-bypass"]);
    expect(String(fake.tables.release[0].url)).not.toContain("bypass=");
  });

  it("refuses a secret-shaped identifier with a 400 (FR-78)", async () => {
    const fake = db();
    const response = await handleReleaseIngest(
      post({ ...BODY, identifier: "sb_secret_AbCdEfGhIjKlMnOpQrSt" }),
      fake,
    );
    expect(response.status).toBe(400);
    expect(fake.tables.release).toHaveLength(0);
  });

  it("never returns a database message to the caller", async () => {
    const fake = db({ fail: { release: { message: "relation release does not exist" } } });
    const response = await handleReleaseIngest(post(BODY), fake);
    const body = (await json(response)) as never as { error: { message: string } };

    expect(response.status).toBe(500);
    expect(body.error.message).not.toContain("relation release");
  });

  it("bounds the body before parsing it", async () => {
    const fake = db();
    const huge = JSON.stringify({ ...BODY, recorded_by: "x".repeat(100_000) });
    const response = await handleReleaseIngest(post(huge), fake);
    expect(response.status).toBe(400);
    expect(fake.tables.release).toHaveLength(0);
  });
});

describe("FR-5 still holds through this handler", () => {
  it("refuses contract_milestone when the handler is given the scoped client", async () => {
    // The route casts `ctx.db` to `ReleaseDb`, which is compile-time only. This
    // drives the real `agentScopedDb` proxy over the fake to prove the runtime
    // guard is still in the call path a cast cannot remove.
    const scoped = agentScopedDb(db()) as unknown as ReleaseDb;
    expect(() => scoped.from("contract_milestone").select("amount")).toThrow(
      /may not read `contract_milestone`/,
    );
  });

  it("still records a release normally through the scoped client", async () => {
    const fake = db();
    const scoped = agentScopedDb(fake) as unknown as ReleaseDb;
    const response = await handleReleaseIngest(post(BODY), scoped);
    expect(response.status).toBe(201);
    expect(fake.tables.release).toHaveLength(1);
  });

  it("uses an explicit engagement projection, never `*`", async () => {
    const fake = db();
    const scoped = agentScopedDb(fake) as unknown as ReleaseDb;
    await handleReleaseIngest(post(BODY), scoped);

    const engagementProjections = fake.projections
      .filter((entry) => entry.table === "engagement")
      .map((entry) => entry.columns);
    expect(engagementProjections.length).toBeGreaterThan(0);
    expect(engagementProjections).not.toContain("*");
  });
});

describe("FR-74 derivation reads what this route wrote", () => {
  it("builds the shipped index from the persisted rows, keeping environments apart", async () => {
    const fake = db();
    await handleReleaseIngest(post(BODY), fake);
    await handleReleaseIngest(
      post({
        ...BODY,
        identifier: "v1.0.0",
        environment: "production",
        requirement_refs: ["FR-73"],
      }),
      fake,
    );

    const loaded = await loadShippedIndex(fake, ENGAGEMENT_ID);
    expect(loaded.error).toBeNull();
    expect(loaded.releases).toHaveLength(2);
    expect([...(loaded.index.get("FR-73") ?? [])].sort()).toEqual([
      "preview",
      "production",
    ]);
    // FR-75: a preview deploy is not a production one and the index says so.
    expect([...(loaded.index.get("FR-74") ?? [])]).toEqual(["preview"]);
  });
});
