# Build report b0952e

**Status:** BLOCKED
**Branch:** `agent-build/2026-08-19-b0952e` (tip `b980e1a`, 43 commits, 355 files, +65,450 lines) — **local only, not pushed**
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec`
**Spec basis:** `spec-approved.md` + CRs [CR-001] — approved: yes (2026-08-17; CR-001 2026-08-18). **CR-002 is PENDING and correctly not folded in.**
**Security posture:** declared (21 entities / 22 classification rows) — `security-gate.sh` PASS
**Duration:** resume 3 of a run started 2026-08-19; 18 of 20 dispatches used

## Summary

This was a resume into a run whose checkpoint was five hours stale. The checkpoint said Phase 1; the manifest said all of Phase 2 was merged. I settled it against the tree rather than either file — every specialist worktree diffed against the branch tip — and the only file present in a worktree and absent from the branch was `src/lib/server/releases/unparsed.ts`, i8's duplicate of the unparsed definition that i7 deliberately deleted when it consolidated that definition to one function. **Nothing was re-dispatched.** No worktree held uncommitted work, so the i6 near-miss did not recur.

The substantive work of this session was the review and what it found. I gave `qa-reviewer` live credentials — the previous session had none, and had traded the end-user manual away to buy verification it then could not perform. That closed **17 of the ~18 items the run was carrying as NOT VERIFIED**, and it surfaced one critical defect: **`POST /api/ingest/run` returned `500` on every request, always.** `service_role` had no `EXECUTE` on `app.gates_are_closed_set`, which sits inside a CHECK constraint on `fleet_run` — and a CHECK evaluates in the *caller's* role. Mode-1 ingest, the reason this product exists, stored nothing, while 919 tests stayed green. It was fixed inside the run and re-verified through the product path. **M1.1 through M1.9 are complete; M1.10 is blocked on CR-002.** Status is BLOCKED rather than SUCCESS because five important findings remain open and the end-user manual §7b requires was not written.

## Work-units completed

| ID | Type | Outcome |
|---|---|---|
| r1 | research | Stack pinned: Next 16.3.1 / TS 7.0.2 / Tailwind 4.3.3. Found **Vercel WAF Pro cannot rate-limit per token** — IP/JA4 only, header keys are Enterprise — forcing FR-8 to a Postgres counter |
| u1 | ui | Scaffold + design system, 63 files. Proved Tailwind wired by reading emitted CSS (863 rules), not by a green build |
| i1 | integration | M1.1: 21 tables, 23 RLS policies, 12 encrypted columns, append-only audit refusing UPDATE/DELETE/**TRUNCATE**. Measured `relrowsecurity` worthless here |
| i2 | integration | Pure domain core, 13 modules. Found **`plan.md`'s own coverage fixture cannot detect a widened certifier join** |
| i3 | integration | CR-001 pure rules. 12 mutations, 12 reds. Removed its own invented QA-fixture shape on finding the template has no such field |
| i4 | integration | M1.2 Access. Security headers observed in a real response; found `proxy.ts` at repo root is silently ignored |
| i5 | integration | M1.3 + M1.4 persistence. Found a latent FR-22 defect: `ON CONFLICT` cannot infer a **partial** unique index, failing only on the second post |
| i6 | integration | M1.5–M1.7. **Rescued, not re-dispatched** — killed by a session limit after writing its report, before committing |
| i7 | integration | M1.8 + the six answer endpoints. **Owns the single `unparsed` population definition.** 14 mutations, 14 detected |
| i8 | integration | Release path. Mutation 2b showed the property is defended twice — disabling the pre-check alone did not duplicate |
| u2 | ui | Registry screens. Running the app found two defects no test would have caught (811px table in a 654px track) |
| u3 | ui | Six answer screens + fixed two defects in **other units'** merged code. Showed the pre-existing assertions could not have caught the hardcoded `unparsed: 0` |
| u4 | ui | Work items, waits, tokens, sign-in. 19 mutations, all red. Found `expiryInstant("2026-02-31")` returned 3 March — a credential lifetime nobody chose |
| c1 | copy | 205 `COPY:` slots across 48 files. Caught a **vacuous all-clear** ("Every requirement is covered" for an engagement with zero requirements) |
| doc1 | docs | Five docs + README, quickstart run against a fresh clone. Found the recommended global hook install is not actually possible at this commit |
| d1 | deploy | Preview deployed and serving. Got past two traps that produce clean-looking false greens; **refused to certify the API layer at all** because every probe returned an identical `500` |
| qa1 | qa | Verdict **ISSUES** (revised from FAIL). Closed 17 NOT VERIFIED items. Found C1 |
| i10 | integration | Fixed C1 + three important findings. Corrected two things I told it, both by measuring first |

## Deferred

- **M1.10 (FR-60 export, FR-61 hard deletion)** — blocked pending CR-002, not deferred by mode. Building it now builds the disputed reading. FR-60 is not itself disputed and is blocked only by milestone membership.
- **Phase 2 (M2.1–M2.6) and Phase 3 (M3.1–M3.3)** — out of scope per `prod.md`. Not a specialist gap.
- **Nothing was deferred for want of a specialist.** All seven have written bodies.

## Decisions & defaults

Erik's 14 recorded answers were carried into every brief. New lead-level decisions this session:

1. **Credentials supplied to the review.** The single highest-leverage act of the session; it is what made C1 findable.
2. **C1 fixed inside the run rather than reported out.** One `grant`, in a new migration, with a full privilege census confirming no second instance.
3. **The `/api/waits` unknown-key gap fixed too** — `expected_by` silently swallowed meant a wait that can never go overdue, and FR-34 reads exactly that field.
4. **i2's failed report gate left failing.** I tried to have i2 repair it; its session is gone (`No transcript found`). I did not edit it.
5. **qa1's report left failing the gate**, because the gate cannot evaluate it at all (B23). qa1 declined to relabel and that refusal was right.
6. **15 worktrees pruned** after verifying no artifact existed only there. 16 refs kept for provenance.
7. **A lesson written into the repo `CLAUDE.md`** (`c1f4f0b`): *every per-name `REVOKE ... FROM public` needs a matching `GRANT ... TO service_role` whenever the function is reached in the caller's role.*

## Verification

- Build (pnpm): **PASS** — typecheck 0, lint 0 (oxlint), build 0 (31 routes), test **966 passed / 6 skipped**, e2e **199 passed / 7 skipped**. All re-run by me at `b980e1a`, not taken on report.
- QA review: **ISSUES** — 1 critical (**closed**), 5 important, 6 minor · `.fleet/qa-report-b0952e.md`
- End-user manual: **not written** — (a) gate is qa1 PASS and the verdict is ISSUES; (b) independently, no operator account exists and no agent may create one (B20). **§7b is NOT waived and I did not write a waiver.**
- Security: 20/22 checklist items observed. `anon` refused on 21/21 tables with a positive control; 12 §7a columns read back as real `c30d0407` ciphertext; MFA enforced **in RLS** with an `aal2` positive control; FR-8 limiter tripped (`{200:60, 429:100}`); append-only refused UPDATE/DELETE/TRUNCATE **as the owning role**. Not checkable: session cookie flags (no `auth.users` row), deletion path (M1.10 blocked).
- **FR-5 is application-layer, NOT database-enforced** — handlers read with the service-role key, which holds BYPASSRLS. Per Erik's answer 7, this must keep being reported exactly that way.
- Tables touched: 22 — 21 classified as declared, **1 (`app.rate_limit_counters`) undeclared** (B24). Column encryption: 12 columns, 3 of them resolved upward from the baseline where §7a is silent.
- Deletion path: **declared in spec, NOT built** — blocked on CR-002, deliberately.
- Accessibility: axe-core, 15 routes × 2 projects, **zero violations at all four impact levels** — but these routes render their refusal state, so it is not a screen-reader pass.
- Worktrees merged: 16 · Files changed: 355 · Build log (`spec/prod.md`): **UPDATED**
- Fleet learnings: **5 routed** · `.fleet/learnings-b0952e.md`
  - `L1 — A Postgres CHECK constraint executes in the caller's role`
  - `L2 — Verify a write path in the role the write path uses`
  - `L3 — PostgREST .upsert() cannot use a partial unique index`
  - `L4 — typescript-eslint cannot load under TS 7; pnpm 11 silently ignores overrides`
  - `L5 — vitest 4 removed --reporter=basic; a harness reports 0/N while measuring its own crash`
  - held back: 4 over cap, 0 scrubbed — Next 16 ignores root `proxy.ts` and writes agent-rules only on `dev`; Vercel's SSO interstitial mimics the app's security headers (`preload` is the tell); five specialists shared one mutation-harness scratchpad path; raw U+0000 bytes in four sources (**with the grep-blindness claim withdrawn as unreproduced**)

## Skipped as already built

M1.0 Provisioning — `prod.md` reports it Done and verified by observation. No unit re-provisioned anything.

## What to review first

1. **Provision one operator account (B20).** It is the bottleneck on more verification than everything else combined: the end-user manual, every authenticated screen, and the session-cookie half of the security review. No screen in this build has ever rendered a real row behind authentication.
2. **The C1 fix and the method behind it.** `20260820011222_i10_grant_gates_check_to_service_role.sql` is one line. The thing to actually read is why it survived a full build and review: idempotency had been proved via the SQL console as `postgres`, a role that can execute the function the app's role could not. That pattern will recur.
3. **Rule on the ingest wire tightening (B25).** Four endpoints now `400` on unknown body keys. The best argument for it and the clearest measure of its risk are the same event: it immediately caught `qa-reviewer` posting `requirementRefs` where the field is `requirement_refs`, silently dropped, which means its own FR-74 coverage row had passed on evidence proving nothing.
4. **`report-gate.sh` cannot evaluate any qa-reviewer report (B23).** The gate is silently absent from the one unit that reviews everything else. Neither agent edited it — cross-project infrastructure, your call.
5. **The six answer screens are still design-unreviewed.** §5a reads `Approved design: NOT YET APPROVED`; approval covers the token layer only, and you have not seen these screens populated.
