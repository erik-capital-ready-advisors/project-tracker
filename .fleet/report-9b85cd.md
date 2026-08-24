# Build report 9b85cd

**Status:** SUCCESS WITH ISSUES — 0 critical, 1 important, 5 minor
**Branch:** `agent-build/2026-08-24-9b85cd` @ `1f961b2` — **not pushed, not deployed**
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec` → `spec/spec-approved.md`
**Spec basis:** `spec-approved.md` + CRs [CR-001, CR-002, CR-003, CR-004, CR-005, CR-007] — approved: **yes**
**CR EXCLUDED:** CR-006 — §3 NOT APPROVED, Q24 unruled. FR-97–FR-103 not in force, not folded, not dispatched.
**Security posture:** declared (18 classification rows, 18/18 §7 entities) — `security-gate.sh` PASS on the resolved spec
**Verification access:** declared, 2 rows, both `reachable`, both exercised at Phase 0
**Duration:** ~2h50m · **Dispatches:** 4 of 20

## Summary

M2.2, the fleet-coverage register, is built, merged, and — unlike M2.7 and M2.9 before it — **observed**. `/stacks` renders against the live ledger with an `aal2` operator session, all nine of FR-108's on-screen figures match the database exactly, and FR-109's write path was exercised through the product's own UI and reverted. **Zero migrations**, exactly as CR-007 §2 predicted from reading the schema before approval; no new entity, so the 21-entity §7a PASS holds and no §7a row was invented. Served routes 31 → 32, `manual-gate.sh` PASS 32/32, tests 1853 → 1987.

The register's first honest answer is that it has seen almost nothing, and it says so out loud: *1 of 2 sessions name no stack at all — 50% of everything captured*, one stack with zero recorded hours, nothing earned, nothing actionable. That is FR-108 working. Erik's Q27 ruling holds structurally — limb two is recorded as **never evaluated**, not false, enforced by a type that carries no `met` field and that `tsc` refuses to let you add one to.

**The three findings worth your time are not the product's behaviour.** A false claim propagated from a specialist into its report and into my own manifest before review caught it; the accessibility gate has been reporting green while auditing sign-in pages; and the user guide had been telling you no critical defect was open while one was.

## Work-units completed

| ID | Type | Specialist | Outcome |
|---|---|---|---|
| i1 | integration | api-integrator | Read layer — `src/lib/server/stacks/{types,columns,rule,list,set-covering,actions}.ts`, `src/lib/stacks-load.ts`. **0 migrations.** 57 new tests, 5 planted mutations all killed. Report gate PASS. Merged `4f19e14`. |
| u1 | ui | ui-designer | `/stacks` screen — `page.tsx` + 4 components + `_lib/display.ts`, `/stacks` appended to `OPERATOR_ROUTES`. 77 new tests, 11 planted mutations all killed. Report gate PASS. Merged `9f92f25`. |
| qa1 | qa | qa-reviewer | ISSUES — 0 critical, 1 important, 5 minor (+1 important / 1 minor pre-existing, counted separately). Trajectory: i1 **SOUND 5/5**, u1 **UNSOUND 1 of 5**. `.fleet/qa-report-9b85cd.md` |
| doc1 | docs | docs-writer (manual) | Guide 8,379 → 10,352 words. **32 rows re-observed, 12 changed, 18 claims corrected, 2 of them false.** `manual-gate.sh` PASS 32/32. Report gate PASS. Merged `b8644ce`. |

## Deferred — decisions, not gaps

- **`copy`** — the screen's prose is not marketing copy. The FR-106 trigger sentence, the Q25 Mode-2 claim, the Q27 UNMET notice and the FR-108 blindness statement are load-bearing product claims specified verbatim by CR-007 and Erik's rulings. A copy pass would rewrite text that was ruled.
- **`deploy`** — no env var, no domain, no provisioning, no new service. Follows M2.9's pattern: PR you merge and deploy.
- **`docs` (handoff)** — no README/env/runbook change. The **guide** update was not deferred; it is `doc1`.
- **`research`** — the only unknown (engagement-count source) was settled by `i1` reading a schema it already had open.
- **CR-006 / M2.6 (FR-97–FR-103)** — scope boundary, not a mode deferral. §3 unapproved.
- **M2.1, M2.3, M2.4, M2.5** — zero FRs between them (run `9d4658`). Not decomposed from prose.

## Decisions & defaults

1. **`TriggerOutcome = 'earned' | 'undetermined'`, not FR-107's "unearned".** FR-106 is a disjunction; Q27 forbids evaluating limb two; so `¬(A ∨ B)` cannot follow from `¬A`. I let i1's deviation stand and referred it to QA, which confirmed it and sharpened it — FR-107's *normative* sentence imposes no vocabulary, "unearned" is in the trailing gloss. **Recorded as an amendment to FR-107's gloss, not a defect.**
2. **Engagement count from `work_session.engagement_id`**, not `work_item` — FR-106 conjoins engagements with hours, and a conjunction across two populations is not a rule you can state on a screen.
3. **`RegisterState` has three values** where FR-108 names two; the third is the state this ledger is in.
4. **FR-107 borrows `state-carried` amber** rather than minting a token. **Yours to revisit** — it touches a palette you approved.
5. **FR-109 audits** (`stack.agent_covering.set`, target id only, never the value), following FR-59 rather than the quieter precedent of `attributeSession`/`updateEngagement`, which write none. Pre-existing inconsistency reported, not fixed.
6. **Phase 2 continued in-run.** Pre-registered in the manifest *before* dispatch: continue only if `i1` queued nothing changing `u1`'s brief. It queued three, all additive — verified against the shipped types, not taken on i1's word.

## Verification

- **Build (pnpm):** PASS — typecheck 0, lint 0, `pnpm build` 0, `ƒ /stacks` in the build's own route table
- **Tests:** 1987 passed / 6 skipped / 1993, 131 files — baseline **1853** measured by me at Phase 0 and independently by i1 (the brief said ~1815; both recorded)
- **QA review:** ISSUES — **0 critical, 1 important, 5 minor** · `.fleet/qa-report-9b85cd.md`
- **End-user manual:** `/Users/erikmeltzer/Projects/project-tracker/docs/user-guide.md`, 10,352 words, **32 of 32 routes covered** · `manual-gate.sh` → **`MANUAL GATE PASS - .`**, `32 of 32 served route(s) covered, all observed` — **re-run independently by me**, not taken from doc1
- **Served routes: 31 → 32**
- **Security:** 2 controls from §7a (`stack` internal, `work_session` sensitive), 0 from baseline defaults, **4 NOT VERIFIED** — RLS probe (N/A, zero schema change), security headers, rate limits, new-account role: none is this milestone's surface. `work_session.summary` never read, never decrypted, never named — QA confirmed **no `.rpc(` call site exists anywhere in the new surface**, which is stronger than "not called".
- **Tables touched: 2 read (`stack`, `work_session`), 1 written (`audit_log`)** — classifications applied: **3 as declared, 0 baseline**. Column encryption: **none required**; `duration_minutes` and `stack_id` are clear columns.
- **Deletion path:** not required by this milestone — no new entity, `app.purge_engagement` untouched.
- **§7c row 1 (agent token):** mechanism present; **no unit needed it** — M2.2 adds no ingest surface.
- **§7c row 2 (`aal2`):** **exercised and alive.** `gate:m27:e2e` **9 passed / 1 failed**; the failure (`/next`, `no-role`) re-ran green in isolation in 4.1s — a `next dev` cold-compile flake. **The brief claimed 10/10; both recorded, not reconciled.**
- **B38 did not fire** — error context scanned for 4 credential shapes: **0 hits against a control scoring 15**, so the scan was not blind. No revocation needed.
- **`/stacks` observed:** signed-out correctly gated; signed-in rendered. Screenshot `.fleet/manual-traces/stacks-observed-9b85cd.png` (dir gitignored by design, as M2.8's).
- **FR-109 observed:** set through the product's own UI, persisted across reload, **reverted to NULL**. Two `audit_log` rows, `outcome='allowed'`.
- **Worktrees merged:** 2, both verified true fast-forwards with `git merge-base --is-ancestor` before the ref moved
- **Files changed:** 28 · **Migrations: 0**
- **Build log (spec/prod.md):** **UPDATED** — `b477c3a`, 13 run-id occurrences (confirmed by commit + grep, never by an audit verdict)
- **Fleet learnings:** 5 routed · `.fleet/learnings-9b85cd.md` — 1 held back as a duplicate

## Fleet learnings routed

| # | Title | Topics | Confidence |
|---|---|---|---|
| L1 | `manual-gate.sh` picks its evidence file lexicographically, so a run whose id sorts low is silently ignored | fleet-tooling, manual-gate, glob, sorting | high |
| L2 | Probe an auth gate with a signed-out control that must PASS, keyed on the marker the screen actually renders | playwright, authentication, negative-control | high |
| L3 | A grep exclusion that filters on the file path blinds the scan to that file's entire contents | grep, blind-scan, false-negative | high |
| L4 | When a hazard is documented only in comments, a grep for its code form returns the prose and the false claim self-perpetuates | code-search, stale-documentation, blockers | high |
| L5 | An accessibility or coverage gate run without credentials measures the sign-in page and reports green forever | accessibility, axe, gates, false-green | high |

Held back: 1 — the Next.js `'use server'` reachability probe, already in the vault from run `cd414c`; this run only re-applied it. **Nothing held back for client content.**

## Skipped as already built

M1.0–M1.10 (all Done/Complete), **M2.7**, **M2.8**, **M2.9** — no work-units created for any of them.

## What to review first

1. **B64 — five stale comments now argue against a closed blocker.** `u1` shipped *"six pages read `OPERATOR_ROUTES` positionally"* into two comments, its report **and my manifest**, and I repeated it as fact. It is false — all eight pages read by href. **QA said it "keeps B44 open on false evidence"; that is also wrong — B44 was RESOLVED in `0b709b9` earlier the same day.** Both readings are in `prod.md`. The mechanism will recur: every `OPERATOR_ROUTES[n]` in `src/` lives inside a comment, so grepping the hazard's code form returns prose describing it, and the next agent may **reopen** a closed blocker. I corrected only the two comments this run introduced.
2. **B63 — the accessibility gate cannot fail.** It measures each route's *signed-out* state against a route list stale since `b0952e`, so it audits a one-notice page and reports green. With a real session: `/questions` **96** serious nodes, `/broken` 27, `/work-items` 22, `/registry` 12, `/runs` 4, **`/stacks` 2**. The new screen is the *least* affected; the cause is the shared `--muted-foreground` opacity ladder. Same class as B19 and B57 — a gate that cannot go red.
3. **The guide was telling you nothing critical is open, while a critical defect is.** `13 open / critical 1 open`; `isUnresolved` keeps a `fixed` defect open. Found **only** because B57 forced re-observation of all 32 rows. Also queued (B62): one milestone amount renders three ways on three screens, **two of them false** under the product's own vocabulary.
