# Build manifest 9d4658

Spec: /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec/`)
Spec basis: spec-approved.md + CRs [CR-001, CR-002, CR-003, CR-004, CR-005]
Spec approved: yes — approved 2026-08-17, byte-identical to spec-v1.md
Security posture: declared (21 entities classified, 22 table rows) — `security-gate.sh` PASS on the resolved spec
Verification access: §7c row 1 (agent token) **DEGRADED this run — negative controls only**; §7c row 2 (operator `aal2`) **REACHABLE, measured 10/10**
Resolved spec: .fleet/resolved-spec-9d4658.md
Prior state: spec/prod.md — 13 milestones Complete (M1.0–M1.9, M2.7, M2.8, M2.9), M1.10 code-complete, 19 active blockers
Mode: full
Branch: agent-build/2026-08-24-9d4658 (cut from 0881cf4)
Started: 2026-08-24T17:27:21Z

## The Phase 0 finding that decides this run

**Every numbered functional requirement in the resolved spec — FR-1 through FR-96 — belongs to a
milestone `prod.md` records as Complete or code-complete.** The six Not-Started milestones
(M2.1–M2.6) carry **zero FRs between them**. Their entire specification is five bullets under
**§4.3 "Deferred (Phase 2+)"**, one prose sentence in §11, and one sentence in §12 Assumption 2.

CR-001 §6 *grows* the §4.3 deferred list by four further entries rather than promoting any of it.
The established pattern here — CR-003 → M2.7, CR-005 §3.2 → M2.8, CR-005 §3.1/§3.3 → M2.9 — is that
a §4.3 bullet becomes dispatchable only when a CR turns it into numbered FRs **and** Erik rules its
open questions first. No such CR exists for any of M2.1–M2.6.

Decomposing them anyway would mean this fleet writing the requirements it then builds against.
That is the same class of act as an agent completing §7a or recording a §5a approval, and it is
refused for the same reason: an agent-invented requirement reads exactly like a client-approved
one, and the difference surfaces only at delivery.

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Measure what the Mode-1 parsers consume and what the artifact corpus carries, so M2.6's writeback block can be specified by Erik rather than invented by an agent | researcher | — | **done** — note at `.fleet/research/9d4658/r1-writeback-corpus.md`; `report-gate.sh` **SKIP** (research note, nothing mergeable); 0 questions queued. Found two verified ingest defects — see below |

## Not dispatched — every remaining milestone, with the specific reason

| Milestone | Reason | Kind | What would make it dispatchable |
|---|---|---|---|
| M1.10 destruction path | Requires destroying rows in the **live** Supabase project. A prior purge probe was authorised by Erik specifically. | **BLOCKED on Erik** — authorisation | Erik's explicit authorisation to create and purge a throwaway engagement |
| M2.1 Probes | Needs per-vendor credentials (App Store Connect, DNS, deploy state, inbox). Project rule: a task that appears to require a real secret is a blocker, not a puzzle. Also carries zero FRs. | **BLOCKED on Erik** — credentials + no FRs | Credentials in the environment, and a CR turning §4.3 bullet 1 into FRs |
| M2.2 Coverage register | Zero FRs. Additionally blocked by **Q6 / B7**, unanswered: which stacks seed the register and what is the trigger for earning an agent. **The trigger rule is the substance of the milestone.** | **BLOCKED on Erik** — open question + no FRs | Erik answers Q6, then a CR |
| M2.3 Estimate vs actual | Zero FRs. An estimate is a **typed field with no natural expiry** — it fails both limbs of CR-005 §2's bar, which Erik adopted as written (Q20). The CR names this case in advance: *"The first real test will be the one that hurts."* Nothing in the system captures an estimate, and FR-13 says engagements and milestones are the only data Erik types. | **BLOCKED on Erik** — scope decision + no FRs | Erik rules on the §2 bar for this surface, then a CR |
| M2.4 Critical path | Zero FRs. "Weighted by Erik's serial time" — nothing in the resolved spec defines a serial-time model, and no artifact carries one. | **Not specified** — no FRs | A CR defining the weighting input |
| M2.5 Harness evidence | Zero FRs. Names Detox, manual device scripts and store review outcomes — harnesses this studio does not currently run, so the evidence would be unobservable on this ledger. | **Not specified** — no FRs, and unobservable | A CR, and an engagement that actually runs those harnesses |
| M2.6 Writeback | Zero FRs. Its emitter half is `~/.claude/agents/project-lead.md`, **outside this repo and unreachable from a worktree** — the same constraint that cut M2.9's scope, where the plan and manifest templates live in `~/.claude/agents/templates`. Its validator half cannot be built to this repo's own fixture rule (*"byte copies of real fleet artifacts"*) because no artifact carries such a block yet. | **BLOCKED** — reflexive, and unspecified | `r1`'s measurement, then Erik writes the block's shape into a CR, then the emitter changes, then the validator is buildable against a real emitted artifact |
| M3.1–M3.3 | Deferred at intake. | **Out of scope** — by decision | — |

## Available today but deliberately NOT dispatched — outside the scope this run was given

These are concrete, unambiguous and need no new spec. They are named so the choice is Erik's rather
than mine; expanding a spec-build run into a blocker-fix run without being asked is scope drift.

| Item | What it is | Why it is dispatchable |
|---|---|---|
| **B55** | `aria-sort` on an `<a>` element — axe `aria-allowed-attr`, **impact: critical**, 7 nodes. Pre-existing. | A bounded `ui` fix. No spec ambiguity, no credential, no live-data risk. The `aal2` session is alive so the fix is **observable** this run. |
| **B44** | Six pages read their own nav metadata positionally as `OPERATOR_ROUTES[0]`…`[5]`. `qa-reviewer` calls it a blocker misfiled as a question. | A bounded `ui`/refactor unit with an obvious correct shape. |
| **B28** | `/next`'s three counters account only for exclusions from the `{pending, not_dispatched}` candidate set, so 20 items in other statuses vanish with no reason given, under an empty state that promises otherwise. | A bounded `integration` fix; the doctrine (`unparsed` is the only default; account for everything) already dictates the behaviour. |

**B22** (Preview carries no `SUPABASE_SERVICE_ROLE_KEY`, so every `/api/*` route 500s on preview) is
**not** on this list: the fix is to place a real secret, which is Erik's to do.
**B24** (`app.rate_limit_counters` is a 22nd table with no §7a row) is **not** on this list: an
entity with no §7a row is a blocker for Erik to classify, and an agent must not classify it.

## Defer list

- `ui`, `integration`, `copy`, `deploy`, `docs`, `qa` — **no work-units created, and not because
  their specialists are stubs.** Every specialist in the roster is functional and `mode=full` makes
  every type dispatchable. There is no in-scope requirement left for them to build.

## Questions collected

| Unit | File | Lines |
|---|---|---|
| r1 | `.fleet/questions-r1-9d4658.jsonl` | **0** — r1 queued none and said so explicitly; its two open items are recorded in its note as observed options, not as blocking questions |

Concatenated to `.fleet/questions-9d4658.jsonl` (0 lines).

## Findings this run — both verified by `project-lead`, not taken on r1's report

**B58 — `parseQaGates` extracts nothing from any real QA report, and says nothing about it.**
`GATE_LINE` (`src/lib/ingest/runReport.ts:130`) requires the bullet label to begin with a bare
letter. Every real QA report bolds it (`- **Build (pnpm):** PASS`), so the regex never matches.
Reproduced independently by running `GATE_LINE.exec()` over the `## Verification performed` section
of all four tracked reports: **0 matches out of 103 non-empty lines** (`b0952e` 0/37 — that one is a
table, not bullets; `eb2490` 0/17; `29b583` 0/15; `d4000f` 0/34). The failure is **silent**:
`runReport.ts:177` is `if (!match) continue;`, which drops the line *before* the
unparsed-incrementing branch at `runReport.ts:183`. Consequence: for every run in the corpus,
`fleetRun.gates` holds only `build_after_phase1` (from the checkpoint, a different code path), and
the QA report's own build / type-check / lint / playwright / accessibility outcomes have **never**
been ingested — with no counter anywhere reporting the gap.

**B59 — three ingest parsers silently drop malformed rows while a fourth counts them.**
Verified in source. `workUnits.ts:55` handles a wrong column count by emitting a record with
`status: "unparsed"` and the raw cells preserved — loud, counted, correct. But
`blocked.ts:49` (`if (cells.length !== BLOCKED_COLUMNS) continue;`), `prodMd.ts:106` (milestone
rows) and `prodMd.ts:127` (a blocker row naming no `Bn`) each `continue` — the row vanishes with no
record and no count, so it is absent from both the numerator and the denominator of every
`unparsed` figure. A malformed Blocked row or milestone row therefore shrinks a list on screen with
no signal at all, which is the failure mode `## unparsed is the only default` exists to prevent.

**Why 1817 tests do not catch either.** The repo's stated safeguard is that fixtures are byte copies
of real fleet artifacts. Measured: `tests/fixtures/` **does not exist**; real-artifact fixtures live
in `fixtures-local/`, which is gitignored and **absent from this checkout**, and the corpus tests
that would use it are wrapped in `describe.skipIf(!present)` — so they **skip silently**. The tests
that do run use tier-1 hand-authored fixtures under `src/lib/ingest/__fixtures__/`, and the one
fixture exercising `GATE_LINE` (`runReport.test.ts:91`) uses an **unbolded** line unlike every real
artifact. Fixture author and parser author shared the same wrong assumption. Same shape as B46,
where a component mocked to `() => null` kept 1545 tests green over a crash.
