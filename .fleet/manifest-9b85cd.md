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
| i1 | integration | 1 | Stacks read layer: per-stack aggregation, FR-106 limb-one trigger evaluation, FR-108 blindness counts, FR-109 operator write path for `agent_covering`. Zero migrations expected. | api-integrator | — | **done** — `report-gate.sh` PASS (run id matched, 6/6 sections, 13 file lines, 3 questions on disk). Merged `4f19e14` (true fast-forward). **Zero migrations, as predicted.** 12 files, +2019 lines, 57 new tests. |
| u1 | ui | 2 | `/stacks` screen titled "Stacks": FR-104 table, FR-106 rule stated on screen, FR-107 actionable state visually distinct, FR-108 blindness + no-data treatment, Q25 Mode-2 sentence, Q27 limb-two UNMET notice, FR-109 operator control. | ui-designer | i1 | **done** — `report-gate.sh` PASS (run id matched, 6/6 sections, 17 file lines, 4 questions on disk). Merged `9f92f25` (true fast-forward). 14 files, +3135/-1. **Routes 31 → 32.** |
| qa1 | qa | final | Independent review of the merged branch + trajectory grading | qa-reviewer | i1, u1 | **done** — **ISSUES: 0 critical, 1 important, 5 minor** (+1 important / 1 minor pre-existing, counted separately). `.fleet/qa-report-9b85cd.md`. Trajectory: i1 **SOUND** 5/5, u1 **UNSOUND** on 1 of 5. |
| doc1 | docs | final | `docs/user-guide.md` covers `/stacks` (routes 31 → 32); **all rows re-opened per B57, not copied forward** | docs-writer (mode: manual) | u1, qa1 | **done** — `report-gate.sh` PASS. **`manual-gate.sh` PASS 32/32, re-run independently by me.** 32 rows re-observed, **12 changed**, **18 guide claims corrected, 2 of them false**. Commit `b8644ce`. |

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


## Phase 1 fan-in — i1

**Report gate:** `report-gate.sh .../specialist-reports/9b85cd/i1.md 9b85cd` → **REPORT GATE PASS**
(`ok run: 9b85cd (matches the run being gated)`), run id passed as this run's, not read back from
the report.

**Merge:** `a12c735` → `4f19e14`, verified a true fast-forward with
`git merge-base --is-ancestor` before moving the ref, so nothing was squashed or lost. Files
enumerated from the worktree tree and from the report's *Files created / modified*, not from
`git status` — the worktree was confirmed clean of untracked-but-intended files, and i1 reports
**no new env var**, so there is no `.env.example` to carry.

**Questions collected:** 3, from `.fleet/questions-i1-9b85cd.jsonl` (the per-unit file, never a
shared one), concatenated into `.fleet/questions-9b85cd.jsonl`. **Per-unit line counts: i1 = 3.**
**None is blocking.**

### The pre-registered phase discriminator, resolved

I recorded before dispatch that Phase 2 continues in-run only if `i1` queued nothing that would
change `u1`'s brief. It queued three, and **all three are additive rather than contradictory** —
i1 says so itself on the first two, and I checked the claim against the shipped types rather than
taking it:

1. **`TriggerOutcome` is `'earned' | 'undetermined'`, not `'earned' | 'unearned'`.** i1's reasoning
   is that Q27 forbids evaluating limb two, so the product **cannot** assert a stack has *not*
   earned a specialist — only that limb one did not fire and limb two was never checked. This is
   the `unparsed`-discipline applied to a trigger rule and it is **more** honest than FR-107's own
   word. `u1` renders from `trigger.outcome`; FR-107's visually-distinct treatment keys off
   `actionable`, which is unchanged.
2. **`RegisterState` is `'no-sessions' | 'no-stacks' | 'observed'`** — three states, where FR-108
   names two. The third (*sessions captured, none naming a stack*) is **the state this ledger is
   actually in today**, so it earns its place. Additive: a screen ignoring `no-stacks` still
   renders.
3. **`audit_log` inconsistency** — pre-existing, reported not fixed. i1 followed FR-59 and wrote an
   audit row for FR-109's write (target id only, **never the value**), while noting that
   `attributeSession` and `updateEngagement` write none. Does not touch `u1`.

**Therefore Phase 2 continues in-run**, and all three best guesses are carried into `u1`'s brief
verbatim rather than left for it to rediscover.


## Phase 2 fan-in — u1

**Report gate:** PASS, run id `9b85cd` matched, 6/6 mandated sections, 17 file lines, 4 questions
confirmed on disk.

**Merge:** `7440081` → `9f92f25`, verified a true fast-forward before the ref moved. Worktree clean
of untracked-but-intended files.

**Questions collected:** 4, from `.fleet/questions-u1-9b85cd.jsonl`. **Per-unit line counts: i1 = 3,
u1 = 4, run total = 7.** None blocking.

### One inference of mine that was wrong, and the check that caught it

`git diff --stat` showed `src/lib/nav.ts | 25 +`, and I read that as a **new** file — which would
have meant `/stacks` was reachable only by typing the URL, since no navigation component appeared in
the diff. **That was wrong.** `nav.ts` is pre-existing and imported by 15 pages plus
`main-nav.tsx` and `command-palette.tsx`; u1 *appended* a 25-line entry to `OPERATOR_ROUTES`, so
`/stacks` lands in both the navigation and the command palette without either file being edited.
Confirmed by listing the importers rather than by re-reading the diff. This is the project's own
standing lesson — confirm at the return site, never from a bare identifier or a stat line — and it
cost one command.

**A hazard u1 documented rather than tripped:** six pages read `OPERATOR_ROUTES` by **positional
index** (`[0]`–`[5]`). Inserting `/stacks` anywhere but the end would have rendered screens under
each other's titles — a wrong answer that does not crash. u1 appended at index `[7]` and read its own
entry with `.find(...)`, which is B44's prescribed fix applied to the one call site it owned.

### Verification I ran myself on the merged branch, not taken from the report

| Check | Result |
|---|---|
| Served page routes | **32** (was 31) — counted on the filesystem AND present as `ƒ /stacks` in `next build`'s own route table |
| `pnpm test` | **1987 passed / 6 skipped / 1993**, 131 files — matches u1's claim exactly |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm build` | exit 0 |

Baseline before the run was **1853 passed / 6 skipped**, measured by me at Phase 0 and independently
by i1. Net new this run: **+134 tests** (i1 57, u1 77).


## QA fan-in — qa1

**Status: ISSUES — 0 critical, 1 important, 5 minor.** Nothing blocks the merge. Because there is no
`critical`, this run's status is not forced below SUCCESS by the review; because there IS an
important finding that this run introduced, the status is **SUCCESS WITH ISSUES** and the finding is
carried verbatim rather than summarised into something softer.

### The important finding: a false claim, not a code defect — and I had propagated it

u1 shipped the sentence *"six pages read `OPERATOR_ROUTES` positionally `[0]`–`[5]`"* into
`src/lib/nav.ts`, `src/app/stacks/page.tsx`, its own report, **and this manifest**, where I repeated
it as fact in the u1 fan-in section.

**I verified it myself rather than swapping u1's unchecked claim for QA's.** It is false, and was
already false at this run's merge base:

- **Zero** positional reads exist in `src/`. Every `OPERATOR_ROUTES[n]` occurrence there is **inside a
  comment**.
- All **eight** app pages read by href: `.find((item) => item.href === ...)`.
- The only positional readers in the repo are **two test files** — `tests/nav-routes.test.ts` pins
  `[0]`–`[4]`, `tests/runs-list.test.tsx` pins `[5]` — and both are deliberate tripwires against
  silent reordering.

**Why it survived:** because the hazard is described in comments, a grep for the indexing form
matches **prose about the hazard** rather than code that has it. This is the project's own standing
lesson landing again — confirm at the return site, never on a bare identifier — and the same shape as
the `defect.source_key` claim that reached `prod.md` and an approved CR on run `d4000f`.

**Consequence that matters: B44 is being held open on false evidence.** Its premise is that six pages
need refactoring to href lookups. They already do.

**Fixed:** the two comments **this run introduced** (`5dc9898`), with the correction stating what was
measured. **Not fixed, deliberately reported instead:** the pre-existing false comments at
`nav.ts:107`, `nav.ts:126`, `runs/page.tsx:20`, `questions/page.tsx:22` and `nav-lookup.test.ts:10`.
Rewriting five files' comments is a change Erik should choose, not one this run makes on its way past.
This manifest section is itself the correction of my own propagation.

### Trajectory grading

- **i1 — SOUND on all five checks.** Every quantitative claim traces to observed output: five
  mutations killed 3/1/2/4/3, the `'use server'` reachability probe genuinely created and deleted,
  two `execute_sql` calls. Its prior-learnings reads actually ran — **the opposite of B45**.
- **u1 — UNSOUND on one check of five**, the `OPERATOR_ROUTES` claim only. Its 11/11 mutations, three
  consecutive 1987/6 runs, route count and a `15→14` self-correction are all in the trace and all
  reproduce.

### What QA corroborated independently rather than restating

FR-108 is **load-bearing, not a footer** — the panel precedes the table (`compareDocumentPosition`),
both denominator identities hold on the rendered DOM, and **all nine rendered figures match the live
database exactly**. Limb two is **structurally** unevaluated: QA planted `blockingMilestone.met` and
`tsc` returned `TS2339: Property 'met' does not exist on type 'UnevaluatedClause'`, exit 1. §7a holds:
`summary` appears in no non-test file, **no `.rpc(` call site exists anywhere in the new surface**,
and both live `audit_log` rows carry a target id and no value, inspected column by column.

### QA's verdict on the `undetermined` deviation I referred to it

**Not a deviation.** FR-107's normative sentence imposes no vocabulary on the non-actionable states —
"unearned" sits in the trailing gloss. FR-106 is a **disjunction**, so `¬(A ∨ B)` cannot follow from
`¬A` while `B` is unevaluated. QA's recommendation, which I have taken: record it as a Decisions-log
amendment to FR-107's gloss, **not** as a defect.


## Manual pass fan-in — doc1

**Gating decision, stated:** my standing rule dispatches the manual pass on `qa-reviewer` **PASS** and
forbids it on **FAIL**. QA returned **ISSUES — 0 critical**, with "nothing blocks the merge". I read
that as not-FAIL and dispatched, because the guide update is a **gate on this milestone** (CR-007 §4)
rather than an optional extra, and because no finding touched what the screen claims. Recorded here
rather than left as an unexplained judgement.

**`manual-gate.sh` — my own run, not doc1's, verbatim:**

```
ok    docs/user-guide.md present (10352 words)
ok    evidence file manual-evidence-d4000f.json carries 32 route row(s)
ok    branch serves 32 route(s)
ok    32 of 32 served route(s) covered, all observed

MANUAL GATE PASS - .
```

**The evidence-file trap was avoided, and it would have cost the whole pass.** `manual-gate.sh`
selects `sorted(glob(".fleet/manual-evidence-*.json"))[-1]` — the **lexicographically last**, not the
newest. `9b85cd` sorts **below** the existing `d4000f`, so a correctly-written
`manual-evidence-9b85cd.json` would have been **silently ignored**, leaving the gate reading
`d4000f`'s 31 rows and failing on route coverage while pointing at the wrong cause. I verified the
selection empirically before dispatch and briefed doc1 to amend `manual-evidence-d4000f.json`
**in place** with an `amendments` note — M2.8's recorded pattern. It did, and the gate reads 32 rows.

### B57 earned its keep: 12 of 32 rows changed, and two guide claims were FALSE

B57 says the manual gate cannot tell a fresh observation from a copied one, so rows are re-opened
rather than carried forward. **32 re-observed, 12 changed, 18 claims corrected.** Two were false
rather than merely stale:

1. **The guide told Erik "nothing critical is currently open."** The screen says **`13 open`,
   `critical 1 open`.** `broken.ts:177` with `defects.ts:441` settle it: `isUnresolved(status)` is
   `status !== "verified" && status !== "wont_fix"`, so a defect marked `fixed` is **still open**.
   A guide that tells the operator no critical defect is open, while one is, is exactly the
   wrong-`done` this product exists to refuse — and only a re-observation could find it.
2. **`/work-items/new` carried `UNVERIFIED: submitting the form`** while `prod.md` 818–825 records run
   `d4000f` submitting that same form and creating `b53-seed`, confirmed against the database. The
   guide also contradicted itself elsewhere.

**Safety held.** No destructive control was clicked; every trigger was matched by `data-verify-unit`,
never by label — the discipline that exists because a label-matched sweep **archived the live
`delivery-ledger` engagement** during this very task on run `29b583`. Two dialogs were opened and
closed with Escape. **Save was never pressed**, and the row read `data-verify-covered="false"` before
and after, so the reversible write I had offered went unused and needs no reverting. No record was
created, modified or deleted. The credential was read from the environment only and no Playwright run
failed, so **B38 did not fire**.

## Questions — 13 queued, none blocking

Per-unit line counts: **i1 = 3, u1 = 4, doc1 = 6, run total = 13**, concatenated into
`.fleet/questions-9b85cd.jsonl` from the three per-unit files.

**Two that doc1 raised are product findings, not documentation ambiguities**, and they are the most
useful things in the queue:

- **`Broken` labels a group `N open` while the rows beneath read `fixed`.** Intended by the code, and
  now explained in the guide — but anyone who has not read that new paragraph will misread the screen.
- **One milestone amount renders three different ways on three screens** — `unreadable` on the
  engagement, `not recorded` on the milestone, a dash on Committed. **Two of the three are false under
  the product's own vocabulary.** doc1 recorded all three as a disagreement rather than picking one,
  per the standing rule that where two artifacts disagree you emit both.

## Final state

| Check | Result |
|---|---|
| `pnpm test` | **1987 passed / 6 skipped / 1993**, 131 files (baseline 1853, **+134**) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | exit 0 |
| Served page routes | **31 → 32** |
| `manual-gate.sh` | **PASS 32/32, all observed** (re-run by me) |
| `security-gate.sh` (resolved spec) | PASS |
| QA | ISSUES — 0 critical, 1 important, 5 minor |
| Migrations | **0** |
| Dispatches used | **4 of 20** |
