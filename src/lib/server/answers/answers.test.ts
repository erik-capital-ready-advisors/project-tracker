// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import { agentScopedDb } from "@/lib/api";
import { parseTestTags } from "@/lib/ingest/testTags";

import { createFakeAnswerDb, resetFakeAnswerIds } from "./__fixtures__/fake-answer-db";
import type { FakeAnswerDb, FakeRow } from "./__fixtures__/fake-answer-db";
import { BUILDER, CERTIFIER, ENGAGEMENT, ledger } from "./__fixtures__/ledger";
import { blockedAnswer } from "./blocked";
import { bottleneckAnswer } from "./bottleneck";
import { brokenAnswer } from "./broken";
import { committedAnswer } from "./committed";
import type { AnswerDb, CensusDb } from "./db";
import {
  parseBlockedFilters,
  parseBrokenFilters,
  parseCommittedFilters,
  parseNextFilters,
} from "./filters";
import {
  handleBlocked,
  handleBroken,
  handleCommitted,
  handleUntested,
} from "./handlers";
import { nextAnswer } from "./next";
import { unparsedCensus } from "./unparsed";
import { untestedAnswer } from "./untested";

const TODAY = "2026-08-19";

function db(overrides: Record<string, FakeRow[]> = {}, options = {}): AnswerDb {
  const tables = { ...ledger(), ...overrides };
  return createFakeAnswerDb({ tables, ...options }) as unknown as AnswerDb;
}

function fake(overrides: Record<string, FakeRow[]> = {}, options = {}): FakeAnswerDb {
  const tables = { ...ledger(), ...overrides };
  return createFakeAnswerDb({ tables, ...options });
}

const NO_FILTER = { engagement: null };

beforeEach(() => {
  resetFakeAnswerIds();
});

// ---------------------------------------------------------------------------
// FR-47 / FR-48 / FR-49 / FR-55 — the four coverage states
// ---------------------------------------------------------------------------

describe("FR-48 untested reports the four coverage states separately", () => {
  it("FR-47 accepts a certifier who executed OTHER work but not the work under test", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    // `qa-reviewer` is itself an executor (it built w2). It certified t1, which
    // covers FR-1, which `api-integrator` built. The correct join compares the
    // certifier only against w1's executor, so this is legitimate coverage.
    // The widened join — certifier against every executor in the input — would
    // report FR-1 self-certified and uncovered instead. See mutation 1.
    expect(acme?.uncovered).not.toContain("FR-1");
    expect(acme?.mapped).toBe(1);
  });

  it("FR-47 reports a test whose certifier built the work it covers as self-certified", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    // t3 covers FR-1 and is certified by `api-integrator`, which built w1.
    expect(acme?.selfCertified).toContain("t3");
    // t2 covers FR-2 and is certified by `qa-reviewer`, which built w2.
    expect(acme?.selfCertified).toContain("t2");
    // t1 and t4 are certified independently and must NOT appear.
    expect(acme?.selfCertified).not.toContain("t1");
    expect(acme?.selfCertified).not.toContain("t4");
  });

  it("FR-49 reports a not-verified requirement as unproven, distinctly from uncovered", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    expect(acme?.unproven).toEqual(["FR-3"]);
    expect(acme?.uncovered).toContain("FR-3");
    // Unproven and uncovered are different claims and both are reported. FR-3
    // has a passing, independently certified test; what it lacks is evidence.
    expect(acme?.uncovered).toContain("FR-4");
    expect(acme?.unproven).not.toContain("FR-4");
  });

  it("FR-48 counts requirements, tests and mapped separately", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    expect(acme?.requirements).toBe(4);
    expect(acme?.tests).toBe(4);
    expect(acme?.mapped).toBe(1);
  });

  it("FR-55 links each uncovered requirement to the work item implementing it", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    const four = acme?.uncoveredDetail.find((one) => one.ref === "FR-4");
    expect(four?.implementedBy.map((one) => one.id)).toEqual(["w4"]);
    expect(four?.implementedBy[0].executor).toBe(BUILDER);
  });

  it("FR-48 reports per engagement and never merges them", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    expect(answer.engagements.map((one) => one.engagement).sort()).toEqual([
      "acme",
      "other",
    ]);
    expect(
      answer.engagements.find((one) => one.engagement === "other")?.requirements,
    ).toBe(0);
  });

  it("resolves self-certified test ids to records carrying FR-46's certifier", async () => {
    const answer = await untestedAnswer(db(), NO_FILTER);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    const detail = acme?.selfCertifiedDetail.find((one) => one.id === "t3");

    expect(detail?.harness).toBe("vitest");
    expect(detail?.certifiedBy).toBe(CERTIFIER);
    expect(detail?.authoredBy).toBe(BUILDER);
  });
});

// ---------------------------------------------------------------------------
// FR-50 / FR-51 / FR-70 / FR-75 / FR-79 — Committed
// ---------------------------------------------------------------------------

describe("FR-50 / FR-51 committed derives the invoice gate", () => {
  const filters = { engagement: null, state: null, environment: null };

  it("FR-50 reports a milestone billable only when its criteria are covered under FR-47", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });
    expect(answer.milestones.find((one) => one.milestone === "m1")?.state).toBe(
      "billable",
    );
  });

  it("FR-51 reports a milestone covered only by self-certified tests as claimed", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });
    const m2 = answer.milestones.find((one) => one.milestone === "m2");

    // FR-2's only passing test is certified by the executor who built it.
    // `claimed` is a review request, not an invoice, and must never read
    // `billable`.
    expect(m2?.state).toBe("claimed");
    expect(m2?.state).not.toBe("billable");
  });

  it("reports a milestone with an untested criterion as open", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });
    const m3 = answer.milestones.find((one) => one.milestone === "m3");
    expect(m3?.state).toBe("open");
    expect(m3?.notCovered.sort()).toEqual(["FR-3", "FR-4"]);
  });

  it("FR-75 asks covered and shipped as two questions and never collapses them", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });
    const m1 = answer.milestones.find((one) => one.milestone === "m1");
    const m2 = answer.milestones.find((one) => one.milestone === "m2");

    // FR-1 is both covered and shipped.
    expect(m1?.covered).toEqual(["FR-1"]);
    expect(m1?.shipped).toEqual(["FR-1"]);
    expect(m1?.shippedEnvironments["FR-1"]).toEqual(["production"]);

    // FR-2 is claimed but has shipped nowhere. Built and deployed are different
    // claims and this row is the proof the system keeps them apart.
    expect(m2?.shipped).toEqual([]);
    expect(m2?.notShipped).toEqual(["FR-2"]);
  });

  it("FR-75 narrows shipped to one environment when asked", async () => {
    const answer = await committedAnswer(
      db(),
      { ...filters, environment: "preview" },
      { today: TODAY },
    );
    // The only release is to production, so nothing is shipped to preview.
    expect(answer.milestones.find((one) => one.milestone === "m1")?.shipped).toEqual([]);
  });

  it("FR-79 flags a billable milestone contested by an open critical defect", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });
    const m1 = answer.milestones.find((one) => one.milestone === "m1");

    // d1 is critical, open, and names FR-1 — one of m1's acceptance criteria.
    expect(m1?.contested).toBe(true);
    expect(m1?.contestingDefects).toEqual(["d1"]);
    // Contested is billable AND flagged, never a downgrade to un-billable.
    expect(m1?.state).toBe("billable");
  });

  it("FR-70 closes the invoice gate when a covering test goes red", async () => {
    const rows = ledger();
    const withRegression = {
      test_result: [
        ...rows.test_result,
        {
          id: "tr-5",
          test_case_id: "t1",
          status: "fail",
          evidence_scope: "observed_live",
          evidence_ref: null,
          run_at: "2026-08-19T10:00:00Z",
          certified_by: CERTIFIER,
        },
      ],
    };

    const answer = await committedAnswer(db(withRegression), filters, { today: TODAY });
    // t1 was FR-1's only independently certified pass. Its latest result is now
    // a failure, so FR-1 loses coverage and m1 leaves billable on its own — no
    // rule produces this, FR-50's condition simply stops holding.
    expect(answer.milestones.find((one) => one.milestone === "m1")?.state).not.toBe(
      "billable",
    );
  });

  it("decrypts amounts server-side and totals them in TypeScript", async () => {
    const answer = await committedAnswer(db(), filters, { today: TODAY });

    expect(answer.milestones.find((one) => one.milestone === "m1")?.amount).toBe(5000);
    expect(answer.totals.committed).toBe(15000);
    expect(answer.totals.billable).toBe(5000);
    expect(answer.totals.currency).toBe("USD");
  });

  it("reports an amount that will not decrypt as null and unreadable, never as 0", async () => {
    const answer = await committedAnswer(
      db({}, { decrypt: (value: string) => (value === "enc:5000" ? null : value.slice(4)) }),
      filters,
      { today: TODAY },
    );
    const m1 = answer.milestones.find((one) => one.milestone === "m1");

    expect(m1?.amount).toBeNull();
    expect(m1?.amountUnreadable).toBe(true);
    // Excluded from the total rather than counted as zero: a total that quietly
    // omits an unreadable row is a smaller number that looks complete, so the
    // omission is counted instead.
    expect(answer.totals.committed).toBe(10000);
    expect(answer.totals.unreadable).toBe(1);
  });

  it("filters by state", async () => {
    const answer = await committedAnswer(
      db(),
      { ...filters, state: "claimed" },
      { today: TODAY },
    );
    expect(answer.milestones.map((one) => one.milestone)).toEqual(["m2"]);
  });
});

// ---------------------------------------------------------------------------
// §7a — the contract_milestone refusal, through the real enforcement
// ---------------------------------------------------------------------------

describe("§7a refuses agent tokens contract_milestone", () => {
  it("throws forbidden_table when Committed is computed through an agent-scoped client", async () => {
    const scoped = agentScopedDb(fake() as unknown as object) as unknown as AnswerDb;

    await expect(
      committedAnswer(
        scoped,
        { engagement: null, state: null, environment: null },
        { today: TODAY },
      ),
    ).rejects.toMatchObject({
      code: "forbidden_table",
      status: 403,
    });
  });

  it("the same scoped client serves the other answers normally", async () => {
    // The negative control. Without it, the assertion above would also pass
    // against a client that refused everything, which would prove nothing about
    // the scoping and everything about the fake being broken.
    const scoped = agentScopedDb(fake() as unknown as object) as unknown as AnswerDb;

    const answer = await untestedAnswer(scoped, NO_FILTER);
    expect(
      answer.engagements.find((one) => one.engagement === ENGAGEMENT)?.requirements,
    ).toBe(4);
  });

  it("never selects an engagement column §7a withholds from agents", async () => {
    const client = fake();
    const scoped = agentScopedDb(client as unknown as object) as unknown as AnswerDb;
    await untestedAnswer(scoped, NO_FILTER);

    const engagementReads = client.projections.filter(
      (one) => one.table === "engagement",
    );
    expect(engagementReads.length).toBeGreaterThan(0);
    for (const read of engagementReads) {
      expect(read.columns).not.toContain("*");
      expect(read.columns).not.toContain("repo_path");
      expect(read.columns).not.toContain("source");
    }
  });

  it("selects an encrypted column ONLY where the requirement needs its prose", async () => {
    const client = fake();
    await Promise.all([
      untestedAnswer(client as unknown as AnswerDb, NO_FILTER),
      brokenAnswer(client as unknown as AnswerDb, {
        engagement: null,
        severity: null,
      }),
      blockedAnswer(client as unknown as AnswerDb, {
        engagement: null,
        owner: null,
        disposition: null,
      }, { today: TODAY }),
    ]);

    // §7a's pgcrypto columns. `defect.title` is clear by CR-001 §4's stated
    // exception and IS selected, which is why it is not in this list.
    const forbidden = [
      "description",
      "raw_status",
      "wont_fix_reason",
      "best_guess",
      "summary",
    ];

    /**
     * This guard used to read "never selects an encrypted column on ANY answer
     * path", and it was correct until 2026-08-20 — at which point it was also
     * why Blocked could tell Erik that `c1` was blocked and not what was
     * blocking it. FR-52, FR-53 and FR-56 ask what a work item IS.
     *
     * So the rule is narrowed rather than dropped: `work_item.description` and
     * `blocker.description` may be selected by the three screens that need
     * prose, and §7a permits it — both rows read "operator, agents, decrypted
     * server-side". Every other encrypted column stays unselected on every
     * path, and the two that are now allowed must still reach a caller
     * DECRYPTED, which the tests below assert separately.
     *
     * `contract_milestone` was already exempt: its amounts are decrypted to be
     * totalled.
     */
    const proseAllowed = new Set(["work_item", "blocker"]);
    for (const read of client.projections) {
      if (read.table === "contract_milestone") continue;
      for (const column of forbidden) {
        if (column === "description" && proseAllowed.has(read.table)) continue;
        expect(`${read.table}: ${read.columns}`).not.toContain(column);
      }
    }

    // The narrowing is bounded: nothing else gained a description selection.
    const describers = new Set(
      client.projections
        .filter((one) => one.columns.includes("description"))
        .map((one) => one.table),
    );
    for (const table of describers) {
      expect([...proseAllowed, "contract_milestone"]).toContain(table);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-52 — Blocked
// ---------------------------------------------------------------------------

describe("FR-52 blocked groups by owner with elapsed time and disposition", () => {
  const filters = { engagement: null, owner: null, disposition: null };

  it("files a blocker with no stated owner under erik, never under the client", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    const erik = answer.groups.find((one) => one.owner === "erik");

    // blk-1 states no owner. `DEFAULT_BLOCKER_OWNER` is `erik` — Erik's own
    // decision, overriding plan.md's hardcoded `client`. Defaulting to the
    // client would file his own work under someone else's name on the one
    // screen that separates the two.
    expect(erik?.items.map((one) => one.id)).toContain("w5");
  });

  it("uses the stated owner where the artifact names one", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    expect(answer.groups.map((one) => one.owner)).toContain("apple");
    expect(
      answer.groups.find((one) => one.owner === "apple")?.waits.map((one) => one.id),
    ).toEqual(["wait-1"]);
  });

  it("reports every reason an item is held rather than collapsing them", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    const w5 = answer.groups
      .flatMap((one) => one.items)
      .find((one) => one.id === "w5");
    const w6 = answer.groups
      .flatMap((one) => one.items)
      .find((one) => one.id === "w6");

    expect(w5?.heldBy).toEqual(["blocker"]);
    expect(w5?.blockerRef).toBe("B1");
    expect(w6?.heldBy).toEqual(["wait"]);
    expect(w6?.waitLabel).toBe("App Store review");
  });

  it("does not list an item held only by a RESOLVED blocker", async () => {
    const rows = ledger();
    const resolved = {
      work_item: rows.work_item.map((one) =>
        one.id === "w5" ? { ...one, blocker_id: "blk-2" } : one,
      ),
    };
    const answer = await blockedAnswer(db(resolved), filters, { today: TODAY });
    expect(answer.groups.flatMap((one) => one.items).map((one) => one.id)).not.toContain(
      "w5",
    );
  });

  it("reports elapsed whole days from a full timestamp without producing NaN", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    const w5 = answer.groups
      .flatMap((one) => one.items)
      .find((one) => one.id === "w5");

    // 2026-08-01 → 2026-08-19.
    expect(w5?.daysElapsed).toBe(18);
    expect(Number.isNaN(w5?.daysElapsed as number)).toBe(false);
  });

  it("marks a wait past its expected-by date as overdue", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    const wait = answer.groups.flatMap((one) => one.waits).find((one) => one.id === "wait-1");

    expect(wait?.overdue).toBe(true);
    expect(wait?.daysWaiting).toBe(14);
    expect(wait?.blocks).toEqual(["w6"]);
  });

  it("lists an open wait that holds no work item at all", async () => {
    const answer = await blockedAnswer(db(), filters, { today: TODAY });
    // wait-2 blocks nothing. It is still something Erik is waiting on, and
    // dropping it would make the screen quieter than the situation.
    expect(answer.groups.flatMap((one) => one.waits).map((one) => one.id)).toContain(
      "wait-2",
    );
  });

  it("carries FR-52's disposition and filters on it", async () => {
    const answer = await blockedAnswer(
      db(),
      { ...filters, disposition: "carried" },
      { today: TODAY },
    );
    const items = answer.groups.flatMap((one) => one.items);
    expect(items.every((one) => one.disposition === "carried")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-53 — Next
// ---------------------------------------------------------------------------

describe("FR-53 next lists only work that is genuinely ready", () => {
  const filters = { engagement: null, limit: 50 };

  it("offers an item with no dependencies and nothing holding it", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: true });
    expect(answer.items.map((one) => one.id)).toContain("w4");
  });

  it("withholds an item an open blocker or wait holds", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: true });
    const ids = answer.items.map((one) => one.id);
    expect(ids).not.toContain("w5");
    expect(ids).not.toContain("w6");
    expect(answer.heldByBlocker).toBe(2);
  });

  it("withholds an item whose dependency is not done", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: true });
    // w8 depends on w7, which is pending.
    expect(answer.items.map((one) => one.id)).not.toContain("w8");
    expect(answer.heldByDependency).toBeGreaterThan(0);
  });

  it("treats an unparsed dependency as unsatisfied rather than as satisfied", async () => {
    const rows = ledger();
    const dependsOnUnparsed = {
      work_item_dependency: [
        ...rows.work_item_dependency,
        { id: "dep-3", work_item_id: "w4", depends_on_id: "w10" },
      ],
    };
    const answer = await nextAnswer(db(dependsOnUnparsed), filters, {
      today: TODAY,
      milestones: true,
    });
    // w10's status could not be classified. Treating that as satisfied would put
    // work on the "start this" list on the strength of a status nobody read.
    expect(answer.items.map((one) => one.id)).not.toContain("w4");
  });

  it("counts unparsed candidates rather than dropping them silently", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: true });
    expect(answer.unparsedCandidates).toBe(1);
    expect(answer.items.map((one) => one.id)).not.toContain("w10");
  });

  it("orders by the nearest dated milestone when milestones are readable", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: true });
    expect(answer.ordering).toBe("milestone-due-date");
    expect(answer.orderingUnavailableReason).toBeNull();
    // w4 implements FR-4, which m3 (undated) names. w7 implements nothing.
    expect(answer.items.find((one) => one.id === "w4")?.nearestMilestone?.id).toBe("m3");
  });

  it("says the ordering is a fallback when the caller may not read milestones", async () => {
    const answer = await nextAnswer(db(), filters, { today: TODAY, milestones: false });

    // The whole point: a list ordered by something else must not claim FR-53's
    // ordering. Erik acts on the top row.
    expect(answer.ordering).toBe("fallback");
    expect(answer.orderingUnavailableReason).toContain("§7a");
    expect(answer.items.every((one) => one.nearestMilestone === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-56 — Bottleneck
// ---------------------------------------------------------------------------

describe("FR-56 bottleneck ranks Erik's own work by what it unblocks", () => {
  const filters = { engagement: null, limit: 50 };

  it("selects only erik and erik_gate executor kinds", async () => {
    const answer = await bottleneckAnswer(db(), filters, {
      today: TODAY,
      milestones: true,
    });
    expect(answer.items.map((one) => one.id)).toEqual(["w7"]);
    expect(answer.items[0].executorKind).toBe("erik_gate");
  });

  it("counts transitive downstream work, not only direct dependents", async () => {
    const answer = await bottleneckAnswer(db(), filters, {
      today: TODAY,
      milestones: true,
    });
    // w8 depends on w7; w9 depends on w8. Doing w7 moves two pieces of work.
    expect(answer.items[0].unblocks).toBe(2);
    expect(answer.items[0].directDependents).toBe(1);
  });

  it("terminates on a dependency cycle instead of looping forever", async () => {
    const rows = ledger();
    const cyclic = {
      work_item_dependency: [
        ...rows.work_item_dependency,
        { id: "dep-x", work_item_id: "w7", depends_on_id: "w9" },
      ],
    };
    const answer = await bottleneckAnswer(db(cyclic), filters, {
      today: TODAY,
      milestones: true,
    });
    expect(answer.items[0].unblocks).toBe(2);
  });

  it("carries FR-29's unautomated reason and FR-30's disposition", async () => {
    const answer = await bottleneckAnswer(db(), filters, {
      today: TODAY,
      milestones: true,
    });
    expect(answer.items[0].unautomatedReason).toBe("no-agent-for-stack");
    expect(answer.items[0].disposition).toBe("carried");
  });

  it("says the ranking is degraded when the caller may not read milestones", async () => {
    const answer = await bottleneckAnswer(db(), filters, {
      today: TODAY,
      milestones: false,
    });
    expect(answer.ranking).toBe("unblocks-only");
    expect(answer.rankingDegradedReason).toContain("§7a");
  });
});

// ---------------------------------------------------------------------------
// FR-71 — Broken
// ---------------------------------------------------------------------------

describe("FR-71 broken lists derived-open defects and both regression kinds", () => {
  const filters = { engagement: null, severity: null };

  it("groups open defects by severity with unparsed among the groups", async () => {
    const answer = await brokenAnswer(db(), filters);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    expect(acme?.bySeverity.map((one) => one.severity)).toEqual([
      "critical",
      "major",
      "minor",
      "unparsed",
    ]);
    expect(
      acme?.bySeverity.find((one) => one.severity === "critical")?.defects.map((d) => d.id),
    ).toEqual(["d1"]);
    // FR-64: an ungraded finding is a bucket, never a filtered-out remainder.
    expect(
      acme?.bySeverity.find((one) => one.severity === "unparsed")?.defects.map((d) => d.id),
    ).toEqual(["d2"]);
  });

  it("FR-66 keeps a defect open when only its fixer's own test passes", async () => {
    const rows = ledger();
    // A test naming D-1, certified by the executor of the fixing work item (w1,
    // built by api-integrator). Self-certification does not clear a defect.
    const selfCertifiedFix = {
      test_case: [
        ...rows.test_case,
        {
          id: "t5",
          engagement_id: "eng-acme",
          harness: "vitest",
          file: "src/t5.test.ts",
          title: "D-1 checkout submits cleanly",
          covers: [],
          authored_by: BUILDER,
          certified_by: BUILDER,
        },
      ],
      test_result: [
        ...rows.test_result,
        {
          id: "tr-6",
          test_case_id: "t5",
          status: "pass",
          evidence_scope: "observed_live",
          evidence_ref: null,
          run_at: "2026-08-19T09:00:00Z",
          certified_by: BUILDER,
        },
      ],
    };

    const answer = await brokenAnswer(db(selfCertifiedFix), filters);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    const d1 = acme?.bySeverity
      .flatMap((one) => one.defects)
      .find((one) => one.id === "d1");

    expect(d1).toBeDefined();
    expect(d1?.status).not.toBe("verified");
    expect(d1?.blockedBy).toBe("self-certified");
    expect(d1?.selfCertifiedTests).toEqual(["t5"]);
  });

  it("FR-66 clears a defect when an independent certifier's test passes", async () => {
    const rows = ledger();
    const independentFix = {
      test_case: [
        ...rows.test_case,
        {
          id: "t5",
          engagement_id: "eng-acme",
          harness: "vitest",
          file: "src/t5.test.ts",
          title: "D-1 checkout submits cleanly",
          covers: [],
          authored_by: BUILDER,
          certified_by: CERTIFIER,
        },
      ],
      test_result: [
        ...rows.test_result,
        {
          id: "tr-6",
          test_case_id: "t5",
          status: "pass",
          evidence_scope: "observed_live",
          evidence_ref: null,
          run_at: "2026-08-19T09:00:00Z",
          certified_by: CERTIFIER,
        },
      ],
    };

    const answer = await brokenAnswer(db(independentFix), filters);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    expect(
      acme?.bySeverity.flatMap((one) => one.defects).map((one) => one.id),
    ).not.toContain("d1");
  });

  it("FR-71 links each open defect to its requirement, work item and tests", async () => {
    const answer = await brokenAnswer(db(), filters);
    const d1 = answer.engagements
      .flatMap((one) => one.bySeverity)
      .flatMap((one) => one.defects)
      .find((one) => one.id === "d1");

    expect(d1?.requirementRef).toBe("FR-1");
    expect(d1?.workItem?.id).toBe("w1");
    expect(d1?.workItem?.executor).toBe(BUILDER);
  });

  it("FR-69 reports a test regression and a requirement regression independently", async () => {
    const rows = ledger();
    const regressed = {
      test_result: [
        ...rows.test_result,
        {
          id: "tr-5",
          test_case_id: "t1",
          status: "fail",
          evidence_scope: "observed_live",
          evidence_ref: null,
          run_at: "2026-08-19T10:00:00Z",
          certified_by: CERTIFIER,
        },
      ],
    };

    const answer = await brokenAnswer(db(regressed), filters);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    expect(acme?.testRegressions.map((one) => one.testId)).toEqual(["t1"]);
    expect(acme?.testRegressions[0].lastPassedAt).toBe("2026-08-18T10:00:00Z");
    expect(acme?.requirementRegressions.map((one) => one.ref)).toEqual(["FR-1"]);
    expect(acme?.requirementRegressions[0].implementedBy.map((one) => one.id)).toEqual([
      "w1",
    ]);
  });

  it("does not call a test that has only ever failed a regression", async () => {
    const rows = ledger();
    const neverPassed = {
      test_result: rows.test_result.map((one) =>
        one.id === "tr-4" ? { ...one, status: "fail" } : one,
      ),
    };
    const answer = await brokenAnswer(db(neverPassed), filters);
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    expect(acme?.testRegressions.map((one) => one.testId)).not.toContain("t4");
  });

  it("filters by severity", async () => {
    const answer = await brokenAnswer(db(), { engagement: null, severity: "critical" });
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    expect(acme?.bySeverity.map((one) => one.severity)).toEqual(["critical"]);
  });
});

// ---------------------------------------------------------------------------
// The read mappings, whose whole job is to fail in the safe direction
// ---------------------------------------------------------------------------

describe("an unreadable stored value never rounds up into evidence", () => {
  /** Replace FR-1's only independently certified result with `overrides`. */
  function withFirstResult(overrides: Record<string, unknown>) {
    const rows = ledger();
    return {
      test_result: rows.test_result.map((one) =>
        one.id === "tr-1" ? { ...one, ...overrides } : one,
      ),
    };
  }

  it("treats a result with NO recorded evidence scope as not-verified, not as asserted", async () => {
    const answer = await untestedAnswer(
      db(withFirstResult({ evidence_scope: null })),
      NO_FILTER,
    );
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    // `evidence_scope` is nullable in Postgres and the domain type is not, so
    // this mapping is a decision. Mapping null to `asserted` would let a result
    // that never said what it observed establish FR-47 coverage — and that flows
    // straight into FR-50 billability. It becomes `unproven` instead.
    expect(acme?.uncovered).toContain("FR-1");
    expect(acme?.unproven).toContain("FR-1");
  });

  it("does not let an unparsed result count as a pass", async () => {
    const answer = await untestedAnswer(
      db(withFirstResult({ status: "unparsed" })),
      NO_FILTER,
    );
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    // The stored enum has four members and the domain has three. `unparsed`
    // lands on `not_run` — neither evidence nor a regression. Rounding it up to
    // `pass` is the wrong `done` this whole product exists to prevent.
    expect(acme?.uncovered).toContain("FR-1");
    expect(acme?.mapped).toBe(0);
  });

  it("does not let a skipped result count as a pass", async () => {
    const answer = await untestedAnswer(
      db(withFirstResult({ status: "skipped" })),
      NO_FILTER,
    );
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    expect(acme?.uncovered).toContain("FR-1");
  });

  it("does not report an unparsed latest result as an FR-69 regression either", async () => {
    const rows = ledger();
    const answer = await brokenAnswer(
      db({
        test_result: [
          ...rows.test_result,
          {
            id: "tr-7",
            test_case_id: "t1",
            status: "unparsed",
            evidence_scope: null,
            evidence_ref: null,
            run_at: "2026-08-19T10:00:00Z",
            certified_by: CERTIFIER,
          },
        ],
      }),
      { engagement: null, severity: null },
    );
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);

    // A test whose latest run nobody could read stops proving anything — so
    // FR-1 loses coverage — but it is not a *failure*, so it is not a test
    // regression. Both halves matter and they are asserted together.
    expect(acme?.testRegressions.map((one) => one.testId)).not.toContain("t1");
    expect(acme?.requirementRegressions.map((one) => one.ref)).toContain("FR-1");
  });

  it("maps a database probe harness and marks an unknown one rather than calling it vitest", async () => {
    const rows = ledger();
    const answer = await untestedAnswer(
      db({
        test_case: rows.test_case.map((one) =>
          one.id === "t3"
            ? { ...one, harness: "database_probe" }
            : one.id === "t2"
              ? { ...one, harness: "smoke_signals" }
              : one,
        ),
      }),
      NO_FILTER,
    );
    const acme = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    const harnesses = new Map(
      acme?.selfCertifiedDetail.map((one) => [one.id, one.harness]),
    );

    expect(harnesses.get("t3")).toBe("db-probe");
    // `manual` is not a member of the Postgres enum, so it cannot collide with a
    // real stored value — which makes it a legible marker rather than a silent
    // mis-attribution to vitest.
    expect(harnesses.get("t2")).toBe("manual");
  });

  it("does not round an unrecognised executor kind into erik or erik_gate", async () => {
    const rows = ledger();
    const answer = await bottleneckAnswer(
      db({
        work_item: rows.work_item.map((one) =>
          one.id === "w4" ? { ...one, executor_kind: "some_future_kind" } : one,
        ),
      }),
      { engagement: null, limit: 50 },
      { today: TODAY, milestones: true },
    );

    // Rounding an unreadable kind into `erik_gate` would put phantom work on the
    // one screen that answers "what is Erik the bottleneck on".
    expect(answer.items.map((one) => one.id)).toEqual(["w7"]);
  });
});

// ---------------------------------------------------------------------------
// FR-58 — the one unparsed definition
// ---------------------------------------------------------------------------

describe("FR-58 the unparsed census is one definition across three tables", () => {
  it("counts unparsed work items, defects and test results as one total", async () => {
    const census = await unparsedCensus(db() as unknown as CensusDb);

    expect(census.workItems).toBe(1); // w10
    expect(census.defects).toBe(1); // d2, severity unparsed
    expect(census.testResults).toBe(0);
    expect(census.total).toBe(2);
  });

  it("counts a defect unparsed in BOTH columns exactly once", async () => {
    const rows = ledger();
    const both = {
      defect: rows.defect.map((one) =>
        one.id === "d2" ? { ...one, severity: "unparsed", status: "unparsed" } : one,
      ),
    };
    const census = await unparsedCensus(db(both) as unknown as CensusDb);

    // The population is records, not fields. Counting the row twice would
    // inflate the number with no corresponding record for Erik to go and look at.
    expect(census.defects).toBe(1);
    expect(census.total).toBe(2);
  });

  it("counts unparsed test results, which no other unit was counting", async () => {
    const rows = ledger();
    const unparsedResult = {
      test_result: [
        ...rows.test_result,
        {
          id: "tr-9",
          test_case_id: "t1",
          status: "unparsed",
          evidence_scope: null,
          evidence_ref: null,
          run_at: "2026-08-19T11:00:00Z",
          certified_by: null,
        },
      ],
    };
    const census = await unparsedCensus(db(unparsedResult) as unknown as CensusDb);
    expect(census.testResults).toBe(1);
    expect(census.total).toBe(3);
  });

  it("reports null rather than a partial total when one component cannot be counted", async () => {
    const client = createFakeAnswerDb({
      tables: ledger(),
      fail: { defect: { message: "relation defect does not exist" } },
    });
    const census = await unparsedCensus(client as unknown as CensusDb);

    expect(census.defects).toBeNull();
    expect(census.workItems).toBe(1);
    // NOT 1. A partial total understates, and an understated unparsed count is
    // indistinguishable from a healthy one.
    expect(census.total).toBeNull();
  });

  it("never reports an unknown count as zero", async () => {
    const client = createFakeAnswerDb({
      tables: ledger(),
      fail: { work_item: { message: "boom" } },
    });
    const census = await unparsedCensus(client as unknown as CensusDb);
    expect(census.total).not.toBe(0);
    expect(census.total).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Paging — the measured incident, applied
// ---------------------------------------------------------------------------

describe("every read pages against an exact count", () => {
  it("reads every work item when the row cap is far below the row count", async () => {
    const rows = ledger();
    const many = {
      work_item: [
        ...rows.work_item,
        ...Array.from({ length: 40 }, (_, index) => ({
          ...rows.work_item[0],
          id: `bulk-${index}`,
          unit: `bulk-${index}`,
          status: "pending",
          executor: "erik",
          executor_kind: "erik",
          blocker_id: null,
          external_wait_id: null,
        })),
      ],
    };

    const answer = await bottleneckAnswer(
      db(many, { maxRows: 3 }),
      { engagement: null, limit: 500 },
      { today: TODAY, milestones: true },
    );

    // 40 bulk erik items plus w7. A short-page termination condition would stop
    // at 3 and report a plausible, wrong, much shorter list.
    expect(answer.items.length).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("filters refuse what they cannot classify", () => {
  it("refuses an unknown query parameter rather than ignoring it", () => {
    // `?engagment=acme` — one letter wrong — would otherwise return every
    // engagement's rows and look filtered.
    expect(() =>
      parseBlockedFilters(new URL("https://x/api/answer/blocked?engagment=acme")),
    ).toThrow(/Unrecognised query parameter/);
  });

  it("refuses an unrecognised value rather than defaulting it", () => {
    expect(() =>
      parseCommittedFilters(new URL("https://x/api/answer/committed?state=invoiced")),
    ).toThrow(/not one of open, claimed, billable/);
    expect(() =>
      parseBrokenFilters(new URL("https://x/api/answer/broken?severity=blocker")),
    ).toThrow(/not one of critical, major, minor, unparsed/);
  });

  it("refuses a limit above the ceiling rather than clamping it silently", () => {
    expect(() =>
      parseNextFilters(new URL("https://x/api/answer/next?limit=9999")),
    ).toThrow(/capped at 500/);
    expect(() =>
      parseNextFilters(new URL("https://x/api/answer/next?limit=ten")),
    ).toThrow(/whole number/);
  });

  it("accepts the documented parameters", () => {
    const filters = parseBlockedFilters(
      new URL("https://x/api/answer/blocked?engagement=acme&owner=erik&disposition=carried"),
    );
    expect(filters).toEqual({
      engagement: "acme",
      owner: "erik",
      disposition: "carried",
    });
  });
});

// ---------------------------------------------------------------------------
// The handlers and the envelope
// ---------------------------------------------------------------------------

describe("the six handlers", () => {
  const request = (path: string) => new Request(`https://x${path}`);

  it("reports the FR-58 count in every envelope", async () => {
    for (const [path, handler] of [
      ["/api/answer/blocked", handleBlocked],
      ["/api/answer/untested", handleUntested],
      ["/api/answer/broken", handleBroken],
    ] as const) {
      const response = await handler(request(path), db());
      const body = (await response.json()) as { unparsed?: number };
      expect(response.status).toBe(200);
      expect(body.unparsed).toBe(2);
    }
  });

  it("omits the count rather than sending 0 when it could not be read", async () => {
    const client = createFakeAnswerDb({
      tables: ledger(),
      fail: { defect: { message: "boom" } },
    }) as unknown as AnswerDb;

    const response = await handleBlocked(request("/api/answer/blocked"), client);
    const body = (await response.json()) as Record<string, unknown>;
    expect("unparsed" in body).toBe(false);
  });

  it("answers 400 with a message naming the bad parameter", async () => {
    await expect(
      handleBlocked(request("/api/answer/blocked?nope=1"), db()),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
  });

  it("refuses committed through the real agent scoping with a 403", async () => {
    const scoped = agentScopedDb(fake() as unknown as object) as unknown as AnswerDb;
    await expect(
      handleCommitted(request("/api/answer/committed"), scoped),
    ).rejects.toMatchObject({ code: "forbidden_table", status: 403 });
  });

  it("leaks no table name or database message on a read failure", async () => {
    const client = createFakeAnswerDb({
      tables: ledger(),
      fail: { work_item: { message: 'relation "work_item" does not exist' } },
    }) as unknown as AnswerDb;

    await expect(
      handleBlocked(request("/api/answer/blocked"), client),
    ).rejects.toMatchObject({ code: "internal_error", status: 500 });

    await handleBlocked(request("/api/answer/blocked"), client).catch(
      (thrown: Error) => {
        expect(thrown.message).not.toContain("relation");
        expect(thrown.message).not.toContain("work_item");
      },
    );
  });

  it("reports an unknown engagement slug distinctly from an empty one", async () => {
    const response = await handleBlocked(
      request("/api/answer/blocked?engagement=nobody"),
      db(),
    );
    const body = (await response.json()) as { data: { engagementUnknown: boolean } };
    expect(body.data.engagementUnknown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The FR-45 reading rule has one implementation
// ---------------------------------------------------------------------------

describe("FR-45 covers is read from the title by one rule", () => {
  it("agrees with parseTestTags on every shape in the fixture", async () => {
    const { coversInTitle } = await import("@/lib/server/qa/persist");

    for (const title of [
      "FR-1 covers the happy path",
      "FR-36, FR-39 to FR-41 the mixed shape",
      "no refs at all",
      "D-1 checkout submits cleanly",
      "FR-1 and FR-2 together",
    ]) {
      const viaSource = parseTestTags(
        [{ path: "src/x.test.ts", source: `it(${JSON.stringify(title)}, () => {})` }],
        "acme",
      );
      expect(coversInTitle(title)).toEqual(viaSource[0].covers);
    }
  });
});

/**
 * FR-52, FR-53 and FR-56 each ask what a work item IS, not merely which one it
 * is. Until 2026-08-20 all three screens rendered a unit key and no prose: the
 * descriptions were in the database, encrypted, and no read path asked for
 * them. Answering "what is `c1` waiting on" meant opening the manifest, which
 * is the silo this product exists to end.
 *
 * These assert the value arrived THROUGH `decrypt_field` — the fixture holds
 * ciphertext, so a screen reading a clear column would fail here.
 */
describe("the three screens that ask what a work item is now say so", () => {
  const blockedFilters = { engagement: null, owner: null, disposition: null };

  it("FR-52 blocked carries the work item's description and the blocker's", async () => {
    const answer = await blockedAnswer(db(), blockedFilters, { today: TODAY });
    const w5 = answer.groups.flatMap((one) => one.items).find((one) => one.id === "w5");

    expect(w5?.description).toBe("Migrate the legacy export to the new schema.");
    // The blocker's own prose is the actual answer to "what is holding it".
    expect(w5?.blockerDescription).toBe("Client has not returned the signed change order.");
  });

  it("FR-53 next carries the description of what would be started", async () => {
    const answer = await nextAnswer(db(), { engagement: null, limit: 50 }, { milestones: true, today: TODAY });
    const w4 = answer.items.find((one) => one.id === "w4");

    expect(w4?.description).toBe("Wire the token issue form to the server action.");
  });

  it("refuses the whole answer when a description will not decrypt, rather than blanking it", async () => {
    // The alternative — rendering null — is indistinguishable from a work item
    // that never had a description, which is the "wrong done" failure in the
    // prose dimension. i6 chose to throw and this asserts that choice reaches
    // the screen path rather than only the ingest one.
    await expect(
      blockedAnswer(db({}, { decrypt: () => null }), blockedFilters, { today: TODAY }),
    ).rejects.toThrow(/could not be decrypted/);
  });
});
