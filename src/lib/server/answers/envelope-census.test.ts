/**
 * FR-58's envelope on the two endpoints that used to hard-code it to zero.
 *
 * ## What these tests exist to catch
 *
 * `GET /api/waits` and `GET /api/session/unassigned` both returned
 * `apiOk(data, { unparsed: 0 })` with a comment reasoning that nothing on
 * either path is *parsed*, so nothing on either path could fail to parse — "a
 * real zero rather than an unmeasured one".
 *
 * That answers a different question than the one FR-58 asks. FR-58 is a
 * statement about the **system**: *"A system that cannot classify something says
 * so on every surface rather than on a diagnostics page."* The count is the
 * ledger's, global and unnarrowed — the same number the app shell's badge shows
 * and the same number `/api/answer/*` reports. So a literal `0` there stated
 * that the whole ledger classified cleanly, on a request that counted nothing.
 * A wrong `done`, reached through an envelope field.
 *
 * The existing assertions in `waits-route.test.ts` and `session-route.test.ts`
 * could not catch it: both seed no `work_item`, `defect` or `test_result` rows,
 * so the real census also returns `0` and the hardcode is indistinguishable from
 * the truth. **Every test below seeds a ledger whose count is not zero**, which
 * is the only arrangement in which the two differ.
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

const { GET: WAITS } = await import("@/app/api/waits/route");
const { GET: UNASSIGNED } = await import("@/app/api/session/unassigned/route");

/**
 * A ledger holding six unclassified records, spread across all three tables the
 * census counts.
 *
 * The third defect is unparsed in **both** columns and must be counted **once**:
 * the population is records, not fields. Counting it twice inflates the number
 * with no extra row for Erik to go and look at.
 */
const UNPARSED_LEDGER: Record<string, Row[]> = {
  work_item: [
    { id: "wi-1", engagement_id: "eng-acme", status: "unparsed" },
    { id: "wi-2", engagement_id: "eng-acme", status: "unparsed" },
    { id: "wi-3", engagement_id: "eng-acme", status: "done" },
  ],
  defect: [
    { id: "d-1", engagement_id: "eng-acme", severity: "unparsed", status: "open" },
    { id: "d-2", engagement_id: "eng-acme", severity: "major", status: "unparsed" },
    { id: "d-3", engagement_id: "eng-acme", severity: "unparsed", status: "unparsed" },
    { id: "d-4", engagement_id: "eng-acme", severity: "minor", status: "open" },
  ],
  test_result: [
    { id: "tr-1", test_case_id: "t-1", status: "unparsed" },
    { id: "tr-2", test_case_id: "t-1", status: "pass" },
  ],
};

/** 2 work items + 3 defects (d-3 counted once) + 1 test result. */
const EXPECTED_TOTAL = 6;

function build(extra: Record<string, Row[]> = {}, failReadOn?: string) {
  const minted = mintAgentToken(TOKEN_ID);
  fake = createFakeDb({
    tables: {
      engagement: [
        { id: "eng-acme", slug: "acme", repo_path: null },
        { id: "eng-other", slug: "other", repo_path: null },
        // FR-26's queue route resolves this slug before it reads anything, and
        // refuses the whole request when it is absent. Seeded by the schema
        // migration in production.
        { id: "eng-unassigned", slug: "unassigned", repo_path: null },
      ],
      agent_token: [
        {
          id: TOKEN_ID,
          label: "fleet reader",
          token_hash: HASH,
          capabilities: ["answer_read"],
          expires_at: "2026-12-31T00:00:00Z",
          revoked_at: null,
        },
      ],
      ...extra,
    },
    ...(failReadOn === undefined ? {} : { failReadOn }),
    rpc: {
      verify_agent_token: (args) =>
        args.p_hash === HASH && args.p_token === minted.secret,
      check_and_increment_rate_limit: () => true,
    },
  });
  return minted.plaintext;
}

function request(path: string, token: string) {
  return new Request(`https://ledger.test${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

const ROUTES = [
  { name: "GET /api/waits", path: "/api/waits", handler: WAITS },
  {
    name: "GET /api/session/unassigned",
    path: "/api/session/unassigned",
    handler: UNASSIGNED,
  },
] as const;

describe("FR-58 — the envelope reports the ledger's count, not a literal", () => {
  for (const route of ROUTES) {
    it(`${route.name} reports the real census rather than zero`, async () => {
      const token = build(UNPARSED_LEDGER);
      const response = await route.handler(request(route.path, token));

      expect(response.status).toBe(200);
      const body = await response.json();

      // The assertion the hardcode fails. Six records in this ledger could not
      // be classified; an endpoint saying `0` says the opposite.
      expect(body.unparsed).toBe(EXPECTED_TOTAL);
    });

    it(`${route.name} counts a doubly-unparsed defect once`, async () => {
      // `d-3` is unparsed in both `severity` and `status`. One record, one
      // count — i7's rule, asserted here so a future `or` rewritten as two
      // summed counts is caught.
      const token = build(UNPARSED_LEDGER);
      const body = await (await route.handler(request(route.path, token))).json();
      expect(body.unparsed).not.toBe(EXPECTED_TOTAL + 1);
      expect(body.unparsed).toBe(EXPECTED_TOTAL);
    });

    it(`${route.name} omits the count entirely when it could not be read`, async () => {
      // `unparsedCensus` returns `null` — never a partial sum — when any one of
      // its three counts fails, and `apiOk` omits an absent count rather than
      // sending `0`. A partial total understates, and an understated unparsed
      // count is indistinguishable from a healthy one.
      const token = build(UNPARSED_LEDGER, "defect");
      const response = await route.handler(request(route.path, token));

      expect(response.status).toBe(200);
      const body = await response.json();

      expect("unparsed" in body).toBe(false);
      // And emphatically not the 3 that the two readable tables would have summed to.
      expect(body.unparsed).not.toBe(3);
      expect(body.unparsed).not.toBe(0);
    });

    it(`${route.name} still reports a genuine zero as zero`, async () => {
      // The negative control. Without it, a route that omitted the field
      // unconditionally would pass the test above, and "unavailable" would have
      // quietly replaced a real and meaningful `0`.
      const token = build();
      const body = await (await route.handler(request(route.path, token))).json();
      expect(body.unparsed).toBe(0);
    });
  }

  it("GET /api/waits does not narrow the count by its own engagement filter", async () => {
    // The count is the ledger's, not this view's. A filtered count can read `0`
    // while the ledger holds unclassified records — Erik filters to one clean
    // engagement, sees "0 unparsed", and reads it as *the system classified
    // everything*. Every unparsed row here belongs to `acme`; the request asks
    // for `other`.
    const token = build(UNPARSED_LEDGER);
    const body = await (
      await WAITS(request("/api/waits?engagement=other", token))
    ).json();

    expect(body.data.waits).toHaveLength(0);
    expect(body.unparsed).toBe(EXPECTED_TOTAL);
  });
});
