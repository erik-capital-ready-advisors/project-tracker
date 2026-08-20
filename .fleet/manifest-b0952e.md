# Build manifest b0952e

Spec: /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec/`)
Spec basis: `spec-approved.md` + CRs [CR-001]
Spec approved: yes — client-approved 2026-08-17, byte-identical to `spec-v1.md`; CR-001 approved 2026-08-18
Security posture: declared (22 classification rows / 21 Section 7 entities classified) — `security-gate.sh` PASS on `.fleet/resolved-spec-b0952e.md`, re-run 2026-08-19 against the folded 21-entity spec
Resolved spec: .fleet/resolved-spec-b0952e.md
Prior state: spec/prod.md (1 milestone already Complete — M1.0 Provisioning; 6 active blockers: B1b, B2, B3, B4, B5, B6, B7)
Mode: full
Branch: agent-build/2026-08-19-b0952e
Started: 2026-08-19
Phase 1 complete: 2026-08-19 — merged head `eed0144`, build PASS. Run PAUSED at the Phase 1 checkpoint.

Phase 2 resumed: 2026-08-19 by `/build-from-spec continue b0952e`. `fleet-preflight.sh` PASS 9/9, re-run at resume.

**Spec basis re-check at resume — basis UNCHANGED.** `spec/change-requests/` now holds a second file,
`CR-002-deletion-vs-append-only.md`. Its Status line reads **"PENDING APPROVAL — DO NOT FOLD INTO A
RESOLVED SPEC"**, verified by reading the file rather than by trusting the instruction. It is **not**
folded into `.fleet/resolved-spec-b0952e.md`, which is byte-unchanged from Phase 1. The Phase 2 spec
basis is `spec-approved.md` + CR-001, exactly as recorded above.

**Design approval state — token layer only.** Erik viewed `/settings/tokens` on the merged branch on
2026-08-19 and approved typography, the violet accent and the 16-token state scale with fuchsia
reserved exclusively for `unparsed`. **The layout and density of the six answer screens are NOT
approved** — they rendered as empty states, so there was nothing to review. §5a's `Approved design:`
line still reads `NOT YET APPROVED` and I have not edited it. Every Phase 2 `ui` brief carries this
distinction and instructs the specialist to treat screen layout as unreviewed.

**Resume 3 (2026-08-19, this session) — checkpoint was stale, manifest was right.** The Phase 1
checkpoint (11:02) still read `phase_complete: 1` and listed i7, u2, u3, u4, c1, doc1, d1 as pending
Phase 2 work. The manifest (16:46) recorded all of them merged. **The tree settled it, not either
file:** every specialist worktree was diffed against branch tip `a87fe4d`, and the only file present
in a worktree and absent from the branch is `src/lib/server/releases/unparsed.ts` — i8's local copy of
the unparsed definition, which i7 deliberately deleted when it consolidated that definition to one
function. Nothing was re-dispatched. No worktree held uncommitted work, so the i6 failure mode did
not recur. Gates re-run independently at the tip: typecheck 0, lint 0, build 0 (31 routes),
**919 pass / 6 skip** — reproducing u3's reported figures exactly.

**Question loss found and repaired at resume 3.** `questions-c1-b0952e.jsonl` (3 lines) and
`questions-d1-b0952e.jsonl` (5 lines) existed **only on the branch**, never in the main tree's
`.fleet/`, so the fan-in file held 69 lines against 85 actually queued — 16 lost, including every
question c1 and d1 raised. Recovered from the branch and the fan-in rebuilt from the per-unit files.
This is the failure the per-unit-file rule exists to prevent, appearing one level up: the per-unit
files did their job, and the *collection* step missed two of them.

**The branch worktree was relocated.** It had been checked out at
`/private/var/folders/.../tmp.aMqsruHklj/m`, a temp path that could be swept mid-run, taking a
592MB `node_modules` with it. Moved to `.claude/worktrees/qa-b0952e` with `node_modules` preserved.

Package manager: pnpm (per `plan.md` Global Constraints — `pnpm vitest run`)
Dispatch budget: 20. **Used so far: 18, and that is final** (qa1 then i10 at resume 3; c1 and d1 in Wave E made 16). **2 remain.** qa1's re-verification will go by `SendMessage`, which costs no dispatch — the same mechanism that rescued i7's and c1's reports without spending one. Previously: 13 (Wave C: i7, u2, u4, doc1 — i6 was rescued, not re-dispatched, so no dispatch was spent on it). Previously: 9 (Wave A: i3, i4 · Wave B: i5, i6, i8). Previously: 6 (Phase 2 Wave A: i3, i4). Previously: 4 (r1, u1, i1, i2). Planned: **18** (Phase 1: 4 · Phase 2: **12**, now including d1 · qa-reviewer: 1 · docs-writer manual: 1). Nothing is undispatchable.

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Stack version matrix (Next.js / TS strict / Tailwind v4 / shadcn), pgcrypto + Supabase Vault current API, MFA-in-RLS idiom, per-token rate limiting without a new vendor | researcher | — | **done** — version matrix pinned (Next 16.3.1 / TS 7.0.2 / Tailwind 4.3.3); TS7 `baseUrl` removal confirmed; pgcrypto `pgp_sym_*` + `bytea` + `vault.decrypted_secrets`; AAL2-in-RLS chokepoint idiom; **FR-8 forced to a Postgres counter — Vercel WAF Pro cannot key on a header**. 0 questions queued. Report gate: SKIP (research note) |
| u1 | ui | 1 | App scaffold + design system: Next.js App Router, TS strict, Tailwind v4, shadcn init, vitest + Playwright config, light/dark theme, semantic state scale, mono/sans typography, app shell + nav for six answers, shared primitives, the `UnparsedCount` surface component | ui-designer | r1 | **done** — merged `aac2260`, 63 files. Next 16.3.1/TS7/Tailwind v4 scaffold, 12 routes build, 11 vitest + 12 Playwright pass, both gates proven able to go red, Tailwind proven wired by reading emitted CSS (863 rules). Report gate PASS. **Did not commit until asked** — caught by `git log` in its worktree. 4 questions queued |
| i1 | integration | 1 | M1.1 Foundation — 21-entity schema, RLS **policies** on every table, pgcrypto columns per §7a as amended, Vault key, `SECURITY DEFINER` decrypt fns with empty `search_path` + per-name `REVOKE`, append-only audit log, generated types. FR-59, FR-62, FR-77, FR-78 | api-integrator | r1, u1 | **done** — merged, 4 commits. 21 tables, 23 RLS policies, 12 encrypted columns, 18 functions all `search_path=''` with no PUBLIC/anon EXECUTE, append-only audit log refusing UPDATE/DELETE/**TRUNCATE**, FR-78 guard, rate-limit RPC. Measured that `relrowsecurity` is worthless here (throwaway table came out true with 0 policies). 3 negative controls. Report gate PASS. 5 questions. **2 NOT VERIFIED: security headers (real gap), FR-61 deletion path** |
| i2 | integration | 1 | `i-core` — the pure domain core `src/lib/ingest/` per `plan.md`, 13 tasks. M1.4 plus the pure rules inside M1.6/M1.7/M1.8. No DB, no network. FR-14–FR-23, FR-45–FR-51 (pure half) | api-integrator | u1 | **done** — merged, 14 commits, 29 files, 87 pass / 6 skip. All 13 `plan.md` tasks mutation-proofed. **Found that `plan.md`'s own coverage fixture cannot detect a widened certifier join** — wrote the widened form, all 7 plan assertions still passed; added a control test. Tier-2 corpus SKIPPED not passed, skip predicate proven able to flip. **Report gate FAIL at resume 3** (Phase 1 recorded PASS; the re-run contradicts it) — its `## Questions Queued` names the worktree-local path, outside the repo's `.fleet/`. **Artifact defect, not a work defect**: both questions were in fact collected. Report NOT edited to clear the gate. 2 questions |
| i3 | integration | 2 | `i-core-2` — CR-001 pure rules beside `i-core`: QA-report findings parser (FR-64), `D-nn` tag reading, defect verification join (FR-66), regression derivation (FR-69/70), shipped state (FR-74), contested (FR-79) | api-integrator | i2 | **done** — 4 modules beside i2 (`defects.ts`, `regressions.ts`, `releases.ts`, `committed.ts`) reusing `coverage.ts`/`billing.ts`/`refs.ts` rather than rewriting them. vitest 153 pass / 6 skip (the Tier-2 six, by name), typecheck 0, lint 0, build 0. **12 mutations, 12 reds** — including the widened FR-66 certifier join, which a one-actor fixture would have missed. Ran a negative control on oxlint because a clean run prints nothing, which is indistinguishable from linting nothing. Removed its own invented `fixed by i5` QA-fixture shape on finding the qa-reviewer template has no such field. Report gate PASS. 4 questions |
| i4 | integration | 2 | M1.2 Access — operator sign-in, MFA enforced in RLS not only in Next.js, agent token issue/hash/scope/expiry/revoke/rotate, per-token rate limits, token-use audit. FR-1–FR-8 | api-integrator | i1 | **done** — merged `7c56526`+`ec5eab6`. `src/lib/api/` (12 modules + 7 test files), `src/proxy.ts`, one additive migration. **Security headers observed in a real `next start` response**, 11/11 script tags nonce-stamped, zero CSP violations in a browser — the Phase 1 gap is closed. 7 controls mutation-tested, all red-capable. `anon` refused `42501` on every table with a positive control. Rate limiter trips `t,t,t,f` at limit 3. **Corrected the brief twice by observation:** the agent-rules block is written by `next dev` only, never `next build` (its first negative control would have read as "flag unnecessary"); and `proxy.ts` at the repo root is silently ignored — the first header probe showed no CSP at all. Found one §7a line nothing enforced (agents may read engagement *name and slug*, not the row) and enforced it strictly. Report gate PASS. 4 questions. **FR-7 PARTIAL — mechanism only, no UI (u4 owns that). FR-5 refusal is application-layer, NOT database-enforced. 4 NOT VERIFIED** |
| i5 | integration | 2 | M1.3 Registry + M1.4 ingest persistence — engagement/milestone/acceptance-criteria server actions, requirement-ref resolution (FR-12), ingest endpoint calling `i-core`, idempotency (FR-22), read-only against source repos (FR-23). FR-9–FR-23 | api-integrator | i1, i2 | **done** — merged `2af455a` — registry actions + M1.4 ingest persistence. **Found a latent FR-22 defect nothing else would have caught:** two upsert targets were *partial* unique indexes, and `ON CONFLICT (columns)` cannot infer a partial index unless the statement restates its predicate — which PostgREST's `on_conflict` has no way to carry. Every `.upsert()` against `work_item` would have failed `42P10` **only on the second post**, i.e. exactly the idempotency case. The schema looked right, i1's index comment named correct SQL, and TypeScript compiled. Measured both forms against the live project before writing the writer; migration `20260819170622` replaces both with plain indexes (`NULLS DISTINCT` already exempted the excluded rows, so nothing is lost). 370 pass / 6 skip. **18/18 mutations caught**, and one test double was found *blind* — its fake `encrypt_field` returned `\\xENC:<plaintext>`, so "no prose in the clear" failed against correct code; it fixed the double, not the assertion. FR-22 observed at the SQL layer with a negative control proving the probe can report DUPLICATED. Encryption read back: 93 bytes, prefix `c30d0407`, plaintext absent. FR-78 refused `23514` on two columns, fails closed, with a positive control. Report gate PASS. 3 questions. **6 NOT VERIFIED — no Supabase credential in session; FR-20 milestone tracker parsed but NOT persisted (no such entity in the 21, and §7a classifies none — an unclassified entity is a blocker, not a default)** |
| i6 | integration | 2 | M1.5 Mode 2 capture + M1.6 Mode 3 waits + M1.7 unified model — session-capture endpoint, unassigned queue, reason classes, dispositions, stack attribution, wait declaration/overdue/resolution, execution modes, executor kinds, Erik-gates, dependency edges, evidence scopes. FR-24–FR-44 | api-integrator | i1, i2 | **done — RESCUED.** Terminated by an API session limit after writing its report but **before committing**; HEAD never left `ec5eab6` while 28 files sat uncommitted in the worktree. project-lead re-ran its gates independently rather than trusting the report (typecheck 0, lint 0, build 0, **424 pass / 6 skip**, the 6 still the corpus file by name), then committed it as `5598018`. M1.5 session capture (4 API routes + `scripts/claude-session-capture.sh`), M1.6 waits, M1.7 unified work items. Report gate PASS. 5 questions. **`blocker.owner` default changed to `erik` here and in i5 independently — merge conflict resolved by hand, see the merge note** |
| i7 | integration | 2 | M1.8 traceability persistence + M1.9 the six answer endpoints — `GET /api/answer/{blocked,next,committed,untested,bottleneck,broken}` under `answer:read`, unparsed count on every one. FR-45–FR-58, FR-71, FR-72, FR-75 | api-integrator | i1, i3 | **done** — **failed the report gate first** (`FAIL  api-integrator report is missing mandated section(s): `## Questions Queued``), was marked `failed` and held back from the merge; i7 completed its own report and it **re-gated PASS**. project-lead did not edit the report. Six answer endpoints + M1.8 persistence. **Defined the run's single `unparsed` population** — `work_item` + `defect` (severity OR status, counted once per row) + `test_result`, **global and never narrowed by caller filters** (a filtered count can read `0` while the ledger holds unclassified rows, and the badge sits in the shell where no filter exists), total **`null` rather than a partial sum** on any component failure. Deleted i8's local copy and repointed the call site: one definition, two call sites, grep-confirmed. **`/api/answer/committed` answers `403 forbidden_table` to agent tokens** — §7a refuses them `contract_milestone` and every field of Committed derives from it, so a partial answer would be worse than a refusal; thrown by `agentScopedDb` itself so it cannot drift. Next and Bottleneck degrade milestone ordering and say so in the payload. 675 pass / 6 skip. **14 mutations, 14 detected.** Caught its own contaminated negative control (whole-tree run let i2/i3 fixtures go red, proving nothing) and re-measured as a delta on its own suite: two-actor +12 red, **one-actor +0, invisible**. Two mutations initially survived on untested load-bearing mappings; 6 assertions added. `decryptAll` now degrades per row rather than taking Committed down for every engagement on one bad ciphertext. 12 questions. **4 NOT VERIFIED (live DB); `test_result` has no HTTP write path — FR-47–FR-51 compute correctly with no production data path** |
| i8 | integration | 2 | **SPLIT at resume.** Release persistence + the release ingest path only — FR-73, FR-76, and the shipped-state read surface FR-74 consumes. M1.10 removed from this unit | api-integrator | i1, i3 | **done** — merged `3b2c81d`. `POST /api/ingest/release` under `ingest:write`, FR-73 persistence, `loadShippedIndex()`. **No migration** — the unique constraints that already existed *are* the idempotency mechanism. **No export, archive or deletion path; nothing in the diff deletes a row.** FR-75 held structurally: the value carried everywhere is `Set<environment>`, no `shipped` boolean, so i3's preview-vs-production question stays answerable. 7 mutations red. **Mutation 2b is the one that matters:** disabling the idempotency pre-check alone did NOT duplicate — the unique constraint caught it; only removing both produced the failure, so the property is defended twice and the test is live. Without that negative control it would have reported a weaker test as a stronger one. Headers + CORS observed against a running server (`access-control` count 0 on POST and on a hostile-Origin OPTIONS preflight). Report gate PASS. 4 questions. **4 NOT VERIFIED, all needing a reachable database — d1 settles them** |
| i9 | integration | 2 | **M1.10 export and handover — FR-60 export through one DB function, FR-61 archive + hard deletion** | NOT DISPATCHED | i1 | **blocked** — Erik's operator instruction in `.fleet/answers-b0952e.jsonl`: M1.10 must not be built until CR-002 is approved, because FR-61 is the requirement CR-002 exists to settle. Building it now builds the disputed reading. FR-60 (export) is not itself disputed by CR-002 and is blocked only by belonging to the named milestone — recorded so the cost of the block is visible |
| u2 | ui | 2 | Registry screens — engagement entry incl. provisioning identifiers with FR-78 secret-shape refusal, contract milestones, acceptance criteria with FR-12 unresolved-ref reporting. FR-9–FR-13, FR-77, FR-78 | ui-designer | u1, i5 | **done** — merged `c75794c` — four registry screens on i5's actions. No shadcn component installed, no dependency added, nothing outside its lane. FR-12's dangling reference is marked **on every read**, not toasted once at save, and deliberately **not in fuchsia** — it parsed perfectly and points at nothing, which is the opposite of `unparsed`. FR-78's refusal passes through verbatim, naming the column. **Running the app found two defects no test would have caught:** with a 22rem sidebar the milestone table needed **811px in a 654px track**, so FR-12's finding — the thing that exists to be seen — was clipped behind a scrollbar; and identifiers wrapped mid-token (`onpvolboecjpdkvurj`/`af`), defeating the comparison they exist for. Both fixed, 0px overflow measured. **Corrected its own wrong comment by measuring it:** a bare `YYYY-MM-DD` parses as UTC and is safe, but a zone-less timestamp does drift (`2026-09-01T00:00:00` → `2026-08-31` at UTC+14) — real bug found, fixed, mutation now bites. 621 pass / 6 skip; e2e 47 pass / 1 skip both projects; **12 mutations, 12 caught**. Report gate PASS. 5 questions. **6 NOT VERIFIED — every authenticated path, because no sign-in route exists** |
| u3 | ui | 2 | The six answer screens — Blocked, Next, Committed, Untested, Bottleneck, Broken; unparsed count on every surface. FR-52–FR-56, FR-58, FR-71, FR-75 | ui-designer | u1, i7 | **done** — merged `3c96d40` + follow-up `fc59597`. All six answer screens, then **two defects it found in other units' merged code, fixed and re-verified**. 919 pass / 6 skip (was 906), e2e 155 pass / 5 skip, build 31 routes, 17/17 then 9/9 mutations detected with a negative control measured green first. **The follow-up's central finding: the pre-existing assertions could not have caught the hardcode** — `expect(body.unparsed).toBe(0)` passed before the fix, after it, and would pass again if restored, because both fixtures seeded zero unparsed rows, so the hardcode and the truth were byte-identical. The 9 new tests seed a ledger whose count is 6, the only arrangement where they differ, and one is a negative control so a route omitting the field unconditionally cannot pass by accident. Badge overflow at 375px: **46px → 0px**, re-measured across all twelve routes, with two tests refusing the tempting fixes (never hidden/empty; no-digit pinned as a property so a rewording cannot reintroduce a number). Its first harness run had reported `0/15 detected` while measuring its own crash — `--reporter=basic` was removed in vitest 4. Report gate PASS (re-gated after the follow-up). 8 questions |
| u4 | ui | 2 | Work-item list/filter/sort across engagements (FR-44), external-wait declaration + resolution (FR-32–FR-36), agent-token management (FR-4, FR-7 — plaintext shown once, never screenshot), unassigned-session queue (FR-26) | ui-designer | u1, i4, i6 | **done** — merged `da3f0e0` — FR-44 unified list (one list, mode as column and filter, filters on clear columns only), FR-32–36 waits, FR-4/FR-7 token lifecycle with once-only plaintext **closing the PARTIAL i4 left**, FR-26 attribution queue, **and FR-1/FR-2 sign-in + MFA verify + MFA enrolment from the mid-run scope addition**. 690 pass / 6 skip; e2e 81 pass / 3 skip; build 22 routes. **19 mutations, all red.** **Three defects found by verification, not review:** `expiryInstant("2026-02-31")` returned 3 March because `Date.parse` rolls an impossible day forward — a credential would have got a lifetime nobody chose; MFA enrolment re-enrolled on every render (`useRouter()` returns a fresh identity), creating extra unverified factors and putting a new TOTP secret back on screen after the first was cleared; and the rejected-filter panel was **fuchsia**, breaking the reservation of that colour for `unparsed` — found only by running the app and looking. One mutation survived round one (styling `erik_gate` identically to `erik`) because the assertion compared `outerHTML`, which still differed in a data attribute; visual-distinction claims now read the class list alone. **Its first mutation harness reported verdicts while silently failing to restore two files** — caught by grepping afterwards, repaired by hand, harness rewritten to verify every restore by sha256. Report gate PASS. 12 questions. **Declined the route-protection instruction with evidence** (see merge notes). **NOT VERIFIED: no screen in this unit has ever rendered a real row** |
| c1 | copy | 2 | All UI copy — empty states, error messages, microcopy, reason-class and disposition labels, the `defect.title` operator rule from §7a, evidence-scope wording that never collapses the four states | copywriter | u2, u3, u4 | **done** — **failed the report gate first** (`FAIL  copywriter report is missing mandated section(s): `## Prior Fleet Learnings Used``), held back from the merge; c1 completed its own report and **re-gated PASS**. project-lead did not edit it. Merged `e184b55`+`a87fe4d`. **205 `COPY:` slots filled across 48 files.** Best catch: the work-item filter read **"Waiting on a wait"** while `list.ts:192` filters `external_wait_id IS NOT NULL` — external waits only — so the label flattened the blocked-versus-waiting distinction the product exists to preserve; now "Held by an external wait". Also caught a **vacuous all-clear** — Untested claimed "Every requirement is covered" for an engagement with *zero* requirements, true and exactly the wrong-`done` shape. Cut "support" from the once-only token warning because §7b states one user and no handover, so a fictional escape route weakens a warning that must be believed. **Refused two things, both correctly:** shortening `"unparsed count unavailable"` to fix the 222px overflow, because `tests/unparsed-count.test.tsx:62` asserts that exact string and editing a test so copy fits is the forbidden move — it measured it to source and queued it, and u3 independently fixed the overflow from the component side, so the constraint resolved with **neither unit weakening an assertion**; and unifying the two vocabularies used for the same four refusals, because that meant rewriting unmarked strings in another unit's component. Kept em dashes against `stop-slop`, reasoning that `CLAUDE.md`, the spec and ~400 unmarked strings already use them, so stripping them from its 205 would make the marked copy audibly different from the copy beside it. Report gate PASS. 3 questions |
| doc1 | docs | 2 | Handoff docs — README, environment setup, deploy runbook, agent-token issuance, session-hook install snippet. **Install *scope* (global-with-allowlist vs per-project) is blocked on B4** and must be written as an open decision, not resolved | docs-writer | i4, i6 | **done** — merged `37fb0c3` — `README.md` + `docs/{env,deploy,agent-tokens,session-hook,security}.md`. **Ran the whole quickstart against a fresh clone with no `node_modules` and every Supabase variable unset**, rather than writing from the source: all five commands exit 0, tree stays clean, and the app serves **all eleven screens `200` with zero env vars set** while every API route answers `500`. So the quickstart stops at a working local site instead of walking Erik to a step he cannot perform. Separated the two `500` shapes into a diagnosis table (empty body = missing service-role key; body naming the audit log = vars set but project unreachable), both observed. B4 and B5 written as open decisions, neither resolved. **Found that the recommended global hook install is not actually possible at this commit** — the hook implements no allowlist, so the global snippet gives unfiltered global capture, the exact failure the allowlist exists to prevent. Report gate PASS. **9 questions — the most of any unit.** Declined to invoke `marketing:draft-content` for the README and said why |
| d1 | deploy | 2 | Vercel preview env vars (the Preview service-role key dropped when Production was hardened to `Sensitive`) + preview deploy verification of this branch | devops | i1, i4 | **BLOCKED (partial)** — merged `170fde9`. **Deployed and serving**: `https://project-tracker-6bo4qchx6-erik-capital-ready-advisors-projects.vercel.app`, `dpl_AjUGrRUSVWTyDyMosrzWLMGBdddW`, READY, build PASS in 40s. **B1b never appeared** — the CLI saw the project, its env vars and its logs without difficulty, confirming the correction. **5 controls closed by observation:** HTTP→HTTPS `308` (noted honestly as Vercel edge, not repo config); the full header block over real TLS incl. HSTS/CSP/XCTO/Referrer-Policy/Permissions-Policy/COOP/X-Frame-Options/frame-ancestors and no `x-powered-by`, **present on `500`s as well as `200`s**; the CSP nonce proven genuinely per-request across two requests and stamping real script tags; **no secret-shaped value in the deployed client bundle** (0 `service_role`, 0 JWT-shaped); and screens failing closed with "Nothing was counted, so this is not a statement that everything classified" rather than a false empty state. **Two traps it got past, both of which would have produced a clean-looking false green:** a plain `curl` to the preview is answered by **Vercel SSO**, not the app, and that interstitial carries its own `strict-transport-security` and `x-frame-options` that look like the app's — the tell is `preload`, which Vercel sets and `next.config.ts` deliberately omits; and its **first bundle scan returned zero on every pattern**, which reads as a perfect result and was actually blindness against the wrong chunks, exposed only by a positive control. **BLOCKER: `SUPABASE_SERVICE_ROLE_KEY` absent from Preview, so every `/api/*` route 500s before the handler** — cause read out of `vercel logs`, not inferred. It declined to set it: the value is unreadable by any agent session, and whether a BYPASSRLS credential belongs on a preview URL is Erik's call. **It also refused to certify the API layer at all**, because no-auth, bad-auth, valid body and garbage body all return an identical `500` — a probe that cannot discriminate certifies nothing. Independently measured `auth.users`, `operator`, `agent_token`, `contract_milestone` all at **0 rows**. **Declined an available workaround** (inserting an `agent_token` hash by SQL) because it routes around the operator-at-`aal2` control and would write a permanent append-only row to prove nothing. Report gate PASS. 5 questions. **9 items still NOT VERIFIED, each with a specific reason** |
| qa1 | qa | 2 | Final review pass on the merged branch: build, lint, type-check, Playwright flows, a11y, security pass against §7a, trajectory grading from specialist traces | qa-reviewer | all merged units | **done — verdict revised to ISSUES** (was FAIL: 1 critical, 5 important, 6 minor) after re-verifying i10's fix. `.fleet/qa-report-b0952e.md`. **C1: Mode-1 ingest inoperable** — `service_role` has no EXECUTE on `app.gates_are_closed_set(jsonb)`, which sits in a CHECK constraint on `fleet_run`; a CHECK evaluates in the *caller's* role and `persistPlan` writes that table first, so `POST /api/ingest/run` 500s on every request and FR-14–FR-23 cannot store a row. Reproduced as `service_role` (`42501 permission denied for function gates_are_closed_set`); blast radius measured at exactly one CHECK constraint. **Credentials let it close 17 of ~18 carried NOT VERIFIED items**, including all four the specialists jointly ranked most-wanted. **Its sharpest finding is a method, not a bug:** i5 proved FR-22 idempotency through `execute_sql` as `postgres`, which *can* execute that function, while the shipping path runs as `service_role` — the probe passed in a role the product never uses, and that is exactly how C1 shipped green. It caught its own false green the same way (identical counts read as IDEMPOTENT while both posts failed at zero; only a different-run-id negative control exposed it) and its own invalid negative control (exit 1 came from `Failed to type check`, not an assertion). Wrote 2 suites, added `@axe-core/playwright`, committed as `a88e18f`. **Report gate CANNOT EVALUATE THIS REPORT — harness gap, not a report defect.** I sent it back twice; the first failure (missing `**Run:**`) was real and qa1 fixed it in one added line. The second is structural: `report-gate.sh`'s `REQUIRED` map (line 84) holds five specialists — ui-designer, api-integrator, copywriter, devops, docs-writer — and **no `qa-reviewer`**, so line 220 exits `unknown specialist` on every truthful heading. `EVIDENCE` (line 92) has the same five and would `KeyError`, and line 235 accepts only DONE/BLOCKED/FAILED while the QA template mandates `**Status:** FAIL`. **Verified in the script myself rather than taken on report.** qa1 tested three heading spellings against throwaway copies; all three fail. The only headings that pass name a specialist that did not write the report and owe sections the QA template does not have. **qa1 declined to relabel and that refusal was correct** — a gate passed by misdeclaring authorship is not a gate. **Neither of us edited the harness**: it is cross-project infrastructure and this run does not need it to proceed. Carried as a finding for Erik. 6 questions |
| i10 | integration | 2 | **Remediation of the qa1 findings** — C1 the `service_role` grant on `app.gates_are_closed_set` plus a census for any second instance; I1 the environment-coupled e2e sign-in test; I2 the silent `engagementSlug` discard; I3 unknown release body keys dropping `deployedAt` | api-integrator | qa1 | **done** — 3 commits `d08ea4e`→`c65e44d`. **C1 proven through the product's own path**, not at the SQL layer: reproduced first (both `42501` under `set local role service_role` and `500` over HTTP), then same binary, same payload, only the grant changed — run `i10p1` took `work_item` 0→20, the same id again held at 20, and a different id `i10p2` rose to 40. **Observed 200 on both posts, not the 201/200 my brief predicted, and left the route alone rather than bending behaviour to match my guess.** Confirmed both of qa1's blast-radius claims independently and read the privilege matrix for all 20 functions in `app`+`public`: **no second instance**; grant is `service_role` only. Regression gate is a **pure text analyzer over the migration SQL** (`tests/migration-grants.ts`) rather than a credentialled privilege assertion, because the latter is a *skipped* test in CI — and it named the defect when the migration was removed. **It corrected my brief's I2 attribution by measuring before designing:** explicit-slug resolution was never broken; qa1's probe sent `engagementSlug` where the field is `engagement` (`sessions/input.ts:231`), so I2 was **I3's defect on another endpoint**. One fix for both: unknown body keys now `400` across all three ingest endpoints, naming the field the caller meant, with a server-owned key (`source`) deliberately exempt and reported in `ignored_fields`. I1 fixed at its **premise**, proven green both with credentials and with the Supabase vars blanked — a runtime guard would have been wrong, those vars being build-time inlined. Gates re-run by me at `c65e44d`: typecheck 0, lint 0, build 0, **958 pass / 6 skip**, **e2e 0 — 199 pass / 7 skip**. Report gate PASS. **Then extended at re-verification** (`5b0baa6`, `b980e1a`, tip **b980e1a**): the unknown-key guard reached `/api/waits` and `/api/waits/resolve` too — qa1 found `/api/waits` had none, and it mattered because `expected_by` was silently swallowed and **FR-34 computes the overdue flag from `expectedBy`**, so the ledger would store a wait that can never go overdue. Proven by reading the row back out of Postgres, not by the `201`: `expected_by`→`400 did you mean expectedBy?`, `expectedBy`→`201` **and `expected_by = "2026-08-18"` stored**, `bogusKey`→`400`. Guard tests proven red by removal (3 failed / 14 passed). Its first read-back printed `stored: undefined` because the probe selected `started_on` where the column is `started_at`; **it fixed the probe rather than reporting around the blank**. Also removed raw U+0000 bytes from four sources and added `tests/source-hygiene.test.ts`. 4 questions. `audit_log` +22 |
| man1 | docs | 2 | End-user manual `docs/user-guide.md` (`mode: manual`), gated on qa1 PASS | docs-writer | qa1 = PASS | **NOT DISPATCHED — the gate did not open.** `qa1` returned **FAIL**, and the rule is that a manual is not written for a build that failed review. This supersedes the earlier note in this row, which recorded man1 as dropped on a session-budget trade; that trade is moot, because budget was never the binding constraint at resume 3 (18 of 20 used, man1 would have been 19). **It is blocked a second and independent way, and this one survives a green QA:** the manual needs a signed-in, populated state, and none is reachable. `auth.users` = 0 rows and `public.operator` = 0 rows, both measured this run by d1 and again by qa1; `disable_signup` is correctly on, so **no agent can create the account**, and §7b states there is no seed script in Phase 1. `docs-writer` would have returned `BLOCKED` and I do not spend a dispatch on a `BLOCKED` I can predict. **§7b is NOT waived** — it requires this guide and names `docs/user-guide.md` as its home. I did not write that waiver and will not: an agent deciding a product has no end user reads exactly like a client agreeing it has none. Resolution is Erik's: provision one operator account, then re-run. |

## Phase 2 wave plan (dispatch order, and why it is not one big fan-out)

Six waves, because the Phase 2 dependency graph is genuinely serial in two places and a wide fan-out
would have three specialists inventing the same server-side primitives in three worktrees and
colliding at merge.

| Wave | Units | Rationale |
|---|---|---|
| A | i3, i4 | i3 is pure TypeScript beside `i-core` and touches no shared file. i4 owns the shared server-side primitives every later route needs — agent-token auth, capability check, rate-limit call, audit write — **and owns `next.config.ts` exclusively** (security headers + `agentRules: false`) |
| B | i5, i6, i8 | All three consume i4's primitives; each owns a disjoint route set |
| C | i7, u2, u4, doc1 | i7 needs i3 + i5/i6 persistence; u2 needs i5; u4 needs i4 + i6; doc1 needs i4 + i6 |
| D | u3 | The six answer screens need i7's endpoints |
| E | c1, d1 | c1 fills the `COPY:` slots u2/u3/u4 leave and **must merge before qa1**; d1 verifies a preview deploy of the finished branch |
| F | qa1, then man1 | qa1 once on the merged branch, no worktree. man1 gated on qa1 PASS |

**Dispatch budget:** 20 total. 4 used in Phase 1. Phase 2 plans **14** (A:2 · B:3 · C:4 · D:1 · E:2 · F:2)
for **18 of 20**. i9 is blocked and consumes none.

## Erik's answers — carried into every Phase 2 brief

All 11 queued questions answered plus three operator instructions, in `.fleet/answers-b0952e.jsonl`.

| # | Decision | Consequence for Phase 2 |
|---|---|---|
| 1 | oxlint accepted for Phase 1; **do not unpin TypeScript** | Keep r1's pins. No hard-failing `lint` script that lints nothing |
| 2 | `unrs-resolver` build-trust **stays declined** | Do not revisit |
| 3 | §5a **approved at the token layer only** | Typography, violet accent, 16-token scale settled; fuchsia stays exclusive to `unparsed`. **Screen layout and density are unreviewed** — surface them for review, do not treat as settled |
| 4 | The visible `unparsed count unavailable` third state **stays** | Never render an unknown count as `0` |
| 5 | `contract_milestone.notes`, `open_question.answer`, `defect.wont_fix_reason` **stay encrypted** | Resolving upward where §7a is silent is correct |
| 6 | **Append-only wins absolutely** over FR-61 | Triggers keep refusing UPDATE/DELETE/TRUNCATE for every role. No escape hatch. M1.10 blocked pending CR-002 |
| 7 | FR-5's `contract_milestone` refusal is a **handler-layer** check in i4 | Must be reported as application-layer, **not** as RLS-enforced. The route handler reads with the service-role key, which holds BYPASSRLS |
| 8 | Four fields **stay free text** | Do not invent enums |
| 9 | **One `operator.role`** for v1 | No speculative admin role |
| 10 | `blocker.owner` **defaults to `"erik"`** — change `plan.md`'s `"client"` | Never infer owner from prose. Where the artifact names a client or vendor, use that; absent a statement, Erik |
| 11 | The six `fixtures-local/` corpus assertions **stay skipped** | Never synthesise fixtures. Never report them as passing |
| Op-1 | Set `agentRules: false` in `next.config.ts` | Next 16.3.1 writes a generated block into `CLAUDE.md`; do not commit it. **i4 owns this file** |
| Op-2 | M1.10 **blocked** pending CR-002 | i9, not dispatched |
| Op-3 | CR-002 is **pending — do not fold** | Spec basis unchanged: `spec-approved.md` + CR-001 |

## Lead-level decisions taken during Phase 2

**D-P2-1 — `i8` found that nobody owns the definition of the `unparsed` population, and it is a real
defect in the making.** FR-58 requires every screen and every endpoint to report "the current
`unparsed` count", and the spec never says *of what*. `i8` chose global `work_item` rows at
`status='unparsed'` and flagged it low-confidence precisely because if `i5`, `i6` and `i7` each pick
differently, **the six endpoints report different numbers for the same state** — which is worse than
reporting none, because a number that disagrees with the number on the next screen destroys trust in
both. **Resolution: `i7` owns the definition**, exports it as one function, and every endpoint and
screen calls it. `i8`'s local choice is reconciled to it at merge. Recorded here rather than left to
whichever unit ran last.

## Merge notes

**Wave A** merged `d1f544f`,`16b5a1f` (i3) then cherry-picked `7c56526`,`ec5eab6` (i4). **Zero conflicts.**
Verified at the merged head: typecheck 0, lint 0, build 0, **265 pass / 6 skip**; `CLAUDE.md` unmodified
after a build, confirming `agentRules: false`.

**Wave B** merged i6 (`0011bc8`), then i5 (`2af455a`), then i8 (`3b2c81d`). **One conflict, in
`src/lib/ingest/blocked.ts`, and it was the good kind:** i5 and i6 independently made the *same*
change Erik ruled on — `blocker.owner` default `"client"` → `"erik"` — and disagreed only on where the
constant should live. i6 defined `DEFAULT_BLOCKER_OWNER` in `blocked.ts` at the point of use; i5
defined it in `prodMd.ts` and imported it. **Resolved by keeping both authors' reasoning rather than
picking a winner:** the constant has one definition in `blocked.ts`, `prodMd.ts` re-exports from
there, and i5's use-site comment was kept because it carries a fact i6's did not — *the manifest's
Blocked table has no Owner column at all*, so this default owns **every** blocker parsed from a
manifest. Both parsers assert `"erik"` in their own tests (`blocked.test.ts` ×3, `prodMd.test.ts` ×3).

Verified at the Wave B merged head `3b2c81d`: typecheck 0, lint 0, build 0 (six `/api/*` routes
registered), **583 pass / 6 skip**.

## i6 was rescued, not re-dispatched — and this is the failure mode the run check exists for

i6 was terminated by an API session limit **after** writing a complete 27KB report and **before**
committing. Its worktree HEAD had never moved off `ec5eab6` while 28 files of finished work sat
uncommitted. A resume that trusted the report would have marked it `done` and merged nothing; a
resume that trusted `git log` would have re-dispatched it and paid for the work twice. **Neither is
what happened:** project-lead re-ran the unit's gates against the uncommitted tree itself
(typecheck 0, lint 0, build 0, 424 pass / 6 skip, the six skips confirmed by filename), and only
then committed on the specialist's behalf with the provenance in the commit message. **No dispatch
was spent.**

## Defects found in merged code, and how they were handled

**D-P2-2 — two routes hardcoded `apiOk(data, { unparsed: 0 })`.** `src/app/api/waits/route.ts:102` and
`src/app/api/session/unassigned/route.ts:50`, both from `i6`, found by `u3` while building the screens
that consume the count. **This states the ledger classified everything, on a request that counted
nothing** — the single failure the project's central rule exists to prevent, and a literal `0` here is
a false positive claim rather than a missing feature. Neither author was still running. **Sent back to
`u3`, which found them, rather than carried into the QA pass**, with a test required for each that
would have caught the hardcode. No dispatch spent.

**D-P2-3 — the shell unparsed badge overflows every route on mobile.** 222px with `shrink-0`, overflowing
a 375px header by 46px, measured by `u3` on `/work-items` as well as its own screens, so it predates
this unit and affects `u2`'s and `u4`'s merged screens too. It is `u1`'s shared component. Same
disposition: back to `u3`, fixed in the shared component, re-measured rather than assumed.

**Both were found by a specialist reading merged code it did not write.** Neither would have been
caught by the gates — the suite was green at 906 passing with both defects present, because a
hardcoded `0` is a valid number and an overflowing header is a valid render.

## Defer list

- **d1 (`deploy`) — CORRECTED 2026-08-19: NOT blocked. It is a normal Phase 2 unit.**
  My dispatch brief stated that B1b blocks the `devops` unit, and `prod.md` said so too until a
  correction landed mid-run. **Both were wrong, and I verified the correction independently rather
  than accepting it:** `~/.claude/agents/devops.md` contains **zero** `mcp__` references and drives
  Vercel entirely through the CLI - `vercel project ls`, `vercel link`, `vercel env ls`,
  `vercel deploy`. The MCP connector's project-scoped grant limits an interactive session's vantage
  and nothing else. This is the project's signature defect family one level up: on 2026-08-17 a tool
  was mistaken for the world; here a tool's limitation was mistaken for a constraint on an agent that
  never calls it. **Had I not re-read `prod.md` at the writeback, this run would have deferred a
  dispatchable unit on a stale premise and reported it as blocked.**
- **Phase 2 milestones M2.1–M2.6 — out of scope**, per `prod.md`'s milestone tracker. Not a specialist gap.
- **Phase 3 milestones M3.1–M3.3 — deferred at intake**, per the spec §4.3 and `prod.md`. Not a specialist gap.
- **No work-unit type is deferred for want of a specialist.** All seven specialists have written bodies. `research`, `ui`, `integration`, `copy`, `qa`, `docs` are all dispatched this run; `deploy` is blocked on B1b, which is an environment blocker and not a scope decision.
- **M1.0 Provisioning — skipped as already built.** `prod.md` reports it Done and verified by observation. No unit re-provisions anything.

## Blocked / carried

| ID | What it blocks | Owner | Carried as |
|----|----------------|-------|-----------|
| B1b | **nothing** — corrected 2026-08-19 | Erik | d1 is dispatchable; B1b limits an interactive MCP vantage only |
| B2 | ingesting any engagement other than this repo's own | Erik | does not block the build; noted in i5's brief |
| B3 | nothing — the §7a baseline ships | Erik | noted in i1's brief |
| B4 | doc1's session-hook install **scope** documentation, not M1.5's code | Erik | doc1 writes it as an open decision |
| B5 | nothing in v1 under the recommended answer | Erik | noted in doc1's brief |
| B6 | nothing — the §7a baseline ships | Erik | `engagement.client_name` stays clear per §7a |
| B7 | M2.2 only (Phase 2) | Erik | out of scope this run |

## Questions fan-in

Per-unit files only: `.fleet/questions-<unit-id>-b0952e.jsonl`. Never a shared file — a worktree-isolated
agent cannot append to a main-tree file, and a shared target silently becomes N worktree-local copies.
Concatenated to `.fleet/questions-b0952e.jsonl` at each fan-in barrier.

| Unit | Lines | Collected into the fan-in file |
|------|-------|-------------------------------|
| r1 | 0 | file never created — no Erik-level judgment arose |
| u1 | 4 | yes |
| i1 | 5 | yes |
| i2 | 2 | yes |
| i3 | 4 | yes (Wave A fan-in) |
| i4 | 4 | yes (Wave A fan-in) |
| i5 | 3 | yes (Wave B fan-in) |
| i6 | 5 | yes (Wave B fan-in) |
| i7 | 12 | yes (Wave C fan-in) |
| i8 | 4 | yes (Wave B fan-in) |
| u2 | 5 | yes (Wave C fan-in) |
| u3 | 8 | yes (Wave D fan-in, incl. the follow-up) |
| u4 | 12 | yes (Wave C fan-in) |
| c1 | 3 | **RECOVERED at resume 3** — existed only on the branch, never in the main tree |
| doc1 | 9 | yes (Wave C fan-in) |
| d1 | 5 | **RECOVERED at resume 3** — existed only on the branch, never in the main tree |
| **TOTAL** | **85** | fan-in rebuilt from the per-unit files at resume 3. It had held **69**. |

**14 of the 85 are answered** (`.fleet/answers-b0952e.jsonl` — the 11 Phase 1 questions plus three
operator instructions). **71 are open**, essentially all of Phase 2. They were queued and the run
proceeded on best guesses, which is the intended discipline; they are not blockers and are not
treated as answered.

## Report-gate results — every unit, re-run at resume 3

`report-gate.sh <report> b0952e`, run with this run's id as the second argument.

r1 SKIP (research note) · u1 PASS · i1 PASS · **i2 FAIL** · i3 PASS · i4 PASS · i5 PASS · i6 PASS ·
i7 PASS · i8 PASS · u2 PASS · u3 PASS · u4 PASS · c1 PASS · doc1 PASS · d1 PASS

**`c1.md` and `d1.md` were also recovered from the branch at resume 3** — like their question files,
both reports existed only in the branch's `.fleet/specialist-reports/b0952e/` and had never been
copied into the main tree. Both PASS the gate.

**i2 FAILS the gate, and I did not fix it.** Verbatim:

```
FAIL  `## Questions Queued` names /Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-af9a7210a66a86493/.fleet/questions-i2-b0952e.jsonl, which resolves to /Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-af9a7210a66a86493/.fleet/questions-i2-b0952e.jsonl — outside this repo's `.fleet/`. A questions file has to be somewhere the run collects from
```

This is a **defect in the report artifact, not in the work**, and the distinction is load-bearing.
i2's two questions *were* in fact collected — `.fleet/questions-i2-b0952e.jsonl` holds both — so the
loss the gate exists to catch did not occur; the report merely names the worktree-local path it wrote
to rather than the collected one. i2's code was independently verified (14 commits, 29 files, 87 pass
/ 6 skip, all 13 `plan.md` tasks mutation-proofed) and has been merged since Phase 1, where the
checkpoint recorded a PASS this re-run contradicts.

**I tried to have i2 repair its own report and could not.** `SendMessage` to `af9a7210a66a86493` returned `No transcript found for agent ID` — Phase 1 ran in a different session and that specialist is no longer resumable. The same remedy worked for i7 and c1 mid-run and for qa1 at the end, because those agents were still reachable. **A specialist's report is only self-repairable for as long as its session survives**, which argues for gating a report the moment it is written rather than at the end of the run.

**I did not edit the report to clear the gate.** On this project that is the named forbidden move —
it is the same act as editing a fixture to make a test pass, and it would make the gate stop being a
gate. The row stays marked with the failure and the line travels into the build report. What it costs
Erik is one wrong `PASS` in the Phase 1 checkpoint, now corrected.
