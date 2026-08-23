/**
 * Tier 1 fixtures for FR-20 (`spec/prod.md`) and FR-21 (the run's checkpoint and
 * QA report). Hand-authored strings reproducing the artifact *shapes* only --
 * tooling detail, no client detail.
 *
 * Both shapes are fixed by documents rather than guessed at:
 *
 *   * The milestone-tracker and active-blocker tables follow `spec/prod.md`'s own
 *     template, and the status vocabulary follows `project-lead`'s Build-log
 *     writeback step 2, which writes exactly `Complete`, `In Progress`, `Blocked`
 *     and `Deferred`. `Done` and `Not Started` are the two additional words the
 *     live `prod.md` already carries.
 *   * The checkpoint key/value block follows `project-lead` Phase 5 step 3.
 *
 * Nothing outside those two vocabularies classifies. See PROD_MD_UNKNOWN_SHAPES.
 */

export const PROD_MD = `# Production Plan: Widget Ledger

## Milestone tracker

### Phase 1 — MVP

| Milestone | Status | Notes |
|---|---|---|
| M1.0 Provisioning | **Done** | Account inventoried empty — run zz01 |
| M1.1 Foundation | Complete | Schema and policies — run zz01 |
| M1.2 Access | In Progress | Tokens landed, limits pending — run zz01 |
| M1.3 Registry | Not Started | |
| M1.4 Ingest | **Blocked** | Waits on B3 — run zz01 |

### Phase 2 — Automation

| Milestone | Status | Notes |
|---|---|---|
| M2.1 Probes | Deferred | Needs per-vendor credentials |

## Active blockers

| ID | Blocker | Owner | Blocks | Resolution path |
|---|---|---|---|---|
| ~~**B1a**~~ | ~~Which hosting organization~~ | ~~Erik~~ | ~~everything~~ | **RESOLVED zz01, verified not assumed.** |
| **B1b** | The connector cannot see the project. Scope-limited token | **Erik** | The deploy unit only | Reauthorize the connector |
| **B3** | Retention on commercial data is unstated | **Erik** | Nothing — the baseline ships | Spec Q3 |
| **B9** | Vendor has not returned the signed order form | **Vendor** | M2.1 | Chase weekly |
`;

/**
 * The shapes the tracker classifier must refuse. A status word outside the six
 * the artifacts actually use is \`unparsed\`, never mapped to the nearest-looking
 * one -- "Nearly done" is not \`Complete\` and "Started" is not \`In Progress\`.
 */
export const PROD_MD_UNKNOWN_SHAPES = `# Production Plan: Widget Ledger

## Milestone tracker

| Milestone | Status | Notes |
|---|---|---|
| M1.5 Capture | Nearly done | |
| M1.6 Waits | Started | |
| M1.7 Unified | ✅ | |

## Active blockers

| ID | Blocker | Owner | Blocks | Resolution path |
|---|---|---|---|---|
| — | A blocker row that names no identifier | | Nothing | |
`;

/** A prod.md with neither section. Zero records, not an error. */
export const PROD_MD_EMPTY = `# Production Plan: Widget Ledger

## What this file is

A narrative. No tracker and no blockers yet.
`;

export const CHECKPOINT = `# Checkpoint zz01

phase_complete: 1
spec_path: /repo/spec/spec-approved.md
branch: agent-build/2026-01-01-zz01
mode: full
repo_path: /repo
manifest_path: /repo/.fleet/manifest-zz01.md
started: 2026-01-01T09:00:00Z
phase1_completed: 2026-01-01T11:30:00Z
build_after_phase1: PASS

## Phase 2 units

u3, u4, u5

## Phase 1 best-guess decisions

- Treated the widget list as paginated.
`;

/** A checkpoint whose build gate failed, and which names no phase 2 units. */
export const CHECKPOINT_FAILED = `# Checkpoint zz02

phase_complete: 1
branch: agent-build/2026-01-02-zz02
mode: ui-only
started: 2026-01-02T09:00:00Z
build_after_phase1: FAIL

## Phase 2 units

none
`;

/** A checkpoint stating a gate outcome outside the closed set. */
export const CHECKPOINT_UNKNOWN_GATE = `# Checkpoint zz03

phase_complete: 1
branch: agent-build/2026-01-03-zz03
build_after_phase1: probably fine
`;

/**
 * A QA report carrying the full `## Verification performed` block from
 * \`qa-reviewer.md\`'s own template, including a NOT RUN with a reason. The
 * reason is deliberately NOT stored -- see the migration comment on
 * \`fleet_run.gates\`.
 */
export const QA_REPORT_WITH_GATES = `# QA report zz01

**Status:** ISSUES
**Branch:** agent-build/2026-01-01-zz01 (HEAD 71b9683)
**Critical:** 0 · **Important:** 2 · **Minor:** 3

## Verdict

Two important findings. Nothing that blocks a ship.

## Verification performed

- Build (pnpm): PASS
- Type-check: PASS
- Lint: FAIL 3 errors in the shell
- Playwright: 6 flows authored, 5 passed, 1 failed
- Accessibility: axe — 0 violations
- Security checklist: 12/14 items checked — two need a browser
`;

/** A QA report whose gate block states counts no differently from prose. */
export const QA_REPORT_NO_GATES = `# QA report zz04

**Status:** PASS

## Verdict

Nothing to act on.
`;
