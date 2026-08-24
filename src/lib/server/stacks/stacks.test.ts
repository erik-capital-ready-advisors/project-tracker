import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  createFakeAnswerDb,
  resetFakeAnswerIds,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";
import type {
  FakeDbOptions,
  FakeRow,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";

import { CIPHERTEXT_COLUMNS, projectionColumns } from "./columns";
import { loadStackRegister } from "./list";
import { AGENT_COVERING_MAX, normaliseAgentCovering, setAgentCovering } from "./set-covering";
import type { StacksDb } from "./types";

/**
 * The `stack` / `work_session` read layer and FR-109's write, driven against the
 * shared PostgREST fake.
 *
 * `createFakeAnswerDb` is reused rather than re-written: it already models the
 * three behaviours that let this code be wrong while a test stays green — a
 * silent `maxRows` truncation, a true `count` distinguishable from a short page,
 * and an `update` that matches nothing and reports success. It also records
 * every projection it is asked for and every RPC it is called with, which is
 * what makes the §7a assertions at the bottom of this file **behavioural**
 * rather than a second reading of the source.
 */

const ENG_LEDGER = "eng-delivery-ledger";
const ENG_OTHER = "eng-other";
const STACK_NEXT = "stack-nextjs-supabase";

/**
 * The ledger as measured against the live database on 2026-08-24, not rounded
 * off.
 *
 * One stack, never seeded and populated on demand by `upsertStack`, with
 * `agent_covering` NULL because nothing in the product has ever written it. Two
 * sessions: one carrying that stack with a **recorded** `duration_minutes` of 0,
 * and one carrying no stack at all — 50% of the denominator, and FR-108's
 * headline number.
 */
function ledger(overrides: Record<string, FakeRow[]> = {}): Record<string, FakeRow[]> {
  return {
    stack: [
      {
        id: STACK_NEXT,
        name: "nextjs-supabase",
        agent_covering: null,
        first_seen_at: "2026-08-20 12:00:00+00",
        last_seen_at: "2026-08-20 12:00:00+00",
      },
    ],
    work_session: [
      {
        id: "ws-1",
        engagement_id: ENG_LEDGER,
        stack_id: STACK_NEXT,
        duration_minutes: 0,
        summary: "enc:whatever Erik was working on",
        source: "session-hook",
      },
      {
        id: "ws-2",
        engagement_id: ENG_LEDGER,
        stack_id: null,
        duration_minutes: 0,
        summary: "enc:whatever Erik was working on",
        source: "session-hook",
      },
    ],
    audit_log: [],
    ...overrides,
  };
}

function db(options: FakeDbOptions = {}): {
  db: StacksDb;
  fake: ReturnType<typeof createFakeAnswerDb>;
} {
  const fake = createFakeAnswerDb({ tables: ledger(), ...options });
  return { db: fake as unknown as StacksDb, fake };
}

beforeEach(() => {
  resetFakeAnswerIds();
});

describe("FR-104 / FR-105 — the register, on the ledger as it actually is", () => {
  it("reports the one observed stack with zero hours across one engagement", async () => {
    const register = await loadStackRegister(db().db);

    expect(register.stacks).toHaveLength(1);
    const [stack] = register.stacks;
    expect(stack.name).toBe("nextjs-supabase");
    expect(stack.agentCovering).toBeNull();
    expect(stack.minutes).toBe(0);
    expect(stack.hours).toBe(0);
    expect(stack.sessions).toBe(1);
    expect(stack.engagements).toBe(1);
    expect(stack.firstSeenAt).toBe("2026-08-20 12:00:00+00");
    expect(stack.lastSeenAt).toBe("2026-08-20 12:00:00+00");
  });

  it("finds nothing earned and nothing actionable, which is the answer and not a bug", async () => {
    const register = await loadStackRegister(db().db);

    expect(register.stacks[0].trigger.outcome).toBe("undetermined");
    expect(register.stacks[0].actionable).toBe(false);
    expect(register.blindness.stacksEarned).toBe(0);
    expect(register.blindness.stacksActionable).toBe(0);
  });

  it("distinguishes a recorded zero from a missing duration", async () => {
    // The measured session carries `duration_minutes = 0`, not NULL. Hours are
    // zero because zero was recorded, and the register is not understating.
    const register = await loadStackRegister(db().db);
    expect(register.stacks[0].sessionsWithoutDuration).toBe(0);
    expect(register.blindness.sessionsWithoutDuration).toBe(0);
  });

  it("counts a NULL duration as a hole rather than as zero", async () => {
    const { db: client } = db({
      tables: ledger({
        work_session: [
          {
            id: "ws-1",
            engagement_id: ENG_LEDGER,
            stack_id: STACK_NEXT,
            duration_minutes: null,
          },
          {
            id: "ws-2",
            engagement_id: ENG_LEDGER,
            stack_id: STACK_NEXT,
            duration_minutes: 90,
          },
        ],
      }),
    });

    const register = await loadStackRegister(client);
    expect(register.stacks[0].minutes).toBe(90);
    expect(register.stacks[0].sessions).toBe(2);
    expect(register.stacks[0].sessionsWithoutDuration).toBe(1);
    expect(register.blindness.sessionsWithoutDuration).toBe(1);
  });

  it("counts engagements from the sessions, so hours and engagements describe one population", async () => {
    const { db: client } = db({
      tables: ledger({
        work_session: [
          { id: "ws-1", engagement_id: ENG_LEDGER, stack_id: STACK_NEXT, duration_minutes: 300 },
          { id: "ws-2", engagement_id: ENG_OTHER, stack_id: STACK_NEXT, duration_minutes: 180 },
          { id: "ws-3", engagement_id: ENG_OTHER, stack_id: STACK_NEXT, duration_minutes: 60 },
        ],
      }),
    });

    const register = await loadStackRegister(client);
    expect(register.stacks[0].engagements).toBe(2);
    expect(register.stacks[0].sessions).toBe(3);
    expect(register.stacks[0].minutes).toBe(540);
    expect(register.stacks[0].hours).toBe(9);
    expect(register.stacks[0].trigger.outcome).toBe("earned");
  });

  it("orders by name and lists a stack no session has ever touched", async () => {
    const { db: client } = db({
      tables: ledger({
        stack: [
          { id: "s-swift", name: "swiftui", agent_covering: null, first_seen_at: null, last_seen_at: null },
          {
            id: STACK_NEXT,
            name: "nextjs-supabase",
            agent_covering: null,
            first_seen_at: null,
            last_seen_at: null,
          },
        ],
      }),
    });

    const register = await loadStackRegister(client);
    expect(register.stacks.map((stack) => stack.name)).toEqual([
      "nextjs-supabase",
      "swiftui",
    ]);
    // A stack observed with no session on it is a real row with real zeroes,
    // not an omission. FR-104 says "every stack the ledger has ever observed".
    expect(register.stacks[1].sessions).toBe(0);
    expect(register.stacks[1].minutes).toBe(0);
    expect(register.stacks[1].engagements).toBe(0);
  });
});

describe("FR-107 — the one actionable state", () => {
  function earnedLedger(agentCovering: string | null): Record<string, FakeRow[]> {
    return ledger({
      stack: [
        {
          id: STACK_NEXT,
          name: "nextjs-supabase",
          agent_covering: agentCovering,
          first_seen_at: null,
          last_seen_at: null,
        },
      ],
      work_session: [
        { id: "ws-1", engagement_id: ENG_LEDGER, stack_id: STACK_NEXT, duration_minutes: 300 },
        { id: "ws-2", engagement_id: ENG_OTHER, stack_id: STACK_NEXT, duration_minutes: 300 },
      ],
    });
  }

  it("is actionable when earned and nobody has named an agent", async () => {
    const register = await loadStackRegister(db({ tables: earnedLedger(null) }).db);
    expect(register.stacks[0].actionable).toBe(true);
    expect(register.blindness.stacksActionable).toBe(1);
    expect(register.blindness.stacksEarned).toBe(1);
    expect(register.blindness.stacksCovered).toBe(0);
  });

  it("is settled, not actionable, when earned and covered", async () => {
    const register = await loadStackRegister(
      db({ tables: earnedLedger("api-integrator") }).db,
    );
    expect(register.stacks[0].actionable).toBe(false);
    expect(register.blindness.stacksActionable).toBe(0);
    expect(register.blindness.stacksEarned).toBe(1);
    expect(register.blindness.stacksCovered).toBe(1);
  });
});

describe("FR-108 — the register reports its own blindness", () => {
  it("counts the session with no stack rather than excluding it", async () => {
    const register = await loadStackRegister(db().db);

    expect(register.blindness.sessionsTotal).toBe(2);
    expect(register.blindness.sessionsWithStack).toBe(1);
    expect(register.blindness.sessionsWithoutStack).toBe(1);
  });

  it("keeps the denominator whole: every session is placed or declared unplaceable", async () => {
    const { db: client } = db({
      tables: ledger({
        work_session: [
          { id: "ws-1", engagement_id: ENG_LEDGER, stack_id: STACK_NEXT, duration_minutes: 10 },
          { id: "ws-2", engagement_id: ENG_LEDGER, stack_id: null, duration_minutes: 10 },
          // Points at a stack row that is not there. The foreign key makes this
          // unreachable in production; it is here so the identity below is
          // proved rather than assumed.
          { id: "ws-3", engagement_id: ENG_LEDGER, stack_id: "stack-ghost", duration_minutes: 10 },
        ],
      }),
    });

    const { blindness, stacks } = await loadStackRegister(client);

    expect(blindness.sessionsOnUnknownStack).toBe(1);
    expect(blindness.sessionsTotal).toBe(
      blindness.sessionsWithStack + blindness.sessionsWithoutStack,
    );
    expect(blindness.sessionsWithStack).toBe(
      stacks.reduce((total, stack) => total + stack.sessions, 0) +
        blindness.sessionsOnUnknownStack,
    );
  });

  it("says nothing has been captured, rather than rendering an empty table", async () => {
    const { db: client } = db({ tables: { stack: [], work_session: [], audit_log: [] } });
    const register = await loadStackRegister(client);

    expect(register.state).toBe("no-sessions");
    expect(register.stacks).toEqual([]);
    expect(register.blindness.sessionsTotal).toBe(0);
  });

  it("distinguishes captured-but-unattributable from captured-nothing", async () => {
    const { db: client } = db({
      tables: {
        stack: [],
        work_session: [
          { id: "ws-1", engagement_id: ENG_LEDGER, stack_id: null, duration_minutes: 30 },
        ],
        audit_log: [],
      },
    });

    const register = await loadStackRegister(client);
    // Work was seen. None of it names a stack. That is a third claim, and it is
    // neither "empty" nor "nothing qualified".
    expect(register.state).toBe("no-stacks");
    expect(register.blindness.sessionsTotal).toBe(1);
    expect(register.blindness.sessionsWithoutStack).toBe(1);
  });

  it("reports `observed` once a stack is in the register, even with zero hours on it", async () => {
    const register = await loadStackRegister(db().db);
    expect(register.state).toBe("observed");
  });

  it("carries FR-106's thresholds so the sentence and the comparison share one source", async () => {
    const register = await loadStackRegister(db().db);
    expect(register.thresholds).toEqual({ minEngagements: 2, minHours: 8 });
  });

  it("carries limb two's unevaluated notice once, for the screen", async () => {
    const register = await loadStackRegister(db().db);
    expect(register.blockingMilestone.evaluated).toBe(false);
    expect("met" in register.blockingMilestone).toBe(false);
  });
});

describe("Q25 — every work_session row counts, with no filter", () => {
  it("counts a session whatever its `source` says", async () => {
    const { db: client } = db({
      tables: ledger({
        work_session: [
          {
            id: "ws-1",
            engagement_id: ENG_LEDGER,
            stack_id: STACK_NEXT,
            duration_minutes: 60,
            source: "session-hook",
          },
          {
            id: "ws-2",
            engagement_id: ENG_LEDGER,
            stack_id: STACK_NEXT,
            duration_minutes: 60,
            source: "some-future-writer",
          },
        ],
      }),
    });

    const register = await loadStackRegister(client);
    // If this layer ever narrows by `source`, executor or mode, this goes red —
    // which is the point. The screen's "all of these are Mode 2 capture"
    // sentence is only checkable while the count behind it is unfiltered.
    expect(register.blindness.sessionsTotal).toBe(2);
    expect(register.stacks[0].minutes).toBe(120);
  });
});

describe("the reads are exhaustive or they fail loudly", () => {
  it("pages past PostgREST's cap instead of stopping at the first short page", async () => {
    const { db: client } = db({
      maxRows: 1,
      tables: ledger({
        work_session: [
          { id: "ws-1", engagement_id: ENG_LEDGER, stack_id: STACK_NEXT, duration_minutes: 60 },
          { id: "ws-2", engagement_id: ENG_OTHER, stack_id: STACK_NEXT, duration_minutes: 60 },
          { id: "ws-3", engagement_id: ENG_LEDGER, stack_id: null, duration_minutes: 60 },
        ],
      }),
    });

    const register = await loadStackRegister(client);

    // Without paging the fake truncates to one row and reports success, exactly
    // as PostgREST does — the register would say 60 minutes, one session, one
    // engagement, and nothing would be wrong at the call site. This test is that
    // control: the numbers below are only reachable through `fetchAllRows`.
    expect(register.blindness.sessionsTotal).toBe(3);
    expect(register.stacks[0].minutes).toBe(120);
    expect(register.stacks[0].sessions).toBe(2);
    expect(register.stacks[0].engagements).toBe(2);
    expect(register.blindness.sessionsWithoutStack).toBe(1);
  });

  it("throws rather than returning a partial register when `stack` cannot be read", async () => {
    const { db: client } = db({ fail: { stack: { message: "boom" } } });
    await expect(loadStackRegister(client)).rejects.toThrow(/could not read stack/);
  });

  it("throws rather than reporting zero hours when `work_session` cannot be read", async () => {
    // The failure mode this refuses: a refused session read rendering as "no
    // stack has earned anything", which is the register's headline claim.
    const { db: client } = db({ fail: { work_session: { message: "boom" } } });
    await expect(loadStackRegister(client)).rejects.toThrow(/could not read work_session/);
  });
});

describe("§7a — `work_session.summary` is never read", () => {
  it("declares a denylist covering every bytea column on the tables it touches", () => {
    expect([...CIPHERTEXT_COLUMNS].sort()).toEqual([
      "description",
      "raw_status",
      "summary",
    ]);
  });

  it("asks for no ciphertext column in any projection it actually issues", async () => {
    const { db: client, fake } = db();
    await loadStackRegister(client);

    expect(fake.projections.length).toBeGreaterThan(0);
    for (const { table, columns } of fake.projections) {
      const named = new Set(projectionColumns(columns));
      expect(
        CIPHERTEXT_COLUMNS.filter((column) => named.has(column)),
        `the read of ${table} asked for "${columns}", which names a §7a ` +
          `ciphertext column. A register of hours renders no prose.`,
      ).toEqual([]);
    }
  });

  it("CONTROL — the same check catches a projection that does name one", () => {
    const named = new Set(projectionColumns("id, stack_id, duration_minutes, summary"));
    expect(CIPHERTEXT_COLUMNS.filter((column) => named.has(column))).toEqual(["summary"]);
  });

  it("issues no `decrypt_field` RPC at all", async () => {
    const { db: client, fake } = db();
    await loadStackRegister(client);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("puts no summary on any returned row, even though the fixture rows carry one", async () => {
    const register = await loadStackRegister(db().db);
    // The fixture's `work_session` rows hold a `summary`. Nothing in the result
    // does, at any depth — the register result type is built from counts rather
    // than by extending the rows it was assembled from.
    expect(JSON.stringify(register)).not.toContain("enc:");
    expect(JSON.stringify(register)).not.toContain("summary");
  });
});

describe("FR-109 — the operator sets `agent_covering`, and nothing infers it", () => {
  it("stores the value and returns the stored row", async () => {
    const { db: client, fake } = db();
    const update = await setAgentCovering(client, "op-1", STACK_NEXT, "api-integrator");

    expect(update).toEqual({
      id: STACK_NEXT,
      name: "nextjs-supabase",
      agentCovering: "api-integrator",
    });
    expect(fake.tables.stack[0].agent_covering).toBe("api-integrator");
  });

  it("clears the value when handed nothing, which is a real operation", async () => {
    const { db: client, fake } = db({
      tables: ledger({
        stack: [
          {
            id: STACK_NEXT,
            name: "nextjs-supabase",
            agent_covering: "api-integrator",
            first_seen_at: null,
            last_seen_at: null,
          },
        ],
      }),
    });

    const update = await setAgentCovering(client, "op-1", STACK_NEXT, "   ");
    expect(update.agentCovering).toBeNull();
    expect(fake.tables.stack[0].agent_covering).toBeNull();
  });

  it("records the write in the audit log, carrying the target and not the value", async () => {
    const { db: client, fake } = db();
    await setAgentCovering(client, "op-1", STACK_NEXT, "api-integrator");

    expect(fake.tables.audit_log).toHaveLength(1);
    const [row] = fake.tables.audit_log;
    expect(row.actor).toBe("op-1");
    expect(row.actor_type).toBe("operator");
    expect(row.action).toBe("stack.agent_covering.set");
    expect(row.target_table).toBe("stack");
    expect(row.target_id).toBe(STACK_NEXT);
    expect(row.outcome).toBe("allowed");
    // FR-59: "with no record contents". The value is a record content; that it
    // changed, and who changed it, is the audit fact.
    expect(JSON.stringify(row)).not.toContain("api-integrator");
  });

  it("refuses an id that matches nothing instead of reporting a silent success", async () => {
    // A PostgREST `update` matching zero rows succeeds with no error and no
    // signal. Without `.select().maybeSingle()` this call would return happily
    // having written nothing at all.
    const { db: client, fake } = db();
    await expect(setAgentCovering(client, "op-1", "stack-ghost", "api-integrator"))
      .rejects.toThrow(ApiError);
    expect(fake.tables.audit_log).toHaveLength(0);
  });

  it("CONTROL — the fake's update really does match nothing and report success", async () => {
    // Proves the refusal above comes from the row check and not from the fake
    // erroring on its own.
    const { fake } = db();
    const result = await fake.from("stack").update({ agent_covering: "x" }).eq("id", "stack-ghost");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
});

describe("FR-109 — what the operator may type", () => {
  it("trims, and treats an empty field as `null` rather than as an empty agent name", () => {
    expect(normaliseAgentCovering("  api-integrator  ")).toBe("api-integrator");
    expect(normaliseAgentCovering("")).toBeNull();
    expect(normaliseAgentCovering("   ")).toBeNull();
    expect(normaliseAgentCovering(null)).toBeNull();
  });

  it("accepts a name at the ceiling and refuses one past it", () => {
    const atLimit = "a".repeat(AGENT_COVERING_MAX);
    expect(normaliseAgentCovering(atLimit)).toBe(atLimit);
    expect(() => normaliseAgentCovering("a".repeat(AGENT_COVERING_MAX + 1))).toThrow(
      ApiError,
    );
  });

  it("refuses a line break, which is a paste accident and invisible in a table cell", () => {
    expect(() => normaliseAgentCovering("api-integrator\nui-designer")).toThrow(ApiError);
  });

  it("validates nothing against a list of agents, because the product cannot read one", () => {
    // FR-109's whole reason: `~/.claude/agents/` is outside this repository and
    // unreadable from a worktree. A name nobody recognises is stored as typed.
    expect(normaliseAgentCovering("an-agent-that-does-not-exist")).toBe(
      "an-agent-that-does-not-exist",
    );
  });
});
