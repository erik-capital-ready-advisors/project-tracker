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
| u1 | ui | A | The one seam: `src/lib/entity-routes.ts`, `<EntityRef>`, `<EntityDetail>`; delete the gate exclusion from `vitest.config.ts` | ui-designer | — | **done** — `report-gate.sh` PASS. Merged as `b9ffe5d`. gate:m27 4/5 pass; test 2 left red pending Wave C's routes. `pnpm test` 1099 passed / 1 failed / 6 skipped. 2 questions queued |
| i1 | integration | B | Detail read layer: reference resolution + eight loaders + FR-82's four relationships, opt-in prose decryption | api-integrator | u1 | **done** — `report-gate.sh` PASS. Merged as `41d0221`. 37 tests, 6 mutations applied and one SURVIVED (vacuous engagement-scoping test, fixed). 11 new decrypt edges and 10 new `service_role` read surfaces, each named. No migration, no JSON route, no `security_invoker` view. 6 questions queued |
| f1 | ui | C | Detail routes: work_item, defect, blocker | ui-designer | u1, i1 | **done** — gate PASS. Merged `38ba1f3` (worktree `df91bae`). 50 tests, 14 mutations/14 killed. Found the `observed-elsewhere` vs `observed_elsewhere` split that renders as "no scope recorded" |
| f2 | ui | C | Detail routes: requirement (FR-82) and open_question | ui-designer | u1, i1 | **done** — gate PASS. Merged `d41cb80` (worktree `61c6ca0`). 39 tests, 7 mutations/7 killed. All four FR-82 sections render even when every relationship is empty |
| f3 | ui | C | Detail routes: external_wait, release, contract_milestone | ui-designer | u1, i1 | **done** — gate PASS. Merged `8f08a25` (worktree `40996f0`). 61 tests. First lint negative control was BLIND; second one fired. Found the `isoDay` timezone defect in M1.x code |
| f4 | ui | C | Reference adoption on the six answer screens; FR-55's hyperlink on /untested | ui-designer | u1, i1 | **done** — gate **FAILED first** (`missing mandated section(s): ## Questions Queued`), returned to the unit, repaired in `3cc71fe`, re-gated PASS. Merged `c3b0044`. 14 mutations/14 killed. Census: 37 entity-refs across the six screens, no silent zero |
| f5 | ui | C | Reference adoption on /work-items, /registry, /waits; FR-84; nav + e2e shell count | ui-designer | u1, i1 | **done** — gate PASS. Merged `9ca3626` (worktree `67e80be`). Found 8 of 28 filter option values rejected by the screen's own parser — a live defect the FR-84 gate would not have caught |
| qa1 | qa | D | Independent review of the merged branch | qa-reviewer | f1–f5 | **done** — `report-gate.sh` PASS (after adding a missing `**Run:**` header line). **BLOCKED, 0 critical / 3 important / 9 minor.** All 7 units SOUND, no fabricated claim found. Added 2 credential-free gates that stay in the branch. Merged `5a8cdde` |

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

## Rulings issued to Wave C (project-lead, on i1's queued questions)

1. **Ambiguous reference resolution refuses.** Exactly one match resolves; zero and two-or-more both dangle. Accepted as i1 built it.
2. **`fallbackLabel(kind, id)` is the only fallback** for a row carrying no human reference. No unit invents a second.
3. **FR-80's engagement slug does NOT become a ninth `ENTITY_KIND`.** Gate test 1 asserts `ENTITY_KINDS` equals exactly FR-81's eight, and an engagement already has a detail view at `/registry/[slug]`. Wave C renders it as a plain `next/link`, never as `<EntityRef>`. FR-80 is met in substance and the divergence is on the record.
4. **Milestones on a requirement view may render**, in a section distinct from FR-82's four named ones. FR-81 asks for inbound and outbound references; the gate asserts only the four.
5. **FR-50's billable state is NOT computed on the milestone detail view.** That rule lives in M1.8/`/committed` and a second implementation would drift. Link to `/committed` instead.
6. **`open_question` resolves by `(engagement_id, source_key)`** per the later migration, and is expected to be unused.
7. **`<EntityRef>` supersedes `<Ref>` wherever a token names one of FR-81's eight kinds.** `<Ref>` survives only for tokens naming nothing that has a detail view. **No unit modifies `src/components/answer-chips.tsx`** — five parallel units editing one file is a merge conflict by construction.

## Question files

One per unit: `.fleet/questions-<unit-id>-eb2490.jsonl`, concatenated at fan-in into
`.fleet/questions-eb2490.jsonl`.

## Questions collected at fan-in — per-unit line counts

| unit | lines |
|---|---|
| u1 | 2 |
| i1 | 6 |
| f1 | 4 |
| f2 | 5 |
| f3 | 3 |
| f4 | 6 |
| f5 | 4 |
| **total** | **30** — concatenated into `.fleet/questions-eb2490.jsonl` |

## Gates at the merged tip, run by project-lead

| gate | before | after |
|---|---|---|
| `pnpm gate:m27` | **5 failed / 5** | **5 passed / 5 — GREEN** |
| `pnpm typecheck` | 0 | 0 |
| `pnpm lint` | 0 | 0 |
| `pnpm test` | 1061 passed / 6 skipped | **1343 passed / 6 skipped / 0 failed** |
| `pnpm build` | 0 errors, 33 routes | **0 errors, 41 routes** |
| `pnpm e2e` | 207 passed / 7 skipped | **207 passed / 7 skipped** |
| `pnpm gate:m27:e2e` | red | **NOT VERIFIED — needs `M27_BASE_URL` + `M27_STORAGE_STATE`, an operator session at `aal2` no agent holds** |

Neither gate file was edited: `git diff 6210318 HEAD -- tests/m27-gate.test.ts e2e/m27-navigation.spec.ts` is empty.
