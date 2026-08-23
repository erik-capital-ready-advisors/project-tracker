import { describe, expect, it } from "vitest";

import type { ServiceClient } from "@/lib/supabase/service";
import {
  createFakeDb,
  fakeCiphertext,
} from "@/lib/server/workitems/__fixtures__/fake-db";
import type { FakeDb, Row } from "@/lib/server/workitems/__fixtures__/fake-db";

import { attributeSession, listUnassignedSessions } from "./unassigned";

function fixture(extra: Record<string, Row[]> = {}): FakeDb {
  return createFakeDb({
    tables: {
      engagement: [
        { id: "eng-unassigned", slug: "unassigned", repo_path: null },
        { id: "eng-acme", slug: "acme", repo_path: "/Users/erik/Projects/acme" },
      ],
      ...extra,
    },
  });
}

const QUEUED_SESSION: Row = {
  id: "sess-1",
  engagement_id: "eng-unassigned",
  work_item_id: "wi-1",
  working_directory: "/Users/erik/Projects/mystery",
  started_at: "2026-08-19T09:00:00Z",
  ended_at: "2026-08-19T10:00:00Z",
  duration_minutes: 60,
  files_changed: 4,
  commits: 1,
  summary: fakeCiphertext("Wired the client's Webflow form to their CRM."),
  source: "session-hook",
  stack_id: null,
};

const db = (fake: FakeDb) => fake as unknown as ServiceClient;

describe("FR-26 the unassigned queue", () => {
  it("FR-26 lists the sessions waiting for attribution", async () => {
    const fake = fixture({ work_session: [QUEUED_SESSION] });
    const queue = await listUnassignedSessions(db(fake));

    expect(queue.sessions).toHaveLength(1);
    expect(queue.sessions[0].id).toBe("sess-1");
    expect(queue.sessions[0].workingDirectory).toBe("/Users/erik/Projects/mystery");
    expect(queue.sessions[0].durationMinutes).toBe(60);
  });

  it("FR-26 does not list sessions that are already attributed", async () => {
    const fake = fixture({
      work_session: [
        QUEUED_SESSION,
        { ...QUEUED_SESSION, id: "sess-2", engagement_id: "eng-acme" },
      ],
    });
    const queue = await listUnassignedSessions(db(fake));
    expect(queue.sessions.map((s) => s.id)).toEqual(["sess-1"]);
  });

  it("§7a decrypts the summary server-side for the operator's screen", async () => {
    const fake = fixture({ work_session: [QUEUED_SESSION] });
    const queue = await listUnassignedSessions(db(fake));
    expect(queue.sessions[0].summary).toBe(
      "Wired the client's Webflow form to their CRM.",
    );
  });

  it("§7a reports an undecryptable summary as null, not as an empty string", async () => {
    // "could not decrypt" and "there was nothing there" are different facts.
    const fake = fixture({
      work_session: [{ ...QUEUED_SESSION, summary: "\\xNOT-OUR-CIPHERTEXT" }],
    });
    const queue = await listUnassignedSessions(db(fake));
    expect(queue.sessions[0].summary).toBeNull();
  });

  it("FR-26 signals truncation rather than letting a long queue look finished", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...QUEUED_SESSION,
      id: `sess-${i}`,
    }));
    const fake = fixture({ work_session: many });
    expect((await listUnassignedSessions(db(fake), 3)).truncated).toBe(true);
    expect((await listUnassignedSessions(db(fake), 5)).truncated).toBe(true);
    expect((await listUnassignedSessions(db(fake), 4)).sessions).toHaveLength(4);
  });
});

describe("FR-26 attribution in one click", () => {
  it("FR-26 moves the session to the named engagement", async () => {
    const fake = fixture({
      work_session: [QUEUED_SESSION],
      work_item: [{ id: "wi-1", engagement_id: "eng-unassigned" }],
    });

    const result = await attributeSession(db(fake), "sess-1", "acme");

    expect(result.engagementSlug).toBe("acme");
    expect(fake.rowsIn("work_session")[0].engagement_id).toBe("eng-acme");
  });

  it("FR-26 moves the work item with it, so the two never disagree", async () => {
    const fake = fixture({
      work_session: [QUEUED_SESSION],
      work_item: [{ id: "wi-1", engagement_id: "eng-unassigned" }],
    });

    await attributeSession(db(fake), "sess-1", "acme");

    expect(fake.rowsIn("work_item")[0].engagement_id).toBe("eng-acme");
  });

  it("FR-26 empties the queue once the session is attributed", async () => {
    const fake = fixture({
      work_session: [QUEUED_SESSION],
      work_item: [{ id: "wi-1", engagement_id: "eng-unassigned" }],
    });

    expect((await listUnassignedSessions(db(fake))).sessions).toHaveLength(1);
    await attributeSession(db(fake), "sess-1", "acme");
    expect((await listUnassignedSessions(db(fake))).sessions).toHaveLength(0);
  });

  it("refuses a slug that names no engagement rather than silently doing nothing", async () => {
    const fake = fixture({ work_session: [QUEUED_SESSION] });
    await expect(attributeSession(db(fake), "sess-1", "no-such")).rejects.toThrow(
      /No engagement has that slug/,
    );
    expect(fake.rowsIn("work_session")[0].engagement_id).toBe("eng-unassigned");
  });

  it("refuses attributing back to `unassigned`, which is always a mistake", async () => {
    const fake = fixture({ work_session: [QUEUED_SESSION] });
    await expect(
      attributeSession(db(fake), "sess-1", "unassigned"),
    ).rejects.toThrow(/cannot be attributed/);
  });

  it("refuses an unknown session id", async () => {
    const fake = fixture({ work_session: [QUEUED_SESSION] });
    await expect(attributeSession(db(fake), "sess-nope", "acme")).rejects.toThrow(
      /No session has that id/,
    );
  });
});
