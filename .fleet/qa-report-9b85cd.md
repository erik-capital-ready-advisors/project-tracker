# QA report 9b85cd

**Status:** ISSUES
**Branch:** `agent-build/2026-08-24-9b85cd` (HEAD `66dbe4867eeb923766a04dfda3a6d142c29c24fe`)
**Reviewed against:** **resolved spec** — `.fleet/resolved-spec-9b85cd.md` (CR-007 §3 folded in) + CRs [CR-001, CR-002, CR-003, CR-004, CR-005, CR-007]. CR-006 excluded per the manifest.
**Critical:** 0 · **Important:** 1 · **Minor:** 5
**Additionally, pre-existing and NOT introduced by this run:** 1 important · 1 minor (own section, deliberately outside the counts above)

## Verdict

Nothing here blocks a merge. FR-104 to FR-109 are all implemented and I **observed** the rendered
screen against the live database rather than reasoning about it: every figure on `/stacks` matches
`onpvolboecjpdkvurjaf` exactly, FR-108's blindness reporting is genuinely load-bearing rather than a
footer, and limb two renders as *never evaluated* rather than as false — a fact I confirmed
structurally by making `tsc` reject `blockingMilestone.met`, not by reading the comment that says so.

The one `important` is not a code defect: **u1 shipped, reported, and propagated into the manifest a
claim that is false at the merge base** — "six pages read `OPERATOR_ROUTES` by positional index
`[0]`–`[5]`". All six use `.find()` and have since before this run. It is benign in effect
(appending is correct either way) and it is exactly the d4000f shape: an unevidenced claim on its way
into `prod.md`. Fix the comment before the writeback, and B44 is probably closeable.

On item 3 of your brief — **you were right to let `undetermined` stand**, and I'd argue it is not a
deviation at all. Details in *Spec coverage*.

## Spec coverage

| Requirement | Implemented | Evidence |
|---|---|---|
| **FR-104** register lists every observed stack with hours, engagements, first/last seen, agent covering | yes | 8 columns observed in order (`stack, trigger, agent covering, hours, sessions, engagements, first seen, last seen`), `e2e/qa1-stacks-register.spec.ts:105` PASS. Screenshot `.fleet/manual-traces/qa1-9b85cd-stacks-observed.png` |
| **FR-105** hours sum `work_session.duration_minutes` per stack | yes | Rendered `data-verify-minutes="0"`, `0h`; DB `sum(duration_minutes)=0` for the stacked session. `list.ts:tallySessions`. Threshold compared in integer minutes, stated in hours — `7h 59m` cannot round to `8h` (`display.test.ts`) |
| **FR-106** rule evaluated **and stated on screen**, both limbs | yes (limb one; limb two per Q27) | `data-verify-min-engagements="2"`, `data-verify-min-hours="8"` read off the live DOM; per-row sentence `1 of 2 engagements · 0h of 8h — clause 1 not met, clause 2 never evaluated`. No literal `2` or `8` in any component — both come from `TRIGGER_THRESHOLDS`. `spec:232` PASS |
| **FR-107** earned + no `agent_covering` = the one actionable state, visually distinct | yes | `isActionable()` is exactly FR-107's conjunction. Three channels (amber row rule + filled chip + the words `earned · no agent`). Live actionable set is 0, which is correct; the treatment is driven through the **real** `loadStackRegister` over the PostgREST fake in `tests/stacks-register.test.tsx`, not hand-written flags |
| **FR-108** register reports its own blindness; no-data says so rather than rendering an empty table | **yes, and genuinely load-bearing** | See dedicated section below |
| **FR-109** `agent_covering` operator-set, never inferred | yes | No inference path exists; nothing validates against an agent list. Write audited. Trigger `aria-haspopup="dialog"`, accessible name names the stack, focus enters the dialog and returns to the trigger on Escape — all observed, `spec:294` |
| **Q25** count every `work_session` row; say on screen they are all Mode 2 | yes | Read carries no filter (`(query) => query`, and a test plants `source: 'some-future-writer'` and asserts it is still counted). Sentence rendered at `data-verify-unit="mode-2-capture-claim"`, above the table, not a tooltip (`title` asserted null) |
| **Q26** route `/stacks`, title "Stacks", `coverage` not reused | yes | Rendered `textContent` and `innerHTML` both contain no `coverage`, **with controls** (`covering`, `agent covering` both found, so the sweep is not blind). `spec:278` PASS. See minor 2 for a defect in *i1's own* grep |
| **Q27** ship limb one, record limb two visibly UNMET | yes | See dedicated section below |

### FR-108 — is the blindness reporting real, or decoration?

**Real, and it is the first thing on the screen.** Measured, not taken from the report:

- The panel **precedes** the table in document order (`compareDocumentPosition`, asserted and PASS).
  Its headline is the largest sentence on the page and leads with the blind number:
  > **1 of 2** sessions in the ledger name no stack at all — 50% of everything captured. Those
  > sessions are counted here and are still in the total; they contribute to no row in the table
  > below, and no figure on this screen quietly drops them.
- **Both identities hold on the rendered DOM**, asserted off `data-verify-value` rather than off the
  source: `sessionsTotal (2) = sessionsWithStack (1) + sessionsWithoutStack (1)`, and
  `sessionsWithStack (1) = Σ row.sessions (1) + sessionsOnUnknownStack (0)`. The row counts also
  reconcile against `stacksTotal`, `stacksCovered`, `stacksEarned` and `stacksActionable`.
- **Every rendered figure matches the database exactly.** Queried live at review time:
  `sessions_total 2 / no_stack 1 / with_stack 1 / no_duration 0 / minutes_sum 0 / stacks_total 1 /
  stacks_covered 0 / distinct_engagements 1` — nine rendered figures, nine matches.
- **The `no-sessions` and `no-stacks` states are distinguishable and tested**, both through the real
  read layer rather than by typing a state label: `stacks.test.ts:276` asserts the read layer itself
  returns `"no-sessions"` for an empty fixture and `:295` `"no-stacks"` for two stack-less sessions;
  `tests/stacks-register.test.tsx:314-354` asserts the `no-stacks` branch renders its **own** notice
  and that `empty-state` is **absent** there — which is what stops the two claims collapsing into
  one. Mutating `no-stacks` to fall through to `no-sessions` killed 2 tests (observed in u1's trace).
- The `nothing-earned` note retires itself at `stacksEarned > 0`, and its wording is narrower than
  the requirement's: *"No stack has earned a specialist **on clause 1, the only clause this register
  evaluates**."*

The one thing I'd sharpen is minor 5 below.

### Q27 — is limb two recorded as unmet, or evaluated to false?

**Recorded as never evaluated, and it is structural rather than documentary.**

- `UnevaluatedClause` is `{ readonly evaluated: false; readonly reason: string }`. **I verified the
  absence of `met` by measurement, not by reading the comment**: I wrote a probe reading
  `t.blockingMilestone.met`, ran `tsc --noEmit`, and got
  `error TS2339: Property 'met' does not exist on type 'UnevaluatedClause'` (exit 1), then removed
  the probe. A caller cannot read limb two as false because there is nothing to read.
- `rule.test.ts:72` asserts `"met" in trigger.blockingMilestone === false` with a CONTROL at `:82`
  asserting the same check returns `true` for limb one.
- On screen, clause 2 renders with `data-verify-evaluated="false"` beside a `not-verified` badge, and
  the reason is `rule.ts`'s own string verbatim: *"**Not evaluated.** This clause needs a link from a
  stack to the blocker that stalls a dated contract milestone, and the schema carries no such link."*
  My test asserts the text contains "not evaluated" **and** does not match `/clause 2 (was )?(not
  met|failed)/`. PASS.
- It renders in **all three** register states, including `no-sessions` — correct, since the clause is
  unevaluated whatever the data.

### Item 3 — the `undetermined` deviation. You were right, and I'd go further

`TriggerOutcome = 'earned' | 'undetermined'` is **not a deviation from FR-107**. FR-107's normative
sentence is *"A stack that has earned a specialist and has no `agent_covering` is the one actionable
state on the screen and is visually distinct from every other"* — it names the actionable state and
imposes no vocabulary on the others. "unearned" appears only in the trailing gloss, *"Earned-and-
covered is settled; unearned is information."*

And the gloss cannot be honoured as written once Q27 is ruled. FR-106 is a **disjunction**: earned if
limb one **or** limb two. `¬(A ∨ B)` does not follow from `¬A` when `B` was never evaluated. A screen
saying "unearned" would assert the whole disjunction false on evidence about one disjunct — a wrong
`done` about a hiring-shaped decision. `undetermined` is the only truthful label available, and the
`actionable` flag that FR-107 actually keys on is unchanged.

The one thing that costs: FR-107's gloss now has no referent, because there is no `unearned` class at
all. That belongs in `prod.md`'s Decisions log as a recorded amendment to FR-107's explanatory
sentence, not as a defect. i1 queued it (question 1) rather than deciding it silently.

## Security posture review

**Reviewed against:** spec §7a in the resolved spec (21 entities classified; `security-gate.sh` PASS
on this run's resolved spec per the manifest). Baseline (`~/.claude/agents/security-baseline.md`)
applies only where §7a is silent; every control below came from §7a unless marked.

**Reconciliation — built from the diff, not from the specialist's table:**

- **Tables in the migration diff:** `git diff 0a08a06..HEAD --name-only -- supabase/` → **0 files.**
  Zero migrations, exactly as CR-007 §2 predicted and both units claimed.
- Tables in the migration diff but **not** in §7a: **none** — the migration diff is empty, so there is
  nothing that could have shipped unclassified. **0 critical from this check.**
- Tables in §7a that this run touches but that are absent from i1's *Security posture applied* table:
  **`audit_log`** — see minor 4. The other 18 §7a entities are untouched by this run and are not
  expected in that table.

| Table | Class per §7a | Treatment found on branch | Verdict |
|---|---|---|---|
| `stack` | internal | Read whole (`id, name, agent_covering, first_seen_at, last_seen_at`) and rendered freely; `agent_covering` written only via `requireOperator()`. No ciphertext column exists on this table. | MATCHES |
| `work_session` | sensitive, **pgcrypto on `summary`** | Projection is `id, engagement_id, stack_id, duration_minutes`. `summary` is named in **no** non-test file of the new surface except the denylist and doc prose (independent grep, mine). **No `.rpc(` call exists anywhere in `src/lib/server/stacks/` or `src/lib/stacks-load.ts` or `src/app/stacks/`** — so no `decrypt_field` is issuable, not merely not issued. | MATCHES |
| `audit_log` | internal, "no record contents" | **Observed on the live table**, not asserted: both `stack.agent_covering.set` rows carry `actor`, `actor_type=operator`, `action`, `target_table=stack`, `target_id`, `outcome=allowed` — and **no column holds the value Erik typed**. | MATCHES |
| `contract_milestone` | sensitive | Not read. FR-106 clause two *mentions* it in prose only; nothing queries it. | N/A — untouched |
| `engagement` | personal | Not read by this layer. `engagement_id` is counted as an opaque identifier, never joined for a name. | N/A — untouched |

**i1's four-way `summary` guarantee, independently checked rather than accepted.** Three of the four
are real mechanical guards with controls that plant a violation and prove the check bites
(`columns.test.ts` typed check + recursive source scan, `stacks.test.ts` projection check on what the
fake actually recorded, `fake.rpcCalls` asserted empty, and `JSON.stringify(register)` asserted free
of `"summary"` and `"enc:"` **against fixture rows that do carry a summary**). My own fourth: the
`.rpc(` grep above, which is stronger than "not called" — the call site does not exist.

| Control | Observed | Verdict |
|---|---|---|
| Transit — no `http://` in a production path, no cert-validation disabling | Scanned the full branch diff: `rejectUnauthorized` 0, `NODE_TLS_REJECT_UNAUTHORIZED` 0, `--insecure` 0, `sslmode` 0, `http://` **2 — both `http://localhost:3000` in report prose**, none in code or config. Control term `export` scored 67, so the scan was not blind. | PASS |
| Cookies (Secure, HttpOnly, SameSite) | No `Set-Cookie` issued on the routes I exercised; this run touches **no auth surface** (`requireOperator()` reused verbatim, no middleware or `next.config.ts` change). | NOT CHECKED — no cookie was issued or altered by this run |
| Security headers, **served** not just configured | Observed in a real response from `/stacks`: `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload`, matching what the repo sets rather than an edge's), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` (17 features denied), and a CSP with `'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` — **no `unsafe-inline`, no `unsafe-eval`**. | PASS — served, on the new route |
| Rate limits on unauth + paid routes | **0 new HTTP routes** on this branch (`git diff --name-only | grep app/api` → 0). The two new surfaces are an RSC read and a Server Action, both behind `requireOperator()`. Neither costs money per call. Existing `enforceRateLimit` in `src/lib/api/guard.ts` untouched. | N/A — no new surface |
| New-account role | No auth change; no `on auth.users` trigger touched; zero migrations. | N/A — untouched |
| Deletion path exercised | No new retention obligation. `stack` is `indefinite` under §7a; `app.purge_engagement()` untouched. | N/A — no new obligation |
| `pnpm audit --audit-level=high` | **"No known vulnerabilities found."** | PASS |
| Secrets in the diff | 0 hits on JWT shape, `sb_secret`, `SUPABASE_SERVICE`, `NEXT_PUBLIC_*KEY`, `sk-…`. The 9 `service_role` hits are all prose naming B29. | PASS |
| Dependencies added | **None.** `package.json`, `pnpm-lock.yaml`, `components.json`, `next.config.ts` all untouched by the diff. | PASS |
| Input validation at the boundary | `normaliseAgentCovering`: trim, `'' → null`, ≤96 chars, no `\r\n`, each with a test and each refusal returned as a value (so it survives Next's redaction) rather than thrown. No raw database message reaches the client — the `internal_error` string deliberately carries none. | PASS |
| Zero-row write detected | `.select(…).maybeSingle()` + explicit `row === null` refusal, with a **CONTROL** proving the fake really does report success on a zero-row update. | PASS |

**Carried blockers — what this run did to each.** **B29:** inherited and named loudly; this unit adds
two `service_role` reads and one `service_role` write, so it *widens* the B29 surface by one screen
while adding no new mechanism, and both module headers say so. **B24:** untouched. **B60:** untouched
— and note the new path writes `outcome='allowed'` correctly, which I confirmed on both live rows, so
it does not add to B60.

## Issues

### Critical

None.

### Important

1. **A false claim about `OPERATOR_ROUTES` was shipped in source, in the report, and into the
   manifest** — `src/lib/nav.ts:150`, `src/app/stacks/page.tsx:15`
   - **What:** the new nav comment and `page.tsx`'s header both state *"SIX pages still read this
     array by POSITIONAL INDEX (`OPERATOR_ROUTES[0]` through `[5]`)"*. At the merge base `0a08a06`,
     **all six already read `.find((item) => item.href === …)`** — I checked each with
     `git show 0a08a06:<file>`. `grep -rn "OPERATOR_ROUTES\[" src/` returns **only comments**. The
     only positional readers left in the repo are two *test* files
     (`tests/nav-routes.test.ts` pins `[0]`–`[4]`, `tests/runs-list.test.tsx` pins `[5]`).
   - **Why it matters:** three ways. It misstates the state of open blocker **B44** — which on this
     evidence is already closed in source and is being kept open by a stale comment. It is the
     d4000f shape exactly: an unevidenced claim reaching `prod.md` via a manifest that repeated it.
     And it makes the "append at the end only" constraint look binding when it is not, which will
     shape the next nav edit for no reason.
   - **Evidence:** `git show 0a08a06:src/app/{registry,work-items,waits,questions}/page.tsx` and both
     settings pages, all `.find()`. u1's trace (`agent-a1d1aedb54311bd1d.jsonl`) contains **no**
     search for `OPERATOR_ROUTES[` — the claim traces to reading `src/lib/nav.ts` (line 28) and
     `src/app/runs/page.tsx` (line 25), both of which carry the same stale sentence, plus two test
     files that genuinely do index positionally. It was inherited, not measured.
   - **Fix:** correct the sentence in `nav.ts` and `stacks/page.tsx` to *"two test files pin
     `OPERATOR_ROUTES` positionally; no page does"*, and re-examine B44 for closure. **Do not carry
     the six-pages sentence into `prod.md`.**
   - **Not a functional defect:** appending at `[7]` is correct regardless, indices `[0]`–`[5]` are
     unshifted (verified), and no screen renders under another's title.

### Minor

1. **`set-covering.ts`'s header describes a mechanism the code does not use** —
   `src/lib/server/stacks/set-covering.ts:28-35`
   - The header is titled ``.select().single()` is the control, not a convenience`` and says a
     zero-row update *"turns into `PGRST116`"*. The code calls `.maybeSingle()`, which returns
     `data: null` and **never** raises `PGRST116`; the refusal comes from the explicit
     `if (row === null)` below. The behaviour is correct — arguably better than the comment — but in
     a repo whose standing lesson is that comments here describe what the code does **not** do, a
     header naming the wrong error code is a trap for the next reader.
   - Fix: retitle to `.maybeSingle()` and replace the `PGRST116` sentence with "returns `data: null`,
     which the row check below turns into a refusal".

2. **i1's Q26 grep is blind to its own `set-covering.ts`, and its report claim is wrong because of
   it** — i1 report, *Files created / modified*
   - i1 ran (trace line 262)
     `grep -rni "coverage" src/lib/server/stacks/ src/lib/stacks-load.ts | grep -v "agent_covering\|…\|set-covering\|…"`.
     The exclusion pattern matches the **file path**, so every line of `set-covering.ts` is filtered
     out whatever it contains. The grep returned 2 hits and i1 reported *"it survives in exactly one
     place — two lines of prose in `types.ts`"*. There is a **third**: `set-covering.ts:54`,
     *"clearing coverage is how the operator says…"*.
   - **Not a Q26 violation** — Q26 forbids `coverage` as a filename, a screen title or visible copy,
     and this is a doc comment. But it is the vault's own blind-scan lesson landing again: an
     exclusion list that filters on the path cannot see the file it names.
   - Fix: anchor such exclusions to the text after the last `:`, or use `grep -h`. Correct the
     sentence in the report if it is quoted onward.

3. **Two WCAG 2 AA contrast failures on `/stacks`, measured** —
   `src/app/stacks/_components/stack-table.tsx:105` and `:201`
   - `undetermined` chip (`text-muted-foreground/80`): **4.44:1** in light, needs 4.5:1. Passes in
     dark. This is the trigger word on every non-earned row.
   - `nobody has said` (`text-muted-foreground/70 italic`): **3.55:1** light, **4.22:1** dark — fails
     in **both** themes. This is the value in the *agent covering* column for every uncovered stack.
   - Evidence: `@axe-core/playwright`, `serious`, ids and ratios above; `e2e/qa1-stacks-register.spec.ts`
     tests `:294` and `:370`, both RED on purpose.
   - **Inherited, not invented** — both class combinations are the product's existing neutral ladder
     (`border-border/60 text-muted-foreground/80 border-dashed` is verbatim `answer-chips.tsx`'s
     `faint` rung; `text-muted-foreground/70 italic` is the repo-wide *not recorded* treatment used on
     19 other components). u1 flagged the whole dimension `NOT VERIFIED — no accessibility audit tool
     was run` rather than claiming it. See the pre-existing section for the systemic picture.
   - Fix on this screen alone: drop the `/70` and `/80` opacity modifiers, or raise
     `--muted-foreground`. The product-wide fix is the better one.

4. **`audit_log` is written by this run but absent from i1's *Security posture applied* table** —
   `.fleet/specialist-reports/9b85cd/i1.md`
   - The table lists `stack` and `work_session`. `setAgentCovering()` inserts into `audit_log`, a
     §7a-classified table, and the report discusses that write correctly at length elsewhere
     (FR-59, "no record contents", best-guess decision 5) — it simply does not appear as a row where
     a reconciler looks for it. Substantively covered, formally missing.
   - Fix: one row in the table.

5. **The `recorded no duration` tile counts only *stacked* sessions, and does not say so** —
   `src/app/stacks/_components/register-blindness.tsx:216`, `src/lib/server/stacks/list.ts:tallySessions`
   - `tallySessions` increments `sessionsWithoutStack` and then `continue`s, so a session that has
     **neither** a stack nor a duration is invisible to `sessionsWithoutDuration`. The type's own doc
     comment states the restriction correctly; the tile's label ("recorded no duration") and detail
     ("Hours understate by exactly these sessions") do not. Zero on this ledger, so no test can catch
     it and nothing is currently wrong on screen.
   - Why it is worth a line on *this* screen: FR-108's entire premise is that no figure quietly drops
     rows from its denominator, and this figure's denominator is 1, not 2.
   - Fix: label it "stacked sessions with no duration", or count all sessions and split the tile.

## Pre-existing — NOT introduced by this run, and outside the counts above

These are findings about the product that this review surfaced while measuring `/stacks`. They are
listed here so they cannot be read as defects of `i1` or `u1`, and so they do not silently set this
run's status.

- **[important] The product's accessibility gate is structurally incapable of measuring the
  product.** `e2e/qa1-accessibility.spec.ts` has a hardcoded `ROUTES` list that has not gained a route
  since run `b0952e` — it omits `/runs`, `/questions`, `/stacks`, `/milestones`, `/defects`,
  `/requirements` — and its own header states it measures each route's **signed-out refusal state**.
  So it runs axe against a one-notice page and reports green. Measured today with a real operator
  session, the same engine reports `serious` contrast violations on every authenticated screen I
  checked: **`/questions` 96 nodes, `/broken` 27, `/work-items` 22, `/registry` 12, `/runs` 4,
  `/stacks` 2.** `/stacks` is the **least affected screen in the product**. The root cause is the
  opacity modifiers on `--muted-foreground` in the shared neutral ladder, not any one screen.
  Suggested: open a blocker on the palette, and drive the ROUTES list off `ALL_ROUTES` with a
  storage-state so the gate cannot go blind again.
- **[minor] FR-105's "Erik's own hours" is enforced by a stamp, not by an identity.** i1 reported this
  precisely and I confirmed it: `src/lib/server/sessions/record.ts:315-317` hard-codes
  `execution_mode: "hand"` and `executor: "erik"` from literals, and the only caller is
  `POST /api/ingest/session`, authenticated by an agent token carrying `ingest:write`. Any holder of
  that token can create a row recorded as Erik's hand work. Nothing does today (every existing row's
  `source` is `session-hook`; **0 user-defined triggers** on `work_session`; INSERT/UPDATE granted to
  `postgres` and `service_role` only). Q25's ruling is the correct mitigation and this build
  implements it literally, which is why the sentence on screen will be visibly wrong on the day it
  stops being true.

## Trajectory grading

| Unit | Specialist | Schema-before-query | Claims evidenced | Verify-after-edit | Unknowns researched | Boundaries escalated | Verdict |
|---|---|---|---|---|---|---|---|
| i1 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| u1 | ui-designer | SOUND | **UNSOUND** | SOUND | SOUND | SOUND | **UNSOUND** |

**i1 — SOUND on all five.** Schema before query: it read
`supabase/migrations/20260819144331_schema_21_entities.sql` for both `work_session` and `stack` at
trace line 59 and grepped every `work_session` write site at 56/70/108, and the first Write of query
code is at line 159 — 100 turns later. Claims: **every quantitative claim in the report has a tool
call behind it and the numbers match.** The five-mutation table (3/1/2/4/3 kills) is the verbatim
output at line 212; `1910 passed / 6 skipped` is line 216; the per-file `{columns 9, rule 15, stacks
33}` is a `--reporter=json` run at line 261, and I independently re-measured 9/15/33. The live-database
figures came from two `execute_sql` calls (116, 245), not from the brief. The `'use server'`
reachability probe genuinely existed and was genuinely deleted (230→239, `git status` clean at 237).
Unknowns: it read three vault Knowledge notes individually (34, 37, 40) after a classifier denial
blocked its bulk read at 33 — **the prior-learnings search actually ran**, which is the direct
opposite of B45. Boundaries: three questions queued, none decided silently; the one security-adjacent
call (which writes audit) was queued *and* implemented on FR-59's reading, and it checked the live
grants rather than assuming them.

**u1 — UNSOUND on one check of five, and it is the `OPERATOR_ROUTES` claim above.** Everything else
u1 asserted is backed: the 11-mutation table is the verbatim output at trace line 235 (11 KILLED,
tree state printed, `post-restore: exit 0 :: 92 passed`); the "three consecutive full runs at
1987/6" is the `for i in 1 2 3` loop at 261; `32 served page routes` is read off `next build`'s own
table at 267; per-file `19 / 42 / 14` is at 270 and I re-measured all three; the flaky test was found
under the full suite at 253, reproduced 3× in isolation at 256, fixed at 259 and re-verified 3× at
261. It even **corrected itself downward** — the report first said `15 hits` for the `coverage` grep
and was edited to `14` at line 277 after `wc -l` returned 14 at 276, which I independently confirmed
is exactly 14 over the same file set. Schema-before-query reads as contract-before-render here: it
read `types.ts`, `stacks-load.ts`, `actions.ts` (line 20) and `rule.ts`/`list.ts` (48, 51) before
writing a single component at 122. Verify-after-edit: last product edit at 241, then build/lint/
typecheck/test at 243–270. Unknowns: vault notes at 68–78 plus three `Skill` invocations and a read
of the vercel `rsc-boundaries` reference at 93.

**The one unsound claim, stated precisely:** u1's report says *"Six pages still index this array
positionally `[0]`–`[5]`"* and it wrote the same sentence into `src/lib/nav.ts` and
`src/app/stacks/page.tsx`. Its trace contains no tool call that measured it; it appears only inside
the output of `cat src/lib/nav.ts` (line 28) and `cat src/app/runs/page.tsx` (line 25), which carry
the same stale sentence, and inside two test files that genuinely do index positionally. It is false
at the merge base. **Grading it UNSOUND is proportionate to the check, not to the unit** — this is one
claim out of roughly twenty, and every other one was measured.

**Is any other claim in either report unsupported by its trace?** One correction rather than a
fabrication: i1's *"[`coverage`] survives in exactly one place — two lines of prose in `types.ts`"*
**is** backed by a tool call (line 262, which returned exactly those two lines), but the call was a
blind instrument — see minor 2. That is a check-2 pass on the letter and a failure on the substance,
and I have filed it as a finding rather than as a trajectory verdict.

Traces: `/private/tmp/claude-501/-Users-erikmeltzer-Projects-project-tracker/bec47970-e7c1-45d1-a318-31c92a439b20/tasks/a1d7fd8fc997f1385.output` (i1, 278 lines) and
`…/a1d1aedb54311bd1d.output` (u1, 294 lines). Both identified by their own STEP-ZERO briefs naming
unit id and run `9b85cd`, so neither is a guessed match.

## Verification performed

- **Build (pnpm):** PASS — corroborated. `pnpm build` exit 0 (u1 trace 267 and the orchestrator's own
  run); the branch's route table carries `ƒ /stacks` and **32** served page routes, up from 31.
- **Type-check:** PASS — `pnpm typecheck` exit 0, run by me at review time. Also used as an
  instrument: a planted `blockingMilestone.met` produced `TS2339` and exit 1, then was removed.
- **Lint:** PASS — `pnpm lint` (oxlint) exit 0, no output, run by me.
- **Unit tests:** PASS — `pnpm test` → **1987 passed / 6 skipped / 1993, 131 files passed / 1
  skipped**, run by me. Matches your figure and u1's exactly. Baseline 1853 → **+134** (i1 57, u1 77),
  and I re-measured every per-file count: `rule 15`, `stacks 33`, `columns 9`, `display 19`,
  `stacks-register 42`, `agent-covering-dialog 14`.
- **Playwright (authored by me):** **9 flows authored, 7 passed, 2 failed.** Both failures are the
  axe contrast assertion and nothing else — the FR-109 test's focus-management assertions all pass
  before it. Suite: `e2e/qa1-stacks-register.spec.ts`, config `playwright.qa1-stacks.config.ts`, run
  against `http://localhost:3000` with the `aal2` operator storage state.
- **Fail-closed check on my own harness, run in the state the next person will find it in:** with the
  env vars unset → `1 failed`, **exit 1** (the guard test names which variable is missing and warns
  that its signature is identical to a revoked session). With no matching tests → **exit 1**. It does
  not skip and it does not measure a signed-out page.
- **Accessibility:** `@axe-core/playwright`, wcag2a/2aa/21a/21aa. `/stacks` light: **1 violation, 2
  nodes, serious** (`color-contrast`). `/stacks` dark: **1 node**. FR-109 dialog open: 1 node,
  inherited from the table behind it. **Zero** violations of any other rule — no missing name, no
  role error, no landmark or heading-order problem. Dialog focus management verified: focus enters
  the dialog, the dialog has an accessible name, Escape closes it, focus returns to the trigger.
- **Live database corroboration:** 2 read-only `execute_sql` queries against `onpvolboecjpdkvurjaf`.
  All nine rendered figures matched. Both FR-109 audit rows inspected column-by-column.
- **Security checklist:** 12/13 items checked. The one not checkable: **cookie flags** — this run
  issues and alters no cookie, so there was nothing to observe.
- **B38 handling:** my two failing tests wrote error-context files. Scanned for `sb-*-auth-token`,
  `access_token`, `refresh_token`, `Bearer ` → **0 hits each**, against a control term scoring 65 on
  the same files, so the scan was not blind. **No credential was exposed and no revocation is needed.**
  My config sets `trace: off` and `screenshot: off` so Playwright captures no request headers.
- **No write to the live ledger.** FR-109's dialog was opened and dismissed with Escape; Save was
  never clicked. Every control was matched by `data-verify-unit` / `[aria-haspopup]`, never by label
  (run `29b583`). The `audit_log` count for `stack.agent_covering.set` is **2** — your two Phase-0
  rows, unchanged.

## Infrastructure failures (not the fleet's fault)

- **None observed on this review.** `node_modules` present, dev server already up on :3000, Playwright
  browsers installed, the Supabase project reachable, registry not consulted (no dependency added).
- Two **recovered** environment events in the traces, neither a code defect and neither costing
  anything: the Claude Code auto-mode classifier denied a bulk `for f in …` read of the Obsidian vault
  in **both** units (i1 trace 33, u1 trace 66), and both recovered by reading the notes individually.
  Both units also hit the worktree-isolation guard on a compound Bash command (i1 76/82/229, u1
  75/214) and re-issued it in a permitted form. One-line fix if it keeps costing turns: brief
  specialists to read vault notes with individual `Read` calls rather than a shell loop.
- One artefact-hygiene note, already handled: my harness originally wrote to an un-ignored
  `.playwright-qa1/`. I repointed it at `playwright-report/qa1-9b85cd/` and screenshots at
  `.fleet/manual-traces/`, both already gitignored. `git status --porcelain` now shows only my two
  intended new files.

## Tests added

- `e2e/qa1-stacks-register.spec.ts` — 9 flows: harness guard (fail-closed), FR-104 columns and row
  contract, FR-108 denominator identities off the rendered DOM plus panel-above-table ordering, Q25
  sentence placement, FR-106/Q27 thresholds and the never-evaluated wording, FR-107's absence of
  "unearned" (with a control), Q26's `coverage` sweep in text and markup (with two controls), FR-109
  reachability + accessible name + focus in and out (no write), and an axe pass on the page.
- `playwright.qa1-stacks.config.ts` — its config. Deliberately separate from `playwright.config.ts`
  so it changes neither `pnpm e2e` nor the M2.7 gate. No `webServer`, no default base URL, exits
  non-zero when it cannot run.
- **Two assertions are RED on purpose** (the two axe checks), documented in the file header with the
  measured ratios and the product-wide comparison, so nobody reads them as a broken test. Relaxing
  them would make the gate green on a known-open defect.
- **Dev dependencies added: none.** `@playwright/test` and `@axe-core/playwright` were already in
  `devDependencies`.

## Not reviewed

- **`doc1` (docs-writer, manual pass) — deferred to after this report.** `docs/user-guide.md` is
  untouched, so `manual-gate.sh` will read 31/32 until it lands. Expected and budgeted per CR-007 §4.
  **B57 applies: the guide's rows must be re-opened, not carried forward.**
- **Milestones already Complete** — M1.0–M1.10, M2.7, M2.8, M2.9. Not this run's work, not reviewed.
- **CR-006 / M2.6 writeback (FR-97–FR-103)** — §3 unapproved, excluded by the manifest. A scope
  boundary, not a gap.
- **M2.1, M2.3, M2.4, M2.5** — zero FRs between them, not dispatchable (run `9d4658`).
- **`copy`, `deploy`, `docs` (handoff), `research`** — deferred by manifest decision, each with a
  stated reason. Deferred is not a defect.
- **Deployment.** Nothing on this branch is on `master` and nothing is live. No preview URL was
  supplied and none was built, so **local is the only environment measured**.
- **Whether the amber FR-107 treatment paints.** u1 named this as its first live-observation ask. The
  live actionable set is **0**, so no row on this ledger renders the amber rule and I did not
  manufacture one by writing to the database. The chip's three distinct treatments are asserted at
  the class-string level and the row rule is mutation-tested; whether Tailwind emits
  `border-l-state-carried` is **NOT VERIFIED** and needs a stack pushed over the threshold.
- **`data-verify-*` carrying an agent name.** A unit test covers it with a fixture value
  (`tests/stacks-register.test.tsx:797`). Live, `agent_covering` is NULL on the only stack, so the
  path is **not exercised in the browser**.
- **Screen-reader behaviour.** axe finds machine-checkable violations and is silent on whether the
  result makes sense. No screen-reader pass was run.
