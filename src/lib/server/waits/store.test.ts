import { describe, expect, it } from "vitest";

import type { ServiceClient } from "@/lib/supabase/service";
import { createFakeDb } from "@/lib/server/workitems/__fixtures__/fake-db";
import type { FakeDb, Row } from "@/lib/server/workitems/__fixtures__/fake-db";

import { parseWaitDeclaration, parseWaitResolution, toIsoDay } from "./input";
import { declareWait, listWaits, resolveWait } from "./store";

const NOW = new Date("2026-08-19T11:00:00Z");
const TODAY = "2026-08-19";
const WAIT_UUID = "11111111-2222-3333-4444-555555555555";

const db = (fake: FakeDb) => fake as unknown as ServiceClient;

function fixture(extra: Record<string, Row[]> = {}): FakeDb {
  return createFakeDb({
    tables: {
      engagement: [
        { id: "eng-acme", slug: "acme", repo_path: "/Users/erik/Projects/acme" },
      ],
      ...extra,
    },
  });
}

function declaration(overrides: Record<string, unknown> = {}) {
  const parsed = parseWaitDeclaration({
    engagement: "acme",
    label: "App Store review",
    owner: "Apple",
    ownerType: "vendor",
    reason: "Submitted build 1.4.2",
    startedAt: "2026-08-12",
    expectedBy: "2026-08-19",
    resolutionMethod: "manual",
    ...overrides,
  });
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.value;
}

describe("FR-32 / FR-35 declaring a wait", () => {
  it("FR-32 requires an owner outside the studio", () => {
    const parsed = parseWaitDeclaration({
      engagement: "acme",
      label: "x",
      startedAt: "2026-08-12",
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors).toContain("owner: required");
  });

  it("FR-35 refuses `probe` with no probe named", () => {
    const parsed = parseWaitDeclaration({
      engagement: "acme",
      label: "x",
      owner: "Apple",
      startedAt: "2026-08-12",
      resolutionMethod: "probe",
    });
    expect(parsed.ok).toBe(false);
    expect((parsed.ok ? [] : parsed.errors).join(" ")).toContain("probeTarget");
  });

  it("FR-35 accepts `probe` when the probe is named", () => {
    expect(
      parseWaitDeclaration({
        engagement: "acme",
        label: "x",
        owner: "Apple",
        startedAt: "2026-08-12",
        resolutionMethod: "probe",
        probeTarget: "appstore.status",
      }).ok,
    ).toBe(true);
  });

  it("FR-35 defaults to `manual`, which is the honest value", () => {
    expect(declaration().resolutionMethod).toBe("manual");
  });

  it("refuses an expected-by date before the start", () => {
    const parsed = parseWaitDeclaration({
      engagement: "acme",
      label: "x",
      owner: "Apple",
      startedAt: "2026-08-19",
      expectedBy: "2026-08-12",
    });
    expect(parsed.ok ? [] : parsed.errors).toContain("expectedBy: is before startedAt");
  });

  it("FR-32 stores the wait against its engagement", async () => {
    const fake = fixture();
    const result = await declareWait(db(fake), declaration(), NOW);

    const wait = fake.rowsIn("external_wait")[0];
    expect(result.created).toBe(true);
    expect(wait.engagement_id).toBe("eng-acme");
    expect(wait.label).toBe("App Store review");
    expect(wait.owner).toBe("Apple");
    expect(wait.owner_type).toBe("vendor");
    expect(wait.expected_by).toBe("2026-08-19");
  });

  it("FR-33 is idempotent, so an agent may re-declare a wait it hits again", async () => {
    const fake = fixture();
    const first = await declareWait(db(fake), declaration(), NOW);
    const second = await declareWait(
      db(fake),
      declaration({ reason: "Still in review" }),
      NOW,
    );

    expect(fake.rowsIn("external_wait")).toHaveLength(1);
    expect(second.waitId).toBe(first.waitId);
    expect(second.created).toBe(false);
    expect(fake.rowsIn("external_wait")[0].reason).toBe("Still in review");
  });

  it("refuses a wait for an engagement that does not exist", async () => {
    const fake = fixture();
    await expect(
      declareWait(db(fake), declaration({ engagement: "nope" }), NOW),
    ).rejects.toThrow(/No engagement has that slug/);
  });
});

describe("FR-32 a wait blocks the work items it names", () => {
  it("FR-32 marks the named work items blocked and points them at the wait", async () => {
    const fake = fixture({
      work_item: [
        { id: "wi-3", unit: "i3", engagement_id: "eng-acme", status: "pending" },
      ],
    });
    const result = await declareWait(db(fake), declaration({ blocks: ["i3"] }), NOW);

    expect(result.blockedWorkItemIds).toEqual(["wi-3"]);
    const item = fake.rowsIn("work_item")[0];
    expect(item.status).toBe("blocked");
    expect(item.external_wait_id).toBe(result.waitId);
  });

  it("FR-42 drops a `blocks` entry naming no work item AND names which", async () => {
    const fake = fixture({
      work_item: [
        { id: "wi-3", unit: "i3", engagement_id: "eng-acme", status: "pending" },
      ],
    });
    const result = await declareWait(
      db(fake),
      declaration({ blocks: ["i3", "i77"] }),
      NOW,
    );

    expect(result.blockedWorkItemIds).toEqual(["wi-3"]);
    expect(result.droppedBlockCount).toBe(1);
    expect(result.droppedBlocks[0].to).toBe("i77");
    expect(result.droppedBlocks[0].reason).toBe("unknown-target");
  });
});

describe("FR-36 resolving a wait unblocks its dependents", () => {
  async function blocked() {
    const fake = fixture({
      work_item: [
        { id: "wi-3", unit: "i3", engagement_id: "eng-acme", status: "pending" },
        { id: "wi-4", unit: "i4", engagement_id: "eng-acme", status: "pending" },
        { id: "wi-5", unit: "i5", engagement_id: "eng-acme", status: "done" },
      ],
    });
    const declared = await declareWait(
      db(fake),
      declaration({ blocks: ["i3", "i4"] }),
      NOW,
    );
    return { fake, waitId: declared.waitId };
  }

  it("FR-36 records who resolved it and when", async () => {
    const { fake, waitId } = await blocked();
    const result = await resolveWait(db(fake), waitId, "erik", NOW);

    const wait = fake.rowsIn("external_wait")[0];
    expect(wait.resolved_by).toBe("erik");
    expect(wait.resolved_at).toBe(NOW.toISOString());
    expect(result.resolvedAt).toBe(NOW.toISOString());
  });

  it("FR-36 moves every blocked dependent back to pending", async () => {
    const { fake, waitId } = await blocked();
    const result = await resolveWait(db(fake), waitId, "erik", NOW);

    expect(result.unblockedWorkItemIds.sort()).toEqual(["wi-3", "wi-4"]);
    const byId = new Map(fake.rowsIn("work_item").map((r) => [r.id, r.status]));
    expect(byId.get("wi-3")).toBe("pending");
    expect(byId.get("wi-4")).toBe("pending");
  });

  it("FR-36 does not drag a finished item backwards", async () => {
    // The isolating case: `wi-5` is linked to this very wait and finished
    // anyway. A test where the finished item was never linked cannot see the
    // status filter at all — measured: removing `.eq("status", "blocked")` left
    // that version green.
    const fake = fixture({
      work_item: [
        { id: "wi-3", unit: "i3", engagement_id: "eng-acme", status: "pending" },
        { id: "wi-5", unit: "i5", engagement_id: "eng-acme", status: "pending" },
      ],
    });
    const declared = await declareWait(
      db(fake),
      declaration({ blocks: ["i3", "i5"] }),
      NOW,
    );
    const finished = fake.rowsIn("work_item").find((r) => r.id === "wi-5");
    if (finished) finished.status = "done";

    const result = await resolveWait(db(fake), declared.waitId, "erik", NOW);

    const byId = new Map(fake.rowsIn("work_item").map((r) => [r.id, r.status]));
    expect(byId.get("wi-5")).toBe("done");
    expect(byId.get("wi-3")).toBe("pending");
    expect(result.unblockedWorkItemIds).toEqual(["wi-3"]);
  });

  it("FR-36 keeps `external_wait_id` as the record of what blocked the item", async () => {
    const { fake, waitId } = await blocked();
    await resolveWait(db(fake), waitId, "erik", NOW);
    expect(fake.rowsIn("work_item")[0].external_wait_id).toBe(waitId);
  });

  it("FR-36 refuses a second resolution rather than overwriting the first name", async () => {
    const { fake, waitId } = await blocked();
    await resolveWait(db(fake), waitId, "erik", NOW);
    await expect(resolveWait(db(fake), waitId, "someone-else", NOW)).rejects.toThrow(
      /already resolved/,
    );
    expect(fake.rowsIn("external_wait")[0].resolved_by).toBe("erik");
  });

  it("FR-36 requires a resolver name rather than defaulting to one", () => {
    const parsed = parseWaitResolution({ id: WAIT_UUID });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors).toContain("resolvedBy: required");
  });

  it("refuses an id that is not a uuid", () => {
    const parsed = parseWaitResolution({ id: "i3", resolvedBy: "erik" });
    expect(parsed.ok ? [] : parsed.errors).toContain("id: must be the wait's uuid");
  });

  it("refuses an unknown wait id", async () => {
    const fake = fixture();
    await expect(resolveWait(db(fake), WAIT_UUID, "erik", NOW)).rejects.toThrow(
      /No external wait has that id/,
    );
  });
});

describe("FR-34 / FR-38 reading the waits", () => {
  async function seeded() {
    const fake = fixture();
    await declareWait(
      db(fake),
      declaration({ label: "App Store review", owner: "Apple", expectedBy: "2026-08-18" }),
      NOW,
    );
    await declareWait(
      db(fake),
      declaration({
        label: "Contract countersignature",
        owner: "Acme Legal",
        startedAt: "2026-08-17",
        expectedBy: "2026-08-24",
      }),
      NOW,
    );
    return fake;
  }

  it("FR-34 counts the elapsed days a wait has been open", async () => {
    const fake = await seeded();
    const listing = await listWaits(db(fake), TODAY);
    const store = listing.waits.find((w) => w.label === "App Store review");
    expect(store?.daysWaiting).toBe(7);
  });

  it("FR-34 flags a wait past its expected-by date as overdue", async () => {
    const fake = await seeded();
    const listing = await listWaits(db(fake), TODAY);
    const byLabel = new Map(listing.waits.map((w) => [w.label, w.overdue]));
    expect(byLabel.get("App Store review")).toBe(true);
    expect(byLabel.get("Contract countersignature")).toBe(false);
    expect(listing.overdueCount).toBe(1);
  });

  it("FR-38 groups the waits by owner", async () => {
    const fake = await seeded();
    const listing = await listWaits(db(fake), TODAY);

    expect(listing.byOwner.map((g) => g.owner)).toEqual(["Acme Legal", "Apple"]);
    expect(listing.byOwner[1].overdueCount).toBe(1);
    expect(listing.byOwner[0].overdueCount).toBe(0);
  });

  it("FR-34 hides resolved waits by default and shows them on request", async () => {
    const fake = await seeded();
    const open = await listWaits(db(fake), TODAY);
    const target = open.waits.find((w) => w.label === "App Store review");
    await resolveWait(db(fake), target?.id as string, "erik", NOW);

    expect((await listWaits(db(fake), TODAY)).waits).toHaveLength(1);
    expect(
      (await listWaits(db(fake), TODAY, { includeResolved: true })).waits,
    ).toHaveLength(2);
  });

  it("FR-34 stops counting once a wait is resolved", async () => {
    const fake = await seeded();
    const open = await listWaits(db(fake), TODAY);
    const target = open.waits.find((w) => w.label === "App Store review");
    await resolveWait(db(fake), target?.id as string, "erik", NOW);

    const listing = await listWaits(db(fake), "2026-09-30", { includeResolved: true });
    const resolved = listing.waits.find((w) => w.label === "App Store review");
    expect(resolved?.daysWaiting).toBe(7);
    expect(resolved?.overdue).toBe(false);
  });
});

describe("the day-normalisation trap", () => {
  it("reduces a timestamptz to the calendar day the arithmetic expects", () => {
    expect(toIsoDay("2026-08-19T11:00:00.000Z")).toBe("2026-08-19");
    expect(toIsoDay("2026-08-19")).toBe("2026-08-19");
  });

  it("returns null rather than a string that would compute NaN days", () => {
    // `@/lib/ingest/waits` appends `T00:00:00Z` to whatever it is handed. A
    // value that is not a bare day would produce `NaN` days waiting, and NaN
    // renders on a screen without ever throwing.
    expect(toIsoDay("19/08/2026")).toBeNull();
    expect(toIsoDay("not a date")).toBeNull();
    expect(toIsoDay("2026-13-45T00:00:00Z")).toBeNull();
  });

  it("never reports NaN days for a wait", async () => {
    const fake = fixture({
      external_wait: [
        {
          id: WAIT_UUID,
          engagement_id: "eng-acme",
          label: "Broken date",
          owner: "Someone",
          started_at: "not a date",
          expected_by: null,
          resolved_at: null,
        },
      ],
    });
    const listing = await listWaits(db(fake), TODAY);
    expect(listing.waits[0].daysWaiting).toBeNull();
    expect(Number.isNaN(listing.waits[0].daysWaiting as number)).toBe(false);
  });
});
