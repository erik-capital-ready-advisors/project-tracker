# Build report eb2490

**Status:** BLOCKED
**Branch:** `agent-build/2026-08-20-eb2490` (tip `7c487d5`, 16 commits from `6210318`, 94 files, +17,563/−229)
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec`
**Spec basis:** `spec-approved.md` + CRs [CR-001, CR-002, CR-003] — approved: **yes**
**Security posture:** declared (22 §7a rows over 21 entities; `security-gate.sh` PASS on the resolved spec)
**Duration:** ~1h55m, 8 of 20 dispatches

## Summary

M2.7 is built. The acceptance gate that was written red before dispatch is green: **`pnpm gate:m27` went 5 failed / 5 → 5 passed / 5**, with the baseline measured by me before any dispatch and reproduced independently by `qa-reviewer` afterwards. Neither gate file was edited — `6210318` is still the only commit that ever touched either, verified twice by different agents. Eight detail views exist, every reference across all eleven screens is navigable, a reference that resolves to nothing renders in FR-12's dangling treatment and is never a link, and FR-82's four relationships appear on one page even when all four are empty.

**The status is BLOCKED for one reason, and it is the reason that matters.** `pnpm gate:m27:e2e` — the ten crawl tests over populated screens — has never run. No agent holds an `aal2` session, so every loader, every decrypt edge and every resolution query in this milestone is exercised against in-memory fakes and **nothing here has met a real row**. That is the half of the acceptance criterion positioned to catch a `b0952e`-class defect, and it is a two-command job for you. I have not marked M2.7 Complete in `prod.md` and will not until it runs.

## Work-units completed

| ID | Wave | What | Merged |
|---|---|---|---|
| `u1` | A | `src/lib/entity-routes.ts`, `<EntityRef>`, `<EntityDetail>`; **deleted the gate exclusion from `vitest.config.ts`** so the gate is now a permanent member of `pnpm test` | `b9ffe5d` |
| `i1` | B | Reference resolution + eight loaders + FR-82, reusing `indexCoverage`/`latestResults`/`shippedIndex` rather than re-deriving them | `41d0221` |
| `f1` | C | `/work-items/[id]`, `/defects/[id]`, `/blockers/[id]` | `38ba1f3` |
| `f2` | C | `/requirements/[id]` (FR-82), `/questions/[id]` | `d41cb80` |
| `f3` | C | `/waits/[id]`, `/releases/[id]`, `/milestones/[id]` | `8f08a25` |
| `f4` | C | `<EntityRef>` on the six answer screens + FR-55's hyperlink | `c3b0044` |
| `f5` | C | Adoption on `/work-items`, `/registry`, `/waits`; FR-84 | `9ca3626` |
| `qa1` | D | Independent review, plus two credential-free gates that stay in the branch | `5a8cdde` |

All eight cleared `report-gate.sh`. **`f4`'s failed first** — missing `## Questions Queued` — and I refused to merge, sent it the verbatim failure, and it repaired and re-verified itself. `qa-reviewer` recorded the distinction I would have glossed: that was externally caught, not self-caught, and those are different capabilities.

## Deferred

- **`copy`** — out of scope. §5a is NOT APPROVED and your brief forbade new design or copy decisions.
- **`deploy`** — out of scope. M2.7 only; B22 is unchanged.
- **`research`** — not needed. CR-003's Q9/Q10/Q11 and the two gate files settled the unknowns in writing.
- **`docs` / end-user manual (§7b)** — **not written, and this is a carried gap, not a waiver.** Two independent reasons: QA returned BLOCKED rather than PASS, and your brief scoped this run to M2.7 only. §7b remains not waived, which is also why M1.10 still does not read Complete.

## Decisions & defaults

- **Ran both waves in one invocation instead of checkpointing after Wave A.** Stated in the manifest before dispatch, not justified afterwards. M2.7's gate cannot go green until all eight routes exist, so a phase-1 exit would have handed you a red gate over a half-built milestone — and your own `CLAUDE.md` lesson, committed that morning as `e90cdd4` so it would reach the worktrees, records that M2.7 had already been stopped once for a question whose options built identical code.
- **FR-80's engagement slug is not a ninth `ENTITY_KIND`** — served by the existing `/registry/[slug]`. I ruled it; `qa-reviewer`, asked to second-guess, agreed independently. The cost is stated: a plain link has no dangling treatment. **B35** asks for a one-line CR-004, because the two requirements genuinely disagree.
- **Reference resolution refuses when ambiguous.** Zero matches and two-or-more both dangle.
- **Prose carries four states, not two.** `unreadable` means ciphertext was stored and could not be read back — a lost spec paragraph. Rendering it blank would be this product's signature failure applied to decryption.
- **Three claims in my own dispatch brief were wrong**, caught by trajectory grading: `u1` ran no mutation testing (my summary error), `f1` read ancestry off a log rather than checking it, and `f4`'s gate failure was externally caught. Recorded in `prod.md` — my summary of a run is itself an artifact that can be wrong, and nothing else in the pipeline checks it.

## Verification

- **Build (pnpm):** PASS — 0 errors, **41 routes** (was 33)
- **QA review:** **BLOCKED** — **0 critical, 3 important, 9 minor** · `.fleet/qa-report-eb2490.md`
- **`pnpm gate:m27`:** **5 passed / 5** (baseline **5 failed / 5**, measured by me at 12:52 before dispatch)
- **`pnpm gate:m27:e2e`:** **NOT VERIFIED** — needs `M27_BASE_URL` + `M27_STORAGE_STATE`. I ran it myself: fails closed with exit 1, not a skip. Not faked, not stubbed, not pointed at an empty instance.
- **`pnpm test`:** 1346 passed / 6 skipped / 0 failed (was 1061 / 6)
- **`pnpm e2e`:** 255 passed / 7 skipped (was 207 / 7) · **typecheck** 0 · **lint** 0
- **Gate files unedited:** `git diff 6210318 HEAD -- tests/m27-gate.test.ts e2e/m27-navigation.spec.ts` is empty. Verified by me and again by `qa-reviewer`.
- **Security:** 14 controls from §7a, 3 baseline-sourced and named individually (`contract_milestone.notes`, `open_question.answer`, `defect.wont_fix_reason` — §7a is silent on all three, B13). 2 NOT VERIFIED — real decrypt-on-read, and anything behind `aal2`.
- **Tables touched:** 8 read, **0 added** — no migration, so nothing to reconcile. **11 decrypt edges, 11 `service_role` read surfaces.** `qa-reviewer` rebuilt the census from the diff and confirmed it complete: **B29 was not deepened quietly.** No `security_invoker` view (Q9 forbids it). `migration-grants.test.ts` untouched and passing.
- **Deletion path:** not required by this run (M1.10's).
- **Worktrees merged:** 7, zero conflicts. **Files changed:** 94.
- **Build log (`spec/prod.md`):** UPDATED — M2.7 row, six new blockers, seven Decisions entries, Current state, Next session pointer, Session log.
- **Fleet learnings:** 5 routed · `.fleet/learnings-eb2490.md` · 1 held back (over cap: a Playwright config that fails closed but names the wrong cause).

## Fleet learnings routed

1. **A raw NUL byte makes `grep`/`git grep` skip the whole file silently** — grep, source-hygiene · high
2. **A mutation removing scoping survives when every fixture holds one tenant** — mutation-testing, false-green · high
3. **An oxlint negative control must use an enabled rule or it is blind** — oxlint, negative-control · high
4. **Wire-vs-stored enum spelling + null-on-miss = a confident false statement** — enums, parsing · high
5. **A static segment beats a sibling dynamic `[id]`, and a clean build is not evidence of it** — nextjs, app-router · high

## Skipped as already built

M1.0–M1.9 (Complete), M1.10 (code complete, carried items untouched), M2.1–M2.6 (Not Started, out of scope).

## What to review first

1. **Run `pnpm gate:m27:e2e` with your own signed-in session.** Highest-value action available. Its error message will say `Project(s) "m27-gate" not found`, which looks like a deleted gate and is actually an unset variable — do not be misled. Until this runs, M2.7 has met no real row.
2. **The money formatters (B32).** `/committed` renders `111.00 USD`; `/milestones/[id]` renders `$111.00` for the same row — and **this run created that adjacency** by putting them one click apart. `qa-reviewer` graded it worse than the unit that found it.
3. **`<EntityDetail identifier>` is optional (B34).** Omitting it renders a positive falsehood — "This entity carries no reference of its own" — with a green type-check and nothing in either gate asserting on it. Four views already print their title twice to dodge it.

One thing worth your attention beyond the defects: the run's most valuable artifacts were the failures that got caught. `i1` had a mutation **survive**, which exposed a scoping test a single-engagement fixture could never fail. `f3`'s first lint control was **blind** and it said so instead of banking the green. `f5` found **8 of 28 filter values silently rejected**, which a passing e2e gate had been perfectly compatible with. And `qa-reviewer` reported a blind check of its own, noting it caught it by luck of ordering rather than discipline — which is a more useful thing to have written down than a clean review would have been.

---

*Persisted verbatim by the dispatching session (F11: `project-lead` cannot write report-shaped
filenames). The only alteration is un-escaping `&lt;`/`&gt;`/`&amp;`, which the notification
transport introduced — `<EntityRef>` was written as such by the orchestrator.*
