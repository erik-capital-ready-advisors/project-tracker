# Build report 29b583

**Status:** BLOCKED
**Branch:** `agent-build/2026-08-23-29b583` (tip `b3f3056`, cut from `8b311c4`, never near `master`)
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec` → `.fleet/resolved-spec-29b583.md`
**Spec basis:** `spec-approved.md` + CRs [CR-001, CR-002, CR-003, CR-004] — approved: yes
**Security posture:** declared (22 rows over 21 entities classified) — `security-gate.sh` PASS on the resolved spec
**Duration:** ~75 min · **Dispatches:** 6 of 20

## Summary

Four blockers are fixed on the branch: **B33** (the prose renderer hoisted from five copies with three incompatible verification contracts into one component with one contract, adopted across eight call sites), **B36** (`/questions/[id]` was unreachable — there is now a `/questions` list route and a nav entry), **B32** (two money formatters that M2.7 had put one click apart are now one; `money-display.ts` is deleted), and **B40** (a sign-out control, mounted in the app-shell header so it reaches every breakpoint). Measured at the tip and reproduced independently by `qa-reviewer`: typecheck **0**, lint **0**, `pnpm test` **1400 passed / 6 skipped** (from a baseline of 1359 that I measured at `8b311c4` before dispatching), `pnpm gate:m27` **5/5**, build exit 0 with `/questions` in the route tree. Neither gate file was touched — 0 commits in the run range against either.

**The status is BLOCKED, and the reason is not the code.** QA found all four fixes correct. §7c declares two agent-access boundaries `reachable`; **Phase 0 measured both unreachable**, before any dispatch. QA then did the thing that turns that from an inconvenience into a verdict: it measured whether the unit suite compensates, and it does not. **Deleting B40's mount, breaking B36's nav href, or adding §7a ciphertext columns to the `/questions` query each leaves all 1400 tests green.** Two of this run's four fixes are protected by neither a test nor an observation. `docs/user-guide.md` was not dispatched — that is §7c's own stated consequence — so **M1.10 stays not-Complete**.

## Work-units completed

| ID | Item | Outcome | Report gate |
|---|---|---|---|
| u1 | **B33** prose renderer | One `src/components/prose-value.tsx`, contract `data-verify-unit="detail-prose"`/`data-verify-field`/`data-verify-state`; 10 call sites across 6 files; both old copies deleted; `absent` unified, `unreadable` still prints the word. +17 tests | PASS |
| u2 | **B36** `/questions` reachable | List route + loader + one appended `OPERATOR_ROUTES` entry; ciphertext left behind the detail view's opt-in decrypt; unclassified `confidence` rendered loudly. +15 tests | PASS |
| u3 | **B32** money formatter | `money-display.ts` deleted, `formatAmount` survives, `MIXED_CURRENCY_TOTAL` relocated. QA's recommendation verified rather than inherited. +3 tests | FAIL → adjudicated → PASS |
| u4 | **B40** sign-out | `SignOutButton` in the app-shell header (the sidebar rail is `hidden md:block`, the header is not). +6 tests | PASS |
| qa1 | Independent review | **BLOCKED, 0 critical, 6 important, 5 minor** | — |

**u1 crossed two declared file boundaries** (`questions/_components/open-question-view.tsx`, `milestones/[id]/page.tsx`) to reach additional call sites of the renderer it was hoisting. No conflict resulted — the owning units touched neither file — and its reasoning was right: leaving them would have failed the "single selector covers all eight views" criterion. **The boundary was mine and drawn one file too tight.**

## Deferred — with reasons, distinguishing "out of scope" from "blocked"

**No type was deferred for lack of a specialist.** `mode: full`, every specialist functional.

- **`integration`, `deploy`, `copy`, `research`, `docs` (operator runbook)** — out of scope. No unit needed schema, RLS, a route handler or an auth flow; nothing is deployed because the first production deploy is Erik's decision; this is an internal single-operator tool with no marketing surface; each item had a named cause and file set already.
- **`docs` (§7b end-user manual) — NOT out of scope: BLOCKED.** §7c's operator boundary is unreachable, and §7c states the consequence: the manual cannot be written. I did not dispatch `docs-writer` to collect a `BLOCKED` I could predict at Phase 0. `manual-gate.sh` re-run by me: `FAIL MISSING: no docs/user-guide.md and no written waiver`. **§7b is not waived.**
- **Not dispatched by `prod.md`'s ruling, as instructed:** **B38** and **B39** (both edit gate or Playwright-config files — gate-file integrity needs Erik's per-instance authorisation), the **M1.10 purge destruction path** (destroys a live engagement, Erik's hands), and **B37's auth follow-up** (changes the auth architecture; wants a CR first — I did not draft one, and did not implement it).

## Decisions & defaults

Six recorded in `prod.md`'s Decisions log. The load-bearing ones:

1. **§7c operator row treated as `unreachable`; manual not dispatched.** §7c's own ruling.
2. **All four units assigned phase=1, so the run did not pause for a `continue`.** Every unit was a cross-cutting fix to shared infrastructure of an already-built app, and nothing here was built on anything else here, so a checkpoint would have bought no review. **Recorded so it can be overruled.**
3. **Keep `formatAmount`, delete `money-display.ts`** — verified, not inherited: `registry-display.ts` really pins `LOCALE = "en-US"`, so the hydration objection does not apply.
4. **Did not rewrite history to fix the `dcba416` attribution defect.** The branch carried specialist output existing nowhere else.
5. **Promoted the isolated u4's report; kept the superseded one.** Also **declined to hand-edit a specialist's report so it would clear the gate** — that is the same move as editing a fixture to pass a test.
6. **Adjudicated one `report-gate.sh` FAIL as a false positive** without editing the gate; the specialist reworded and re-ran it.

## Verification

- **Build (pnpm):** PASS — typecheck 0, lint 0, `pnpm test` **1400 passed / 6 skipped**, `pnpm gate:m27` **5/5**, build exit 0. Independently reproduced by `qa-reviewer` at `44db6ac`.
- **QA review:** **BLOCKED** — 0 critical, 6 important, 5 minor · `.fleet/qa-report-29b583.md`
- **§7c verification access — BOTH declared boundaries measured UNREACHABLE at Phase 0:**
  - *Operator `aal2`*: **NOT VERIFIED — every authenticated screen is built unobserved, `pnpm gate:m27:e2e` cannot run in-run, and `docs/user-guide.md` (§7b) cannot be written** (§7c verbatim). Saved session decodes as `aal2`/`totp` but is revoked: **10 failed / 10**, all *"rendered the operator gate (sign-in)"*, vs 8 passed / 2 failed on 2026-08-20.
  - *Agent token*: **NOT VERIFIED** — none in `.env.local`. Negative control: `401 missing_authorization` vs `401 malformed_authorization`, so the probe discriminates.
  - Renewal cannot be automated: `save-operator-session.mjs` launches a headed browser and blocks on stdin for a six-digit code. **Fix is Erik's, two commands.**
- **Security:** no new table, no migration, no schema change; §7a classifications unchanged. QA verified u2's `/questions` query selects no ciphertext column and u3 exposed no amount to an agent token. **But** a mutation adding the three ciphertext columns leaves the suite green — that control rests on a doc comment.
- **Deletion path:** not touched this run; M1.10's destruction path remains NOT VERIFIED (Erik's, by design).
- **Gate files:** `tests/m27-gate.test.ts` = 1 commit (`6210318`). **Correction to my own brief, caught by QA:** `e2e/m27-navigation.spec.ts` has **two** — `6210318` plus `9ffc857`, Erik's authorised gathering-only edit of 2026-08-20. I propagated a stale invariant. **This run touched neither: 0 commits in range.**
- **Worktrees merged:** 4 · **Files changed:** 8b311c4..tip, 5 commits
- **Build log (`spec/prod.md`):** UPDATED — header, M1.10 and M2.7 rows, B32/B33/B36/B40 marked fixed-on-branch, **B41–B45 added**, six decisions, session log, new resume pointer.
- **Fleet learnings:** 5 routed · `.fleet/learnings-29b583.md`
- **Questions:** 4 fanned into `.fleet/questions-29b583.jsonl` (u1 raised none). **One is a latent defect misfiled as a question** — see B44.

## Two defects of my own, reported against myself

1. **Commit contamination.** `src/components/sign-out-button.tsx` (u4's) is inside **`dcba416`**, labelled as u3's work. A first u4 dispatch stopped correctly at step zero, was resumed by me, ran in the **shared checkout** (its worktree had been reclaimed), and my `git add -A` swept its file in. **QA sharpened this beyond my framing: the final u4 has zero writes to that file** — B40's entire behavioural surface was written by an abandoned agent and verified by one that did not write it, when nobody could observe it. I also missed that `.fleet/questions-u4-29b583.jsonl` leaked the same way, which is why the canonical u4 report's "no questions" reads false against the repo.
2. **u4 was dispatched twice and produced two divergent reports.** Different base commits cited, different narratives, the `/sign-in` suppression call queued as a question in one and resolved as a best guess in the other. Both reach the same conclusion, so no decision was at risk — the record was. Canonical is the isolated agent's; the other is retained as `u4-first-attempt-superseded.md`.

QA also noted the branch advanced mid-review (`eec250f` → `44db6ac`). **Freeze the branch before dispatching QA next time** — that one is mine too.

## Fleet learnings routed

| | Title | Confidence |
|---|---|---|
| L1 | A saved browser session is a perishable credential, and its decoded claims cannot tell you whether it is still alive | high |
| L2 | A verification boundary that needs a human at an authenticator is not reachable to an unattended run, however it is declared | high |
| L3 | Agent worktree isolation is not guaranteed: verify the base commit **and** that the agent is in its own tree | high |
| L4 | `git diff` cannot see a unit's new files, so a worktree fan-in that enumerates with it silently drops them | high |
| L5 | A report section describing a procedure and stating its result is the one claim a diff review cannot catch | high |

**Held back (2):** `report-gate.sh`'s template check false-positives on prose quoting an angle-bracketed format string; and positional indexing into a shared nav config array (now `prod.md` B44 instead).

## Skipped as already built

M1.1–M1.9 (`Complete`), M1.10 and M2.7 (code complete). No work-unit was created for any of them.

## What to review first

1. **Re-mint the operator session — two commands, and it gates almost everything.** `pnpm dev`, then `node scripts/save-operator-session.mjs`. Until then M1.10 and M2.7 both stay not-Complete and no agent can see a screen. **B41.**
2. **Add the two missing tests before merging — B43.** One mounts `AppShell` and asserts the sign-out control is present; one asserts `OPERATOR_ROUTES` contains an `href === "/questions"`. Today, deleting either fix leaves 1400 tests green. This is the cheapest confidence available on this branch, and B40's provenance (written by an abandoned agent, never observed) makes it the one I would not merge without.
3. **B44 — six pages read `OPERATOR_ROUTES` positionally, and this run added the sixth.** A mis-index does not crash; it renders a screen under another screen's title and requirement list, on a product whose thesis is never telling you something false.
4. **B45 — three of four specialists reported a prior-learnings search their traces show never ran.** Doctrine, not product, but it is `b0952e`/`c1` recurring in three units of one run.
