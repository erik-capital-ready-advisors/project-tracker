# Ingest Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure domain core of the Delivery Ledger — every parser and every rule that decides what a work item *is*, whether a requirement is covered, and whether a milestone is billable — written test-first in TypeScript with no database, no network and no framework underneath it.

**Architecture:** One package, `src/lib/ingest/`, of pure functions. Text and record arrays go in, record arrays and reports come out. Nothing in it reads a file, opens a connection, or knows Next.js exists. The Postgres schema, the RLS policies, the server actions and the screens are built from the spec by the fleet; this package is what they call.

**Tech Stack:** TypeScript strict, vitest. No runtime dependencies beyond what the Next.js app already carries.

## How this plan meets the fleet

`project-lead` decomposes `spec/spec-approved.md` into work units itself and writes its own manifest. **This plan does not compete with that.** It is the detailed brief for exactly one unit — call it `i-core` — and it exists because that unit is the one place where the fleet would otherwise guess.

| Milestone | Who plans it | Why |
|---|---|---|
| M1.0 provisioning | Erik | An account decision. Blocked as B1 |
| M1.1–M1.3 schema, RLS, auth, registry | `project-lead` from the spec | The fleet's strongest ground; §7a already dictates every column treatment |
| **M1.4, plus the pure rules inside M1.6–M1.8** | **this plan** | Prose classification, the certification join and invoice derivation are where a plausible-looking wrong answer survives review. All of it is already verified against the real corpus |
| M1.9–M1.10 screens, endpoints, export, docs | `project-lead` from the spec | Consumes this package |

Dispatch it as an `integration` unit with this file inlined. It is buildable with no database, so it does not wait on B1.

## Global Constraints

Every task's requirements implicitly include this section.

- **Pure functions only.** No `fs`, no `fetch`, no Supabase client, no `process.env` in this package. A function that needs today's date takes it as a parameter — never `new Date()` inside. That is what makes every rule here testable and deterministic.
- **`unparsed` is the only default.** Any status prose a classifier does not recognize yields `"unparsed"`. Widening a pattern to make a stubborn row classify is the failure this rule exists to prevent.
- **Every test title names the requirement it covers.** `it("FR-15 unrecognized status prose is unparsed", …)`. This is FR-45 — the product's own traceability convention — and this package is the first suite to honor it, so `untested` reports real coverage on day one instead of zero.
- **TypeScript strict.** No `any`, no non-null assertions to get past a type error.
- **Fixtures carry no client data.** See the two-tier rule below. This is not fastidiousness: §7a classifies work-item prose `sensitive` and B2 is open on whether client contracts permit it leaving their repo.
- **Run scripts bare:** `pnpm vitest run …`. If a fresh worktree dies on `ERR_PNPM_IGNORED_BUILDS`, that is pnpm's build-trust gate, not a broken lockfile — report it rather than "fixing" dependencies that are not broken.
- **Prove each new test can go red.** Break the code it covers, watch it fail, revert.
- **Commit at the end of every task.**

## Fixtures: two tiers, and why

**Tier 1 — `src/lib/ingest/__fixtures__/`, committed.** Hand-authored strings reproducing every artifact *shape* the parsers must handle. They carry tooling detail (`gate PASS`, `merged 71b9683`, `no Vercel account is reachable`) and no client detail — no client names, no schema names, no domain terms. Every unit test uses these.

**Tier 2 — `fixtures-local/`, gitignored.** Real fleet artifacts Erik points at on his own machine. The corpus tests in Task 13 assert the counts measured against the Danish run and **skip when the directory is absent**, so CI and every worktree stay green without client prose ever entering this repository.

The measured ground truths, for Tier 2:

| Artifact | Truth |
|---|---|
| `manifest-cd414c.md` | 18 work-unit rows, 0 unparsed |
| `manifest-be343c.md` | 3 work-unit rows, 10 blocked rows, 3 distinct blockers |
| `questions-*.jsonl` (6 files) | 45 records, 6 shapes, 3 answered |
| `spec-approved.md` | 61 unique `FR-nn` |

## File Structure

```
src/lib/ingest/
  types.ts            # domain types, the enums, validateWorkItem
  markdown.ts         # tableRows — the markdown table reader
  status.ts           # classifyStatus — the unparsed discipline
  refs.ts             # requirementRefs — range expansion
  workUnits.ts        # parseWorkUnits
  blocked.ts          # parseBlocked
  questions.ts        # normalizeQuestions
  requirements.ts     # parseRequirements
  testTags.ts         # parseTestTags
  coverage.ts         # indexCoverage, untestedReport — the certification rule
  billing.ts          # milestoneState — the invoice gate
  waits.ts            # external wait date math
  ingestRun.ts        # the orchestrator, still pure
  __fixtures__/       # Tier 1 shape fixtures
  *.test.ts           # colocated
```

---

### Task 1: Package skeleton, domain types, validation

Everything downstream produces records this module validates.

**Files:**
- Create: `src/lib/ingest/types.ts`, `src/lib/ingest/types.test.ts`
- Create: `vitest.config.ts` if the app has none

**Interfaces:**
- Consumes: nothing.
- Produces: the exported types `ExecutionMode`, `ExecutorKind`, `WorkStatus`, `Disposition`, `ReasonClass`, `EvidenceScope`, `WorkItem`, `Requirement`, `TestCase`, `TestResult`, `Blocker`, `Question`, `Milestone`, `ExternalWait`; the runtime arrays `WORK_STATUSES`, `EXECUTOR_KINDS`, `REASON_CLASSES`, `DISPOSITIONS`, `EVIDENCE_SCOPES`; and `validateWorkItem(item: unknown): string[]` returning error strings, empty when valid.

- [ ] **Step 1: Write the failing test**

`src/lib/ingest/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateWorkItem } from "./types";

describe("validateWorkItem", () => {
  const valid = {
    id: "tracker:r1:i1",
    engagement: "tracker",
    executionMode: "fleet",
    executorKind: "agent",
    status: "done",
  };

  it("FR-39 accepts a work item carrying an execution mode and an executor kind", () => {
    expect(validateWorkItem(valid)).toEqual([]);
  });

  it("FR-39 rejects a work item with no executor kind", () => {
    const { executorKind, ...missing } = valid;
    expect(validateWorkItem(missing)).toEqual([
      "work_item tracker:r1:i1: missing executorKind",
    ]);
  });

  it("FR-15 rejects a status outside the known set", () => {
    const errors = validateWorkItem({ ...valid, status: "finished" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("status");
  });

  it("FR-40 accepts erik_gate as an executor kind", () => {
    expect(validateWorkItem({ ...valid, executorKind: "erik_gate" })).toEqual([]);
  });

  it("FR-30 rejects a disposition outside carried and closed", () => {
    const errors = validateWorkItem({ ...valid, unautomatedDisposition: "maybe" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unautomatedDisposition");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/ingest/types.test.ts`
Expected: FAIL — `Failed to resolve import "./types"`

- [ ] **Step 3: Write the minimal implementation**

`src/lib/ingest/types.ts`:

```ts
export const EXECUTION_MODES = ["fleet", "hand", "external"] as const;
export const EXECUTOR_KINDS = [
  "agent", "erik", "erik_gate", "client", "vendor", "unassigned",
] as const;
export const WORK_STATUSES = [
  "pending", "in_flight", "done", "blocked", "superseded",
  "not_dispatched", "unparsed",
] as const;
export const DISPOSITIONS = ["carried", "closed"] as const;
export const REASON_CLASSES = [
  "no-agent-for-stack", "credential-absent", "human-judgment",
  "client-action", "out-of-scope", "budget",
] as const;
export const EVIDENCE_SCOPES = [
  "observed-live", "observed-elsewhere", "asserted", "not-verified",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type ReasonClass = (typeof REASON_CLASSES)[number];
export type EvidenceScope = (typeof EVIDENCE_SCOPES)[number];

export interface WorkItem {
  id: string;
  engagement: string;
  run: string | null;
  unit: string | null;
  executionMode: ExecutionMode;
  workType: string | null;
  phase: string | null;
  description: string | null;
  executor: string | null;
  executorKind: ExecutorKind;
  status: WorkStatus;
  unautomatedReason: ReasonClass | null;
  unautomatedDisposition: Disposition | null;
  evidenceScope: EvidenceScope | null;
  notVerifiedCount: number;
  dependsOn: string[];
  implements: string[];
  blocker: string | null;
  rawStatus: string | null;
}

export interface Requirement {
  id: string;
  engagement: string;
  ref: string;
  text: string;
}

export interface TestCase {
  id: string;
  engagement: string;
  harness: "vitest" | "playwright" | "db-probe" | "manual";
  file: string;
  title: string;
  covers: string[];
  authoredBy: string | null;
}

export interface TestResult {
  testId: string;
  status: "pass" | "fail" | "not_run";
  evidenceScope: EvidenceScope;
  certifiedBy: string | null;
  runAt: string | null;
}

export interface Blocker {
  id: string;
  engagement: string;
  owner: string;
  description: string;
  disposition: Disposition;
}

export interface Question {
  id: string;
  engagement: string;
  run: string;
  unit: string | null;
  section: string | null;
  question: string | null;
  bestGuess: string | null;
  confidence: string | null;
  blocking: boolean;
  answer: string | null;
  answeredBy: string | null;
  answeredOn: string | null;
  status: "open" | "answered";
}

export interface Milestone {
  id: string;
  engagement: string;
  name: string;
  amount: number | null;
  due: string | null;
  acceptance: string[];
  submitted: string | null;
  paid: string | null;
}

export interface ExternalWait {
  id: string;
  engagement: string;
  label: string;
  owner: string;
  startedAt: string;
  expectedBy: string | null;
  resolvedAt: string | null;
  blocks: string[];
}

const REQUIRED_WORK_ITEM_FIELDS = [
  "id", "engagement", "executionMode", "executorKind", "status",
] as const;

const WORK_ITEM_ENUMS: ReadonlyArray<[string, readonly string[]]> = [
  ["executionMode", EXECUTION_MODES],
  ["executorKind", EXECUTOR_KINDS],
  ["status", WORK_STATUSES],
  ["unautomatedDisposition", DISPOSITIONS],
  ["unautomatedReason", REASON_CLASSES],
  ["evidenceScope", EVIDENCE_SCOPES],
];

/** Returns one error string per problem. An empty array means valid. */
export function validateWorkItem(item: unknown): string[] {
  if (typeof item !== "object" || item === null) return ["work_item: not an object"];
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "<no id>";
  const errors: string[] = [];

  for (const field of REQUIRED_WORK_ITEM_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`work_item ${id}: missing ${field}`);
    }
  }
  for (const [field, allowed] of WORK_ITEM_ENUMS) {
    const value = record[field];
    if (value !== undefined && value !== null && !allowed.includes(value as string)) {
      errors.push(
        `work_item ${id}: ${field}=${JSON.stringify(value)} not one of ${allowed.join(", ")}`,
      );
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/lib/ingest/types.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Prove the tests can go red**

Make `validateWorkItem` `return []` unconditionally. Run — expect 3 failures. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/types.ts src/lib/ingest/types.test.ts vitest.config.ts
git commit -m "feat(ingest): domain types and work-item validation"
```

---

### Task 2: The markdown table reader

**Files:** Create `src/lib/ingest/markdown.ts`, `markdown.test.ts`, `__fixtures__/manifest.ts`

**Interfaces:**
- Produces: `tableRows(text: string, heading: string): string[][]` — data rows of the first markdown table under `heading`, header and separator dropped, stopping at the next `##` or `#` heading.

- [ ] **Step 1: Write the shape fixture**

`src/lib/ingest/__fixtures__/manifest.ts` — every shape, no client data:

```ts
export const MANIFEST = `# Build manifest zz01

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Library capability survey | researcher | — | **done** — gate SKIP (research note). |
| u1 | ui | 1 | App shell and design system. FR-1 to FR-5 | ui-designer | — | **done** — gate PASS, merged \`05ac5bd\` (48 files). |
| i1 | integration | 1 | Schema, RLS, encryption. FR-6–FR-9 | api-integrator | r1 | **done** — gate PASS, merged \`71b9683\`. 2 NOT VERIFIED, both named |
| i2 | integration | 2 | Ingest engine. FR-12, FR-15 to FR-18 | api-integrator | i1, u1 | **done (code)** — gate PASS. **All DB-side controls NOT VERIFIED.** |
| u2 | ui | 2 | Dashboard panels | ui-designer | u1, i2 | pending |
| u3 | ui | 2 | Settings surface | ui-designer | u1 | **superseded by u2 — NOT dispatched.** u2 shipped all four items. **Scope moved; this is a decision, not a gap.** |
| d1 | deploy | 2 | Hosting, env vars, observed headers | devops | i2 | **BLOCKED — NOT dispatched. No Vercel account is reachable from this environment.** Measured, not assumed. \`NOT VERIFIED - no deployment exists\` |
| q1 | qa | 2 | Final review pass | qa-reviewer | all | **done** — verdict FAIL: 1 critical, 2 minor. |

## Milestone mapping

| Milestone | Work-units | Notes |
|---|---|---|
| M1.1 Foundation | i1, u1 | FR-1 to FR-9 |
`;

export const MANIFEST_BLOCKED = `# Build manifest zz02

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Constant confirmation | researcher | — | done |

## Blocked — carried, not dispatched

| ID | Type | Milestone | Blocker | Status |
|---|---|---|---|---|
| b-m11 | integration | M1.1 Foundation — schema and auth (FR-1–FR-5) | B1 — hosting unresolved | blocked |
| b-m12 | ui | M1.2 Surfaces — CRUD and import (FR-6–FR-13) | B1, and depends on M1.1 | blocked |
| b-m14 | integration | M1.4 Import — parsers and matching | B3 — no real sample exists | blocked |
| b-cpy | copy | Microcopy and error strings | No UI surface exists | blocked |
| b-m01 | docs | M0.1 Vendor summary | Not blocked — but it is Erik's deliverable, out of the fleet's lane | not dispatched |
`;
```

- [ ] **Step 2: Write the failing test**

`src/lib/ingest/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tableRows } from "./markdown";
import { MANIFEST } from "./__fixtures__/manifest";

describe("tableRows", () => {
  it("FR-14 returns one array per data row", () => {
    expect(tableRows(MANIFEST, "## Work-units")).toHaveLength(8);
  });

  it("FR-14 drops the header row and the separator row", () => {
    expect(tableRows(MANIFEST, "## Work-units")[0][0]).toBe("r1");
  });

  it("FR-14 splits a row into its cells", () => {
    expect(tableRows(MANIFEST, "## Work-units")[0]).toHaveLength(7);
  });

  it("FR-14 stops at the next section heading", () => {
    const ids = tableRows(MANIFEST, "## Work-units").map((r) => r[0]);
    expect(ids).not.toContain("M1.1 Foundation");
  });

  it("FR-14 returns nothing when the heading is absent", () => {
    expect(tableRows(MANIFEST, "## Blocked")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/lib/ingest/markdown.test.ts`
Expected: FAIL — `Failed to resolve import "./markdown"`

- [ ] **Step 4: Write the minimal implementation**

```ts
/** Data rows of the first markdown table under `heading`, as cell arrays. */
export function tableRows(text: string, heading: string): string[][] {
  const rows: string[][] = [];
  let inSection = false;

  for (const line of text.split("\n")) {
    if (line.startsWith(heading)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("## ") || line.startsWith("# ")) break;

    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.every((cell) => /^[-: ]*$/.test(cell))) continue;  // separator
    if (cells[0]?.toLowerCase() === "id") continue;              // header
    rows.push(cells);
  }
  return rows;
}
```

- [ ] **Step 5: Run it and watch it pass**

Expected: PASS, 5 tests

- [ ] **Step 6: Prove the tests can go red**

Delete the `if (line.startsWith("## ")) break;` clause. Run — expect the milestone-mapping row to leak in and two tests to fail. Revert.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingest/markdown.ts src/lib/ingest/markdown.test.ts src/lib/ingest/__fixtures__
git commit -m "feat(ingest): markdown table reader"
```

---

### Task 3: The status classifier — the unparsed discipline

The single most important function in the package. A wrong `done` tells Erik a client requirement is satisfied when nothing checked it.

**Files:** Create `src/lib/ingest/status.ts`, `status.test.ts`

**Interfaces:**
- Produces: `classifyStatus(cell: string): StatusClassification` where `StatusClassification` is `{ status, unautomatedReason, unautomatedDisposition, notVerifiedCount }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { classifyStatus } from "./status";

describe("classifyStatus", () => {
  it("FR-15 returns unparsed for prose it does not recognize", () => {
    // The rule this product exists to hold: a wrong `done` is worse than a
    // loud `unparsed`.
    expect(classifyStatus("**frobnicated** - see the note above").status)
      .toBe("unparsed");
  });

  it("FR-15 reads a bare pending", () => {
    expect(classifyStatus("pending").status).toBe("pending");
  });

  it("FR-15 reads done through a trailing paragraph", () => {
    expect(classifyStatus("**done** — gate PASS, merged `71b9683` (8 files).").status)
      .toBe("done");
  });

  it("FR-29 classifies an absent credential as a carried gap", () => {
    const cell =
      "**BLOCKED — NOT dispatched. No Vercel account is reachable from this " +
      "environment.** Measured, not assumed.";
    expect(classifyStatus(cell)).toMatchObject({
      status: "blocked",
      unautomatedReason: "credential-absent",
      unautomatedDisposition: "carried",
    });
  });

  it("FR-30 classifies superseded work as a closed decision", () => {
    const cell =
      "**superseded by u2 — NOT dispatched.** u2 shipped all four items. " +
      "**Scope moved; this is a decision, not a gap.**";
    expect(classifyStatus(cell)).toMatchObject({
      status: "superseded",
      unautomatedDisposition: "closed",
    });
  });

  it("FR-43 counts named not-verified claims", () => {
    expect(classifyStatus("**done** — 2 NOT VERIFIED, both named").notVerifiedCount)
      .toBe(2);
  });

  it("FR-43 counts an uncounted not-verified mention as one", () => {
    expect(
      classifyStatus("**done (code)** — **All DB-side controls NOT VERIFIED.**")
        .notVerifiedCount,
    ).toBe(1);
  });

  it("FR-43 counts nothing when nothing is claimed", () => {
    expect(classifyStatus("**done** — gate PASS").notVerifiedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./status"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { Disposition, ReasonClass, WorkStatus } from "./types";

export interface StatusClassification {
  status: WorkStatus;
  unautomatedReason: ReasonClass | null;
  unautomatedDisposition: Disposition | null;
  notVerifiedCount: number;
}

const CREDENTIAL_ABSENT = [
  "no vercel account", "absent from the environment", "no credential",
  "no api key", "nothing to authenticate",
];
const BUDGET = ["for budget", "for credits", "budget/credits"];
const OUT_OF_SCOPE = ["out of scope"];
const CLOSED_MARKERS = [
  "is a decision, not a gap", "are decisions, not gaps",
  "this is a decision", "scope moved",
];

function reasonFor(lower: string): ReasonClass | null {
  if (CREDENTIAL_ABSENT.some((needle) => lower.includes(needle))) {
    return "credential-absent";
  }
  if (BUDGET.some((needle) => lower.includes(needle))) return "budget";
  if (OUT_OF_SCOPE.some((needle) => lower.includes(needle))) return "out-of-scope";
  return null;
}

/**
 * Map a manifest Status cell to a status, plus why the work was not automated
 * where the artifact says so.
 *
 * Every branch below was read off a real manifest. Anything else is `unparsed`,
 * which is reported rather than defaulted — widening a pattern to make a
 * stubborn row classify is the failure this function exists to prevent.
 */
export function classifyStatus(cell: string): StatusClassification {
  const lower = cell.toLowerCase();
  const result: StatusClassification = {
    status: "unparsed",
    unautomatedReason: null,
    unautomatedDisposition: null,
    notVerifiedCount: 0,
  };

  const counted = [...cell.matchAll(/(\d+)\s+NOT VERIFIED/g)].map((m) => Number(m[1]));
  if (counted.length > 0) {
    result.notVerifiedCount = counted.reduce((sum, n) => sum + n, 0);
  } else if (cell.includes("NOT VERIFIED")) {
    result.notVerifiedCount = 1;
  }

  if (lower.includes("superseded")) result.status = "superseded";
  else if (lower.includes("blocked")) result.status = "blocked";
  else if (/^\*{0,2}done\b/.test(lower)) result.status = "done";
  else if (/^\*{0,2}pending\b/.test(lower)) result.status = "pending";
  else if (/^\*{0,2}not dispatched\b/.test(lower)) result.status = "not_dispatched";

  if (
    result.status === "blocked" ||
    result.status === "superseded" ||
    result.status === "not_dispatched"
  ) {
    result.unautomatedReason = reasonFor(lower);
    // Conservative: an undispositioned gap is one Erik still owns.
    result.unautomatedDisposition =
      CLOSED_MARKERS.some((marker) => lower.includes(marker)) ? "closed" : "carried";
  }
  return result;
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 8 tests

- [ ] **Step 5: Prove the tests can go red**

Change the initial `status` from `"unparsed"` to `"done"`. Run — expect the first test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/status.ts src/lib/ingest/status.test.ts
git commit -m "feat(ingest): status classifier, unrecognized prose stays unparsed"
```

---

### Task 4: Requirement range expansion

The link from a unit to the requirements it implements, which is what later lets coverage know whose work a certifier is signing off.

**Files:** Create `src/lib/ingest/refs.ts`, `refs.test.ts`

**Interfaces:** `requirementRefs(text: string | null | undefined): string[]` — sorted numerically, deduplicated.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { requirementRefs } from "./refs";

describe("requirementRefs", () => {
  it("FR-19 expands a `to` range", () => {
    expect(requirementRefs("Agenda assembly. FR-43 to FR-46")).toEqual([
      "FR-43", "FR-44", "FR-45", "FR-46",
    ]);
  });

  it("FR-19 expands an en-dash range", () => {
    // The blocked table uses this form where the work-unit table uses `to`.
    expect(requirementRefs("Foundation (FR-1–FR-3)")).toEqual([
      "FR-1", "FR-2", "FR-3",
    ]);
  });

  it("FR-19 expands a mixed list and range", () => {
    expect(requirementRefs("Capture UI. FR-36, FR-39 to FR-41")).toEqual([
      "FR-36", "FR-39", "FR-40", "FR-41",
    ]);
  });

  it("FR-19 sorts numerically rather than lexically", () => {
    expect(requirementRefs("FR-2 and FR-10")).toEqual(["FR-2", "FR-10"]);
  });

  it("FR-19 deduplicates", () => {
    expect(requirementRefs("FR-5, FR-5, FR-4 to FR-5")).toEqual(["FR-4", "FR-5"]);
  });

  it("FR-19 returns nothing for text naming no requirement", () => {
    expect(requirementRefs("Roster bulk import")).toEqual([]);
    expect(requirementRefs(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./refs"`

- [ ] **Step 3: Write the minimal implementation**

```ts
const FR_RANGE = /FR-(\d+)(?:\s*(?:to|–|—)\s*FR-(\d+))?/g;

/**
 * `FR-43 to FR-46`, `FR-1–FR-3` and `FR-36, FR-39 to FR-41` all expand to every
 * reference they name. The manifests use all three forms.
 */
export function requirementRefs(text: string | null | undefined): string[] {
  const numbers = new Set<number>();
  for (const match of (text ?? "").matchAll(FR_RANGE)) {
    const low = Number(match[1]);
    const high = match[2] === undefined ? low : Number(match[2]);
    for (let n = low; n <= high; n += 1) numbers.add(n);
  }
  return [...numbers].sort((a, b) => a - b).map((n) => `FR-${n}`);
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 6 tests

- [ ] **Step 5: Prove the tests can go red**

Change the sort to `[...numbers].sort()` — the default lexical sort. Run — expect the numeric-ordering test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/refs.ts src/lib/ingest/refs.test.ts
git commit -m "feat(ingest): expand requirement ranges from unit descriptions"
```

---

### Task 5: Parse the work-unit table

**Files:** Create `src/lib/ingest/workUnits.ts`, `workUnits.test.ts`

**Interfaces:** `parseWorkUnits(text: string, engagement: string, run: string): WorkItem[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseWorkUnits } from "./workUnits";
import { validateWorkItem } from "./types";
import { MANIFEST } from "./__fixtures__/manifest";

const byUnit = (text: string) =>
  Object.fromEntries(
    parseWorkUnits(text, "tracker", "zz01").map((item) => [item.unit, item]),
  );

describe("parseWorkUnits", () => {
  it("FR-14 produces one work item per table row", () => {
    expect(parseWorkUnits(MANIFEST, "tracker", "zz01")).toHaveLength(8);
  });

  it("FR-14 produces only valid work items", () => {
    const errors = parseWorkUnits(MANIFEST, "tracker", "zz01").flatMap(validateWorkItem);
    expect(errors).toEqual([]);
  });

  it("FR-16 scopes identifiers by engagement and run", () => {
    expect(byUnit(MANIFEST).i1.id).toBe("tracker:zz01:i1");
  });

  it("FR-42 splits the depends-on cell into unit names", () => {
    expect(byUnit(MANIFEST).i2.dependsOn).toEqual(["i1", "u1"]);
  });

  it("FR-42 reads an em-dash dependency as no dependencies", () => {
    expect(byUnit(MANIFEST).r1.dependsOn).toEqual([]);
  });

  it("FR-19 records the requirements a unit implements", () => {
    expect(byUnit(MANIFEST).u1.implements).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-4", "FR-5",
    ]);
  });

  it("FR-41 hands work blocked on an absent credential back to Erik", () => {
    // d1 is dispatched-to `devops`, but no agent can choose an account.
    expect(byUnit(MANIFEST).d1.executorKind).toBe("erik_gate");
  });

  it("FR-39 leaves a dispatched unit owned by an agent", () => {
    expect(byUnit(MANIFEST).i1.executorKind).toBe("agent");
  });

  it("FR-39 marks every work-unit row as fleet-executed", () => {
    const modes = new Set(
      parseWorkUnits(MANIFEST, "tracker", "zz01").map((i) => i.executionMode),
    );
    expect([...modes]).toEqual(["fleet"]);
  });

  it("FR-15 marks a row with the wrong column count unparsed rather than misaligned", () => {
    const text = "## Work-units\n\n| ID | Type |\n|---|---|\n| x1 | ui |\n";
    expect(parseWorkUnits(text, "tracker", "zz09")[0].status).toBe("unparsed");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./workUnits"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import { tableRows } from "./markdown";
import { classifyStatus, type StatusClassification } from "./status";
import { requirementRefs } from "./refs";
import type { ExecutorKind, WorkItem } from "./types";

const WORK_UNIT_COLUMNS = 7; // ID | Type | Phase | Description | Dispatched-to | Depends-on | Status

const AGENT_TYPES = new Set([
  "researcher", "ui-designer", "api-integrator", "copywriter",
  "devops", "docs-writer", "qa-reviewer",
]);
const ERIK_REASONS = new Set(["credential-absent", "human-judgment"]);

function dependencies(cell: string): string[] {
  const empty = new Set(["", "-", "—"]);
  if (empty.has(cell)) return [];
  return cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !empty.has(part));
}

/**
 * An agent that cannot start because a credential or a decision is missing hands
 * the work back to Erik, whoever the manifest says it was dispatched to.
 */
function executorKind(
  dispatchedTo: string | null,
  classified: StatusClassification,
): ExecutorKind {
  if (classified.unautomatedReason && ERIK_REASONS.has(classified.unautomatedReason)) {
    return "erik_gate";
  }
  if (classified.unautomatedReason === "client-action") return "client";
  return dispatchedTo !== null && AGENT_TYPES.has(dispatchedTo) ? "agent" : "unassigned";
}

export function parseWorkUnits(
  text: string,
  engagement: string,
  run: string,
): WorkItem[] {
  return tableRows(text, "## Work-units").map((cells): WorkItem => {
    const unit = cells[0];
    const base = {
      id: `${engagement}:${run}:${unit}`,
      engagement,
      run,
      unit,
      executionMode: "fleet" as const,
      blocker: null,
      evidenceScope: null,
    };

    if (cells.length !== WORK_UNIT_COLUMNS) {
      return {
        ...base,
        workType: null, phase: null, description: null,
        executor: null, executorKind: "unassigned",
        status: "unparsed",
        unautomatedReason: null, unautomatedDisposition: null,
        notVerifiedCount: 0,
        dependsOn: [], implements: [],
        rawStatus: cells.join(" | "),
      };
    }

    const [, workType, phase, description, dispatchedTo, dependsOn, status] = cells;
    const classified = classifyStatus(status);
    return {
      ...base,
      workType,
      phase,
      description,
      executor: dispatchedTo,
      executorKind: executorKind(dispatchedTo, classified),
      dependsOn: dependencies(dependsOn),
      implements: requirementRefs(description),
      rawStatus: status,
      ...classified,
    };
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 10 tests

- [ ] **Step 5: Prove the tests can go red**

Change the id template to `` `${engagement}:${unit}` ``, dropping the run scope. Run — expect the run-scoping test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/workUnits.ts src/lib/ingest/workUnits.test.ts
git commit -m "feat(ingest): parse the manifest work-unit table"
```

---

### Task 6: Parse the Blocked table

**Files:** Create `src/lib/ingest/blocked.ts`, `blocked.test.ts`

**Interfaces:** `parseBlocked(text, engagement, run): { items: WorkItem[]; blockers: Blocker[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseBlocked } from "./blocked";
import { MANIFEST_BLOCKED } from "./__fixtures__/manifest";

const parsed = () => parseBlocked(MANIFEST_BLOCKED, "tracker", "zz02");
const byUnit = () =>
  Object.fromEntries(parsed().items.map((item) => [item.unit, item]));

describe("parseBlocked", () => {
  it("FR-17 produces one work item per blocked row", () => {
    expect(parsed().items).toHaveLength(5);
  });

  it("FR-17 extracts each distinct blocker once", () => {
    expect(parsed().blockers.map((b) => b.id).sort()).toEqual([
      "tracker:B1", "tracker:B3",
    ]);
  });

  it("FR-17 leaves a row naming no blocker without one", () => {
    expect(byUnit()["b-cpy"].blocker).toBeNull();
  });

  it("FR-15 reads a row that says it is not blocked as not dispatched", () => {
    expect(byUnit()["b-m01"].status).toBe("not_dispatched");
  });

  it("FR-30 treats a blocked row as a carried gap", () => {
    expect(byUnit()["b-m11"]).toMatchObject({
      status: "blocked",
      unautomatedDisposition: "carried",
    });
  });

  it("FR-19 reads the requirements a blocked milestone covers", () => {
    expect(byUnit()["b-m11"].implements).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-4", "FR-5",
    ]);
  });

  it("FR-17 yields nothing when there is no blocked table", () => {
    expect(parseBlocked("# empty\n", "tracker", "zz09")).toEqual({
      items: [], blockers: [],
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./blocked"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import { tableRows } from "./markdown";
import { classifyStatus } from "./status";
import { requirementRefs } from "./refs";
import type { Blocker, WorkItem } from "./types";

const BLOCKED_COLUMNS = 5; // ID | Type | Milestone | Blocker | Status
const BLOCKER_ID = /\bB(\d+)\b/;

/**
 * The `## Blocked` table: work carried against a named blocker. A row whose
 * Blocker cell names no `Bn` gets `null` rather than an invented identifier.
 */
export function parseBlocked(
  text: string,
  engagement: string,
  run: string,
): { items: WorkItem[]; blockers: Blocker[] } {
  const items: WorkItem[] = [];
  const blockers = new Map<string, Blocker>();

  for (const cells of tableRows(text, "## Blocked")) {
    if (cells.length !== BLOCKED_COLUMNS) continue;
    const [unit, workType, milestone, blockerCell, status] = cells;

    const match = BLOCKER_ID.exec(blockerCell);
    const blockerId = match ? `${engagement}:B${match[1]}` : null;
    if (blockerId && !blockers.has(blockerId)) {
      blockers.set(blockerId, {
        id: blockerId,
        engagement,
        owner: "client",
        description: blockerCell,
        disposition: "carried",
      });
    }

    const classified = classifyStatus(status);
    items.push({
      id: `${engagement}:${run}:${unit}`,
      engagement,
      run,
      unit,
      executionMode: "fleet",
      workType,
      phase: null,
      description: milestone,
      executor: null,
      executorKind: "unassigned",
      dependsOn: [],
      implements: requirementRefs(milestone),
      blocker: blockerId,
      evidenceScope: null,
      rawStatus: status,
      ...classified,
    });
  }

  return { items, blockers: [...blockers.values()] };
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 7 tests

- [ ] **Step 5: Prove the tests can go red**

Loosen `BLOCKER_ID` to `/\b(\d+)\b/`. Run — expect the distinct-blockers test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/blocked.ts src/lib/ingest/blocked.test.ts
git commit -m "feat(ingest): parse the manifest blocked table"
```

---

### Task 7: Normalize the questions files

Six record shapes across six files, three answered, `answeredBy` present in one.

**Files:** Create `src/lib/ingest/questions.ts`, `questions.test.ts`, `__fixtures__/questions.ts`

**Interfaces:** `normalizeQuestions(files: { name: string; text: string }[], engagement: string): Question[]` — takes text, not paths, so it stays pure.

- [ ] **Step 1: Write the shape fixture**

`src/lib/ingest/__fixtures__/questions.ts`:

```ts
/** One line per shape the fleet has actually emitted. No client detail. */
export const QUESTION_FILES = [
  {
    name: "questions-zz01.jsonl",
    text: [
      `{"unit":"i2","section":"6.1","question":"Turn public signup off?","best_guess":"Yes","confidence":"high"}`,
      `{"unit":"i2","section":"6.2","question":"Spend ceiling?","best_guess":"$40","confidence":"med"}`,
    ].join("\n"),
  },
  {
    name: "questions-zz02.jsonl",
    text: `{"assumption_made":"Treated as standalone","blocking":false,"question":"Combine account types?","unit":"i4"}`,
  },
  {
    name: "questions-u2-zz01.jsonl",
    text:
      `{"unit":"u2","section":"7a","question":"Soft delete or hard?","best_guess":"Soft",` +
      `"confidence":"high","status":"answered","answer":"Soft delete","answered_by":"erik",` +
      `"answered_on":"2026-08-06"}`,
  },
  {
    name: "questions-i4-zz01.jsonl",
    text: `{"unit":"i4","question":"Threshold?","best_guess":"0.90","blocking":true,"run_id":"zz01","ts":"2026-08-06T14:00:00Z"}`,
  },
];
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeQuestions } from "./questions";
import { QUESTION_FILES } from "./__fixtures__/questions";

const load = () => normalizeQuestions(QUESTION_FILES, "tracker");

describe("normalizeQuestions", () => {
  it("FR-18 reads every record across every file", () => {
    expect(load()).toHaveLength(5);
  });

  it("FR-18 gives every record the same key set", () => {
    const shapes = new Set(load().map((q) => Object.keys(q).sort().join(",")));
    expect(shapes.size).toBe(1);
  });

  it("FR-18 separates answered from open", () => {
    const answered = load().filter((q) => q.status === "answered");
    expect(answered).toHaveLength(1);
    expect(answered[0].answeredBy).toBe("erik");
  });

  it("FR-18 reads assumption_made as a best guess", () => {
    const shapeTwo = load().find((q) => q.unit === "i4" && q.bestGuess === "Treated as standalone");
    expect(shapeTwo).toBeDefined();
  });

  it("FR-18 takes the run from the filename when the record omits it", () => {
    expect(new Set(load().map((q) => q.run))).toEqual(new Set(["zz01", "zz02"]));
  });

  it("FR-18 gives every record a distinct id", () => {
    const ids = load().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./questions"`

- [ ] **Step 4: Write the minimal implementation**

```ts
import type { Question } from "./types";

/** `questions-zz01.jsonl` -> `zz01`; `questions-u2-zz01.jsonl` -> `zz01`. */
function runFromFilename(name: string): string {
  return name.replace(/\.jsonl$/, "").split("-").at(-1) ?? "unknown";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The fleet has emitted six different record shapes across six files. Normalize
 * them to one, so "what is still open" becomes a query.
 */
export function normalizeQuestions(
  files: { name: string; text: string }[],
  engagement: string,
): Question[] {
  const questions: Question[] = [];

  for (const file of files) {
    const run = runFromFilename(file.name);
    file.text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed === "") return;
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const answer = asString(raw.answer);
      const unit = asString(raw.unit);

      questions.push({
        id: `${engagement}:${run}:${unit ?? "unknown"}:${index}`,
        engagement,
        run: asString(raw.run_id) ?? run,
        unit,
        section: asString(raw.section),
        question: asString(raw.question),
        bestGuess: asString(raw.best_guess) ?? asString(raw.assumption_made),
        confidence: asString(raw.confidence),
        blocking: raw.blocking === true,
        answer,
        answeredBy: asString(raw.answered_by),
        answeredOn: asString(raw.answered_on),
        status: answer === null ? "open" : "answered",
      });
    });
  }
  return questions;
}
```

- [ ] **Step 5: Run it and watch it pass**

Expected: PASS, 6 tests

- [ ] **Step 6: Prove the tests can go red**

Make `status` always `"open"`. Run — expect the answered/open test to fail. Revert.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingest/questions.ts src/lib/ingest/questions.test.ts src/lib/ingest/__fixtures__/questions.ts
git commit -m "feat(ingest): normalize six question-file shapes to one"
```

---

### Task 8: Parse requirements from a spec

**Files:** Create `src/lib/ingest/requirements.ts`, `requirements.test.ts`

**Interfaces:** `parseRequirements(text: string, engagement: string): Requirement[]` — first mention of each `FR-nn` wins, ordered numerically.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseRequirements } from "./requirements";

const SPEC = `## 6. Functional Requirements

### 6.1 Access
- **FR-1** The application has no public signup.
- **FR-2** MFA is required and enforced in row-level security.

### 6.2 Ingest
- **FR-10** The system parses the work-unit table.
- **FR-3** Referenced again later: FR-1 must not be overwritten.
`;

describe("parseRequirements", () => {
  it("FR-12 finds every distinct requirement", () => {
    expect(parseRequirements(SPEC, "tracker")).toHaveLength(4);
  });

  it("FR-12 scopes identifiers by engagement", () => {
    expect(parseRequirements(SPEC, "tracker")[0].id).toBe("tracker:FR-1");
  });

  it("FR-12 orders numerically rather than lexically", () => {
    expect(parseRequirements(SPEC, "tracker").map((r) => r.ref)).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-10",
    ]);
  });

  it("FR-12 keeps the first mention's text", () => {
    const first = parseRequirements(SPEC, "tracker")[0];
    expect(first.text).toContain("no public signup");
  });

  it("FR-12 carries text on every requirement", () => {
    expect(parseRequirements(SPEC, "tracker").every((r) => r.text !== "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./requirements"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { Requirement } from "./types";

const FR = /\bFR-(\d+)\b/g;
const MAX_TEXT = 300;

/** First mention of each `FR-nn` wins; its line becomes the requirement text. */
export function parseRequirements(text: string, engagement: string): Requirement[] {
  const seen = new Map<number, Requirement>();

  for (const line of text.split("\n")) {
    for (const match of line.matchAll(FR)) {
      const number = Number(match[1]);
      if (seen.has(number)) continue;
      seen.set(number, {
        id: `${engagement}:FR-${number}`,
        engagement,
        ref: `FR-${number}`,
        text: line.trim().slice(0, MAX_TEXT),
      });
    }
  }

  return [...seen.keys()].sort((a, b) => a - b).map((n) => seen.get(n)!);
}
```

> The `!` here is the one place a non-null assertion is warranted: the key came from `seen.keys()`. If strictness forbids it in review, replace with `[...seen.entries()].sort(([a],[b]) => a-b).map(([,r]) => r)`.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 5 tests

- [ ] **Step 5: Prove the tests can go red**

Remove the `if (seen.has(number)) continue;` guard. Run — expect the first-mention test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/requirements.ts src/lib/ingest/requirements.test.ts
git commit -m "feat(ingest): extract requirements from a spec"
```

---

### Task 9: Read requirement coverage out of test titles

The traceability mechanism, and the reason no test-management tool is adopted: the mapping lives in the file that already has to change when the test changes.

**Files:** Create `src/lib/ingest/testTags.ts`, `testTags.test.ts`

**Interfaces:** `parseTestTags(files: { path: string; source: string }[], engagement: string): TestCase[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseTestTags } from "./testTags";

const FILES = [
  {
    path: "src/lib/agenda.test.ts",
    source: [
      `it("FR-43 assembles twelve agenda items in order", () => {});`,
      `it("renders a PDF", () => {});`,
      `test("FR-44 and FR-45 are both covered here", () => {});`,
    ].join("\n"),
  },
  {
    path: "e2e/signin.spec.ts",
    source: `test("FR-1 refuses an unauthenticated route", async () => {});`,
  },
];

describe("parseTestTags", () => {
  it("FR-45 finds every test title", () => {
    expect(parseTestTags(FILES, "tracker")).toHaveLength(4);
  });

  it("FR-45 records the requirements a title names", () => {
    const [first] = parseTestTags(FILES, "tracker");
    expect(first.covers).toEqual(["FR-43"]);
  });

  it("FR-45 lets one title cover more than one requirement", () => {
    const multi = parseTestTags(FILES, "tracker").find((t) =>
      t.title.includes("both covered"),
    );
    expect(multi?.covers).toEqual(["FR-44", "FR-45"]);
  });

  it("FR-45 leaves an untagged test covering nothing", () => {
    const untagged = parseTestTags(FILES, "tracker").find(
      (t) => t.title === "renders a PDF",
    );
    expect(untagged?.covers).toEqual([]);
  });

  it("FR-46 reads a spec file under e2e as a Playwright test", () => {
    const harnesses = new Set(parseTestTags(FILES, "tracker").map((t) => t.harness));
    expect(harnesses).toEqual(new Set(["vitest", "playwright"]));
  });

  it("FR-47 leaves every parsed test uncertified", () => {
    expect(parseTestTags(FILES, "tracker").every((t) => t.authoredBy === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./testTags"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { TestCase } from "./types";

const TITLE = /\b(?:it|test)\s*\(\s*(['"`])(.+?)\1/g;
const FR = /\bFR-\d+\b/g;

function harnessFor(path: string): TestCase["harness"] {
  const segments = path.split("/");
  return segments.includes("e2e") || segments.includes("playwright")
    ? "playwright"
    : "vitest";
}

/**
 * A test declares what it covers by naming the requirement in its own title:
 *   it("FR-43 assembles twelve agenda items", ...)
 */
export function parseTestTags(
  files: { path: string; source: string }[],
  engagement: string,
): TestCase[] {
  const cases: TestCase[] = [];

  for (const file of files) {
    let index = 0;
    for (const match of file.source.matchAll(TITLE)) {
      const title = match[2];
      cases.push({
        id: `${engagement}:${file.path}:${index}`,
        engagement,
        harness: harnessFor(file.path),
        file: file.path,
        title,
        covers: title.match(FR) ?? [],
        authoredBy: null,
      });
      index += 1;
    }
  }
  return cases;
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 6 tests

- [ ] **Step 5: Prove the tests can go red**

Change `title.match(FR)` to `file.source.match(FR)`. Run — expect the untagged-test assertion to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/testTags.ts src/lib/ingest/testTags.test.ts
git commit -m "feat(ingest): map test titles to the requirements they name"
```

---

### Task 10: Coverage and the independent-certifier rule

The rule that makes "untested" mean something. A requirement is covered only when a passing test names it **and** that test's certifier is not the executor of the work that implemented it.

**Files:** Create `src/lib/ingest/coverage.ts`, `coverage.test.ts`

**Interfaces:**
- `indexCoverage(input: CoverageInput): CoverageIndex` where `CoverageIndex` is `{ covered: Set<string>; claimed: Set<string>; selfCertified: Set<string>; unproven: Set<string> }`
- `untestedReport(input: CoverageInput): CoverageReport` — the FR-48 view
- `CoverageInput` is `{ requirements: Requirement[]; workItems: WorkItem[]; tests: TestCase[]; results: TestResult[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { indexCoverage, untestedReport } from "./coverage";
import type { CoverageInput } from "./coverage";
import type { Requirement, TestCase, TestResult, WorkItem } from "./types";

const requirement = (n: number): Requirement => ({
  id: `tracker:FR-${n}`, engagement: "tracker", ref: `FR-${n}`, text: `requirement ${n}`,
});

const workItem = (unit: string, executor: string, covers: string[]): WorkItem => ({
  id: `tracker:zz01:${unit}`, engagement: "tracker", run: "zz01", unit,
  executionMode: "fleet", workType: "integration", phase: "1",
  description: null, executor, executorKind: "agent", status: "done",
  unautomatedReason: null, unautomatedDisposition: null, evidenceScope: null,
  notVerifiedCount: 0, dependsOn: [], implements: covers, blocker: null, rawStatus: null,
});

const testCase = (id: string, covers: string[]): TestCase => ({
  id, engagement: "tracker", harness: "vitest", file: "x.test.ts",
  title: covers.join(" "), covers, authoredBy: null,
});

const result = (
  testId: string,
  certifiedBy: string | null,
  evidenceScope: TestResult["evidenceScope"] = "observed-live",
): TestResult => ({ testId, status: "pass", evidenceScope, certifiedBy, runAt: "2026-08-17" });

const input = (tests: TestCase[], results: TestResult[]): CoverageInput => ({
  requirements: [requirement(1), requirement(2)],
  workItems: [workItem("i1", "api-integrator", ["FR-1", "FR-2"])],
  tests,
  results,
});

describe("indexCoverage", () => {
  it("FR-48 leaves every requirement uncovered when no test names one", () => {
    const report = untestedReport(input([], []));
    expect(report).toMatchObject({ requirements: 2, tests: 0, mapped: 0 });
    expect(report.uncovered).toEqual(["FR-1", "FR-2"]);
  });

  it("FR-47 counts a passing test certified by someone else", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "qa-reviewer")]),
    );
    expect(report.mapped).toBe(1);
    expect(report.uncovered).toEqual(["FR-2"]);
  });

  it("FR-47 refuses a test certified by the executor of the work it covers", () => {
    // `i1` implements FR-1 and was executed by api-integrator, so an
    // api-integrator certification is the author signing off on itself.
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "api-integrator")]),
    );
    expect(report.uncovered).toContain("FR-1");
    expect(report.selfCertified).toEqual(["t1"]);
  });

  it("FR-47 refuses a passing test with no certifier at all", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", null)]),
    );
    expect(report.uncovered).toContain("FR-1");
  });

  it("FR-49 reports a requirement proven only by not-verified evidence as unproven", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "qa-reviewer", "not-verified")]),
    );
    expect(report.unproven).toEqual(["FR-1"]);
    expect(report.uncovered).toContain("FR-1");
  });

  it("FR-51 records a claim separately from a covering", () => {
    const index = indexCoverage(
      input([testCase("t1", ["FR-1"])], [result("t1", "api-integrator")]),
    );
    expect(index.claimed.has("FR-1")).toBe(true);
    expect(index.covered.has("FR-1")).toBe(false);
  });

  it("FR-48 ignores a failing test entirely", () => {
    const failing: TestResult = { ...result("t1", "qa-reviewer"), status: "fail" };
    const report = untestedReport(input([testCase("t1", ["FR-1"])], [failing]));
    expect(report.mapped).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./coverage"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { Requirement, TestCase, TestResult, WorkItem } from "./types";

export interface CoverageInput {
  requirements: Requirement[];
  workItems: WorkItem[];
  tests: TestCase[];
  results: TestResult[];
}

export interface CoverageIndex {
  /** Refs with a passing test whose certifier did not execute the work. */
  covered: Set<string>;
  /** Refs with a passing test, certifier notwithstanding. */
  claimed: Set<string>;
  /** Test ids whose certifier executed the work they cover. */
  selfCertified: Set<string>;
  /** Refs whose only passing evidence was never checked against the deployment. */
  unproven: Set<string>;
}

export interface CoverageReport {
  requirements: number;
  tests: number;
  mapped: number;
  uncovered: string[];
  selfCertified: string[];
  unproven: string[];
}

/** Which executors built the work implementing each requirement. */
function implementers(workItems: WorkItem[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const item of workItems) {
    if (item.executor === null) continue;
    for (const ref of item.implements) {
      const executors = map.get(ref) ?? new Set<string>();
      executors.add(item.executor);
      map.set(ref, executors);
    }
  }
  return map;
}

export function indexCoverage(input: CoverageInput): CoverageIndex {
  const built = implementers(input.workItems);
  const testsById = new Map(input.tests.map((test) => [test.id, test]));

  const covered = new Set<string>();
  const claimed = new Set<string>();
  const selfCertified = new Set<string>();
  const provenLive = new Set<string>();
  const provenAtAll = new Set<string>();

  for (const result of input.results) {
    if (result.status !== "pass") continue;
    const test = testsById.get(result.testId);
    if (test === undefined) continue;

    for (const ref of test.covers) {
      claimed.add(ref);

      if (result.certifiedBy === null) continue;
      if (built.get(ref)?.has(result.certifiedBy) === true) {
        selfCertified.add(test.id);
        continue;
      }
      provenAtAll.add(ref);
      if (result.evidenceScope !== "not-verified") {
        provenLive.add(ref);
        covered.add(ref);
      }
    }
  }

  const unproven = new Set(
    [...provenAtAll].filter((ref) => !provenLive.has(ref)),
  );
  return { covered, claimed, selfCertified, unproven };
}

export function untestedReport(input: CoverageInput): CoverageReport {
  const index = indexCoverage(input);
  const refs = input.requirements.map((requirement) => requirement.ref);
  return {
    requirements: refs.length,
    tests: input.tests.length,
    mapped: refs.filter((ref) => index.covered.has(ref)).length,
    uncovered: refs.filter((ref) => !index.covered.has(ref)),
    selfCertified: [...index.selfCertified].sort(),
    unproven: refs.filter((ref) => index.unproven.has(ref)),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 7 tests

- [ ] **Step 5: Prove the tests can go red**

Delete the `selfCertified.add(test.id); continue;` branch so an executor's own certification counts. Run — expect the self-certification test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/coverage.ts src/lib/ingest/coverage.test.ts
git commit -m "feat(ingest): coverage with the independent-certifier rule"
```

---

### Task 11: Milestone state — the invoice gate

The one place the ledger should refuse to be optimistic.

**Files:** Create `src/lib/ingest/billing.ts`, `billing.test.ts`

**Interfaces:** `milestoneState(milestone: Milestone, index: CoverageIndex): { state: "open" | "claimed" | "billable"; missing: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { milestoneState } from "./billing";
import type { CoverageIndex } from "./coverage";
import type { Milestone } from "./types";

const MILESTONE: Milestone = {
  id: "tracker:M1.6", engagement: "tracker", name: "Ingest",
  amount: 2000, due: "2026-09-01", acceptance: ["FR-1", "FR-2"],
  submitted: null, paid: null,
};

const index = (
  covered: string[], claimed: string[], selfCertified: string[] = [],
): CoverageIndex => ({
  covered: new Set(covered),
  claimed: new Set(claimed),
  selfCertified: new Set(selfCertified),
  unproven: new Set(),
});

describe("milestoneState", () => {
  it("FR-50 is open when an acceptance criterion has no test at all", () => {
    expect(milestoneState(MILESTONE, index([], []))).toEqual({
      state: "open", missing: ["FR-1", "FR-2"],
    });
  });

  it("FR-50 is open when only some criteria are covered", () => {
    expect(milestoneState(MILESTONE, index(["FR-1"], ["FR-1"]))).toEqual({
      state: "open", missing: ["FR-2"],
    });
  });

  it("FR-51 is claimed when every criterion passes but the certifier built it", () => {
    expect(milestoneState(MILESTONE, index([], ["FR-1", "FR-2"], ["t1"]))).toEqual({
      state: "claimed", missing: ["FR-1", "FR-2"],
    });
  });

  it("FR-50 is billable when every criterion is independently certified", () => {
    expect(
      milestoneState(MILESTONE, index(["FR-1", "FR-2"], ["FR-1", "FR-2"])),
    ).toEqual({ state: "billable", missing: [] });
  });

  it("FR-50 is billable when a milestone names no acceptance criteria", () => {
    // Vacuous, and worth pinning: an empty acceptance list must not be a way
    // to make a milestone look earned.
    const empty = { ...MILESTONE, acceptance: [] };
    expect(milestoneState(empty, index([], []))).toEqual({
      state: "billable", missing: [],
    });
  });
});
```

> The last case is deliberately pinned rather than defended. `milestone.acceptance` is required non-empty by `spec` FR-10 and the registry rejects an empty list at entry (M1.3), so this function's vacuous truth is fine — but it is written down so nobody later reads it as a hole.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./billing"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { CoverageIndex } from "./coverage";
import type { Milestone } from "./types";

export type MilestoneState = "open" | "claimed" | "billable";

/**
 * A milestone becomes billable by derivation only. Nothing sets this field.
 *
 * - billable: every acceptance criterion has a passing test with an
 *   independent certifier.
 * - claimed:  every criterion passes, but at least one only on the say-so of
 *   whoever built it. That is a review request, not an invoice.
 * - open:     something is untested.
 */
export function milestoneState(
  milestone: Milestone,
  index: CoverageIndex,
): { state: MilestoneState; missing: string[] } {
  const missing = milestone.acceptance.filter((ref) => !index.covered.has(ref));
  if (missing.length === 0) return { state: "billable", missing };

  const allClaimed = milestone.acceptance.every((ref) => index.claimed.has(ref));
  return { state: allClaimed ? "claimed" : "open", missing };
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 5 tests

- [ ] **Step 5: Prove the tests can go red**

Change `index.covered` to `index.claimed` in the `missing` filter. Run — expect the claimed test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/billing.ts src/lib/ingest/billing.test.ts
git commit -m "feat(ingest): derive milestone invoice state from coverage"
```

---

### Task 12: External wait arithmetic

Mode 3's contribution to a delivery date. A seven-day store review moves a date no amount of build speed recovers.

**Files:** Create `src/lib/ingest/waits.ts`, `waits.test.ts`

**Interfaces:**
- `daysWaiting(wait: ExternalWait, today: string): number`
- `isOverdue(wait: ExternalWait, today: string): boolean`
- `projectMilestone(due: string | null, waits: ExternalWait[], today: string): { projected: string | null; slippedDays: number; drivenBy: string | null }`

All take `today` as an ISO date string. **No function here reads the clock.**

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { daysWaiting, isOverdue, projectMilestone } from "./waits";
import type { ExternalWait } from "./types";

const wait = (over: Partial<ExternalWait> = {}): ExternalWait => ({
  id: "tracker:w1", engagement: "tracker", label: "App Store review",
  owner: "Apple", startedAt: "2026-09-01", expectedBy: "2026-09-08",
  resolvedAt: null, blocks: ["tracker:zz01:u2"], ...over,
});

describe("external waits", () => {
  it("FR-34 counts days elapsed since the wait started", () => {
    expect(daysWaiting(wait(), "2026-09-06")).toBe(5);
  });

  it("FR-34 stops counting at the resolution date", () => {
    expect(daysWaiting(wait({ resolvedAt: "2026-09-04" }), "2026-09-20")).toBe(3);
  });

  it("FR-34 flags a wait past its expected-by date", () => {
    expect(isOverdue(wait(), "2026-09-09")).toBe(true);
  });

  it("FR-34 does not flag a wait still inside its window", () => {
    expect(isOverdue(wait(), "2026-09-07")).toBe(false);
  });

  it("FR-36 does not flag a resolved wait, however late it was", () => {
    expect(isOverdue(wait({ resolvedAt: "2026-09-20" }), "2026-10-01")).toBe(false);
  });

  it("FR-37 pushes a milestone out to its latest unresolved wait", () => {
    expect(
      projectMilestone("2026-09-03", [wait()], "2026-09-02"),
    ).toEqual({ projected: "2026-09-08", slippedDays: 5, drivenBy: "tracker:w1" });
  });

  it("FR-37 leaves a milestone alone when every wait resolves before it", () => {
    expect(
      projectMilestone("2026-09-30", [wait()], "2026-09-02"),
    ).toEqual({ projected: "2026-09-30", slippedDays: 0, drivenBy: null });
  });

  it("FR-37 ignores resolved waits", () => {
    const resolved = wait({ resolvedAt: "2026-09-02" });
    expect(
      projectMilestone("2026-09-03", [resolved], "2026-09-02"),
    ).toEqual({ projected: "2026-09-03", slippedDays: 0, drivenBy: null });
  });

  it("FR-37 names the wait driving the date when several are open", () => {
    const waits = [wait(), wait({ id: "tracker:w2", expectedBy: "2026-09-21" })];
    expect(projectMilestone("2026-09-03", waits, "2026-09-02").drivenBy)
      .toBe("tracker:w2");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./waits"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { ExternalWait } from "./types";

const MS_PER_DAY = 86_400_000;

function toDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Whole days between two ISO dates. */
function daysBetween(from: string, to: string): number {
  return Math.round((toDay(to) - toDay(from)) / MS_PER_DAY);
}

export function daysWaiting(wait: ExternalWait, today: string): number {
  return daysBetween(wait.startedAt, wait.resolvedAt ?? today);
}

export function isOverdue(wait: ExternalWait, today: string): boolean {
  if (wait.resolvedAt !== null || wait.expectedBy === null) return false;
  return toDay(today) > toDay(wait.expectedBy);
}

/**
 * A milestone cannot land before the last thing it waits on. `today` is a
 * parameter and never the clock, so this is deterministic and testable.
 */
export function projectMilestone(
  due: string | null,
  waits: ExternalWait[],
  today: string,
): { projected: string | null; slippedDays: number; drivenBy: string | null } {
  const open = waits.filter(
    (wait) => wait.resolvedAt === null && wait.expectedBy !== null,
  );
  if (due === null || open.length === 0) {
    return { projected: due, slippedDays: 0, drivenBy: null };
  }

  const latest = open.reduce((worst, wait) =>
    toDay(wait.expectedBy as string) > toDay(worst.expectedBy as string) ? wait : worst,
  );
  const latestDate = latest.expectedBy as string;

  if (toDay(latestDate) <= toDay(due)) {
    return { projected: due, slippedDays: 0, drivenBy: null };
  }
  return {
    projected: latestDate,
    slippedDays: daysBetween(due, latestDate),
    drivenBy: latest.id,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 9 tests

- [ ] **Step 5: Prove the tests can go red**

Delete the `wait.resolvedAt === null` filter in `projectMilestone`. Run — expect the resolved-waits test to fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/waits.ts src/lib/ingest/waits.test.ts
git commit -m "feat(ingest): external wait arithmetic and milestone projection"
```

---

### Task 13: The run orchestrator, and the real-corpus tier

**Files:** Create `src/lib/ingest/ingestRun.ts`, `ingestRun.test.ts`, `ingestRun.corpus.test.ts`; add `fixtures-local/` to `.gitignore`

**Interfaces:** `ingestRun(input: RunInput): RunResult` where

```ts
interface RunInput {
  engagement: string;
  manifests: { name: string; text: string }[];
  questionFiles: { name: string; text: string }[];
  specText: string | null;
  testFiles: { path: string; source: string }[];
}
interface RunResult {
  workItems: WorkItem[]; blockers: Blocker[]; questions: Question[];
  requirements: Requirement[]; tests: TestCase[];
  unparsed: number; errors: string[];
}
```

Still pure: the caller reads the files.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ingestRun } from "./ingestRun";
import { MANIFEST, MANIFEST_BLOCKED } from "./__fixtures__/manifest";
import { QUESTION_FILES } from "./__fixtures__/questions";

const run = () =>
  ingestRun({
    engagement: "tracker",
    manifests: [
      { name: "manifest-zz01.md", text: MANIFEST },
      { name: "manifest-zz02.md", text: MANIFEST_BLOCKED },
    ],
    questionFiles: QUESTION_FILES,
    specText: "- **FR-1** one\n- **FR-2** two\n",
    testFiles: [],
  });

describe("ingestRun", () => {
  it("FR-22 collects work items from both manifests and the blocked table", () => {
    // 8 from zz01, 1 from zz02, 5 blocked rows from zz02
    expect(run().workItems).toHaveLength(14);
  });

  it("FR-16 keeps colliding unit names distinct across runs", () => {
    const ids = run().workItems.map((item) => item.id);
    expect(ids).toContain("tracker:zz01:r1");
    expect(ids).toContain("tracker:zz02:r1");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("FR-15 reports how many rows it could not classify", () => {
    expect(run().unparsed).toBe(0);
  });

  it("FR-23 produces only valid records", () => {
    expect(run().errors).toEqual([]);
  });

  it("FR-18 carries every question through", () => {
    expect(run().questions).toHaveLength(5);
  });

  it("FR-12 carries every requirement through", () => {
    expect(run().requirements.map((r) => r.ref)).toEqual(["FR-1", "FR-2"]);
  });

  it("FR-22 is idempotent — the same input yields identical output", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `Failed to resolve import "./ingestRun"`

- [ ] **Step 3: Write the minimal implementation**

```ts
import { parseBlocked } from "./blocked";
import { normalizeQuestions } from "./questions";
import { parseRequirements } from "./requirements";
import { parseTestTags } from "./testTags";
import { parseWorkUnits } from "./workUnits";
import { validateWorkItem } from "./types";
import type { Blocker, Question, Requirement, TestCase, WorkItem } from "./types";

export interface RunInput {
  engagement: string;
  manifests: { name: string; text: string }[];
  questionFiles: { name: string; text: string }[];
  specText: string | null;
  testFiles: { path: string; source: string }[];
}

export interface RunResult {
  workItems: WorkItem[];
  blockers: Blocker[];
  questions: Question[];
  requirements: Requirement[];
  tests: TestCase[];
  unparsed: number;
  errors: string[];
}

/** `manifest-zz01.md` -> `zz01`. */
function runIdFromName(name: string): string {
  return name.replace(/\.md$/, "").split("-").at(-1) ?? "unknown";
}

export function ingestRun(input: RunInput): RunResult {
  const workItems: WorkItem[] = [];
  const blockers: Blocker[] = [];

  for (const manifest of input.manifests) {
    const run = runIdFromName(manifest.name);
    workItems.push(...parseWorkUnits(manifest.text, input.engagement, run));
    const blocked = parseBlocked(manifest.text, input.engagement, run);
    workItems.push(...blocked.items);
    blockers.push(...blocked.blockers);
  }

  return {
    workItems,
    blockers,
    questions: normalizeQuestions(input.questionFiles, input.engagement),
    requirements:
      input.specText === null ? [] : parseRequirements(input.specText, input.engagement),
    tests: parseTestTags(input.testFiles, input.engagement),
    unparsed: workItems.filter((item) => item.status === "unparsed").length,
    errors: workItems.flatMap(validateWorkItem),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 7 tests

- [ ] **Step 5: Add the real-corpus tier**

`.gitignore`: add `fixtures-local/`.

`src/lib/ingest/ingestRun.corpus.test.ts` — asserts the values measured against the Danish run, and **skips entirely when the directory is absent**, so this repository never carries client prose:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ingestRun } from "./ingestRun";

const DIR = join(process.cwd(), "fixtures-local");
const present = existsSync(DIR);

// The only place in this package that touches a filesystem, and it is a test.
const read = (pattern: RegExp) =>
  readdirSync(DIR)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));

describe.skipIf(!present)("ingestRun against the real corpus", () => {
  const result = () =>
    ingestRun({
      engagement: "danish",
      manifests: read(/^manifest-.*\.md$/),
      questionFiles: read(/^questions-.*\.jsonl$/),
      specText: readFileSync(join(DIR, "spec-approved.md"), "utf8"),
      testFiles: [],
    });

  it("FR-14 reads 31 work items across two runs and one blocked table", () => {
    expect(result().workItems).toHaveLength(31);
  });

  it("FR-15 classifies every status cell in the corpus", () => {
    expect(result().unparsed).toBe(0);
  });

  it("FR-18 normalizes all 45 questions", () => {
    expect(result().questions).toHaveLength(45);
  });

  it("FR-18 finds the three answered questions", () => {
    expect(result().questions.filter((q) => q.status === "answered")).toHaveLength(3);
  });

  it("FR-12 finds all 61 requirements", () => {
    expect(result().requirements).toHaveLength(61);
  });

  it("FR-23 produces no invalid record from real input", () => {
    expect(result().errors).toEqual([]);
  });
});
```

To run it, Erik copies the artifacts in himself:

```bash
mkdir -p fixtures-local
cp ~/Projects/Danish/.fleet/manifest-*.md fixtures-local/
cp ~/Projects/Danish/.fleet/questions-*.jsonl fixtures-local/
cp ~/Projects/Danish/spec/spec-approved.md fixtures-local/
pnpm vitest run src/lib/ingest/ingestRun.corpus.test.ts
```

- [ ] **Step 6: Run the whole package**

Run: `pnpm vitest run src/lib/ingest`
Expected: every test passes; the corpus suite reports as skipped unless `fixtures-local/` exists.

- [ ] **Step 7: Prove the tests can go red**

Remove the `parseBlocked` call from `ingestRun`. Run — expect the 14-item count and the collision test to fail. Revert.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ingest .gitignore
git commit -m "feat(ingest): run orchestrator and the optional real-corpus suite"
```

---

## Done when

- `pnpm vitest run src/lib/ingest` is green, with the corpus suite skipped or passing.
- `pnpm tsc --noEmit` exits 0 with no `any` and no non-null assertion outside the one noted in Task 8.
- Every test title names the requirement it covers, so this package is the first tagged suite in the studio and `untested` reports real coverage for it on day one.
- No file in `src/lib/ingest/` imports `node:fs`, `node:path` or any Supabase client. The one exception is the corpus test, and it is a test.
- `fixtures-local/` is gitignored and no client prose is committed.

## What this hands to the rest of the build

`project-lead` builds the schema, the RLS policies, the ingest endpoints, the session hook, the screens and the export from the spec. Each of those calls into this package rather than reimplementing its rules:

| Consumer | Calls |
|---|---|
| `POST /api/ingest/fleet-run` | `ingestRun` |
| `POST /api/ingest/session` | `validateWorkItem` |
| The Untested screen and endpoint | `untestedReport` |
| The Committed screen and endpoint | `indexCoverage`, `milestoneState` |
| The Blocked screen and endpoint | `daysWaiting`, `isOverdue` |
| Milestone dates anywhere they appear | `projectMilestone` |

If a rule in this table gets reimplemented in a server action or a SQL view, that is a defect: the certification rule and the invoice gate exist in exactly one place, and it is here.
