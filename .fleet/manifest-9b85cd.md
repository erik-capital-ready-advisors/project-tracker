# Build manifest 9b85cd

Spec: /Users/erikmeltzer/Projects/project-tracker (project dir → `spec/`)
Spec basis: spec-approved.md + CRs [CR-001, CR-002, CR-003, CR-004, CR-005, CR-007]
Spec approved: yes — `spec-approved.md`, approved 2026-08-17 by Erik
CR EXCLUDED: CR-006 — §3 NOT APPROVED, Q24 not ruled. FR-97–FR-103 are NOT in force. Not folded, not dispatched.
Security posture: declared (18 classification rows; 18/18 §7 entities classified — `security-gate.sh` PASS on the resolved spec)
Verification access: declared — 2 boundary rows, BOTH `reachable`, BOTH exercised in Phase 0 (see below)
Resolved spec: .fleet/resolved-spec-9b85cd.md (committed to the build branch, so it resolves inside every worktree)
Prior state: spec/prod.md — Phase 1 M1.0–M1.10 all Done/Complete; M2.7, M2.8, M2.9 Complete; M2.1/M2.3/M2.4/M2.5/M2.6 carry ZERO FRs and are NOT dispatchable
Mode: full
Branch: agent-build/2026-08-24-9b85cd (cut from `0a08a06` on `spec/cr-007-approved`)
Started: 2026-08-24T15:00:00-04:00

## Preflight

`fleet-preflight.sh /Users/erikmeltzer/Projects/project-tracker` → **PREFLIGHT PASS**, 0 WARN.
Launch cwd VERIFIED (derived from `$CLAUDE_CODE_SESSION_ID`), so the fallback that a `cd` can fake was not in play.

## Security posture — §7a

`security-gate.sh .fleet/resolved-spec-9b85cd.md` → **SECURITY GATE PASS** (this run, on the resolved
spec, is the authoritative one). 18 classification rows; new-account role answered `none`.

**No new entity this run.** `stack` is already classified **`internal`** ("technology names and which
agent covers them", provider default at rest, indefinite retention, readable by operator and agents).
`work_session` is **`sensitive`** with a pgcrypto column on `summary` — this run reads
`duration_minutes` and `stack_id`, both clear columns, and must not surface `summary`. The 21-entity
§7a PASS therefore holds and **no new §7a row is needed**, exactly as CR-007 §2 predicted.

Open and carried, not introduced by this run: **B24** — `app.rate_limit_counters` is a 22nd table with
no §7a row. Blocks nothing measurable. **B29** — every operator read runs as `service_role`
(`BYPASSRLS`), so RLS is not a real control on any read surface. `/stacks` inherits both.

## Verification access — §7c, both rows exercised at Phase 0

| Boundary | Declared | Phase 0 result |
|---|---|---|
| Agent token (`ingest:write`, `answer:read`) | reachable | Mechanism present (`docs/agent-tokens.md`, 17,709 bytes). **No unit this run needs it** — M2.2 adds no ingest surface. Not exercised, and nothing in this run depends on it. |
| Operator sign-in at `aal2` (TOTP) | reachable | **EXERCISED AND ALIVE.** `M27_BASE_URL=http://localhost:3000 M27_STORAGE_STATE=.playwright-auth/operator.json pnpm gate:m27:e2e` → **9 passed / 1 failed**. The one failure (`/next`, reason `no-role`) **re-ran green in isolation in 4.1s**, so it is a flake under `next dev` cold-compile concurrency, not a dead session. |

**A disagreement between two artifacts, recorded rather than reconciled.** The dispatch brief states
`gate:m27:e2e` passes **10/10**. This run measured **9/10**, then **1/1** on an isolated re-run of the
failing test. Both are recorded. The consequence that matters is the same either way: **the `aal2`
session is alive, so `/stacks` can be OBSERVED rather than reported
`NOT VERIFIED — cannot render an authenticated screen from an isolated worktree`.**

**B38 did not fire.** The failing gate's `error-context.md` was scanned for credential shapes
(`sb-*-auth-token`, `access_token`, `refresh_token`, `Bearer `) → **0 hits**, against a control term
scoring **15** on the same file, so the scan was not blind. No session cookie was exposed and no
revocation is required on this run's account.

## Ground truth measured at Phase 0 — this is what FR-108 has to report honestly

Queried live (`onpvolboecjpdkvurjaf`, schema `public`, **not `app`**):

| Figure | Value |
|---|---|
| `stack` rows | **1** — `nextjs-supabase`, `agent_covering` **NULL** |
| `work_session` rows | **2** |
| sessions with **no** stack | **1** (50% of the denominator — this is FR-108's headline number) |
| sessions with a stack | 1 |
| `sum(duration_minutes)` for `nextjs-supabase` | **0** |
| distinct engagements for `nextjs-supabase` | **1** |
| `stack` rows with `agent_covering` set | **0** |
| `engagement` rows | 2 |

**Consequences the specialists are told up front, so nobody builds decoration:**
- **Zero stacks have earned a specialist.** `nextjs-supabase` has 1 engagement (needs ≥2) and 0 hours (needs ≥8). Both limbs of the FR-106 conjunction fail.
- **FR-107's actionable state will render ZERO rows.** That is the correct answer, not a bug.
- **The one observed stack has 0 recorded minutes.** A stack seen with no time on it is its own honest case.
- `work_item.stack_id` also exists and holds 1 row. Whether engagement-count derives from `work_session` or `work_item` is a build-time call for `i1` to make and to *state*.

## Dispatch-budget and phase note — stated up front, not rationalised afterwards

Cap is 20. This run plans **4**: `i1`, `u1`, `qa-reviewer`, `docs-writer` (manual pass).

By the letter of the phase rule, a page implementation is phase=2, and Phase 5 exits for Erik's
`continue`. **The pause exists so feature work does not build on unanswered questions.** This run has
none: Q25, Q26 and Q27 are ruled, scope is named by FR number, and Phase 0 measured the ground truth
that would otherwise be `u1`'s biggest unknown. The dispatch brief also asks for completion-only
deliverables (a `manual-gate.sh` verdict, a QA status, an observed FR-108).

**So the discriminator is evidence, not convenience:** if `i1` returns having queued a question that
would change `u1`'s brief, this run checkpoints and exits for Erik. If it does not, Phase 2 continues
in-run and the deviation is reported. Recorded here **before** `i1` was dispatched.

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| i1 | integration | 1 | Stacks read layer: per-stack aggregation, FR-106 limb-one trigger evaluation, FR-108 blindness counts, FR-109 operator write path for `agent_covering`. Zero migrations expected. | api-integrator | — | pending |
| u1 | ui | 2 | `/stacks` screen titled "Stacks": FR-104 table, FR-106 rule stated on screen, FR-107 actionable state visually distinct, FR-108 blindness + no-data treatment, Q25 Mode-2 sentence, Q27 limb-two UNMET notice, FR-109 operator control. | ui-designer | i1 | pending |
| qa1 | qa | final | Independent review of the merged branch + trajectory grading | qa-reviewer | i1, u1 | pending |
| doc1 | docs | final | `docs/user-guide.md` covers `/stacks` (routes 31 → 32); **all rows re-opened per B57, not copied forward** | docs-writer (mode: manual) | u1, qa1 PASS | pending |

## Defer list — decisions, not gaps

- **`copy` — DEFERRED, and this is a decision.** The prose on this screen is not marketing copy: the
  FR-106 trigger sentence, the Q25 "all Mode 2 capture" claim, the Q27 limb-two UNMET notice and the
  FR-108 blindness statement are **load-bearing product claims specified verbatim by CR-007 and by
  Erik's rulings**. A copy pass over them would rewrite text that was ruled. `ui-designer` places them
  verbatim; `copywriter` is not dispatched.
- **`deploy` — DEFERRED, and this is a decision.** M2.2 adds no environment variable, no domain, no
  provisioning step and no new external service. The branch follows M2.9's pattern: reviewed, then a
  PR Erik merges and deploys. Nothing for `devops` to do.
- **`docs` (handoff) — DEFERRED, and this is a decision.** No README, env or runbook change: no new
  variable, no new setup step. The **guide** update is NOT deferred — it is `doc1`, budgeted into this
  milestone per CR-007 §4 and the ~157k-token lesson M2.8 paid for.
- **`research` — NOT DISPATCHED, and this is a decision.** The only open unknown was whether
  engagement-count derives from `work_session` or `work_item`, which `i1` settles by reading a schema
  it already has open. A researcher dispatched for that would bill a round trip to re-read the same
  table.
- **CR-006 / M2.6 Writeback (FR-97–FR-103) — NOT IN SCOPE.** §3 is unapproved. Not a deferral by mode;
  a scope boundary.
- **M2.1, M2.3, M2.4, M2.5 — NOT DISPATCHABLE.** Zero FRs between them (run `9d4658`).
