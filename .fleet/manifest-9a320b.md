# Build manifest 9a320b

Spec: /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec/`)
Spec basis: `spec-approved.md` + CRs [CR-001, CR-002, CR-003, CR-004, CR-005 §3.2 ONLY]
Spec approved: yes — `spec-approved.md` approved 2026-08-17; CR-005 §3.2 approved 2026-08-23
Milestone: **M2.8 — Fleet run history**, FR-92 to FR-95
Security posture: declared (18 tables classified; `security-gate.sh` PASS on the resolved spec)
Verification access: declared, 2 boundary rows, **both `reachable` and both EXERCISED at Phase 0** (see below)
Resolved spec: `.fleet/resolved-spec-9a320b.md`
Prior state: `spec/prod.md` — 12 milestones Complete/Done, M1.10 + M2.7 code-complete-not-Complete, 8 active blockers
Mode: full
Branch: `agent-build/2026-08-23-9a320b`, cut from `4e9f0a3` (tip of `agent-build/2026-08-23-29b583`)
Started: 2026-08-23

---

## Phase 0 preflight results — measured, not assumed

| Check | Result |
|---|---|
| `fleet-preflight.sh <repo>` (one arg) | **PASS**, 0 WARN. Launch cwd VERIFIED from `$CLAUDE_CODE_SESSION_ID` |
| `security-gate.sh` on resolved spec | **PASS** — §7a 18 rows, all 18 §7 entities classified, §7c 2 rows |
| `manual-gate.sh` BASELINE (before build) | **PASS** — 28 routes served, 28 covered, all observed, evidence `manual-evidence-29b583.json` |
| §7c row 1 — agent token | declared `reachable`; **not exercised this run** — no unit touches an agent-token surface (M2.8 is operator-only read routes). Carried as such |
| §7c row 2 — operator `aal2` session | **EXERCISED AND LIVE.** `/blocked` → 200, `h1: "Blocked"`; `/registry` → 200, `h1: "Registry"`; no sign-in gate. **B41 is resolved in practice for this run.** `/runs` → **404**, confirming the milestone is unbuilt |

**B41 note.** `prod.md` carries B41 as open ("the saved `aal2` session is revoked"). Measured
2026-08-23 at Phase 0 of this run: it is **not** revoked — the session in
`.playwright-auth/operator.json` authenticates. Erik re-minted it before dispatch. Every
authenticated screen this run builds is therefore **observable**, which is the difference from
run `29b583`.

**B38 handling rule in force.** A failing `gate:m27:e2e` prints the live session cookie. No unit
may paste raw gate output into a report, a fixture, a screenshot or a trace.

---

## Ground truth measured at Phase 0 — every unit builds against this, not against a guess

Queried directly against Supabase `onpvolboecjpdkvurjaf`:

| Fact | Value |
|---|---|
| `fleet_run` rows | **1** |
| That row | `run_id=b0952e`, `branch=agent-build/2026-08-19-b0952e`, `mode=full`, `verdict=`**`unparsed`** |
| `started_at` / `ended_at` | both `2026-08-19 00:00:00+00` — **duration is genuinely zero** |
| `dispatch_cap`, `dispatches_used` | **NULL, NULL** |
| `tests_passed / failed / skipped` | **NULL / NULL / NULL** |
| `gates` | `{"build_after_phase1": "PASS"}` — one key |
| `work_item` rows with `fleet_run_id` set | **20 of 20** |
| `open_question` rows with `run='b0952e'` | **96 of 96**, 1 distinct run |
| `work_item_requirement` rows | **116** |
| `defect` rows | **13** |
| `defect` rows with `fixing_work_item_id` set | **0** |
| `engagement` rows | **2** |
| `work_item` rows with `status='unparsed'` | 0 |

### Linkage shapes, verbatim from `information_schema`

- `work_item.fleet_run_id` — `uuid`, nullable. The only FK edge run → work unit.
- `open_question.run` — **`text`**, nullable. Matched against `fleet_run.run_id`, not a FK.
- `work_item_requirement.requirement_ref` — `text`, joined via `work_item` → `fleet_run`.
- **`defect` has NO run column.** The only modelled edge is `defect.fixing_work_item_id` →
  `work_item` → `fleet_run`, and it is **NULL on all 13 rows**.

### Encrypted columns on the entities this milestone renders (§7a)

`work_item.description`, `work_item.raw_status`, `open_question.question`,
`open_question.best_guess`, `open_question.answer`, `defect.description` are all **`bytea`**.
Selecting one without the server-side decryption path exposes ciphertext to the browser — the
uncaught mutation `qa-reviewer` found on `/questions` (B43's third mutation) is exactly this.

---

## Decisions taken BEFORE dispatch, so no unit invents them

These are handed down in every brief. They are recorded here first so the reasoning is auditable.

**D1 — FR-95, and what "the manifest and the checkpoint disagree" means against this schema.**
The database carries **one** `verdict` column. The disagreement CR-005 names lives across
*sources*, and the row exposes two: the `verdict` column (parsed by
`src/lib/ingest/runReport.ts` from the QA report's `**Status:**` line, defaulting to `unparsed`)
and the `gates` jsonb (contributed by the manifest and the checkpoint). The rule: **emit
`verdict` byte-for-byte** — no title-casing, no mapping to a friendlier word, no hiding
`unparsed` behind a dash — and where `gates` carries a verdict-bearing key that disagrees with
it, **render both, each labelled with its source.** Where only one source exists, say that one
source exists. **No unit may synthesise a second source to satisfy FR-95.**

**D2 — the defects section of `/runs/[run-id]` will be empty, and why matters more than that.**
No defect in this ledger links to a run. A bare empty state there reads "this run opened no
defects", which is a claim nothing checked — the exact failure this product exists to prevent.
The section must state the measured reason: the only modelled edge is
`defect.fixing_work_item_id`, and it is unset on all 13 defect rows. **Queued as a question for
Erik rather than solved by widening anything.** No heuristic on `reported_by`, `source_key` or
`ref` prefix — that is the regex-widening failure under a different name.

**D3 — NULL is not zero, on every numeric field this screen renders.** `dispatch_cap`,
`dispatches_used` and all three test counts are NULL on the only row. They render in a
not-recorded treatment that cannot be read as `0`, following `@/lib/unparsed-display`'s
three-state rule (`unknown` / `zero` / `nonzero`) rather than inventing a fourth convention.
A zero duration from equal timestamps is **data** and renders as zero; a NULL timestamp is not.

**D4 — no decrypted prose on either new screen.** `/runs/[run-id]` lists the questions a run
queued by their **clear** columns (`unit`, `section`, `confidence`, `status`, `answered_at`) and
links each to `/questions/[id]`, which already decrypts. It never selects `question`,
`best_guess` or `answer`. Same rule for `work_item.description` — follow whatever
`readWorkItems` already does; do not add a prose column to satisfy a layout.

**D5 — `nav.ts`: append at the END, index `[6]`.** B44 is open: six pages read
`OPERATOR_ROUTES` by positional index `[0]`–`[5]`. `tests/nav-routes.test.ts` pins `[0]`–`[4]`
by href and **must not be edited.** The new `/runs` page reads its own entry as
`OPERATOR_ROUTES.find((r) => r.href === "/runs")!` — B44's prescribed fix applied to the new
call site only. **It does not add a seventh positional index, and it does not refactor the
other six** (out of scope, five files no unit here owns).

**D6 — no schema change, no migration, no new entity.** The 21-entity `security-gate.sh` PASS
is a precondition of this run. A unit that believes it needs a column raises a question and
stops.

**D7 — phase assignment and the single-invocation deviation, stated before dispatch.** Every
unit is `phase=1`. M2.8's acceptance criterion is one thing — two routes plus `manual-gate.sh`
green at 30 served routes — and a phase-1 exit would checkpoint a half-built milestone whose
gate is necessarily red, telling Erik nothing. This mirrors run `eb2490`'s recorded deviation
(`prod.md` Decisions log, 2026-08-20) and, unlike a default, it is written here **before**
dispatch rather than justified afterwards. Dependency waves are sequenced inside this one
invocation. Consequence: no phase-2 units exist, so Phase 5 proceeds directly to Synthesize.

**D8 — `docs-writer` dispatch rule, fixed in advance.** Protocol gates the manual pass on
`qa-reviewer` PASS. This repo's reviewer has returned **BLOCKED** on every prior run. The rule
for this run: **PASS or BLOCKED-with-0-critical → dispatch** the manual pass; **FAIL, or any
`critical` → do not dispatch**, and report the manual as NOT WRITTEN with the reason. Erik's
dispatch brief budgets the guide extension into this milestone explicitly, which is why
BLOCKED-with-0-critical is not treated as a stop.

---

## Work-units

| ID | Type | Phase | Wave | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|------|-------------|---------------|-----------|--------|
| i1 | integration | 1 | A | Read layer for `fleet_run`: list query + per-run detail query + pure display/derivation helpers + tests. No route, no component. | api-integrator | — | pending |
| u1 | ui | 1 | B | `/runs` list route (FR-92, FR-94, FR-95) + `OPERATOR_ROUTES` append at index `[6]` | ui-designer | i1 | pending |
| u2 | ui | 1 | B | `/runs/[run-id]` detail route (FR-93, FR-94, FR-95) incl. the rendered `gates` payload | ui-designer | i1 | pending |
| q1 | qa | 1 | C | Independent review of the merged branch: build, lint, typecheck, tests, Playwright against the live `aal2` session, security pass, trajectory grading | qa-reviewer | u1, u2 | pending |
| d1 | docs | 1 | D | `mode: manual` — extend `docs/user-guide.md` and `.fleet/manual-evidence-*.json` from 28 to 30 routes so `manual-gate.sh` is green | docs-writer | q1 | pending |

Reserve: up to 3 further dispatches for defect fixes surfaced by q1, then a re-review. Budget
**5 planned + 3 reserve = 8 of 20**.

## Defer list — decisions, not gaps

- **`copy` units — DEFERRED, reason: voice already established, not "out of scope".** Every
  existing screen in this product carries final prose written by `ui-designer` against a
  documented house voice (see `/questions/page.tsx`'s header). Introducing `COPY:` slots and a
  `copywriter` pass on a two-screen additive milestone would produce copy in a second voice one
  click from the first. `ui-designer` writes the microcopy and names its choices in its report.
- **`deploy` units — DEFERRED, reason: nothing deploys this run.** M2.8 adds two routes to a
  build branch. No Vercel project setting, env var, domain or protection rule changes. Nothing
  merges to `master`.
- **`docs` (operator handoff) units — DEFERRED, reason: no operator-facing change.**
  `docs/deploy.md`, `env.md`, `security.md`, `agent-tokens.md` and `session-hook.md` describe
  provisioning and credentials; two read-only screens change none of them. The **end-user manual**
  half is NOT deferred — it is unit `d1`, and it is required, because served routes go 28 → 30.
- **`research` units — NOT NEEDED.** The unknowns a researcher would have been sent after
  (schema shape, row counts, linkage edges, existing loader conventions, nav indexing, gate
  baselines) were all measured directly at Phase 0 and are recorded above. Dispatching a
  researcher to re-derive them would spend budget to produce a note less precise than this table.

## Out of scope — named because a unit might reach for it

CR-005 **§3.1** (FR-87–FR-91: planned work, `createWorkItem`, plan parser) and **§3.3** (FR-96:
engagement filter) are **DRAFT, NOT APPROVED**; Q12–Q15 are unanswered and §3.1 must not start
before Q13. No unit builds a create path, a plan parser or an engagement filter. A unit that
believes it needs one **queues a question for Erik and stops.**

## Questions

Per-unit files at `.fleet/questions-<unit-id>-9a320b.jsonl`, fanned into
`.fleet/questions-9a320b.jsonl` at fan-in — **after the last unit reports**, not before
(run `29b583` fanned in early and missed a question).

| Unit | Question file | Lines |
|---|---|---|
| i1 | `.fleet/questions-i1-9a320b.jsonl` | pending |
| u1 | `.fleet/questions-u1-9a320b.jsonl` | pending |
| u2 | `.fleet/questions-u2-9a320b.jsonl` | pending |
| q1 | `.fleet/questions-q1-9a320b.jsonl` | pending |
| d1 | `.fleet/questions-d1-9a320b.jsonl` | pending |
