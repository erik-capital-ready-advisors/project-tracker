# Build report d4000f

**Status:** SUCCESS (Phase 1 checkpoint — run PAUSED, not complete)
**Branch:** agent-build/2026-08-24-d4000f @ `6f91fa2` (Phase 1 merge `7be6949`)
**Base ref:** `docs/b46-verified-in-production` @ `3927de4` — **verified `627521d` is an ancestor and is NOT on `master`**
**Spec:** /Users/erikmeltzer/Projects/project-tracker/spec
**Spec basis:** spec-approved.md + CRs [CR-001, CR-002, CR-003, CR-004, CR-005] — approved: yes
**Security posture:** declared (21 tables classified) — `security-gate.sh` PASS on the resolved spec
**Dispatches:** 4 of 20
**Duration:** ~2h20m (10:46Z → 13:07Z)

## Summary

M2.9's foundation is built, merged, green, and checkpointed. Three specialist units plus one research pass landed the FR-87 schema, the FR-89 plan parser and the FR-96a/FR-96b app-shell filter. Every measurement below was re-run by me on the merged tree rather than taken from a report.

**The run's three most valuable outputs are corrections, not code**, and all three would have been lost if the units had reasoned instead of measured. A latent defect (D-1) that no type checker can see and that would have made every planned row lie about its own state; a factual error in the approved CR's own cost argument; and a stale fact in my resolved spec that a specialist caught and I attributed rather than quietly edited.

## Work-units completed

| ID | Type | Outcome | Gate |
|---|---|---|---|
| r1 | research | Conventions note at `.fleet/research/d4000f/r1.md`. **Refuted CR-005 §3.3's cost claim.** | SKIP (research note) |
| i1 | integration | FR-87 schema. Migration `20260824110601` applied, local file renamed to reported version. Committed `3ef7861`. **Found D-1.** | PASS |
| i2 | integration | FR-89 parser `src/lib/ingest/planDocument.ts`, pure over text, ships unwired by design. **6 mutations, 0 survivors.** | PASS |
| u1 | ui | FR-96a/b shell picker + scope-labelled badge + shared `src/lib/engagement-filter.ts`. Found and fixed 2 defects by serving the build. | PASS |

## Deferred

Nothing deferred for "specialist not yet implemented" — every specialist is functional. All deferrals are **out of scope**, a decision rather than a gap:

- **M2.1–M2.6, M3.1–M3.3** — outside CR-005 §3.1/§3.3.
- **FR-90's write half** — deferred *by the approved CR itself* (§3.1a). No artifact carries a reconciliation id; both templates live outside this repo. A stated limitation, **not an unmet clause**.
- **FR-93's "the defects it opened"** — needs a `fleet_run_id` column on `defect`, which CR-005 §7 lists as still unapproved and wanting its own CR. Do not build it on `source_key` string-parsing.
- **Phase 2 (8 units) + QA + manual** — not deferred, *pending*: the fleet contract pauses at the Phase 1 checkpoint.

## Decisions & defaults

13 recorded in the checkpoint; 6 in `prod.md`'s Decisions log. The ones that matter:

1. **`/work-items/new` is a route, not a dialog** → served routes will go 30 → 31, obliging a guide section and an observed evidence row. *(mine, Phase 0)*
2. **`plan_ref` ships CLEAR while the prose beside it ships encrypted** — an encrypted column cannot be joined on, so encrypting the reconciliation key would delete the requirement it exists for. *(i1, high)*
3. **No `collides_with` FK; the FR-90 mark is per-row** — with no shared key you can only identify *which* two rows correspond by matching prose, which Q13 forbids absolutely, so a pairwise edge could only be populated by the forbidden mechanism. *(i1, medium — the sharpest reasoning any unit produced)*
4. **FR-91 staleness derives from `updated_at`**, trigger-maintained; both columns added so i4 can switch without a migration. *(i1, high)*
5. **One `### Task N:` heading = one row**; steps ride along. 82 rows from one `plan.md` would drown `/next`. *(i2, medium)*
6. **The six answer screens keep their free-text engagement inputs** alongside the new picker. **This is the one Erik should look at** — u1 flagged it as a decision u3 must not make silently. *(u1, medium)*
7. **`**Plan-id:**` guessed as the future syntax** — lowest-confidence call in the run; one regex and one fixture to change. *(i2, low)*

## Verification

- Build (pnpm): **PASS**, exit 0
- `pnpm typecheck` **0** · `pnpm lint` (oxlint) **0**
- `pnpm test` **1638 passed / 6 skipped** — from 1550, exactly +44 +44, so neither unit's tests were lost in the merge
- `pnpm gate:m27` **5/5** · `pnpm gate:m27:e2e` **10 passed / 10** (baseline was 9+1-on-rerun)
- `manual-gate.sh` **PASS — 30 of 30 routes covered, all observed** (re-run by me). Guide: `/Users/erikmeltzer/Projects/project-tracker/docs/user-guide.md`
- Served page routes **30, unchanged**. **Neither gate file touched.**
- QA review: **not dispatched** — Synthesize-phase unit, gated behind Phase 2
- End-user manual: not due this phase; `docs-writer` manual pass is gated on a QA PASS
- Security: 21 entities classified, `security-gate.sh` PASS. i1's new function carries per-name `REVOKE` + `service_role` `GRANT`; advisors confirm it is absent from lints 0028/0029. Anon SELECT and UPDATE both `42501` against a `service_role` positive control
- Tables touched: 1 (`work_item`, additive). Column encryption: **`plan_ref` deliberately clear** (identifier, join key); plan prose flagged for pgcrypto at persistence time — i3's job
- Deletion path: not required by this milestone; CR-002 append-only untouched
- **NOT VERIFIED — §7c agent token, DEGRADED:** no token obtainable (absent from shell; `.env.local` read-denied by design and **not** routed around). Negative controls pass — 401 no-auth, 401 bad-auth, 401 ingest — so the boundary is **proven to refuse and not proven to admit.** What would settle it: a token in the environment
- Worktrees merged: 3 (+1 research). Files changed: 17 across src/supabase/tests
- Build log (spec/prod.md): **UPDATED** — header, M2.9 → In Progress, pointer, Current state, Decisions entry, blockers D-1 + B48, one Session-log line. Nothing rewritten or deleted
- Fleet learnings: **5 routed** · `.fleet/learnings-d4000f.md` · 1 held back (over cap)

## Fleet learnings routed

- **L1** — Widening a Postgres column to nullable is a type-level no-op where row types are hand-written; `tsc` silence is evidence of disconnection, not safety. *postgres, typescript, nullability · high*
- **L2** — jsdom does not implement `requestSubmit()`, so a form-submit test can pass against a handler that never ran. *jsdom, vitest, react, false-green · high*
- **L3** — A duplicated verification-access table makes the security gate double-count boundaries and read a measured DEGRADED as declared reachable. *fleet, security-gate, tooling · high*
- **L4** — A worktree-isolated agent cannot run an e2e suite needing gitignored env files; that verification belongs to the orchestrator post-merge. *fleet, git-worktrees, playwright · high*
- **L5** — Read schema state from the newest migration touching an object, never its `CREATE`; citing a superseding migration is not reading it. *postgres, migrations, schema-drift · high*

## Skipped as already built

M1.0, M1.1–M1.10, M2.7, M2.8 — all Complete in `prod.md`. No work-unit created for any of them.

## What to review first

1. **D-1, before anything else.** `execution_mode` is now nullable and **`tsc` cannot see it** — row interfaces are hand-written, so `fromExecutionMode(null)` returns `"fleet"` and a planned row renders as fleet work: exactly FR-91's "nobody has started this" reading as "this is in flight". Invisible to all 1638 tests, inert today, **live the moment i3 writes the first planned row.** u4 owns it and it must land *before or with* i3. Note the asymmetry it exposes: `fromWorkStatus` one function above correctly defaults to `"unparsed"` — the `unparsed`-only-default discipline was applied to status and not to execution mode.
2. **u1's queued question about the six free-text engagement inputs.** It proceeded on "keep both" at medium confidence and explicitly flagged it as a decision u3 must not make silently. Answering it before Phase 2 is cheaper than reversing six screens after.
3. **That i1 applied a migration to the live Supabase project** `onpvolboecjpdkvurjaf`. Additive and backward-compatible, nothing deployed, nothing on `master` — but it is a live database change made on a branch build, and `d1` must **verify, not re-apply** (a re-run fails on `create type plan_reconciliation`).

Also worth knowing, though not blocking: **B41 is stale** — it records the `aal2` session as revoked and this run measured it alive twice. And **u1's vault grep for prior learnings was blocked by the permission classifier**; it did not route around it, but if fleet units are expected to search prior learnings themselves, that needs an allowlist rule or it recurs as B45 did.
