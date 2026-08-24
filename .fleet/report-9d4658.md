# Build report 9d4658

**Status:** BLOCKED
**Branch:** `agent-build/2026-08-24-9d4658` (tip `c52296b`, cut from `0881cf4`, not pushed)
**Spec:** `/Users/erikmeltzer/Projects/project-tracker/spec/`
**Spec basis:** `spec-approved.md` + CRs [CR-001, CR-002, CR-003, CR-004, CR-005] — approved: **yes**
**Security posture:** declared (21 entities classified, 22 table rows) — `security-gate.sh` **PASS** on the resolved spec
**Duration:** ~40 min · 1 of 20 dispatches used

## Summary

**This run dispatched no build unit, and that is its finding rather than its failure.** Phase 0 established by measurement that the resolved spec contains no unbuilt requirement: every numbered FR it defines — **FR-1 through FR-96** — belongs to a milestone `prod.md` records as Complete or code-complete. The six Not-Started milestones you named as candidate scope carry **zero FRs between them**. Five exist in the approved spec only as bullets under **§4.3 "Deferred (Phase 2+)"** — a list CR-001 §6 *grows* by four further entries rather than promoting any of — and M2.6 exists only as one sentence in §12 Assumption 2. Your brief said of M2.6 *"read its FRs carefully before decomposing"*; doing that literally is what produced this. The established pattern here is that a §4.3 bullet becomes buildable when a CR turns it into numbered FRs **and** you rule its open questions first (CR-003 → M2.7, CR-005 §3.2 → M2.8, CR-005 §3.1/§3.3 → M2.9, gated on Q12–Q15 then Q17–Q19). No such CR exists for M2.1–M2.6. Decomposing them from prose would have meant the fleet authoring the requirements it then built against — the same act as an agent completing §7a or recording a §5a approval.

**The one unit that did run found two silent-failure defects inside the ingest layer**, both of which I reproduced independently rather than carrying on its word. `parseQaGates` has never extracted a single gate outcome from any real QA report and reports nothing about it; and three parsers drop malformed rows uncounted while a fourth counts them. Both are the wrong-`done` class this product exists to prevent, sitting inside the product. Neither is caught by 1817 passing tests, for a reason worth its own line: `tests/fixtures/` **does not exist**, the real-artifact fixture tier is gitignored and **absent from this checkout**, and its corpus tests `describe.skipIf` themselves into silence.

## Work-units completed

| ID | Type | Phase | Outcome |
|---|---|---|---|
| r1 | research | 1 | **done.** `report-gate.sh` → **SKIP** (research note, nothing mergeable), run id matched. Mapped all eleven Mode-1 parsers, what each consumes, and what every real artifact carries. Note at `/Users/erikmeltzer/Projects/project-tracker/.fleet/research/9d4658/r1-writeback-corpus.md`. 0 questions queued, stated explicitly. Wrote no product code, proposed no schema. |

## Deferred

Nothing was deferred for "specialist not yet implemented" — `mode=full` and every specialist in the roster is functional. The distinction you asked for, per milestone:

| Milestone | Kind | Reason |
|---|---|---|
| M1.10 destruction path | **BLOCKED on you** | Destroys rows in the live project. Requires your explicit authorisation. |
| M2.1 Probes | **BLOCKED on you** | Per-vendor credentials + zero FRs. A task needing a real secret is a blocker, not a puzzle. |
| M2.2 Coverage register | **BLOCKED on you** | Zero FRs, and **Q6/B7 unanswered** — which stacks seed the register and what the trigger is. That question *is* the milestone. |
| M2.3 Estimate vs actual | **BLOCKED on you** | Zero FRs. An estimate is a typed field with no natural expiry — it fails **both limbs** of CR-005 §2's bar, which you adopted as written (Q20). The CR names this case in advance: *"the first real test will be the one that hurts."* FR-13 says engagements and milestones are the only things you type. |
| M2.4 Critical path | **Not specified** | Zero FRs. Nothing defines the "Erik's serial time" weighting input. |
| M2.5 Harness evidence | **Not specified** | Zero FRs, and names harnesses (Detox, store review) this studio does not run — the evidence would be unobservable on this ledger. |
| M2.6 Writeback | **BLOCKED, reflexive** | Zero FRs. Emitter is `~/.claude/agents/project-lead.md`, out-of-tree and unreachable from a worktree — the same constraint that cut M2.9's scope. Validator half cannot meet the repo's own fixture rule until a real artifact carries such a block. |
| M3.1–M3.3 | **Out of scope** | Deferred at intake, by decision. |

**Dispatchable today and deliberately not dispatched** — named so the choice is yours, since expanding a spec-build into a blocker-fix run uninvited is the exact scope drift this run's finding is about: **B55** (`aria-sort` on `<a>`, axe **critical**, 7 nodes), **B44** (six pages reading nav metadata positionally), **B28** (`/next`'s unaccounted items). All three need no new spec and are observable while the `aal2` session lives. **B22** and **B24** are excluded: one needs a real secret placed, the other needs you to classify a table.

## Decisions & defaults

1. **Treated M2.1–M2.6 as not dispatchable** rather than decomposing §4.3 prose. Alternative rejected: build from prose, producing agent-authored requirements indistinguishable at read time from client-approved ones.
2. **Dispatched one `research` unit rather than aborting outright** — M2.6's decomposition is blocked on a *measurable* unknown, and resolving it converts M2.6 from unspecified into CR-draftable. Barred from proposing a schema or writing code.
3. **No `qa-reviewer`** — no unit produced product code, so there is no diff to review. Not a deferral.
4. **No `docs-writer` manual pass** — the branch adds no route (31, unchanged) and the gate is green. §7b needs no waiver.
5. **Did not fix B58/B59** — I do not write product code, and both sit outside this run's given scope. Escalated as measurements.

## Verification

- **Build (pnpm):** PASS — exit 0, **31 routes**, unchanged.
- **Typecheck:** PASS — `tsc --noEmit`, exit 0. **Lint (oxlint):** PASS — exit 0.
- **`pnpm test`:** **1817 passed / 6 skipped**, 120 files. `prod.md` records 1815; the **+2 is explained by measurement, not assumed** — `tests/state-scale.test.ts` from B54's contrast fix in `3eff490`, which post-dates that number.
- **`gate:m27:e2e`:** **10 passed / 10** with both `M27_BASE_URL` and `M27_STORAGE_STATE`. B41 stays closed; the `aal2` boundary is genuinely reachable right now.
- **QA review:** not dispatched — no unit produced product code.
- **End-user manual:** `/Users/erikmeltzer/Projects/project-tracker/docs/user-guide.md`, 8379 words · `manual-gate.sh` **MANUAL GATE PASS — 31 of 31 served routes covered, all observed**, re-run by me rather than quoted. **B57 caveat stands:** that gate cannot distinguish a fresh observation from a copied one, and this run did not re-open the rows.
- **Security:** 0 controls added or changed — no schema, no migration, no route, no source file touched. Nothing to reconcile against §7a. **B24 remains open**: `app.rate_limit_counters` is a 22nd table with no §7a row, and an agent must not classify it.
- **§7c verification access, measured before dispatch:** operator `aal2` **REACHABLE** (10/10); agent token **DEGRADED — negative controls only** (`401` no-auth, `401` bad-auth; no token obtainable, `.env.local` read-denied by design). **Proven to refuse, not proven to admit.**
- **Tables touched:** 0. **Deletion path:** unchanged — **declared in spec, destruction path still NOT observed** (M1.10), requires your authorisation.
- **Worktrees merged:** 0 (research note copied byte-identically, verified with `diff -q`, then the worktree pruned with its branch retained). **Files changed:** 8, all under `.fleet/` plus `spec/prod.md`. **No source file was touched.**
- **Build log (`spec/prod.md`):** **UPDATED** — confirmed with `git log -1 -- spec/prod.md` → `c52296b` and `grep -c 9d4658` → 10, never with `run-audit.sh`'s verdict.
- **Fleet learnings:** 3 routed · `/Users/erikmeltzer/Projects/project-tracker/.fleet/learnings-9d4658.md` · none held back.

## Findings — both reproduced by me, not taken on report

**B58 — `parseQaGates` has never extracted a gate outcome from any real QA report, and says nothing about it.** `GATE_LINE` (`src/lib/ingest/runReport.ts:130`) requires the bullet label to begin with a bare letter; every real report bolds it. I ran `GATE_LINE.exec()` over the `## Verification performed` section of all four tracked reports: **0 matches across 103 non-empty lines** (`b0952e` 0/37 — a table, not bullets; `eb2490` 0/17; `29b583` 0/15; `d4000f` 0/34). The failure is **silent**, and this is the load-bearing detail:

```
const match = GATE_LINE.exec(line.trim());
if (!match) continue;                      // runReport.ts:177 — drops the line here
...
if (key === undefined) { unparsed += 1; }  // runReport.ts:183 — never reached
```

So `fleetRun.gates` holds only `build_after_phase1` for every run in the corpus, and the QA report's own build / type-check / lint / playwright / accessibility outcomes are absent with no counter reporting the gap.

**B59 — three parsers drop malformed rows uncounted while a fourth counts them.** `workUnits.ts:55` emits a record with `status: "unparsed"` and the raw cells preserved. But `blocked.ts:49` (`if (cells.length !== BLOCKED_COLUMNS) continue;`), `prodMd.ts:106` and `prodMd.ts:127` each `continue` — the row leaves no record and no count, missing from both numerator and denominator of every `unparsed` figure. A malformed Blocked or milestone row shortens a list on screen with no signal.

## Fleet learnings routed

- **L1** — `security-gate.sh` reads every 4-cell row inside §7c as a boundary declaration, so a second table there launders a DEGRADED boundary into an `ok ... reachable` line. *(fleet, security-gate, false-green; high; observed before/after on this run, 4 rows → 2, plus the cause in the script source.)* **This bit me and I fixed my own artifact** — worth knowing because `qa-reviewer` takes §7c as an input.
- **L2** — A build log's milestone tracker is not a scope authority; the requirement set is, and the two drift in opposite directions. *(fleet, spec-resolution, phase-0; high; this run's own finding.)*
- **L3** — A gitignored fixture directory behind `describe.skipIf` turns the suite's only real-artifact tests into silent no-ops, and hand-authored fixtures then agree with the bug. *(vitest, fixtures, false-green; high; 0/103 regex matches against 1817 green tests.)*

## Skipped as already built

M1.0–M1.9 (Phase 1 MVP in full), M2.7 Detail and navigation, M2.8 Fleet run history, M2.9 Planned work. No work-unit was created for any of them.

## What to review first

1. **B58.** The product's ingest layer has been silently discarding QA gate outcomes for every run in its own corpus. Decide whether it is fixed now, folded into M2.6, or tracked — and note that the same `continue`-above-the-counter shape is worth grepping for elsewhere.
2. **M1.10 is one authorisation away and the window is open.** The purge path is built and reachable through the product's own Danger Zone with a typed-confirmation guard, and the `aal2` session is alive *right now*. A throwaway engagement created, archived and purged would observe the cascade, the audit rows a real purge writes, and CR-002 §2.4's retention. An agent may not start it.
3. **Decide what Phase 2 actually is.** `.fleet/research/9d4658/r1-writeback-corpus.md` exists to make the M2.6 CR draftable. Q6/B7 is the specific thing blocking M2.2. Read them together — M2.3 is the one CR-005 §2 warned would hurt.

**Nothing is in flight and there is no `continue` command for this run.** The branch touches no source file.
