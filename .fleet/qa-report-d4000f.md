# QA report d4000f

**Status:** ISSUES
**Gating verdict for the end-user manual pass: PASS — proceed.** No `critical` is open. The one
`important` is a false sentence in an error path, not a defect a person will meet on a screen.
**Branch:** agent-build/2026-08-24-d4000f (HEAD `64628b2`)
**Reviewed against:** **resolved spec** `.fleet/resolved-spec-d4000f.md` + CRs [CR-001, CR-002, CR-003, CR-004, CR-005 §3.1 + §3.3]
**Critical:** 0 · **Important:** 1 · **Minor:** 9

## Verdict

M2.9 is the strongest branch this fleet has produced on this project, and I could not break the
part that mattered most. **All seven mutations I applied to the milestone's load-bearing rules were
caught by the existing suite** — including reverting D-1, which produced *exactly* the 4 failures
u4's report claims, independently corroborating its red-then-green account. FR-90 reads no prose
anywhere; FR-96c never falls back to unfiltered and never reuses `notFound()`; FR-91 is derived with
no column and no status; the new write path does not merely resemble the encrypted one, it *calls*
it. Nothing to hold the release for.

**Fix before merge:** `/api/ingest/run` can return the sentence *"Nothing else was changed"* to an
agent **after `persistPlan` has already committed the entire run**. In a product built against wrong
`done`, shipping a wrong *"not done"* is the same defect facing the other way.

Two things Erik should know that the run did not surface. **i4 wrote a query against a schema it
never read** — it took the column list from i1's *report* and got the right answer; that is the
trajectory failure output-checking cannot see. And **c1's report says it proved its new assertion
red-capable against the old copy "first"; the trace shows it proved it last**, by post-hoc mutation.
The proof is real and the restore is verified — the ordering claim is not.

## Spec coverage

| Requirement | Implemented | Evidence |
|---|---|---|
| FR-87 planned row = `execution_mode` NULL + `status=pending`, engagement required at creation | yes | `20260824110601:50-51` drops NOT NULL; `create-planned-work-item.ts` resolves engagement or refuses; `e2e-review/qa1-d4000f-planned-work.spec.ts:195` |
| FR-88 two creation paths, both requiring an engagement | yes | form `src/app/work-items/new/`; parsed path `plan-document.ts:223` — **both call the one primitive** |
| FR-89 parser pure over text, `unparsed`-only default | yes | `src/lib/ingest/planDocument.ts:194,197,199,202,204,238,256,261` — every unrecognised shape → `unparsed`. Zero fs/db imports |
| FR-90 read side: mark every collision, merge nothing, no prose key | yes | `reconcile.ts` reads only `id, execution_mode, status, plan_ref, plan_reconciliation`. **Mutation "merge on prose" → 17 tests red** |
| FR-90 `keyed` unreachable in M2.9 | yes | `reconcile.ts` produces only `collision`/default; CHECK at `20260824110601:207` |
| FR-91 staleness derived, never stored, from a date passed in | yes | `planned.ts:73,148-159`; no `stale` column/status in migration. **Mutation 30→3000 days → 10 red** |
| FR-91 planned row distinguishable on every screen | **partial — not observed** | Code + unit tests present (`tests/planned-chip.test.tsx`, real component, 0 mocks). **The ledger holds no planned row, so the marker was never rendered.** See Not reviewed |
| FR-96 filter on the eleven screens, unfiltered default | yes | `engagement-filter.ts:ENGAGEMENT_FILTERABLE_PATHS`; 11/11 observed, `qa1-d4000f-planned-work.spec.ts:109` |
| FR-96a badge ledger-wide + "(whole ledger)", suppressed when UNKNOWN | yes | `unparsed-display.ts:56-66`; observed on screen. **Mutation dropping the label → 5 red** |
| FR-96b one picker in the shell, URL is the whole state, no stickiness | yes | `app-shell.tsx:109`; cookies/localStorage/sessionStorage all empty — observed, `spec.ts:121` |
| FR-96c unresolvable filter → explicit state, no rows, never a silent fallback, not a 404 | yes | **Observed 200 + `unknown-engagement` notice + 0 rows on all 11 screens.** `notFound()` appears only in `[id]` detail pages. **Mutation → 5 red** |
| FR-96 detail views do NOT take the filter | yes | `engagement-scope.tsx:94` gates on `isEngagementFilterable`; observed |
| Served page routes stay 30/31 | yes | `manual-gate.sh` PASS, 31 routes (the FR-88 form is the +1) |

## Security posture review

**Reviewed against:** spec §7a (**21 tables classified**). Controls below are marked **[§7a]** where
the spec dictated them and **[baseline]** where `~/.claude/agents/security-baseline.md` did.

**Table reconciliation — built from the migration diff, not from any report.**
The migration contains **no `create table`**. M2.9 introduces **no new entity**: planned work is a
`work_item`. So:

- Tables in the migration diff but **not** in §7a: **none.**
- Tables in §7a but not in `api-integrator`'s report: **none** — the only altered table, `work_item`,
  is reported on.

| Table | Class per §7a | Treatment found on branch | Verdict |
|---|---|---|---|
| `work_item` | sensitive | 4 new columns, all clear: `created_at`, `updated_at` (timestamptz), `plan_reconciliation` (enum), `plan_ref` (text). §7a names exactly two encrypted columns (`description`, `raw_status`) and **both are still encrypted on the new write path** — `create-planned-work-item.ts:266` calls the pre-existing `encryptAll` from `@/lib/server/ingest/encrypt`, the same helper `persist.ts:166` uses | **MATCHES** |
| `work_item.description` on the NEW path | sensitive | `encryptAll` throws rather than degrading; `description` is **not selected back** (`create-planned-work-item.ts:63`), so no plaintext round-trips | **MATCHES** |
| `work_item.raw_status` on the NEW path | sensitive | never written — a planned row has no run and no raw status. Correct omission, not a gap | **MATCHES** |
| `work_item.plan_ref` | (new column, clear) | Clear by necessity — an encrypted key cannot be indexed. Constrained at the parser by `PLAN_ID` regex (`planDocument.ts:171`, no whitespace/prose) and fixed `null` on the hand path | **ACCEPTED** — same treatment §7a gives `requirement.ref` |

| Control | Observed | Verdict |
|---|---|---|
| **[§7a]** New tables unclassified | none exist | PASS |
| **[§7a]** MFA (`aal2`) enforced **in RLS**, not only in Next.js | No new policy exists. All policies route through `app.is_operator()` (`rls_and_grants.sql:51-65`) = `app.assurance_satisfied()` AND `role is not null`. New columns inherit table-level `grant select` — no copy-paste omission possible | PASS |
| **[§7a]** New-account role | unchanged this run; `requireOperator` refuses below `aal2` at `operator.ts:144` | PASS (unchanged) |
| **[§7a]** Agent tokens refused `contract_milestone` | unchanged; new route touches only `work_item`/`engagement` | PASS (unchanged) |
| **[§7a]** No unauthenticated endpoint costing money | **All 14 handlers across 13 route files gated.** `/api/ingest/plan` (new) = `withAgentRoute(INGEST_WRITE)`. `/api/export` = `requireOperator()` at `src/lib/server/export/run.ts:41`, **verified at the code, before `createServiceClient()`** | PASS |
| **[repo rule]** Per-name `REVOKE FROM PUBLIC` + matching `GRANT TO service_role` | One new function, `app.touch_updated_at()`. REVOKE at `:131`, GRANT at `:132`. Reached **only** from a `BEFORE UPDATE` trigger (the exempt case) — no CHECK, no generated column, no RLS expression, no app call site. The migration **explicitly declined** to put a function call in the new CHECK (`:202-209`) | PASS — the `b0952e` failure mode was actively avoided |
| **[repo rule]** Upsert conflict target is a PLAIN unique index | `create unique index work_item_engagement_plan_ref_key on public.work_item (engagement_id, plan_ref)` — no `WHERE` | PASS |
| **[baseline]** Security headers, **served** not just configured | Observed on a live response: HSTS `max-age=63072000; includeSubDomains` (**no `preload`, matching what the repo sets** — so this is the app's header, not an edge one), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, **`Cross-Origin-Opener-Policy: same-origin`**, `X-DNS-Prefetch-Control: off` | PASS — every declared header served, none missing |
| **[baseline]** CSP is a real policy | Observed: nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. **No `unsafe-inline` anywhere** | PASS |
| **[baseline]** Transit — no `http://`, no disabled cert validation | 4 `http://` in the diff, all `localhost`. Zero `rejectUnauthorized` / `NODE_TLS_REJECT_UNAUTHORIZED` / `--insecure` in code | PASS |
| **[baseline]** Secret scan of the diff | Zero on every credential pattern. **Control terms non-zero and reported** (`const` 647, `export` 169, `work_item` 237) — the scan is proven not blind | PASS |
| **[baseline]** No new env vars / secret surface | `process.env.*` added: **none**; `.env.example` unchanged | PASS |
| **[baseline]** `pnpm audit --audit-level=high` | `No known vulnerabilities found`. **Zero dependency changes in the entire diff** — `package.json` and `pnpm-lock.yaml` untouched | PASS |
| **[baseline]** No raw DB error to the client | `mark-collisions.ts:110` deliberately withholds the Postgres message ("names tables and sometimes row values") | PASS |
| **[baseline]** Rate limit on the new route | inherited from `withAgentRoute` (FR-8) | PASS |
| **[§7a]** Agent-token **positive** path | **NOT VERIFIED — no valid token obtainable.** `.env.local` is read-denied by `.claude/settings.json`, by design, and that denial was not routed around | NOT CHECKABLE (declared) |

**Agent-token boundary, measured:** `/api/ingest/plan` no-auth → **401**, bad-bearer → **401**,
empty-bearer → **401**, `GET` → **405**; refusal body names no mechanism. Controls
`/api/ingest/run` → 401 and `/api/answer/next` → 401. **The new boundary is proven to REFUSE. It is
NOT proven to ADMIT, and no positive-path claim is made here.**

## Issues

### Critical

None.

### Important

1. **`/api/ingest/run` tells the caller "Nothing else was changed" after the whole run was persisted** — `src/lib/server/planned-work/mark-collisions.ts:110-115`, reached from `src/app/api/ingest/run/route.ts:77`
   - What: `persistPlan` commits at `route.ts:58`. `markPlanCollisions` runs at `:77`. If its read
     fails it throws `apiError("internal_error", "The FR-90 reconciliation could not read this
     engagement's work items, so no collision mark was written. **Nothing else was changed.**")`.
     `withAgentRoute` converts a thrown `ApiError` into that message verbatim.
   - Why it matters: the sentence is false. Everything else *was* changed — the run, its work items,
     its blockers. This product exists to stop a wrong `done`; a wrong *"not done"* is the same
     error inverted, and it is the one an agent will act on by re-posting or by reporting the ingest
     failed. The second clause is also stale on the update path, which reports partial success
     correctly two lines below.
   - Evidence: `route.ts:58` vs `:77` ordering, read directly; `guard.test.ts:206` confirms a thrown
     `ApiError` reaches the client with its own message.
   - Fix: scope the sentence to the reconciliation — *"The run was persisted. Only the FR-90
     collision marking failed; re-post to complete it."*

### Minor

1. **A stale comment re-plants exactly the trap this repo has a lesson about** — `src/lib/database.types.ts:66-67`
   - Says `fromExecutionMode()` *"currently returns `"fleet"` for null"*. That is D-1, and it is
     fixed in the same commit (`from-db.ts:117` → `?? EXECUTION_MODE_UNPARSED`). Two files in one
     commit disagree about live behaviour. The repo's own lesson — *"comments here describe what the
     code does NOT do at least as often as what it does"* — was earned on precisely this shape.
   - Fix: delete the sentence or mark it "was D-1, fixed 2026-08-24".

2. **Three components are mocked in the only test file that references them, with no test of the real thing — the B46/B43 shape** — `tests/app-shell.test.tsx:63-65`
   - `MainNav`, `MobileNav`, `ThemeToggle` are each stubbed, and no other test mounts them.
     `CommandPalette` had exactly this profile and reached production.
   - **Pre-existing, and NOT this run's doing** — the mocks are not in the diff and the run did not
     touch those three components. Reported because the sweep is the highest-yield check on this
     project and it should not have to be re-derived next run.
   - Fix: a smoke test per component that renders the real thing.

3. **No test pins the "every `api/**/route.ts` is guarded" convention** — flagged honestly by i3, and I agree it should exist
   - All 14 handlers are guarded today; only convention holds it. A naive grep flags
     `src/app/api/export/route.ts` as unwrapped and is wrong — **verified: it authenticates by
     operator session at `src/lib/server/export/run.ts:41`, before `createServiceClient()`.**
   - Fix: a test enumerating `src/app/api/**/route.ts` that asserts each exported handler is either
     `withAgentRoute`-wrapped or reaches `requireOperator()`, with `export` listed by mechanism
     rather than exempted.

4. **`db as unknown as ReleaseDb` double-cast in a write path** — `src/app/api/ingest/run/route.ts:78`, `src/lib/server/planned-work/plan-document.ts:226`
   - `as unknown as` disables the one check that would catch the agent-scoped client and `ReleaseDb`
     diverging later. Verified **not** a live vulnerability: the runtime `agentScopedDb()` Proxy is
     not stripped by a type assertion, and both engagement reads select only allow-listed columns.
   - Fix: a shared minimal interface both clients satisfy, so the cast becomes unnecessary.

5. **This run propagated a WCAG AA contrast failure into two new components** — `src/components/planned-chip.tsx:66`, `src/app/work-items/_components/chips.tsx`
   - `text-muted-foreground/70` at `text-xs` measures **3.55:1** against `#fafafa`; AA needs 4.5:1.
     Pre-existing in 10+ files (96 nodes on `/questions`), so not a regression in kind — but two new
     instances were added, one of them in FR-91's own chip (`unknown` state only).
   - Fix: one systemic change — drop the `/70` modifier at `text-xs` sizes, or define a token that
     meets AA at 12px.

6. **`aria-sort` on an `<a>` element — axe `aria-allowed-attr`, impact critical, 7 nodes** — `src/app/work-items/_components/work-item-table.tsx:108`, `src/app/next/_components/next-table.tsx:97`, `src/app/bottleneck/_components/bottleneck-table.tsx:91`
   - `aria-sort` is only valid on `columnheader`/`rowheader`. On the link it is ignored, so sort
     state is not announced. **Pre-existing** — the attribute lines are not in the diff — but this
     run edited all three files and left it.
   - Fix: move `aria-sort` to the enclosing `<th>`.

7. **The FR-90 collision mark carries less information than its name suggests** — `src/lib/server/planned-work/reconcile.ts:118-152`
   - `decideCollisions` marks **every** unreconciled planned row as soon as the engagement holds
     **any** ingested row, related or not. It is conservative (never a false `done`), documented,
     and correct under Q13 — but in practice the flag approximates *"this engagement contains both
     kinds of row"* rather than *"this row collided"*.
   - Not a defect today. Worth deciding deliberately when FR-90's write half lands, rather than
     inheriting.

8. **CR-005 §4 budgets "nullable columns"; three of four landed `not null`** — `20260824110601:72-74, 183-185`
   - `created_at`, `updated_at`, `plan_reconciliation` are `not null` **with defaults**, so no row
     broke and no write path must supply them. A literal divergence from the CR's wording with no
     operational consequence. Recording it so the CR and the schema stop disagreeing.

9. **project-lead's fan-in report contains a false global claim** — `.fleet` Wave-D report
   - It states *"Nothing in this run used `git add -A`."* The traces show **8 invocations across 6
     units, 4 of them unscoped** (u3, u4, i3, c1). All 4 ran inside the unit's own worktree, and
     **nothing stray reached the branch — I verified the diff adds no image, binary, log or build
     artifact.** So the *substance* (the shared checkout was not swept) is right and the sentence as
     written is wrong.

## Trajectory grading

Traces: `/Users/erikmeltzer/.claude/projects/-Users-erikmeltzer-Projects-project-tracker/7ecb5a31-4816-40a6-8bcf-977a7f93ad33/subagents/agent-*.jsonl` — **all 12 units identified CONFIDENT** (every `.meta.json` names its unit in `description`; no mtime guessing required).

| Unit | Specialist | Schema-before-query | Claims evidenced | Verify-after-edit | Unknowns researched | Boundaries escalated | Verdict |
|---|---|---|---|---|---|---|---|
| r1 | researcher | N/A (no writes) | SOUND | N/A | SOUND | N/A | **SOUND** |
| i1 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| i2 | api-integrator | N/A (pure parser, 0 queries) | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| u1 | ui-designer | N/A | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| u2 | ui-designer | N/A | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| u3 | ui-designer | N/A | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| u4 | ui-designer | N/A | **SOUND** | SOUND | SOUND | SOUND | **SOUND** |
| i3 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| i4 | api-integrator | **UNSOUND** | SOUND | SOUND | SOUND | SOUND | **UNSOUND** |
| d1 | devops | N/A (no writes) | SOUND | N/A | SOUND | SOUND | **SOUND** |
| c1 | copywriter | N/A | **UNSOUND** | SOUND | SOUND | SOUND | **UNSOUND** |
| doc1 | docs-writer | N/A (no writes) | SOUND | N/A | SOUND | SOUND | **SOUND** |

**i4 — UNSOUND on schema-before-query.** i4 wrote `src/lib/server/workitems/planned.ts` at trace
index 92 and edited the query-bearing `src/lib/server/workitems/list.ts` at 158, adding `updated_at`
to the selected columns. **No read of any migration file and no read of `src/lib/database.types.ts`
occurs anywhere in its trace** — the only `database.types` hit is index 304, a search of Erik's
Obsidian vault, after every edit. What it read instead, before writing, was `.fleet/specialist-
reports/d4000f/i1.md` at index 25 — i1's *report* — plus the consuming code at 44. The column exists
and the code is correct, so the diff is clean; the route to it was a specialist's prose account of a
schema rather than the schema. That is the case output-checking cannot catch, and it will be wrong
the next time the column list moves. Everything else about i4 is sound.

**c1 — UNSOUND on claims-evidenced (report overstates ordering, substance is genuine).** c1 replaced
an assertion in `tests/questions-list.test.tsx` rather than re-pointing it — confirmed, and the new
assertion is genuinely stronger (a rule over two toggle states, `not.toMatch(/\bopen\b/i)`, versus
the old literal-string `toContain`). Its report claims it proved the new assertion red-capable
against the old wording **first**. The trace shows the opposite order: the copy change landed at
index 122; the new assertion was written at 171 and its **first run, at 173, was green**; the
red-capable demonstration is at 177, a post-hoc mutation that re-inserted the old copy, observed the
failure, and restored (`=== restored: True ===` at 178). A post-hoc mutation proof is epistemically
sound — I use the same technique below — so the assertion is **not** tautological and the finding is
about the report, not the test. But "first" is not what happened, and on this project the ordering
of a red proof is exactly the thing that gets claimed rather than done.

**u4 — worth recording as a positive.** Its red-then-green claim is true byte-for-byte: index 111
`"Run the D-1 test — expect RED"` → `Tests 4 failed | 3 passed (7)`; edits to `from-db.ts` at 117
and 119; index 124 `"Re-run D-1 test — expect GREEN"` → `Tests 7 passed (7)`. **My own independent
mutation reverting the fix produced exactly 4 failures** — the same number, arrived at without
reading u4's report. That is the strongest corroboration available.

**Wave B step-zero override — correctly executed, all three.** u4, i3 and c1 each started at
`e3de4be` (on `origin/master`, not on the run branch) and each **verified the commit was pushed
before resetting**: c1 at index 12 (`git branch -a --contains e3de4be` → `remotes/origin/master`),
u4 at 12 (same, plus run-branch SHA and worktree list), i3 at 15 (`git merge-base --is-ancestor HEAD
master` → NO, then the contains check). Reset in each case at a **later** index. The override was
led with in each report. **Graded SOUND** — this is what a justified override looks like.

**Fixture integrity: clean.** Every trace swept for writes under `tests/fixtures/`. **Zero.** The
three mentions are `ls` listings and one heredoc writing prose to the resolved spec.

## Verification performed

- **Build** (pnpm): **PASS** — exit 0
- **Type-check** (`tsc --noEmit`): **PASS** — exit 0, re-confirmed with my added config present
- **Lint** (oxlint): **PASS** — exit 0
- **Unit tests** (vitest): **PASS** — **1814 passed / 6 skipped (1820), 120 files** — matches the
  handed baseline exactly
- **`pnpm gate:m27`**: not re-run separately; covered by the suite
- **`pnpm gate:m27:e2e`**: **PASS — 10/10** at `M27_BASE_URL=http://localhost:3000` +
  `M27_STORAGE_STATE`, exit 0, zero `sign-in` or `no-role` occurrences. Output grepped, never pasted
  (**B38**), and the log deleted.
- **Mutation testing** (my own, 7 mutations in a throwaway detached worktree, bytes snapshotted and
  restored in a `finally`, tree confirmed clean after): **7/7 caught.**

  | Mutation | Result |
  |---|---|
  | D-1 sentinel → old `"fleet"` default | RED — **4 failed** |
  | FR-90 never mark a collision | RED — 15 failed |
  | FR-90 merge on prose | RED — 17 failed |
  | FR-96a drop "(whole ledger)" | RED — 5 failed |
  | FR-96c silent fallback to unfiltered | RED — 5 failed |
  | FR-96b picker keeps name on clear | RED — 1 failed |
  | FR-91 boundary 30 → 3000 days | RED — 10 failed |

- **Playwright (mine)**: **19 flows authored, 19 passed** — FR-96c on all 11 screens, FR-96a badge
  scope, FR-96b picker/stickiness/detail-exclusion, FR-91 honest-absence, FR-88 form.
- **Accessibility** (axe-core, wcag2a/2aa/21a/21aa, operator session): **4 surfaces RED.**
  `aria-allowed-attr` (critical) ×7 and `color-contrast` (serious) ×65/×6/×4/×96. **Filtered and
  unfiltered pages produce identical violations, which establishes this run's filter did not
  introduce them.** See Minor 5 and 6.
- **Security checklist**: 17/18 items checked. **Not checkable: the agent-token positive path** —
  no valid token obtainable, `.env.local` read-denied by design.
- **`pnpm audit --audit-level=high`**: `No known vulnerabilities found`.
- **Dev server**: started, used, **shut down; port 3000 confirmed free** by `lsof`.

**My harness fails closed, verified by running it in the degraded state:** with both env vars unset
it exits **1** with *"qa1 harness cannot run … Refusing to exit 0 on a suite that observed
nothing."*; with `M27_BASE_URL` set but `M27_STORAGE_STATE` unset it also exits **1**. Observed, not
intended.

## Infrastructure failures (not the fleet's fault)

- **Agent-token positive path unobtainable** — `DELIVERY_LEDGER_INGEST_TOKEN` absent from the shell
  and `.env.local` read-denied by `.claude/settings.json`. **This is the rule working, and it was
  not routed around.** Fix if a positive-path check is ever wanted: Erik exports a scoped, expiring
  token into the review shell's environment. Not a code finding, and not counted against any unit.
- **`new-desktop.png`, 135 KB, untracked at the repo root** — a stray from u2's serve-and-look pass.
  **It did not reach the branch** (verified: the diff adds no binary). Repo hygiene only; per my
  instructions I did not delete it. Fix: `rm new-desktop.png`.
- Two untracked fleet artifacts sit in the working tree (`.fleet/audit-d4000f.md`,
  `.fleet/report-d4000f.md`) — project-lead's to commit, not mine.
- Nothing else. No registry timeout, no rate limit, no sandbox crash, no missing binary, no
  `ERR_PNPM_IGNORED_BUILDS`, no port conflict. **The environment behaved.**

## Assessments requested

**B-P3 (committed manual-trace transcripts) — I measured it independently and I disagree with the
framing. Recommend: keep the files, write the exception into §7a, do NOT force-push.**
34 `.txt` files are tracked on `origin/master`; `.gitignore:34-36` ignores the `.png` and says of the
text *"The .txt dumps beside them are the evidence that matters and stay tracked."* — so this is a
**deliberate retention decision, not an accident**. On content: the only engagement slug appearing
anywhere in them is **`delivery-ledger` (272 occurrences)** — this repo's own project. No
third-party client name, no `dl_` token shape, 3 files mention "Description" and 1 "Blocker". The
§7a class violation is technically real (decrypted `sensitive` prose in plaintext in git) and the
data subject is Erik, about the very repo the files live in. A history purge plus a force-push to
`origin/master` is **disproportionate** to that. The honest fix is to add a §7a line stating that
`.fleet/manual-traces/*.txt` holds rendered `internal`-class evidence for the `delivery-ledger`
engagement only, and a gate that refuses to commit one containing any other engagement slug.
Severity as it stands: **minor**, not the exposure it was flagged as.

**Production/migration divergence — I agree with d1, with one caveat.** Migration `20260824110601`
is applied to the live database while production serves `e3de4be`. Every change is additive or
widening (`drop not null`, new columns with defaults, new indexes, a new enum, one trigger); no
column is dropped, narrowed or retyped, and the CHECK constrains only a value the old code never
writes. Old code cannot break on it. **Caveat, from this repo's own lesson:** confirm the local
filename matches the version `list_migrations` reports before the next `supabase db push`, or every
applied file reads as pending and re-runs — which fails on `create type public.plan_reconciliation`
and will look like a broken migration rather than a bookkeeping mismatch. One `list_migrations` call.

**i3's cross-unit change to `/api/ingest/run` — keep it, fix the sentence.** The argument is right:
FR-90's meeting happens in either order, and marking only on the plan path leaves a real collision
unmarked whenever the run lands second. Both callers share one function, so they cannot disagree
about what a collision is; the update re-asserts `plan_reconciliation = 'unreconciled'` as a filter,
so it is genuinely idempotent and cannot reset a future `keyed`; and the read pages via
`fetchAllRows` rather than trusting PostgREST's silent 206 truncation. Reversing it would be the
worse branch. **Two fixes, not a reversal:** the false error sentence (Important 1) and the double
cast (Minor 4).

**B-P4 (`manual-gate.sh` passes on stale evidence) — real, and doc1's catch proves it.** doc1 found
two shipped-guide claims this milestone falsified (*"There is no engagement filter"*, *"You cannot
fill Next from inside the product"*) that a copy-forward would have preserved under a green gate.
Recommend the gate record a content hash plus the observing run id per route and refuse evidence
whose run id is not the current one — otherwise the gate certifies that a file exists, which is not
what anyone reads it as.

## Tests added

Kept deliberately **outside `e2e/`**, in `e2e-review/`, with their own config — `playwright.config.ts`'s
default projects would otherwise pick them up and `pnpm e2e` would fail for want of an operator
session. Verified: `playwright test --config=playwright.config.ts --list` matches **0** of them.

- `e2e-review/qa1-d4000f-planned-work.spec.ts` — 19 flows: FR-96c on all eleven screens (with an
  unfiltered control proving the assertion can fail), FR-96a badge scope in both states, FR-96b
  picker presence / no-stickiness / detail-exclusion, FR-91 honest absence, FR-88 form. **19/19 pass.**
- `e2e-review/qa1-d4000f-a11y.spec.ts` — axe-core over 7 changed surfaces. **3 pass, 4 fail, and it
  is committed red on purpose**: the violations are pre-existing and the suite is the record of that
  debt. Do not silence it to make a dashboard green.
- `playwright.qa1.config.ts` — the review harness. **Fails closed** (throws, exit 1) when
  `M27_BASE_URL` or `M27_STORAGE_STATE` is absent.

**Dependencies added: none.** `@axe-core/playwright` and `@playwright/test` were already present.

## Not reviewed

- **FR-91's planned and STALE markers rendering on screen** — the ledger holds **no planned row**
  (20 `work_item` rows, all `data-verify-planned="false"`). I asserted the absence is honest (no row
  falsely claims planned; no STALE marker anywhere) and annotated the positive case as not observed.
  Unit coverage is real and unmocked (`tests/planned-chip.test.tsx`, real `ExecutionModeChip`, 0
  `vi.mock`), and my 30→3000-day mutation went red. **The pixels have not been seen.**
- **FR-96's roster-unavailable notice** — requires a failed roster read, which I could not induce.
  I did observe `roster="gated"` (anonymous) and `roster="ok"` (operator); `unavailable` is the
  third state and is unobserved.
- **The FR-88 form's submit path end-to-end** — creating a planned row would write to the live
  database. I verified the form renders, publishes its state contract, and that its action gates
  (`requireOperator()` at `actions.ts:68`, before `createServiceClient()`), but I did not submit it.
- **Any positive-path agent-token claim** — the boundary is proven to refuse and is **not** proven
  to admit. Per §7c as measured, no such claim is made anywhere in this report.
- **Anything behind `aal2` that a person must touch** — agent verification reaches where a token
  reaches. The manual pass is what covers the rest.
- **FR-90's write half** — deferred by CR-005 §3.1a. Correctly out of scope, not a gap.
- **Milestones already Complete** (M1.0–M1.10, M2.7, M2.8) and the six Not Started Phase-2
  milestones — out of scope for this run.
- **`docs/Delivery-Ledger-User-Guide.docx`, `CLAUDE.md`, `new-desktop.png`** — dirty or stray by
  instruction; not touched, not staged, not reviewed.
