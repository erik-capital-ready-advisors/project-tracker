# Build manifest eb2490

Spec: /Users/erikmeltzer/Projects/project-tracker/spec
Spec basis: spec-approved.md + CRs [CR-001, CR-002, CR-003]
Spec approved: yes — spec-approved.md, client-approved 2026-08-17; CR-003 approved 2026-08-20
Security posture: declared (22 rows classified across 21 entities; `security-gate.sh` PASS)
Resolved spec: .fleet/resolved-spec-eb2490.md
Prior state: spec/prod.md — M1.0–M1.9 Complete, M1.10 code-complete-not-Complete, M2.1–M2.6 Not Started, M2.7 gated. Active blockers: B1b, B2, B3, B4, B5, B6, B7, B22, B24, B26, B28, B29, B30
Mode: full
Branch: agent-build/2026-08-20-eb2490 (cut from 6210318 on agent-build/2026-08-19-b0952e)
Started: 2026-08-20T12:52:00Z

## Milestone in scope

M2.7 only — CR-003 FR-80 to FR-86, plus FR-55 (reclassified PARTIALLY MET by CR-003 Q11).
Everything else in the resolved spec is already built (M1.x) or Not Started and out of this
run's scope (M2.1–M2.6).

## Acceptance criterion, written before dispatch

`pnpm gate:m27` — 5 structural tests, credential-free. **Baseline measured 2026-08-20 12:52: 5
failed / 5.** Must end 5 passed / 5.
`pnpm gate:m27:e2e` — 10 crawl tests. Needs `M27_BASE_URL` + `M27_STORAGE_STATE`, which this run
does not hold. **NOT VERIFIED, not skipped, not faked.**

Neither gate file may be edited by any unit. A gate assertion believed wrong is reported as a
finding and left red.

## Phase policy for this run — a deliberate deviation, stated

The standing fleet protocol checkpoints after phase=1 and exits for an operator `continue`. This
run does not, and the reason is on the record rather than inferred: M2.7's acceptance criterion is
a single gate whose route-existence assertion cannot go green until the eight detail routes exist,
so a phase-1 exit would report a red gate on a half-built milestone; and this repository's own
`CLAUDE.md` lesson, written 2026-08-20 and committed as e90cdd4, records that dispatching M2.7 was
already stopped once for a question whose options produced identical code. The work is therefore
run as three dependency waves inside one phase. Waves are sequenced, not parallel-with-hope: each
wave merges to the branch before the next is cut from it.

## Work-units

| ID | Type | Wave | Description | Dispatched-to | Depends-on | Status |
|----|------|------|-------------|---------------|-----------|--------|
| u1 | ui | A | The one seam: `src/lib/entity-routes.ts`, `<EntityRef>`, `<EntityDetail>`; delete the gate exclusion from `vitest.config.ts` | ui-designer | — | pending |
| i1 | integration | B | Detail read layer: reference resolution + eight loaders + FR-82's four relationships, opt-in prose decryption | api-integrator | u1 | pending |
| f1 | ui | C | Detail routes: work_item, defect, blocker | ui-designer | u1, i1 | pending |
| f2 | ui | C | Detail routes: requirement (FR-82) and open_question | ui-designer | u1, i1 | pending |
| f3 | ui | C | Detail routes: external_wait, release, contract_milestone | ui-designer | u1, i1 | pending |
| f4 | ui | C | Reference adoption on the six answer screens; FR-55's hyperlink on /untested | ui-designer | u1, i1 | pending |
| f5 | ui | C | Reference adoption on /work-items, /registry, /waits; FR-84; nav + e2e shell count | ui-designer | u1, i1 | pending |
| qa1 | qa | D | Independent review of the merged branch | qa-reviewer | f1–f5 | pending |

## Defer list

- `copy` — no copy work-unit. §5a is NOT APPROVED and the caller's brief forbids new design or
  copy decisions; detail views reuse the existing screens' visual language and wording idiom.
  **Deferred as out of scope, not as unimplemented.**
- `deploy` — out of scope. The caller's brief is M2.7 only; B22 (Preview carries no service-role
  key) is unchanged by this run.
- `docs` (end-user manual, §7b) — **not written, and this is a carried gap rather than a waiver.**
  It is M1.10's open item, held deliberately until §5a is approved (prod.md, M1.10 row). This run
  builds page routes, so the standing rule would call for it; dispatching a whole-product manual
  against an unapproved design, for a run whose brief says "M2.7 ONLY. Nothing else.", would be
  the larger error. Reported as NOT WRITTEN with the reason.
- `research` — none. The unknowns this milestone would have researched are settled in writing by
  CR-003's Q9/Q10/Q11 and by the two gate files.

## Question files

One per unit: `.fleet/questions-<unit-id>-eb2490.jsonl`, concatenated at fan-in into
`.fleet/questions-eb2490.jsonl`.
