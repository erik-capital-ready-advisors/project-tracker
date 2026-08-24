import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { ServiceClient } from "@/lib/supabase/service";

import { listOpenQuestions } from "./questions-load";

/**
 * B36 -- `listOpenQuestions` is the pure query-and-shape half of the loader
 * behind `/questions` (`readOpenQuestions` adds only `requireOperator()` and
 * the real client, exactly as `readWorkItems` sits in front of
 * `listWorkItems`, and that thin wrapper is not unit-tested here for the same
 * reason it is not tested in `list.test.ts`: it has no logic of its own).
 *
 * The fake below is scoped to this file rather than shared, for the reason
 * `workitems/__fixtures__/fake-db.ts` gives for staying scoped to its own
 * directory: a fixture at a shared path is a merge conflict waiting to happen
 * across parallel work-units, and this module owns nothing else that would
 * need one.
 */

type Row = Record<string, unknown>;

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

function fakeDb(rows: Row[], options: { fail?: boolean } = {}): ServiceClient {
  const engagements: Record<string, { slug: string; client_name: string }> = {
    "eng-acme": { slug: "acme", client_name: "Acme Corp" },
  };

  const db = {
    from(table: string) {
      if (table !== "open_question") {
        throw new Error(`fake db: unexpected table ${table}`);
      }

      const filters: Array<(row: Row) => boolean> = [];
      let limit: number | null = null;

      const builder = {
        select() {
          return builder;
        },
        order() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        then<TResult1 = FakeResult, TResult2 = never>(
          onfulfilled?:
            | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
            | null,
        ): Promise<TResult1 | TResult2> {
          if (options.fail) {
            return Promise.resolve(
              onfulfilled === undefined || onfulfilled === null
                ? ({ data: null, error: { message: "boom" } } as unknown as TResult1)
                : onfulfilled({ data: null, error: { message: "boom" } }),
            );
          }

          let matched = rows.filter((row) => filters.every((f) => f(row)));
          if (limit !== null) matched = matched.slice(0, limit);

          const shaped = matched.map((row) => {
            const engagementId = row.engagement_id as string | undefined;
            const engagement =
              engagementId !== undefined ? (engagements[engagementId] ?? null) : null;
            return { ...row, engagement };
          });

          const result: FakeResult = { data: shaped, error: null };
          return Promise.resolve(
            onfulfilled === undefined || onfulfilled === null
              ? (result as unknown as TResult1)
              : onfulfilled(result),
          );
        },
      };

      return builder;
    },
  };

  return db as unknown as ServiceClient;
}

function question(overrides: Row = {}): Row {
  return {
    id: `q-${Math.random().toString(36).slice(2, 8)}`,
    engagement_id: "eng-acme",
    run: "29b583",
    unit: "u2",
    section: "5a",
    confidence: "med",
    answered_by: null,
    answered_at: null,
    status: "open",
    ...overrides,
  };
}

describe("B36 listOpenQuestions", () => {
  it("defaults to open questions only", async () => {
    const db = fakeDb([
      question({ id: "a", status: "open" }),
      question({ id: "b", status: "answered" }),
    ]);

    const listing = await listOpenQuestions(db);

    expect(listing.questions.map((q) => q.id)).toEqual(["a"]);
    expect(listing.openCount).toBe(1);
    expect(listing.answeredCount).toBe(0);
  });

  it("includes answered questions when asked, and counts both", async () => {
    const db = fakeDb([
      question({ id: "a", status: "open" }),
      question({ id: "b", status: "answered", answered_by: "erik" }),
    ]);

    const listing = await listOpenQuestions(db, { includeAnswered: true });

    expect(listing.questions.map((q) => q.id).sort()).toEqual(["a", "b"]);
    expect(listing.openCount).toBe(1);
    expect(listing.answeredCount).toBe(1);
  });

  it("never coerces a recorded confidence and counts unclassified rows separately", async () => {
    const db = fakeDb([
      question({ id: "a", confidence: "low" }),
      question({ id: "b", confidence: null }),
      question({ id: "c", confidence: "high" }),
    ]);

    const listing = await listOpenQuestions(db, { includeAnswered: true });
    const byId = new Map(listing.questions.map((q) => [q.id, q]));

    expect(byId.get("a")?.confidence).toBe("low");
    expect(byId.get("b")?.confidence).toBeNull();
    expect(byId.get("c")?.confidence).toBe("high");
    expect(listing.unclassifiedConfidenceCount).toBe(1);
  });

  it("resolves the engagement slug and client name from the join", async () => {
    const db = fakeDb([question({ id: "a", engagement_id: "eng-acme" })]);

    const listing = await listOpenQuestions(db);

    expect(listing.questions[0]?.engagementSlug).toBe("acme");
    expect(listing.questions[0]?.engagementClientName).toBe("Acme Corp");
  });

  it("reports null engagement fields rather than throwing when the join misses", async () => {
    const db = fakeDb([question({ id: "a", engagement_id: "eng-unknown" })]);

    const listing = await listOpenQuestions(db);

    expect(listing.questions[0]?.engagementSlug).toBeNull();
    expect(listing.questions[0]?.engagementClientName).toBeNull();
  });

  it("flags truncation when the page fills the limit exactly", async () => {
    const db = fakeDb([question({ id: "a" }), question({ id: "b" })]);

    const listing = await listOpenQuestions(db, { limit: 2 });

    expect(listing.truncated).toBe(true);
  });

  it("does not flag truncation when fewer rows than the limit come back", async () => {
    const db = fakeDb([question({ id: "a" })]);

    const listing = await listOpenQuestions(db, { limit: 2 });

    expect(listing.truncated).toBe(false);
  });

  it("throws an ApiError rather than leaking a raw Postgres error", async () => {
    const db = fakeDb([], { fail: true });

    await expect(listOpenQuestions(db)).rejects.toBeInstanceOf(ApiError);
  });
});
