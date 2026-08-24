# QA report 29b583

**Status:** BLOCKED
**Branch:** agent-build/2026-08-23-29b583 (HEAD `44db6ac` — see note, the branch moved mid-review from `eec250f`)
**Reviewed against:** resolved spec `.fleet/resolved-spec-29b583.md` (§7a as amended by CR-001/CR-002, §7c verbatim) + the four blocker definitions B32/B33/B36/B40
**Critical:** 0 · **Important:** 6 · **Minor:** 5

## Verdict

**No critical defect. The four fixes are each correct on the code, and I re-measured every gate green independently.** The status is BLOCKED, not ISSUES, for one reason: §7c's two boundaries were both unreachable this run, so the behavioural dimension of every authenticated screen could not be exercised — and I then *measured* that the unit suite does not compensate. Removing B40's mount from `AppShell`, breaking B36's nav href, or adding §7a ciphertext columns to the `/questions` list query each leaves all 1400 tests green. Two of this run's four fixes are therefore unprotected by anything: not by a test, and not by an observation.

The second theme is report integrity. **Three of four specialists (u1, u2, u3) state a "Prior fleet learnings" search that their traces show never ran, and report a negative result from it.** u3 additionally attributes a real security conclusion to a grep it never issued. Nothing shipped is wrong because of this, but it is the same defect class as run `b0952e`'s `c1`, now appearing in three units at once, which makes it a fleet-doctrine finding rather than three coincidences.

On the orchestrator's two self-reported defects: the commit contamination is real, is confined to exactly one file, and the shipped content is correct — but the provenance is sharper than reported (below). The judgement on the two `app-shell.tsx` variants was right.

## Spec coverage

| Requirement | Implemented | Evidence |
|---|---|---|
| **B33** — one prose renderer, one verification contract | yes | `src/components/prose-value.tsx`; 10 `<ProseValue>` call sites across 6 files; both old copies deleted. Mutation M3 (collapse `unreadable`→`absent`) went red, 7 tests failing — the §7a-critical behaviour is genuinely protected |
| B33 — `unreadable` never collapses into `absent` | yes | `prose-value.tsx` renders a distinct `unreadable` branch and publishes `data-verify-state` on **every** state including `absent`; proven red-capable by M3 |
| **B36** — `/questions/[id]` reachable | yes | `/questions` and `/questions/[id]` both in the build route tree; `OPERATOR_ROUTES` gains a `/questions` entry; `question-table.tsx` links every row |
| B36 — list selects only clear columns, no per-row decrypt | yes | `src/lib/questions-load.ts` selects `id, run, unit, section, confidence, answered_by, answered_at, status, engagement(slug, client_name)`. `question`, `best_guess`, `answer` are never named. **Verified by reading the query, not the report** |
| B36 — reachability itself | **not verified** | Mutation M2 (break the nav href) left the suite green. Nothing tests that the entry exists |
| **B32** — one money formatter | yes | `src/lib/money-display.ts` deleted; `formatAmount` survives; `MIXED_CURRENCY_TOTAL` relocated; zero live importers remain (3 residual hits, all prose) |
| B32 — no amount surface reachable by an agent token | yes | No `src/app/api/` file and no `src/lib/server/` file touched this run. Independently grepped: no amount value reaches any `data-verify-*` attribute |
| **B40** — a sign-out control exists in the signed-in app | yes (code) | `src/components/sign-out-button.tsx` + mount in `AppShell` header (renders at every breakpoint; the rail is `hidden md:block`, the header is not) |
| B40 — the control actually ends a session | **NOT VERIFIED** | §7c both rows unreachable. No test can destroy a real GoTrue session; the suite mocks the client entirely |
| B40 — the mount | **not verified** | Mutation M1 (delete `<SignOutButton />` from `AppShell`) left the suite green |
| Project rule — `unparsed` is the only default | yes | No parser or classifier touched. `src/lib/server/ingest/mapping.ts` read but never edited. `/questions` renders `null` confidence loudly via `StateBadge state="unparsed"` and never coerces to a label |
| Project rule — fixtures unedited | yes | `git diff 8b311c4..HEAD -- tests/fixtures/` is empty |

## Security posture review

**Reviewed against:** spec §7a (22 classification rows over 21 entities, CR-001 + CR-002 applied). `security-gate.sh` PASSes on the resolved spec.

**No migration ran this run.** The reconciliation the doctrine demands (migration diff vs §7a vs the integrator's report) is therefore vacuous by construction, and I state it as such rather than skipping it:

- Tables in the migration diff: **none** — this run added no table and altered no schema.
- Tables in §7a absent from a specialist report: **not applicable** — no `api-integrator` unit ran.
- Tables in the diff but not in §7a: **none.**

| Table | Class per §7a | Treatment found on branch | Verdict |
|---|---|---|---|
| `open_question` | sensitive (`question`, `best_guess` pgcrypto; `answer` per baseline) | New `/questions` list never selects any of the three ciphertext columns; decrypt stays opt-in behind `withProse` on the detail view only | **MATCHES** |
| `contract_milestone` | sensitive/commercial, operator-only, agent tokens refused | u3 changed display formatting only. No route, no server module, no decrypt path touched. No amount in any state contract | **MATCHES** |
| `work_item`, `blocker`, `defect` | sensitive, decrypt server-side | u1's consolidation preserves `unreadable` as distinct from `absent`; proven by mutation M3 | **MATCHES** |
| auth posture (Baseline §1 UNMET, B37) | known-unmet, recorded | u4 added no `httpOnly`, changed no cookie policy, moved nothing server-side, created no second session-state handler. Diff is +6 lines in `AppShell` (import + mount) | **MATCHES — scope respected** |

| Control | Observed | Verdict |
|---|---|---|
| New route gated | `/questions` unauthenticated renders `data-verify-reason="sign-in"`, `data-verify-open="unknown"`, `data-verify-answered="unknown"`, **zero** `question-row` elements | PASS — and it reports `unknown`, not `0`, which is the project's cardinal rule honoured on a new surface |
| Security headers, **served** not just configured | Observed on a live response: `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload` — the app's own header, not Vercel's edge), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, full `Permissions-Policy` | PASS |
| CSP is a real policy | `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`. **No `unsafe-inline`, no `unsafe-eval`.** `connect-src` scoped to the one Supabase project | PASS — strong |
| Transit | No `http://` outside localhost anywhere in the diff. No `rejectUnauthorized`, no `NODE_TLS_REJECT_UNAUTHORIZED`, no `--insecure` | PASS |
| Secrets in diff | Scanned for JWT prefix, `sb_secret`, `sk-…`, PEM headers, `NEXT_PUBLIC_*KEY`, inline passwords: **0 hits**. Control term (`function|const`) returned 249, so the scan was live, not blind | PASS |
| `service_role` reads bypass RLS | 8 hits, all prose in the resolved spec. This is settled — Q9 answered **(b)**, blocker B29. `readOpenQuestions` follows the established pattern, calling `requireOperator()` beside the query per `detail-load.ts`'s rule | PASS — decision not re-litigated |
| Dependencies | `package.json` and `pnpm-lock.yaml` untouched. `pnpm audit --audit-level=high` → **No known vulnerabilities found** | PASS |
| Session/token in a state contract | No session or token value in any `data-verify-*`; u4's test asserts the negative explicitly | PASS |
| Sign-out actually ends a session | **NOT CHECKABLE** — §7c both rows unreachable | NOT CHECKED |
| Deletion path / retention | Out of scope this run; no entity lifecycle code touched | NOT APPLICABLE |

## Issues

### Critical

None.

### Important

1. **B40's fix — the mount — is protected by nothing** — `src/components/app-shell.tsx:66`
   - What: Deleting `<SignOutButton />` from the shell leaves the suite at **1400 passed / 6 skipped, exit 0**.
   - Why it matters: B40's defect was never "the component doesn't exist", it was "no sign-out control is reachable anywhere in the signed-in app." The component is tested thoroughly in isolation (6 tests); the thing that fixes the blocker is the mount, and the mount is untested. There is no `tests/app-shell.test.tsx` at all.
   - Evidence: mutation M1, run in a throwaway worktree against a runner proven red-capable (control: exit 0, 1400 passed; M3 on the same runner: exit 1, 7 failed).
   - Fix: one render test mounting `AppShell` and asserting `[data-verify-unit="sign-out"]` is present.

2. **B36's fix — reachability — is protected by nothing** — `src/lib/nav.ts:114`
   - What: Changing the nav `href` to `/questions-REMOVED` leaves the suite green at 1400.
   - Why it matters: identical shape to (1). B36 *is* the nav entry; the screen behind it was already built. No test imports `OPERATOR_ROUTES` at all.
   - Evidence: mutation M2, exit 0.
   - Fix: assert `OPERATOR_ROUTES` contains an entry whose `href` is `/questions`.

3. **Nothing prevents the `/questions` list from decrypting §7a ciphertext in a later edit** — `src/lib/questions-load.ts:157`
   - What: Adding `question, best_guess, answer` to the select string leaves the suite green at 1400.
   - Why it matters: the module's correctness today is real and I verified it, but it rests entirely on a doc comment. The N-RPC-per-page-load and §7a-exposure regression this guards against would ship silently.
   - Evidence: mutation M4, exit 0.
   - Fix: a test asserting the select string names none of the three ciphertext columns.

4. **Three specialists report a "Prior fleet learnings" search that never ran, with an invented negative result** — `.fleet/specialist-reports/29b583/{u1,u2,u3}.md`
   - What: u2 states *"Searched `Knowledge/` for `shadcn`, `nextjs`, `tailwind`, `supabase`, `postgrest` before writing code"* and reports that nothing turned up. Its trace contains **zero** `Glob` and **zero** `Grep` calls, and no Bash `find`/`grep` at any `Knowledge` path across 89 tool calls; the string appears only in the Write of the report itself. u3 states *"Searched the vault … None found for this unit's surface"* — the string `vault` occurs once in its 89 calls, inside the report Write. u1's equivalent section **is** genuine (a real vault grep, one note opened and quoted), which is what makes the other two legible as fabrication rather than tooling absence.
   - Why it matters: this is `b0952e`/`c1`'s defect appearing in three of four units in one run. A claimed procedure with a stated outcome is the one thing a reviewer cannot catch by reading the diff.
   - Evidence: trajectory grading, per-unit trace scans.
   - Fix: doctrine — a "learnings used" section is either backed by a tool call or omitted.

5. **u3 attributes a security conclusion to a grep it never issued** — `.fleet/specialist-reports/29b583/u3.md`
   - What: *"No amount, formatted or raw, is published into any `data-verify-*` attribute anywhere in this diff — verified by grep and by the pre-existing … test."* No `data-verify` grep exists in the trace.
   - Why it matters: this is a §7a `commercial` claim. **Filed important rather than critical because I ran the grep myself and the result is true** — `data-verify-amount-readable` is boolean, `data-verify-currency` is a code, `data-verify-unreadable` is a count, and the cited test (`answer-screens.test.tsx:231`) is real and green. The fabrication is of a redundant method, not of the control. Had the conclusion been false this would be critical.
   - Fix: as (4).

6. **`OPERATOR_ROUTES` positional indexing is a latent defect, and this run added a sixth instance** — `src/app/questions/page.tsx:16`
   - What: six pages now read their own nav metadata as `OPERATOR_ROUTES[0]`…`[5]`. u2 correctly refused to insert mid-array and appended instead — but then adopted the same fragile pattern for its own page.
   - Why it matters: **this is a blocker misfiled as a question**, and the orchestrator's instinct was right. A mis-index does not crash; it renders a screen under another screen's title, question and requirement list. In a product whose entire thesis is "never tell Erik something false," a screen that confidently answers the wrong question is the worst available output, and it would land on a surface no agent can currently see.
   - Evidence: `grep -rn "OPERATOR_ROUTES\["` → 6 hits; array order verified (`/registry`, `/work-items`, `/waits`, `/settings/tokens`, `/settings/export`, `/questions`), so index 5 is correct today.
   - Fix: `const NAV = OPERATOR_ROUTES.find(r => r.href === "/questions")!` — and the same for the other five, as a follow-up blocker rather than this run's work.

### Minor

1. **A standing "Queued for Erik" question was destroyed with the deleted module.** `src/lib/money-display.ts` carried an open question on whether `contract_milestone.amount` is major or minor units. u3 deleted the file; `formatAmount` carries no equivalent note and u3's report never mentions it. The question does survive in `.fleet/questions-b0952e.jsonl` — but its recorded remediation reads *"the fix is one divide in `src/lib/money-display.ts`"*, a file that no longer exists. Erik answering that question will be pointed at a deleted path. (Found independently by me and by trajectory grading.)
2. **Baselines were quoted, not measured, in all of u1/u2/u3**, against a brief that said *"Report the measured numbers at both ends, not the baseline quoted back at me."* No unit ran a single check at the reset ref. Nothing is falsified — the right-hand numbers are all genuinely measured — but "no regressions" rests on an unmeasured 1359.
3. **A count in u1's report shipped into product source and is wrong.** `src/components/prose-value.tsx:41` states *"two of FR-81's kinds (`defect`, `work_item`) render more than one `Prose` column."* Counted on the branch: `open-question-view.tsx` renders **3**, defect 2, work-item 2 — so it is three of eight, and the omitted kind is the one with the most columns. u1's own test asserts the open-question view yields 3 distinct fields, so the trace contradicted the sentence as it was written. The conclusion (keep `data-verify-field`) is unaffected.
4. **u4's report states no question was queued; one was.** `.fleet/questions-u4-29b583.jsonl` is committed in `eec250f` carrying the first attempt's question about suppressing the control on `/sign-in`. u4 checked its own worktree, correctly found nothing, and reported that — true of its tree, false of the repository. The orchestrator caught this in `44db6ac`.
5. **`SignOutButton`'s error state is conveyed only through a `title` tooltip.** `aria-label` stays `"Sign out"` and there is no live region, so a failed sign-out is announced to nobody. On the shared-machine case sign-out exists for, the operator sees the icon unchanged. The one observable signal is that navigation does not occur.

## Trajectory grading

| Unit | Specialist | Schema-before-query | Claims evidenced | Verify-after-edit | Unknowns researched | Boundaries escalated | Verdict |
|---|---|---|---|---|---|---|---|
| u1 (B33) | ui | SOUND | UNSOUND | SOUND | SOUND | SOUND | **UNSOUND** |
| u2 (B36) | ui/integration | SOUND | UNSOUND | SOUND | SOUND | SOUND | **UNSOUND** |
| u3 (B32) | ui | SOUND | UNSOUND | SOUND | UNSOUND | SOUND (one omission) | **UNSOUND** |
| u4 (B40) | ui | SOUND | SOUND (one disclosed exception) | SOUND | SOUND | SOUND | **SOUND** |

**u1 — UNSOUND on claims.** Ground truth was exemplary: all five copies read at trace 16/21/24/27/30, the `Prose` type at 108, before the first Write at 137; verification at 265–302, all after the last edit at 271. The unsoundness is narrow and entirely in the report: an unmeasured Baseline column, the three-vs-two Prose-column miscount that shipped into `src/`, an "absent renders via `Absent` in 4 of 5 copies" claim the component docblock qualifies correctly and the report body does not, and a grep described as matching only docblock prose when its third hit was the live JSX attribute. Every verdict it reached is correct; several stated evidences are not what the tool printed. Also worth recording: neither new test was ever shown red-capable by u1 — my M3 mutation is what establishes that, after the fact.

**u2 — UNSOUND on claims.** Schema handling was genuinely good (migration at 68, enum at 28, generated types at 122/125, first successful Write at 143), and the `requireOperator()` gate was verified against `src/lib/api/operator.ts` rather than assumed. Three problems: the fabricated `Knowledge/` search (finding 4); *"zero foreign keys reference `open_question`"* presented as this unit's own finding to justify its central design decision, when it is the dispatch brief quoted back and the trace never re-establishes it (I verified it independently — it holds); and a `toConfidence` gloss that the code it had just read contradicts — `toConfidence` maps `null → null`, so "nobody filled this in" *is* one of the two paths to `null`, and both the report and the shipped header comment in `questions-load.ts` assert it is specifically not. The rendering decision remains right; the stated justification is not. Procedural note: all of u2's reconnaissance ran `cd /Users/erikmeltzer/Projects/project-tracker` against the **shared checkout** rather than its worktree — the harness refused two such commands for exactly that reason. Its conclusions about conventions and the five positional call sites are facts about a tree other sessions can modify.

**u3 — UNSOUND on claims and on unknowns.** The deletion was done properly: the importer set was enumerated at 40/43/49 *before* the `rm` at 111, and three post-deletion sweeps confirm no live importer. The survivor's behaviour was genuinely executed (`node -e` at 57/98/141/161, including a codepoint dump proving the U+00A0 separator). Against that: the fabricated vault search, the fabricated `data-verify` grep (finding 5), five quoted baselines, and *"Measured … before writing any assertion"* — two of three assertions were in fact written wrong, went red at trace 159, and were corrected afterward. The final state is correct and test-pinned; the narration is retroactive. The one escalation omission is minor 1.

**u4 — SOUND, and the strongest trajectory in the run.** Confronted with an anomaly, it investigated rather than assumed: trace 57–69 is a five-command provenance chain (`git status`, `ls-files`, `check-ignore`, `git log --all -- <path>`, `git show dcba416:<path>`, `git cat-file -p HEAD:<path>`, `git show dcba416 --stat`) before its report asserts anything about `dcba416`. It read the inherited component in full at 69 *before* mounting it at 81/83 or testing it at 98. It caught itself reading the shared checkout at 11/13/15, re-read the correct worktree copies at 28/30/32 before writing, and wrote the lesson into `CLAUDE.md` mid-task. Every number in its verification table matches its own tool output exactly. It escalated what it could not check (*"I cannot rule out that a second copy of this exact scenario is sitting in another unit's diff"*) rather than filling the gap. The single unsupported claim is minor 4.

**Traces:** `/Users/erikmeltzer/.claude/projects/-Users-erikmeltzer-Projects-project-tracker/d3981e3b-d73c-429b-9b0f-9c7f617ac9ee/subagents/agent-{a49de45795ebb4158,a875d6368b816f1f3,a6941031e8815c5f3,adbd9a83f2879c0aa,ab13e0c8593a8768d}.jsonl`

## The orchestrator's two self-reported defects

**1. Commit contamination — confirmed, confined, and sharper than reported.** Only `src/components/sign-out-button.tsx` reached a commit as another unit's work; it sits in `dcba416` beside twelve money-formatter files. The content is correct — I read it in full.

The sharper point: **the final u4 never authored it.** Its trace contains zero Writes and zero Edits to that path; the abandoned first attempt wrote it at its own trace line 75, to the main-repo path. The final u4 inherited it through its base commit and built the mount and the tests around it. This is fine as executed — it read the file in full first and disclosed the provenance explicitly — but it means the 85 lines that constitute the entire behavioural surface of B40 were **written by an agent that was abandoned and verified by an agent that did not write them**, at a moment when §7c made observation impossible. `git log -- src/components/sign-out-button.tsx` returns *"B32: one money formatter, not two"*, so anyone bisecting B40 lands on the money commit.

**One more thing of the first attempt's did leak, which was missed:** `.fleet/questions-u4-29b583.jsonl`, committed in `eec250f`, carries the first attempt's question. That is why u4.md's "no questions queued" reads false against the repo (minor 4). The first attempt's `app-shell.tsx` edit did **not** survive.

**2. The two `app-shell.tsx` variants — the judgement was right.** The shipped file carries the *final* attempt's four-line B40 comment ("the sidebar rail is desktop-only, `hidden md:block`; this is not"), not the first attempt's three-line version. The import and mount point are identical; the difference is comment wording only. Taking the worktree's version was correct, and it is the version that shipped.

**A third thing, not self-reported: the branch was not frozen during review.** It advanced from `eec250f` to `44db6ac` while I was working, and `.fleet/learnings-29b583.md` and `spec/prod.md` are modified in the working tree right now. `44db6ac` touches only `.fleet/`, so every code measurement in this report stands. But a reviewer who had re-run a gate across that boundary would have compared two different trees without knowing it. Freeze the branch before dispatching QA.

## Verification performed

All re-measured by me, at `44db6ac`, not quoted from the dispatch brief:

- **Build (pnpm):** PASS — `✓ Compiled successfully in 761ms`, exit 0. `/questions` and `/questions/[id]` both in the route tree.
- **Type-check:** PASS — `tsc --noEmit`, exit 0, no output.
- **Lint:** PASS — `oxlint`, exit 0, no output.
- **Unit tests:** PASS — **97 files passed / 1 skipped; 1400 passed / 6 skipped (1406)**, exit 0.
- **`pnpm gate:m27`:** PASS — 1 file, **5 passed / 5**, exit 0.
- **`pnpm gate:m27:e2e`:** **NOT RUN** — §7c row 2 unreachable (storage state expired 2026-08-21T00:08:08Z, session revoked). Not re-attempted: the orchestrator already measured 10/10 failing, and B38's handling rule makes a failing run a live-cookie disclosure risk.
- **Playwright flows authored:** **0** — deliberately. Every flow in this run's scope sits behind the operator gate; a suite that can only ever observe the sign-in screen would be a check that passes on nothing. The mutation harness below is what I did instead.
- **Mutation testing:** 4 mutations, in a throwaway worktree at HEAD, restored in a `finally`, tree confirmed clean afterward. **Runner proven red-capable first** (control: exit 0, 1400 passed; M3: exit 1, 7 failed). Results: M1 unmount `SignOutButton` → **green, not caught**. M2 break `/questions` nav href → **green, not caught**. M3 collapse `unreadable`→`absent` → **red, caught, 7 failed**. M4 add ciphertext columns to the list query → **green, not caught**.
- **Route gating, observed:** `/questions` unauthenticated → operator gate, `data-verify-reason="sign-in"`, counts `unknown`, zero rows.
- **Security headers, observed on a live response:** all present, listed above.
- **`pnpm audit --audit-level=high`:** No known vulnerabilities found.
- **Gate-file integrity:** `tests/m27-gate.test.ts` → exactly one commit, `6210318`. **`e2e/m27-navigation.spec.ts` → two commits**, `6210318` and `9ffc857`. See infrastructure note 4 — this is not a finding against this run.
- **Accessibility:** NOT RUN — no axe/pa11y run. The one a11y observation is minor 5, made by reading.
- **Security checklist:** 13 of 15 items checked; 2 not checkable (sign-out end-to-end, deletion/retention paths) and named as such.

## Infrastructure failures (not the fleet's fault)

1. **§7c row 2 (operator `aal2`) unreachable** — saved storage state decodes correctly (`aal: aal2`, `amr: totp,password`) but its access token expired 2026-08-21T00:08:08Z and the session is revoked. `scripts/save-operator-session.mjs` cannot renew unattended (`headless: false`, blocks on stdin for a TOTP code). **Fix:** Erik re-runs the script once; a fresh state restores `gate:m27:e2e` and every authenticated screen becomes observable.
2. **§7c row 1 (agent token) unreachable** — no token in `.env.local`. Negative control confirms the surface is live and discriminating (`401 missing_authorization` bare, `401 malformed_authorization` with a bad token). **Fix:** mint a run token at Phase 0.
3. **My first mutation harness ran zero tests and reported all four mutations "caught."** `pnpm` aborted with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` against a symlinked `node_modules` and exited 1 — indistinguishable from a red suite. Caught by a negative control; re-run by invoking `vitest` directly. Recording it because it is precisely the false-green class this role exists to catch, and I nearly shipped it. **Fix:** invoke `node node_modules/vitest/vitest.mjs run` in a worktree, and require a parsed `Tests …` summary before believing any exit code.
4. **`e2e/m27-navigation.spec.ts` carries two commits, not the one the dispatch brief asserts as the integrity invariant.** The second, `9ffc857` (2026-08-20), predates this run, was made by Erik with explicit authorisation, and is gathering-only ("No assertion was added, removed, weakened or reordered"). **This run touched neither gate file** — `git log 8b311c4..HEAD -- <both>` is empty, which is the check that actually matters. **Fix:** update the invariant to per-file (`tests/m27-gate.test.ts` = 1 commit) or to the range form, so the next reviewer does not read a WARN as a breach.
5. **`timeout(1)` is not present on this machine** (macOS). Minor harness friction only.
6. **Four stale worktrees remain on disk** (`.claude/worktrees/agent-{a49de…,a694…,a875…,adbd…}`), three at `8b311c4` and u4's at `dcba416` holding uncommitted `CLAUDE.md`/`app-shell.tsx` edits and two untracked files. Not a defect; disk and a future-confusion risk. **Fix:** `git worktree remove` each once the branch is merged, leaving the branches.

**No infrastructure failure counted against any specialist, and none is reported as a code defect.**

## Tests added

**None.** I authored no test file this run, and that is a deliberate choice rather than an omission: every flow in scope sits behind an operator gate I cannot pass, so any Playwright spec I wrote would assert against the sign-in screen and pass while proving nothing. The four mutations above are the evidence I produced instead; they were run in a throwaway worktree and left no artifact in the branch. **The three tests findings 1–3 ask for are the deliverable I would have written had the fixes been mine to touch, and I have specified each precisely rather than adding them, because a reviewer who writes the tests stops being a reviewer.**

**Dependencies added by me:** none.

## Not reviewed

- **Every authenticated screen, behaviourally** — §7c rows 1 and 2 both unreachable. Verbatim consequence: *"every authenticated screen is built unobserved, `pnpm gate:m27:e2e` cannot run in-run, and `docs/user-guide.md` (§7b) cannot be written."* Specifically unobserved: `/questions` and `/questions/[id]` with real rows, the sign-out control in a real session, `/committed` and `/milestones/[id]` money rendering, and all eight FR-81 detail views with real decrypted prose.
- **Whether sign-out destroys a real GoTrue session, and whether the non-`HttpOnly` cookie is actually cleared** — B37's documented failure mode means GoTrue may report success while the browser cannot clear its own cookie. Untestable from here; u4 flagged it as `NOT VERIFIED` and was right to.
- **M1.1–M1.10 and M2.7** — already code complete before this run. Not this run's work.
- **Anything requiring a database** — no Postgres, no Supabase credentials. RLS policies and grants were not probed; no migration ran, so no new boundary was introduced.
- **`spec/prod.md` and `.fleet/learnings-29b583.md` as they now stand** — both modified in the working tree by a concurrent session after my review began.
