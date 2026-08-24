# Build manifest d4000f

Spec: /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec/`)
Spec basis: spec-approved.md + CRs [CR-001, CR-002, CR-003, CR-004, CR-005]
Spec approved: yes — `spec-approved.md`, approved 2026-08-17. All five CRs approved; CR-005 §3.1 and §3.3 approved 2026-08-24 in commit `627521d`.
Base ref: `docs/b46-verified-in-production` @ `3927de4`. **VERIFIED in Phase 0: `627521d` is an ancestor of HEAD and is NOT on `master`.** Resolving from `master` would have folded the unapproved CR-005 draft (229 changed lines in that CR).
Security posture: declared (21 tables classified) — `security-gate.sh` PASS on the resolved spec
Verification access: declared — 2 boundary rows, both `reachable`; **measured in Phase 0: operator `aal2` REACHABLE (alive), agent token DEGRADED (negative controls only)**
Resolved spec: .fleet/resolved-spec-d4000f.md
Prior state: spec/prod.md — Phase 1 M1.0–M1.10 Complete, M2.7 Complete, M2.8 Complete; 6 Phase-2 milestones Not Started and out of scope; ~14 active blockers, none blocking M2.9
Mode: full
Branch: agent-build/2026-08-24-d4000f
Started: 2026-08-24T10:46:38Z

## Scope

**M2.9 — Planned work, and only M2.9.** CR-005 §3.1 + §3.3: FR-87, FR-88, FR-89, FR-90 (read side
only, per §3.1a), FR-91, and FR-96 with FR-96a, FR-96b, FR-96c.

## Phase 0 measurements (not taken on report)

| Check | Result |
|---|---|
| `fleet-preflight.sh` | **PASS**, 9/9 ok, **no WARN**, launch cwd verified from `$CLAUDE_CODE_SESSION_ID` |
| `security-gate.sh` on resolved spec | **PASS** — 21 classified rows, 2 §7c boundary rows |
| `pnpm typecheck` | 0 |
| `pnpm lint` (oxlint) | 0 |
| `pnpm test` | **1550 passed / 6 skipped** (106 files) |
| `pnpm gate:m27` | **5 passed / 5** |
| `pnpm gate:m27:e2e` | **9 passed / 1 failed**; the `/untested` failure re-ran **1 passed** in isolation → effectively 10/10. Failure reason was `no-role`, not `sign-in` |
| `manual-gate.sh` | **PASS** — 30 of 30 routes covered, all observed |
| Served page routes | **30** |
| §7c operator `aal2` | **REACHABLE — measured alive.** B41 is stale as written |
| §7c agent token | **DEGRADED — negative controls only** (401 no-auth, 401 bad-auth, 401 on ingest). No token obtainable; `.env.local` read-denied by design |

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Fix the conventions: how all 11 filterable screens read `searchParams` under Next 16, how `app-shell.tsx` mounts `UnparsedCount`, existing engagement-resolution helpers, and the `/registry/new` form pattern. Output to `.fleet/research/d4000f/r1.md` | researcher | — | pending |
| i1 | integration | 1 | FR-87 schema foundation: make `work_item.execution_mode` nullable, add the FR-91 staleness timestamp, add the FR-90 plan-reference + collision columns, PLAIN unique index, per-name REVOKE + `service_role` GRANT on any new function, regenerate types | api-integrator | — | pending |
| i2 | integration | 1 | FR-89 plan parser: pure function over the `writing-plans` shape (`### Task N:` + `- [ ]`), `unparsed` the only default, test feeding it an unrecognised shape, byte-copy fixture | api-integrator | — | pending |
| u1 | ui | 1 | FR-96a + FR-96b shell foundation: one engagement picker in `app-shell.tsx` beside the badge; badge stays ledger-wide and labels its scope under a filter | ui-designer | r1 | pending |
| i3 | integration | 2 | FR-90 read side (mark every collision, merge nothing) + FR-87/FR-88 planned-work write path | api-integrator | i1, i2 | pending |
| i4 | integration | 2 | FR-91 staleness derivation — pure, 30-day boundary from a date passed in, never `new Date()` inside — plus planned-row query helpers | api-integrator | i1 | pending |
| u2 | ui | 2 | FR-88 hand-entry form at `/work-items/new` (engagement REQUIRED per Q14). Takes served routes 30 → 31 | ui-designer | u1, i1 | pending |
| u3 | ui | 2 | FR-96 URL filter honoured on all 11 list screens + FR-96c explicit "no such engagement" state, never a silent fall-back | ui-designer | u1, r1 | pending |
| u4 | ui | 2 | FR-91 planned + STALE visual treatment everywhere a work item renders | ui-designer | u1, i4 | pending |
| c1 | copy | 2 | Microcopy: form labels and help, empty states, STALE wording, "no such engagement" state, the FR-96a badge scope label | copywriter | u1, u2, u3, u4 | pending |
| doc1 | docs | 2 | `docs/user-guide.md`: FR-96 filter section + `/work-items/new` section + observed evidence rows, taking the evidence file to 31 routes | docs-writer | u2, u3, u4, c1 | pending |
| d1 | deploy | 2 | Apply i1's migration, rename the local file to the version `list_migrations` reports, check advisors, verify the preview deploy | devops | i1 | pending |
| qa1 | qa | synth | Final independent review of the merged branch, incl. trajectory grading | qa-reviewer | all | pending |
| man1 | docs | synth | End-user manual pass, `mode: manual`. **Gated on qa1 PASS** | docs-writer | qa1 | pending |

**Dispatch budget: 14 of 20 planned.** 4 in Phase 1, 8 in Phase 2, 2 in Synthesize.

## Defer list

Nothing is deferred for "specialist not yet implemented" — every specialist in the roster is
functional. Both deferrals below are **out of scope**, which is a decision, not a gap:

- **M2.1–M2.6** (Probes, Coverage register, Estimate vs actual, Critical path, Harness evidence,
  Writeback) — Not Started in `prod.md` and outside CR-005 §3.1/§3.3. Out of scope.
- **M3.1–M3.3** — deferred at intake. Out of scope.
- **FR-90's write half** (actually merging a planned row with an ingested unit) — **deferred by the
  approved CR itself**, §3.1a: no artifact carries a reconciliation id today, and both templates
  live outside this repo in `~/.claude/agents/templates`. M2.9 builds the read side. This is a
  stated limitation, **not an unmet clause**.
- **FR-93's "the defects it opened"** — needs a `fleet_run_id` column on `defect`, which CR-005 §7
  lists as **still unapproved and wanting its own CR**. Out of scope. Do not build it on
  `source_key` string-parsing.

## Carried NOT VERIFIED, declared before dispatch

- **Any positive-path agent-token assertion** (§7c row 1, measured DEGRADED). The boundary is
  proven to refuse and not proven to admit. No unit may claim an authenticated ingest round-trip.

## Questions

One file per unit: `.fleet/questions-<unit-id>-d4000f.jsonl`. Concatenated at fan-in into
`.fleet/questions-d4000f.jsonl`. Never a shared file — a worktree-isolated agent cannot append to
one, and the last writer silently wins.

| Unit | Lines |
|---|---|
| r1 | — |
| i1 | — |
| i2 | — |
| u1 | — |
