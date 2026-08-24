# Checkpoint d4000f

phase_complete: 1
spec_path: /Users/erikmeltzer/Projects/project-tracker/spec
resolved_spec: /Users/erikmeltzer/Projects/project-tracker/.fleet/resolved-spec-d4000f.md
branch: agent-build/2026-08-24-d4000f
base_ref: docs/b46-verified-in-production @ 3927de4
mode: full
repo_path: /Users/erikmeltzer/Projects/project-tracker
manifest_path: /Users/erikmeltzer/Projects/project-tracker/.fleet/manifest-d4000f.md
started: 2026-08-24T10:46:38Z
phase1_completed: 2026-08-24T13:05:00Z
phase1_merge_commit: 7be6949
build_after_phase1: PASS
dispatches_used: 4 of 20

## Measured on the merged tree at 7be6949 — re-run by project-lead, not taken on report

| Check | Baseline (3927de4) | After Phase 1 |
|---|---|---|
| `pnpm typecheck` | 0 | **0** |
| `pnpm lint` (oxlint) | 0 | **0** |
| `pnpm test` | 1550 passed / 6 skipped | **1638 passed / 6 skipped** (= 1550 + 44 + 44, both units' increments intact) |
| `pnpm gate:m27` | 5/5 | **5/5** |
| `pnpm gate:m27:e2e` | 9 + 1 rerun | **10 passed / 10** |
| `pnpm build` | exit 0 | **exit 0** |
| `manual-gate.sh` | PASS 30/30 | **PASS 30/30** |
| Served page routes | 30 | **30, unchanged** |

Neither gate file was touched this run. `vitest.gate.config.ts` and the gate specs are unmodified.

## Phase 1 units — all four done, all four gated

| Unit | Report | `report-gate.sh` |
|---|---|---|
| r1 | `.fleet/research/d4000f/r1.md` (note) + `.fleet/specialist-reports/d4000f/r1.md` | **SKIP** — research note, nothing mergeable |
| i1 | `.fleet/specialist-reports/d4000f/i1.md` | **PASS** |
| i2 | `.fleet/specialist-reports/d4000f/i2.md` | **PASS** |
| u1 | `.fleet/specialist-reports/d4000f/u1.md` | **PASS** |

## Worktrees

r1=/Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-a445b46bdd4cfcbee
i1=/Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-a988ddcb058f8f0b8
i2=/Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-af9cdd2da84919c8b
u1=/Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-a5588be50ada61d04

All merged into `7be6949`. Safe to prune with `git worktree remove` once Phase 2 has landed —
**prove safety with `git cherry` plus a file-set comparison first, never a bare
`git diff HEAD <branch>`**, which on a branch behind HEAD answers a question you did not ask.

## Phase 2 units

i3, i4, u2, u3, u4, c1, doc1, d1

Then, in Synthesize: `qa1` (qa-reviewer, on the merged branch, no worktree) and `man1`
(docs-writer `mode: manual`, **only on a QA PASS**).

## MUST reach Phase 2 dispatch briefs

### D-1 — a latent defect the type checker cannot see. u4 owns it.

Making `execution_mode` nullable is **silent to `tsc`**: the row interfaces are hand-written and do
not derive from the generated `Tables<"work_item">`. Measured by i1 running the real functions, and
independently confirmed by project-lead at the return site (`from-db.ts:96`, not at the comment):

```
fromExecutionMode(null)              -> "fleet"      <-- a planned row reads as FLEET WORK
fromExecutionMode("fleet") [control] -> "fleet"
fromExecutorKind(null)               -> "unassigned"   <-- safe
```

`EXECUTION_MODE[String(value)] ?? "fleet"` — `String(null)` is `"null"`, no key, so it falls to
`"fleet"`. Reached from `answers/load.ts:313`, `detail/work-item.ts:195`, `runs/detail.ts:198`.
Separately `workitems/list.ts:216` passes raw `null` to `EXECUTION_MODE_LABELS[null]` ->
`undefined` -> a **blank chip** on `/work-items`.

**This is exactly the FR-91 failure: "nobody has started this" reading as "this is in flight."**
Invisible to `tsc` and to all 1638 tests. Inert today; **live the moment i3 writes the first
planned row.** The fix widens the domain type into `ExecutionModeChip` and its two callers, which
is React — u4's scope, not i1's.

**Sequencing rule: D-1 must land before or with i3's write path, never after.**

Worth noting for the report: one function above, `fromWorkStatus` correctly defaults to
`"unparsed"`. The `unparsed`-only-default discipline was applied to status and **not** to execution
mode, and nullability is what turns that pre-existing asymmetry into a live wrong answer.

### The approved CR carries a measurement that is wrong

CR-005 §3.3 says *"eleven of these screens already read `searchParams`, which is why FR-96 is
cheap."* r1 measured **9 of 11**, in **3 divergent shapes** — shared `SearchParams` + parsers in
`src/lib/answer-query.ts` (6 screens), a duplicated-but-identical type in
`src/app/work-items/_lib/query.ts`, and ad-hoc inline `Record` types on `/questions` and `/waits`.
**`/runs` and `/registry` read no `searchParams` at all.** Scope is unchanged; **u3's cost is not.**

### Other Phase 2 constraints established in Phase 1

- **`/work-items/new` takes served routes 30 -> 31.** `manual-gate.sh` fails **FORWARD** on any
  served route the evidence file misses, so `doc1` must add a section **and an observed evidence
  row**, taking the file to 31. Budgeted, not to be discovered at merge.
- **d1 must VERIFY i1's migration, never re-apply it.** `20260824110601` is already applied to
  Supabase `onpvolboecjpdkvurjaf`. A re-run fails on `create type plan_reconciliation` and reads
  like a broken migration.
- **i3 owns the parser seam.** `planDocument.ts` ships **unwired** — `ingestRun` has no slot for a
  plan document, deliberately, because a plan is not a run artifact.
- **`planRef` stays CLEAR; `PlanTask.title`, `rawHeading` and every step's text are §7a `sensitive`
  client prose needing pgcrypto at persistence.** An encrypted column cannot be joined on, so the
  reconciliation key and the prose it identifies get different at-rest treatment by design.
- **u1 owns the shared primitive `src/lib/engagement-filter.ts`** — the single spelling authority
  for the parameter, the eleven filterable paths, and how a filter change preserves other
  parameters while dropping `page`. u3 adopts it across all eleven; `/runs` and `/registry` adopt
  it from nothing.
- **FR-96c must not reuse `notFound()`.** `/registry/[slug]:136` 404s on a bad **route param**;
  FR-96c is about a **query filter** and needs an explicit no-rows state.
- **B44:** append to `OPERATOR_ROUTES`, never insert. If a screen must read its own nav entry, use
  `runs/page.tsx:26`'s `.find((item) => item.href === ...)`, never a new positional index.
- **jsdom does not implement `requestSubmit()`** — u1 found this by mutation testing, and it had
  silently made a submit test pass against a handler that never ran. u2 builds a form; it will
  meet this.

## Phase 1 best-guess decisions

1. **`/work-items/new` as a new route** for FR-88's hand-entry form, following the `/registry/new`
   precedent, rather than a dialog on `/work-items`. Takes routes 30 -> 31 and obliges a guide
   section. *project-lead, Phase 0.*
2. **The resolved spec and manifest were committed to the branch** so they resolve inside every
   worktree, rather than inlined into four briefs. `.fleet/` is tracked here (127 files), so this
   is consistent with existing practice. *project-lead, Phase 0.*
3. **`plan_ref` left CLEAR, not encrypted.** §7a's own pattern for a sensitive table is prose
   encrypted / identifiers clear (stated for `requirement`: text encrypted, `ref` and `section`
   clear). Encrypting the reconciliation key would delete the requirement it exists for. *i1, high
   confidence.*
4. **No `collides_with` FK — the FR-90 mark is per-row, not a pairwise edge.** With no shared key
   you cannot identify which two rows correspond except by matching prose, which Q13 excludes
   absolutely; a pairwise edge could only be populated by the forbidden mechanism. *i1, medium.*
5. **FR-91 staleness derives from `updated_at`, not `created_at`**, maintained by a BEFORE UPDATE
   trigger so no write path can forget it. Both columns exist, so i4 can switch without a
   migration. *i1, high.*
6. **One `### Task N:` heading = one `work_item` row**; steps ride along as structured data. A step
   is a procedure inside a unit of work, and 82 rows out of one `plan.md` would drown `/next`.
   *i2, medium.*
7. **`**Plan-id:** <token>` guessed as the future plan-id syntax**, reusing the `**Files:**` /
   `**Interfaces:**` field lines the artifact already has rather than inventing a form. No artifact
   emits one today. **Lowest-confidence decision in the run**; changing it is one regex and one
   fixture. *i2, low.*
8. **Only lines presenting as the shape are classification candidates** — a `Task` heading, a
   bracket bullet, a `**Plan-id:**` line. Treating every prose line as a candidate would turn
   `plan.md`'s 2160 lines into thousands of `unparsed` rows, contradicting Q12's own "not a page of
   unparsed rows". *i2, medium.*
9. **The parser ships unwired**, i3 owns the seam. Flagged explicitly because an unwired parser
   ships inert and looks finished. *i2, high.*
10. **The six answer screens keep their existing free-text engagement inputs** alongside the new
    shell picker. FR-96b's "not built eleven times" is satisfied by not adding an eleventh copy;
    removing six tested controls is a behaviour change FR-96b does not ask for, and free text is
    the only way to type a slug the picker does not list. **Flagged to u3 as a decision it must not
    make silently.** *u1, medium — the one Erik should look at.*
11. **The shell picker renders only on the eleven filterable paths**, not on detail views,
    `/settings/*`, `/`, `/registry/new` or `/work-items/unassigned`. Offering a filter where
    nothing honours it lets Erik set a scope that narrows nothing. *u1, high.*
12. **The "(whole ledger)" scope note is suppressed when the count is UNKNOWN** — FR-96a exists to
    stop a ledger-wide *number* being misread, and the unknown state renders no number. The badge
    still reports `data-verify-scope="none"` so an assertion can tell the states apart. *u1, high.*
13. **u1 owns the shared engagement-filter helper** rather than leaving ownership open — a
    sequencing call project-lead made in answer to r1's queued question. *project-lead.*

## Questions

14 queued across four per-unit files, concatenated into `.fleet/questions-d4000f.jsonl`.
None blocking. r1=2, i1=4, i2=4, u1=4.

Answer in `.fleet/answers-d4000f.jsonl`, then `/build-from-spec continue d4000f`.

## Open, and NOT resolved by this run

- **§7c agent token is DEGRADED — negative controls only.** Proven to refuse (401 no-auth, 401
  bad-auth, 401 ingest); **not proven to admit.** No positive-path agent-token claim may be made.
- **`pnpm gate:m27:e2e` cannot run from a fleet worktree** — a worktree has no `.env.local` and the
  copy is refused by the permission system. u1 refused to run it against the shared checkout and
  call that a pass. **project-lead ran it post-merge: 10/10.** This is now the standing division of
  labour.
- **u1's vault grep was blocked by the permission classifier** (`grep -rli` and `find` over
  `Knowledge/`). It did not route around it. If fleet units are expected to search prior learnings
  themselves, that needs an allowlist rule — otherwise this recurs as B45 did.
- **B41 is stale as written.** It records the `aal2` session as revoked; this run measured it alive
  twice (Phase 0, and 10/10 post-merge).
