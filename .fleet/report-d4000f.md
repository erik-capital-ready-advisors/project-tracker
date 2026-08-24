# Build report d4000f

**Status:** SUCCESS WITH ISSUES — M2.9 is code-complete and deliberately **not** marked Complete
**Branch:** `agent-build/2026-08-24-d4000f` @ `c504216` — **not pushed, not deployed**
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec` → `.fleet/resolved-spec-d4000f.md`
**Spec basis:** `spec-approved.md` + CRs [CR-001…CR-005] — approved: **yes**. No new CRs since the checkpoint.
**Security posture:** declared (21 tables classified) — `security-gate.sh` PASS, §7c 2 boundary rows
**Duration:** Phase 2 resume ~3h20m · **15 of 20 dispatches**

## Summary

Eleven build units across four sequenced waves, plus an independent review and one scoped fix. Every unit cleared `report-gate.sh`. Phase 2 was sequenced rather than fanned out because it was the first wave depending on merged code — each wave merged and was re-verified before the next dispatched.

M2.9 delivers FR-87 through FR-91 and FR-96/a/b/c. **D-1, the latent wrong-`done` defect this milestone existed to avoid shipping, is fixed and independently corroborated** — QA reverted it in a throwaway worktree and got *exactly* the four failures u4 claimed, without having read u4's report.

The run's most valuable outputs, again, are corrections rather than code — and three of them are corrections to my own reporting.

## Work-units completed

| Unit | Wave | Outcome |
|---|---|---|
| i4 | A | FR-91 staleness derived, `asOf` passed in. +35 tests. 7 mutations, 0 survivors |
| u2 | A | `/work-items/new` + the shared insert primitive. Routes 30→31. 11 mutations, 11 caught |
| u3 | A | FR-96 on eleven screens, FR-96c explicit no-rows. Badge untouched. Routes stayed 30 |
| d1 | A | Verification only, **applied nothing**. Migration verified against the live DB, not the file |
| u4 | B | **D-1 fixed** + FR-91 treatment on six surfaces. Red-then-green 4→7/7 |
| i3 | B | Plan write path behind `withAgentRoute(INGEST_WRITE)`; FR-90 marks, merges nothing |
| c1 | C | 11 copy slots filled, **3 copy defects found** |
| doc1 | D | Guide 6,354→8,268 words, evidence file 31 rows, **manual-gate PASS** |
| qa1 | synth | 0 critical / 1 important / 9 minor; 7 mutations, all caught |
| i5 | fix | The one important finding, fixed at the shared source |

## Deferred

`man1` **not dispatched** — doc1 already performed the manual pass (`report-gate.sh` printed `mode: manual`; guide + evidence exist; `manual-gate.sh` PASS 31/31, re-run by me). §7b is **not** waived and the manual is not missing. One dispatch if you want it anyway.

## Decisions & defaults

- **FR-88's two creation paths split across u2 and i3**, with the first-landing unit owning the shared primitive. u2 **corrected my module path** — I would have put a service-role writer in the client-safe half of `src/lib/`.
- **u3 inherited "keep both engagement controls"** rather than choosing it, and re-queued the question. You have not ruled on it.
- **i5 declined QA's suggested wording** because `markPlanCollisions` is shared and "the run was persisted" would be false on the plan path — the same defect relocated.

## Verification

- Build (pnpm): **PASS**, exit 0 · typecheck 0 · lint 0
- `pnpm test`: **1815 passed / 6 skipped** (from 1638; every wave's increment exactly additive)
- `gate:m27`: **5/5** · `gate:m27:e2e`: **10/10 warm**; intermittent `no-role` on the first test of a cold run — **mechanism NOT ESTABLISHED**, not a credential fault
- QA review: **ISSUES** — 0 critical, 1 important (fixed), 9 minor · `.fleet/qa-report-d4000f.md`
- End-user manual: `docs/user-guide.md`, 8,268 words, **31 of 31 routes, all observed** · `manual-gate.sh` **PASS**, re-run by me
- Security: all 14 handlers across 13 route files gated; headers observed **served** (HSTS with no `preload` — the app's, not the edge's); CSP nonce + `strict-dynamic`, no `unsafe-inline`
- **NOT VERIFIED:** any positive-path agent-token claim (§7c DEGRADED — proven to refuse, not to admit); FR-91's on-screen clause (no planned row exists)
- Deletion path: not required by this milestone
- Worktrees merged: 7 · Files changed: **139 (+16,827 / −228)** across 14 commits
- Build log (`spec/prod.md`): **UPDATED** — confirmed by `git log -1` (`f6a58a0`) and `grep -c d4000f` = 28
- Fleet learnings: **3 routed** in a Phase 2 addendum (run total 8, stated not hidden) · `.fleet/learnings-d4000f.md`

## Fleet learnings routed

- **L6** — a worktree's base is unpredictable, and `git worktree list` cannot audit it because it shows post-reset state
- **L7** — a report written in a worktree but never committed is invisible to a commit-based merge; "never written" and "never staged" are indistinguishable
- **L8** — an evidence-file gate checking "an observation exists" cannot tell fresh from copied

Held back: the intermittent-diagnosis lesson and the unauthenticated-primitive one (over cap), and one scrubbed as client structure.

## Skipped as already built

M2.7, M2.8 (Complete). M2.1–M2.6, M3.1–M3.3 out of scope.

## What to review first

1. **B53 — seed one planned row.** FR-91's on-screen clause has **never rendered**: all 20 `work_item` rows report `data-verify-planned="false"`, and `?status=pending` returns none while unfiltered returns 20 (a control proving the query isn't blind). This is the *only* reason M2.9 isn't Complete, and no agent would write into the live ledger to make its own check pass.
2. **B54 — contrast debt this run created.** 3.55:1 where AA needs 4.5:1, propagated into two **new** components.
3. **B56 — the live database is ahead of every deployed artifact.** Migration applied to production; branch never pushed; production serves `e3de4be`. d1 judged no harm with evidence and declined to raise a preview deploy from an unpushed branch.

## Three things I got wrong

- **I over-escalated the `manual-traces` "§7a exposure" to you.** I quoted `.gitignore:36` without reading lines 34–35, which say the `.txt` dumps *"stay tracked"* by design. Only slug present is `delivery-ledger`. Withdrawn, re-graded minor, no purge.
- **I named the e2e intermittency twice and both were wrong** — a one-worker failure refuted the first, a cold pass refuted the second. Now recorded as NOT ESTABLISHED.
- **QA caught a false claim in my report**: "Nothing used `git add -A`" — 8 invocations, 4 unscoped, all inside worktrees. Substance held; sentence was false.

Also: trajectory grading found **i4 queried a schema it never read** (took the column list from i1's report) and **c1's red-then-green ordering claim was backwards** though its proof was real — I relayed c1's version to you verbatim and shouldn't have.

`CLAUDE.md`, the `.docx` and a stray `new-desktop.png` are untouched and unstaged. i3's two proposed `CLAUDE.md` lessons were excluded from the merge and are in its report for you to place.
