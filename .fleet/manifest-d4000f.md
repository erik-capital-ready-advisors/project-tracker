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
| r1 | research | 1 | Fix the conventions: how all 11 filterable screens read `searchParams` under Next 16, how `app-shell.tsx` mounts `UnparsedCount`, existing engagement-resolution helpers, and the `/registry/new` form pattern. Output to `.fleet/research/d4000f/r1.md` | researcher | — | **done** — gate SKIP (research note, nothing mergeable), run id matched. Note at `.fleet/research/d4000f/r1.md`. **Corrected the approved CR: only 9 of 11 screens read `searchParams`, in 3 divergent shapes; `/runs` and `/registry` read none** |
| i1 | integration | 1 | FR-87 schema foundation: make `work_item.execution_mode` nullable, add the FR-91 staleness timestamp, add the FR-90 plan-reference + collision columns, PLAIN unique index, per-name REVOKE + `service_role` GRANT on any new function, regenerate types | api-integrator | — | **done** — gate PASS. Migration `20260824110601` **applied to live Supabase `onpvolboecjpdkvurjaf`**, local file renamed to match. Committed `3ef7861`. Baseline held exactly: 1550/6, typecheck 0, lint 0, gate:m27 5/5, build PASS. **Carries defect D-1 (below)** |
| i2 | integration | 1 | FR-89 plan parser: pure function over the `writing-plans` shape (`### Task N:` + `- [ ]`), `unparsed` the only default, test feeding it an unrecognised shape, byte-copy fixture | api-integrator | — | **done** — gate PASS. `src/lib/ingest/planDocument.ts` +3 test/fixture files, **all 4 untracked**. test **1594 passed / 6 skipped** (+44 from 1550), typecheck 0, lint 0, gate:m27 5/5. **6 mutations, 0 survivors**, incl. the guess-instead-of-`unparsed` one. Parser ships **unwired** — i3 owns the seam |
| u1 | ui | 1 | FR-96a + FR-96b shell foundation: one engagement picker in `app-shell.tsx` beside the badge; badge stays ledger-wide and labels its scope under a filter | ui-designer | r1 | **done** — gate PASS (17 file lines). `src/lib/engagement-filter.ts` + `engagement-roster.ts` + `engagement-scope.tsx` + 2 tests new; `app-shell.tsx`, `layout.tsx`, `unparsed-count.tsx`, `unparsed-display.ts` + 2 tests modified. test **1594 / 6 skipped**, typecheck 0, lint 0, gate:m27 5/5, **manual-gate PASS 30/30, routes unchanged**. Found and fixed 2 defects by serving the build (picker rendered on gated screens; 375px label overflow). **`gate:m27:e2e` NOT VERIFIED from the worktree — orchestrator ran it post-merge: 10/10** |
| i3 | integration | 2 | FR-90 read side (mark every collision, merge nothing) + FR-87/FR-88 planned-work write path | api-integrator | i1, i2 | pending |
| i4 | integration | 2 | FR-91 staleness derivation — pure, 30-day boundary from a date passed in, never `new Date()` inside — plus planned-row query helpers | api-integrator | i1 | **done** — gate PASS (6 sections, 14 file lines, 4 questions), run id matched. Worktree base STALE `75f070a` → reset `6f91fa2`, `HAVE_PHASE1` confirmed, **verified independently by project-lead**. Committed `c7c62ee`. Module `@/lib/server/workitems/planned` — full signature block carried into u4's brief. test **1673 passed / 6 skipped** (+35 from 1638, exactly its new tests), typecheck 0, lint 0, gate:m27 5/5, build exit 0. **Red-capability proven: 4 derivation mutations + 3 projection mutations, 0 survivors**, `planned.ts` restored byte-identical and SHA-checked. No migration, no route, no action, no new field on any agent-facing payload (grepped for object spread in the three answer modules), no column newly decrypted. **D-1 deliberately untouched and still u4's** — `isPlannedRow` reads raw snake_case columns precisely because `fromExecutionMode(null)` returns `"fleet"`, so i4 neither depends on the fix nor breaks when it lands, and **no test here asserts the broken behaviour**. `gate:m27:e2e` NOT VERIFIED — orchestrator post-merge; did not point one at the shared checkout |
| u2 | ui | 2 | FR-88 hand-entry form at `/work-items/new` (engagement REQUIRED per Q14). Takes served routes 30 → 31 | ui-designer | u1, i1 | **done** — gate PASS (6 sections, 11 file lines, 4 questions), run id matched. Worktree base STALE `75f070a` → reset `6f91fa2`, `HAVE_PHASE1` confirmed, **verified by project-lead**. Committed `23ce03c`. **Served routes 30 → 31** and `manual-gate.sh` now reports exactly `FAIL FORWARD: the branch serves /work-items/new and the guide's evidence never mentions it` — everything above it `ok`. **This is expected and is doc1's job**, budgeted, not discovered at merge. test **1670 passed / 6 skipped** (+32, +2 files), typecheck 0, lint 0, gate:m27 5/5, build exit 0. **11 mutations, 11 caught, tree restored.** Dev server started, both screens driven at 1280 and 375 (375: `scrollWidth` 375, zero overflowing elements), and **confirmed shut down**. `gate:m27:e2e` NOT VERIFIED — orchestrator post-merge |
| u3 | ui | 2 | FR-96 URL filter honoured on all 11 list screens + FR-96c explicit "no such engagement" state, never a silent fall-back | ui-designer | u1, r1 | **in_progress** — Wave A, dispatched 2026-08-24 |
| u4 | ui | 2 | FR-91 planned + STALE visual treatment everywhere a work item renders | ui-designer | u1, i4 | pending |
| c1 | copy | 2 | Microcopy: form labels and help, empty states, STALE wording, "no such engagement" state, the FR-96a badge scope label | copywriter | u1, u2, u3, u4 | pending |
| doc1 | docs | 2 | `docs/user-guide.md`: FR-96 filter section + `/work-items/new` section + observed evidence rows, taking the evidence file to 31 routes | docs-writer | u2, u3, u4, c1 | pending |
| d1 | deploy | 2 | Apply i1's migration, rename the local file to the version `list_migrations` reports, check advisors, verify the preview deploy | devops | i1 | **done** — gate PASS (5 sections, 5 questions), run id matched. Worktree base was STALE `75f070a`, reset to `6f91fa2`, `HAVE_PHASE1` confirmed — **verified independently by project-lead**, not taken on report. **Applied nothing.** Migration `20260824110601` verified against the LIVE database, not the file: version+filename match on all 13 (no `db push` re-run risk); `execution_mode` nullable; BEFORE UPDATE trigger enabled; unique index is **PLAIN** (`btree (engagement_id, plan_ref)`, no `WHERE`); `app.touch_updated_at()` `proacl = postgres=X || service_role=X`, no PUBLIC. Catalog claims exercised in rolled-back transactions (2nd upsert no `42P10`; `service_role` write no `42501`; trigger overrode a written timestamp; CHECK `23514`), rollback proven after the fact. Advisors: security 4 findings **0 introduced**; performance **1 introduced** — `work_item_planned_updated_idx` unused, benign only while FR-91's reader is deferred, **re-check when it ships**. **BLOCKING FINDING B-P1 (below).** Declined to create a preview deploy, with reasons |
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

## D-1 — latent defect created by i1, invisible to tsc and to 1550 tests, MUST be fixed in Phase 2

**`pnpm typecheck` passes with zero errors after `execution_mode` became nullable, and that is the
problem.** The row interfaces are hand-written and do not derive from the generated
`Tables<"work_item">`, so widening the database type reaches nothing. Measured by i1 running the
real functions:

```
fromExecutionMode(null)              -> "fleet"     <-- a planned row reads as FLEET WORK
fromExecutionMode("fleet") [control] -> "fleet"
fromExecutorKind(null)               -> "unassigned"  <-- safe
```

- `answers/from-db.ts:95`, reached from `answers/load.ts:313`, `detail/work-item.ts:195`,
  `runs/detail.ts:198` — **a planned row reads as fleet work. That is precisely the FR-91 failure:
  "nobody has started this" reading as "this is in flight."**
- `workitems/list.ts:216` passes raw `null` to `EXECUTION_MODE_LABELS[null]` -> `undefined` ->
  **blank chip** on `/work-items`.

**Nothing is broken today. It goes live the moment i3 writes the first planned row.** i1 correctly
did not fix it: the fix widens the domain type into `ExecutionModeChip` and its two callers, which
is React and therefore **u4's scope**. **u4 owns D-1 and i3 must not write a planned row before it
lands** — or must land behind it in the merge order.

## Carried NOT VERIFIED, declared before dispatch

- **Any positive-path agent-token assertion** (§7c row 1, measured DEGRADED). The boundary is
  proven to refuse and not proven to admit. No unit may claim an authenticated ingest round-trip.

## Questions

One file per unit: `.fleet/questions-<unit-id>-d4000f.jsonl`. Concatenated at fan-in into
`.fleet/questions-d4000f.jsonl`. Never a shared file — a worktree-isolated agent cannot append to
one, and the last writer silently wins.

| Unit | Lines |
|---|---|
| r1 | 2 |
| i1 | 4 |
| i2 | 4 |
| u1 | 4 |

---

## Phase 2 wave plan — project-lead, on resume 2026-08-24

Phase 2 is the first wave in this run whose units depend on **merged** Phase 1 code, so it is
sequenced rather than fanned out flat. Each wave merges before the next dispatches, which is the
only mechanism that puts a dependency's output into a dependent's worktree.

| Wave | Units | Why this wave |
|---|---|---|
| A | i4, u2, u3, d1 | every dependency is already in `7be6949` |
| B | **u4 then i3, merged in that order** | u4 consumes i4's staleness derivation; **u4 carries the D-1 fix and must land before or with i3** |
| C | c1 | copy fills the slots u2/u3/u4 leave; a `copy` unit dispatched in parallel with its `ui` units greps a tree with no markers in it |
| D | doc1 | the guide quotes final copy and needs u2's new route observed |
| Synth | qa1, then man1 on a QA **PASS** only | |

### Seam decision — FR-88's two creation paths, split so neither unit builds the other's

FR-88 creates planned work two ways. Left implicit, u2 and i3 both write a planned-row insert.

- **u2 owns the hand-entry path end to end** — `/work-items/new`, its form, its server action,
  **and the shared planned-work insert primitive** (engagement required, `execution_mode` NULL,
  `status = 'pending'`, `description` encrypted per §7a).
- **i3 owns the plan-document path** — bulk creation from i2's parser — **and adopts u2's
  primitive.** i3 also owns the FR-90 collision read side.

This mirrors u1 owning `src/lib/engagement-filter.ts` and u3 adopting it: the unit that lands
first owns the primitive. *project-lead, high confidence.*

### EVERY worktree in this run is cut at `75f070a` — corrected, and worse than first recorded

**First recording was wrong and is corrected here rather than quietly edited.** A
`git worktree list` taken immediately after dispatching Wave A showed i4/u2/u3 at `6f91fa2` and
only d1 at `75f070a`, which was written up as "bases are not uniform within a batch". The
specialists' own step-zero SHAs disprove it: **i4 and d1 both report HEAD before reset as
`75f070a`**, and u1's recovered Phase 1 report reports `75f070a` → `0594209`. The snapshot caught
three units *after* they had already reset. The list command sees post-reset state and cannot be
used to audit this.

**The actual fact: every worktree this run creates — Phase 1 and Phase 2 alike — is cut at
`75f070a`**, two commits before the run's own base ref `3927de4` and four before the Phase 1 merge
`7be6949`. Such a tree has no `engagement-filter.ts`, no `planDocument.ts`, no
`20260824110601` migration, and no resolved spec.

**Every Wave A unit would have built against it.** Nothing in the dispatch reaches worktree
creation — the worktree exists before the prompt is read — so the only thing standing between this
run and four units silently building on a pre-run tree is the mandatory step-zero
`reset --hard <branch>` and its two guards. It fired four times out of four.

**Audit rule for the rest of this run:** a unit's base is verified from **its reported pre-reset
SHA plus `git merge-base --is-ancestor 7be6949 <its HEAD>` run by project-lead**, never from
`git worktree list`.

## Carried NOT VERIFIED, declared before dispatch

- **Any positive-path agent-token assertion** (§7c row 1, measured DEGRADED). The boundary is
  proven to refuse and not proven to admit. No unit may claim an authenticated ingest round-trip.

## Questions

One file per unit: `.fleet/questions-<unit-id>-d4000f.jsonl`. Concatenated at fan-in into
`.fleet/questions-d4000f.jsonl`. Never a shared file — a worktree-isolated agent cannot append to
one, and the last writer silently wins.

| Unit | Lines |
|---|---|
| r1 | 2 |
| i1 | 4 |
| i2 | 4 |
| u1 | 4 |

---

## Phase 2 wave plan — project-lead, on resume 2026-08-24

Phase 2 is the first wave in this run whose units depend on **merged** Phase 1 code, so it is
sequenced rather than fanned out flat. Each wave merges before the next dispatches, which is the
only mechanism that puts a dependency's output into a dependent's worktree.

| Wave | Units | Why this wave |
|---|---|---|
| A | i4, u2, u3, d1 | every dependency is already in `7be6949` |
| B | **u4 then i3, merged in that order** | u4 consumes i4's staleness derivation; **u4 carries the D-1 fix and must land before or with i3** |
| C | c1 | copy fills the slots u2/u3/u4 leave; a `copy` unit dispatched in parallel with its `ui` units greps a tree with no markers in it |
| D | doc1 | the guide quotes final copy and needs u2's new route observed |
| Synth | qa1, then man1 on a QA **PASS** only | |

### Seam decision — FR-88's two creation paths, split so neither unit builds the other's

FR-88 creates planned work two ways. Left implicit, u2 and i3 both write a planned-row insert.

- **u2 owns the hand-entry path end to end** — `/work-items/new`, its form, its server action,
  **and the shared planned-work insert primitive** (engagement required, `execution_mode` NULL,
  `status = 'pending'`, `description` encrypted per §7a).
- **i3 owns the plan-document path** — bulk creation from i2's parser — **and adopts u2's
  primitive.** i3 also owns the FR-90 collision read side.

This mirrors u1 owning `src/lib/engagement-filter.ts` and u3 adopting it: the unit that lands
first owns the primitive. *project-lead, high confidence.*

### Worktree bases are NOT uniform within a single dispatch batch — measured this wave

`git worktree list` immediately after dispatching Wave A, before any specialist had run its
step-zero reset:

| Unit | Worktree base at creation | Contains Phase 1 merge `7be6949`? |
|---|---|---|
| i4 | `6f91fa2` | yes |
| u2 | `6f91fa2` | yes |
| u3 | `6f91fa2` | yes |
| **d1** | **`75f070a`** | **NO — two commits before the run's base ref** |

Four worktrees created by one message, three at the branch tip and one at a commit predating the
run entirely. This is the `cd414c` failure mode reproduced live, and it is **not** predictable
from dispatch order or unit type. The mandatory step-zero `reset --hard <branch>` is what makes
it survivable; each unit's two reported SHAs are checked against this table at fan-in.

## Carried NOT VERIFIED — restated at Phase 2 dispatch, not discovered at the end

- **Any positive-path agent-token assertion** (§7c row 1, measured DEGRADED in Phase 0). Proven
  to refuse (401 no-auth, 401 bad-auth, 401 ingest); **not proven to admit.** `.env.local` is
  read-denied by design and that denial is not routed around.
- **`pnpm gate:m27:e2e` from any worktree.** It needs `M27_BASE_URL` **and** `M27_STORAGE_STATE`,
  and the storage-state file is gitignored — structurally unrunnable in an isolated tree. Every
  Wave A brief assigns it to the orchestrator post-merge and forbids pointing it at a dev server
  running against the shared checkout, which would report another tree's code as the unit's pass.

## Phase 1 record gap — RECOVERED at Phase 2 resume, not unrecoverable

The resume brief recorded u1 as `done` with **no report**, absent from the merge commit and
"from every worktree", and instructed that it be reported as an unrecoverable record gap and not
fabricated. **The premise was checked rather than accepted, and it is wrong in its second half.**

`find . -name u1.md` located the report **in u1's own worktree**,
`.claude/worktrees/agent-a5588be50ada61d04/.fleet/specialist-reports/d4000f/u1.md` — 343 lines,
21,659 bytes, written 08:58. `git -C <that worktree> status --porcelain` on the path returns
`?? .fleet/specialist-reports/d4000f/u1.md`: **u1 wrote its report and never committed it**, so
the Phase 1 merge — which takes committed content — could not carry it. Nothing was lost; one
file was never staged.

- `report-gate.sh <path> d4000f` → **PASS**: run id matches, specialist `ui-designer`, status
  DONE, all 6 mandated sections present, 17 file lines, `## Verification` carries observations,
  and its 4 queued questions are present in `.fleet/questions-u1-d4000f.jsonl`.
- Copied to `.fleet/specialist-reports/d4000f/u1.md` and confirmed **byte-identical by SHA-256**
  (`287ec757b5bbac99660154057eadf508949d2964ee4da083bdd2db081a56640b`). These are u1's own bytes,
  not a reconstruction — the one thing the brief rightly forbade.

**u1's trajectory is therefore gradable and its two self-reported defects have a first-hand
record.** The report's own header also corroborates the worktree-base finding above: its reset
line reads `75f070a` → `0594209`, so u1's tree was cut at the same pre-run commit d1's was, and
the step-zero guard is what saved it.

**The generalisable defect is in the merge step, not in u1.** A specialist report is written into
`.fleet/` inside the worktree, and `.fleet/` is tracked in this repo — so an uncommitted report is
invisible to a merge that takes commits, and the orchestrator that reads reports off disk in the
main tree sees nothing and cannot distinguish "never written" from "never staged". Every Wave A
brief already requires a "Files created / modified" section listing untracked files for this
reason; the missing half is that **the orchestrator must sweep each worktree for its report before
concluding one is absent.** Applied to all Wave A/B/C/D fan-ins on this run.

---

## B-P1 — the live database has moved ahead of every deployed artifact. Found by d1.

**Not a schema defect. A state-of-the-world defect, and it predates this resume.**

i1 applied migration `20260824110601` to the **live production** Supabase project
`onpvolboecjpdkvurjaf` during Phase 1. The commit carrying it is on **no remote branch and in no
deployment**:

- `git ls-remote` for `agent-build/2026-08-24-d4000f` returns **nothing** — the branch was never
  pushed.
- Production serves **`e3de4be` on `master`**, SHA read from the Vercel API rather than inferred
  from a timestamp coincidence.
- There is **no preview deployment for this branch**, confirmed with a negative control proving
  the branch filter can return rows — the "API cannot see it" / "it does not exist" distinction
  this project has been burned by before.

**d1 assessed production harm and judged none**, with evidence rather than reassurance: every
change is additive or widening, production reads `work_item` through explicit column lists, there
is no zod schema anywhere to reject an unexpected column, and it observed `200`/`401`/`404` on
three different production requests taken after the migration. Worth recording that its **first
grep for this returned zero on both the pattern and the control — blind, not clean** — and it
re-ran with a control that must match before drawing the conclusion. That is the repo's
standing scan rule applied unprompted.

**Why it still matters:** the fleet's schema changes are reaching production directly while the
code that uses them is not. This run's remaining units widen that gap, not close it. The decision
of when to push and deploy is Erik's; d1 correctly **declined to create a preview deploy** on the
grounds that from an unpushed branch it would carry no git metadata, would not be "the preview for
this branch", and would publish ungated code. Queued as its question 4.

## d1's own false negative, caught and re-measured — worth carrying to the learnings

d1's first probe reported `trigger_fired_under_service_role: false`. That was an artifact of
`now()` being **frozen inside a transaction**, not a broken trigger; it re-measured with a
technique that discriminates and the trigger is fine. A specialist that reports its own
retracted measurement is doing the thing this fleet's report gate cannot check for.

---

## Routing corrections from Wave A — these change later briefs, and both were the specialist's catch

### 1. The shared primitive's module path is NOT the one project-lead suggested

u2's brief proposed `src/lib/planned-work/create-planned-work-item.ts`. **u2 corrected it and was
right:** every service-role module in this repo lives under `src/lib/server/**`, and `src/lib/**`
outside it is client-safe. Placing a service-role writer in the client-safe half would have been a
real defect, not a naming quibble. Actual path and signature, to be carried verbatim into i3's brief:

```ts
// @/lib/server/planned-work/create-planned-work-item
createPlannedWorkItems(db: ServiceClient, engagementSlug: string, items: readonly PlannedWorkInput[]): Promise<PlannedWorkRecord[]>
createPlannedWorkItem (db: ServiceClient, engagementSlug: string, item:  PlannedWorkInput):            Promise<PlannedWorkRecord>
```

- **No `'use server'`, no `requireOperator()`** — it takes an already-authorised client so i3 can
  reach it under an agent token. **i3 MUST gate before calling it.** This is the sharpest thing in
  the handoff: the primitive is deliberately unauthenticated and i3 inherits that obligation.
- Takes a **slug**, not an id — i2's `ParsedPlan.engagement` drops straight in.
- Writes split on `plan_ref`: NULL → plain insert (NULLS DISTINCT); present → `upsert … on conflict
  (engagement_id, plan_ref)` with `ignoreDuplicates`. **Returned order is not input order.**

### 2. A deliberate cross-unit edit, reported rather than buried

u2 added `aria-hidden` to the "required" badge in `src/app/registry/_components/field.tsx`, which
also changes `/registry/new` and `/registry/[slug]/edit`. Serving the build showed the
accessibility tree reading `combobox "Engagementrequired"` — **a label's text nodes concatenate
with no separator.** No test in the repo would have caught it and none broke. Now pinned by a
`getByRole(…, { name })` assertion and queued as u2's question 4 in case Erik wants it
report-only. This is the second run in a row where serving the build found a defect the whole
suite was blind to.

## A NOT VERIFIED that two units jointly nearly discharge — resolve before claiming it

u2 states honestly: its primitive's tests run against `createFakeDb`, which models **neither
`NULLS DISTINCT` nor PostgREST's `resolution=ignore-duplicates`**. So *"the code asks the database
for the right thing"* is proven; *"the database does the right thing with it"* is **NOT VERIFIED**
for the duplicate-`plan_ref` skip.

**d1 independently covers part of this against the live database:** it exercised a second
`on conflict` post in a rolled-back transaction and got **no `42P10`**, which settles the conflict-
target mechanics — exactly the failure mode the PLAIN-index rule exists for. What remains open is
narrower than u2 could know: (a) two planned rows with **NULL** `plan_ref` must both insert under
NULLS DISTINCT, and (b) `ignoreDuplicates` must **skip** rather than error or overwrite.
**project-lead resolves (a) and (b) post-merge with a rolled-back live query** rather than carrying
a NOT VERIFIED that is one statement away from being closed.
