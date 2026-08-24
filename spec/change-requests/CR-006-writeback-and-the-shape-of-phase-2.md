# CR-006 — Writeback, and what Phase 2 actually is

**Date drafted:** 2026-08-24
**Status:** **Q21, Q22 and Q23 RULED by Erik 2026-08-24** (he took the drafter's recommendation on all three). **§3 itself is still NOT APPROVED**, and **Q24 is NOT ruled** — a recommendation is recorded in §9 and needs his word. Nothing here is built until §3 is approved.
**Amends:** `spec-approved.md` §4.3 (promotes one bullet out of Deferred), §12 Assumption 2. Adds
FR-97 through FR-103. Adds Q21 through Q24.
**Depends on:** nothing. M1.10 is Complete as of 2026-08-24 and gates nothing here.

---

## 1. Why this CR exists: a build that dispatched nothing

Fleet run `9d4658` was dispatched `mode=full` against this project on 2026-08-24 and returned
**BLOCKED without dispatching a single build unit.** Its Phase 0 established by measurement that
the resolved spec contains no unbuilt requirement: every numbered FR the spec defines — **FR-1
through FR-96** — belongs to a milestone `prod.md` records as Complete or code-complete.

The six milestones `prod.md` listed as `Not Started` — M2.1 Probes, M2.2 Coverage register, M2.3
Estimate vs actual, M2.4 Critical path, M2.5 Harness evidence, M2.6 Writeback — carry **zero
numbered functional requirements between them.** Five exist in the approved spec only as bullets
under **§4.3 "Deferred (Phase 2+)"**, a list CR-001 §6 *grows* by four further entries rather than
promoting any of. The sixth, M2.6, exists only as one sentence in §12 Assumption 2.

**That was verified independently of the orchestrator's report** before this CR was drafted: §4.3
lines 69 to 74 are the six bullets, and the only FRs whose text touches the subject matter —
FR-31, FR-35, FR-46 — merely name Phase 2 as a downstream *consumer* of a Phase 1 field.

So the tracker and the requirement set had drifted apart, and the tracker is the document a session
reads first. This CR closes the gap for the one milestone that is genuinely draftable today, and
says plainly what each of the other five still needs.

### The established pattern this CR follows

A §4.3 bullet becomes buildable when a CR turns it into numbered FRs **and** Erik rules its open
questions first. CR-003 did this for M2.7. CR-005 §3.2 did it for M2.8, and §3.1/§3.3 for M2.9,
gated on Q12–Q15 and then Q17–Q19. There is no such CR for M2.1–M2.6, which is why a fleet that
obeyed its brief would have had specialists **author the requirements they then built against** —
and an agent-invented requirement reads exactly like a client-approved one until delivery.

---

## 2. The boundary: this CR promotes ONE bullet, not six

M2.6 is the only one of the six that is draftable from measurement rather than from a decision this
CR is not entitled to make. §4 dispositions the other five explicitly rather than leaving them in a
status word that reads as ready.

**M2.6 is also the highest-leverage of the six**, for a reason worth stating: `project-lead`
emitting a machine-readable block turns every Mode-1 parser from a *guesser* into a *validator*,
and retires the whole `unparsed` risk class at its source. Today every parser infers structure from
prose a specialist wrote freehand. B58 is what that costs — see §3.0.

### The reflexive constraint, which shapes every FR below

The emitter of a writeback block is `~/.claude/agents/project-lead.md`, **out of this repo**, and
unreachable from a build worktree. This is the same boundary that cut M2.9's scope (`plan` and
`manifest` templates live in `~/.claude/agents/templates`).

The consequence is not cosmetic and it is why FR-97 is written as it is: **this repo can only ever
own the *contract*, never the emitter.** A parser here is written in anticipation of a shape and
cannot be verified against the emitter's actual template until a real artifact carrying that shape
lands in a tracked `.fleet/`. Any FR that assumed otherwise would be unbuildable, and this CR does
not contain one.

---

## 3. Proposed changes — M2.6 Writeback

### 3.0 What the milestone is actually worth, measured

Run `9d4658` found and this session fixed **B58**: `parseQaGates` had **never extracted a single
gate outcome from any real QA report**, across all four in the corpus, and reported nothing about
it. `GATE_LINE` required a bare-letter bullet label; every real report bolds it. The non-matching
line was dropped by a `continue` sitting **above** the counter meant to notice exactly that, so a
report whose every gate line failed to parse reported `unparsed: 0`.

Measured before the fix: **0 matches across 103 non-empty lines**, with 1817 tests green.

**That is the argument for M2.6 in one defect.** Prose written by a specialist is not an interface,
and a parser reading it cannot tell "this artifact says nothing" from "I could not read what it
says". A block the emitter writes on purpose is an interface, and the parser's job becomes
comparison rather than inference.

### 3.1 The requirements

- **FR-97** `project-lead` emits a **machine-readable writeback block** in a fixed, versioned shape,
  carrying the facts it already states in prose: run id, branch, base ref, per-unit id, type, phase
  and status, the dispatch count, the gate outcomes, and the QA verdict. **This repo owns the
  contract and publishes it; it does not own the emitter.** The contract is versioned so a parser
  can refuse a version it does not know rather than guess at it.

- **FR-98** Mode-1 ingest parses the block when present. A block that parses supplies the same
  records the prose parsers produce today.

- **FR-99** **The block VALIDATES the prose parse; it does not replace it.** Both are parsed. Where
  they agree, the record is written once and marked corroborated. **Where they disagree, BOTH
  readings are recorded and the disagreement is surfaced** — never silently resolved in favour of
  either. This is the standing rule of this codebase applied to its own ingest path: in the
  reference corpus `manifest-cd414c.md` marks unit `u4` `pending` while `checkpoint-cd414c.md` says
  it merged, and that disagreement is data.

- **FR-100** A writeback block that does not parse is **`unparsed`, and counted** — never a silent
  skip, and never a reason to discard the prose parse that would otherwise have run. FR-58's
  reported count includes it.

- **FR-101** A run whose artifacts carry **no** writeback block ingests exactly as it does today,
  with no degradation and no warning treated as an error. Every artifact in the existing corpus
  predates this contract, and a migration that made history unreadable would be a worse product.

- **FR-102** The contract is published in-repo as a **fixture the emitter can be checked against**,
  and the parser carries a test feeding it a shape it does not recognise that asserts `unparsed`
  rather than a guess.

- **FR-103** The `/runs/[run-id]` screen shows, per run, whether a writeback block was present,
  parsed, or `unparsed`, and lists any field where block and prose disagreed. **A run ingested
  before this contract existed reads "no block", not "failed".**

### 3.2 What is deliberately NOT in this CR

- **No change to `~/.claude/agents/project-lead.md`.** Out of tree, and Erik's.
- **No new entity.** A writeback block describes work items, runs and gates that already have
  tables. Expected §7a impact: **none** — the 21-entity classification holds and no new §7a row is
  required. This is asserted, and §7a must be re-read at build time rather than trusted here.
- **No retirement of any prose parser.** FR-99 depends on both existing.

---

## 4. The other five milestones — dispositioned, not left ambiguous

| Milestone | Disposition | What it actually needs |
|---|---|---|
| **M2.1** Probes | **Blocked on Erik, twice over** | Zero FRs **and** per-vendor credentials. This repo's rule is that a task needing a real secret is a blocker, not a puzzle. Needs a CR *and* a credential decision. |
| **M2.2** Coverage register | **Blocked on one ruling** | Zero FRs, and **Q6/B7 is unanswered** — which stacks seed the register, and what the trigger rule is. That question *is* the milestone: FR-31 already accumulates the hours it would consume. Promoted to **Q24** below. |
| **M2.3** Estimate vs actual | **Fails the bar Erik adopted** | Zero FRs. An estimate is a typed field with no natural expiry, so it fails **both limbs** of CR-005 §2's test, which Erik adopted as written under Q20. FR-13 says engagements and milestones are the only things he types. CR-005 named this case in advance: *"the first real test will be the one that hurts."* **Recommendation: leave deferred**, and if it is wanted, amend §2's bar deliberately rather than route around it. |
| **M2.4** Critical path | **Not specified** | Zero FRs, and nothing anywhere defines the "Erik's serial time" weighting input the milestone name assumes. Needs a definition before it needs a CR. |
| **M2.5** Harness evidence | **Not specified, and possibly unobservable** | Zero FRs, and it names harnesses this studio does not run (Detox, store review). Evidence for them would be unobservable on this ledger, which makes it exactly the wrong-`done` this product exists to refuse. |

**None of these five is promoted by this CR.** Recording why is the point: a `Not Started` row that
means "nobody has decided this yet" and one that means "approved and waiting for a dispatch" are
different states, and the tracker spells them the same way.

---

## 5. What this costs

- **Migrations:** at most one, and possibly zero. Recording a disagreement (FR-99) needs somewhere
  to put it; whether that is a column, a `jsonb` field on `fleet_run`, or rows in an existing table
  is a build-time decision, not a scope one. **Nothing dropped, no cascade change.**
- **Routes:** FR-103 amends `/runs/[run-id]`, an existing route. **Served route count stays 31**, so
  `manual-gate.sh`'s count is unaffected — but the guide text for that route changes, so **budget
  the `docs/user-guide.md` update into the milestone.** That is the lesson M2.8 paid ~157k tokens to
  learn, and M2.9 then budgeted for correctly.
- **The named risk:** the contract is written blind to the emitter. The first real run carrying a
  block will disagree with the parser in some detail, and **that disagreement is the milestone
  working**, not failing — FR-100 exists precisely so the first mismatch is loud and cheap.
- **B57 still applies.** `manual-gate.sh` cannot distinguish a fresh observation from a copied one,
  so re-open the guide's rows rather than carrying them forward.

---

## 6. Milestone proposal

**M2.6 Writeback — FR-97 to FR-103.** One milestone, dispatchable as a normal fleet run once
approved and once Q21–Q23 are ruled. M2.1 through M2.5 stay `Deferred` in the tracker rather than
`Not Started`, so the tracker stops reading as though five approved milestones are waiting.

---

## 7. Open questions — Erik answers these before any of this is built

**Q21. Row-level `unparsed`, or whole-document rejection?**
This codebase already uses both philosophies and nothing decides which a third document type
inherits. `parseWorkUnits` emits `unparsed` per malformed row and keeps the rest. `POST
/api/ingest/plan` (Q12) refuses a whole document that is not shaped like a plan, before any row is
written. A writeback block is a new document type. *Why it matters:* row-level keeps a partly-broken
block useful and risks half a run's facts landing; whole-block is all-or-nothing and falls back
cleanly to the prose parse. **Drafter's recommendation: whole-block refusal**, because FR-101
guarantees a clean fallback that the plan endpoint never had.

**Q22. Where does the block live?**
The manifest, the checkpoint, or its own artifact file. *Why it matters:* the manifest is written
at dispatch and the checkpoint at completion, so a block in the manifest cannot carry gate outcomes
or a QA verdict, and a block in the checkpoint cannot be validated against a run that died before
it. A third file is cleanest and is one more thing the emitter must be trusted to write.

**Q23. What IS a block-vs-prose disagreement, to this product?**
FR-99 says record both. It does not say what the product then *calls* it. Options: data only
(surfaced on `/runs/[run-id]`, no further consequence); a `defect` row; or a `blocker`. *Why it
matters:* CR-001 gave this product a defect entity and a Broken screen, so "make it a defect" is
now available in a way it was not when the disagreement rule was written. **Drafter's
recommendation: data only** for v1 — a disagreement between two records is normal here, and
promoting every one to a defect would make Broken unreadable.

**Q24. M2.2's blocker, restated so it can be answered: which stacks seed the coverage register, and
what is the trigger rule for "this stack has earned a specialist"?**
Carried from Q6/B7, unanswered since intake. *Why it matters:* FR-31 has been accumulating stack
attribution on work sessions since M1.5 shipped, so the input exists and is filling up. The
register cannot be specified without the rule, and the rule is a judgement about Erik's practice
that no agent should make. **This is the single ruling that unblocks a second Phase 2 milestone.**

---

## 8. Approval

**Not approved.** This CR was drafted by Claude at Erik's direction on 2026-08-24, after run
`9d4658` returned BLOCKED. It amends the approved spec and therefore needs Erik's explicit
approval, recorded here with a date, before any part of it is dispatched.

Approving §3 without ruling Q21–Q23 would put a build unit in the position of choosing a failure
philosophy for a new document type, which is the same class of decision as an agent completing §7a.

- [ ] §3 (M2.6 Writeback, FR-97 to FR-103) approved — date, Erik
- [ ] §4's dispositions accepted, tracker updated to `Deferred` — date, Erik
- [x] **Q21 RULED 2026-08-24 — whole-block refusal.** A writeback block that does not parse is refused
      entire and nothing from it is written; FR-101's prose parse still runs, so the run still ingests.
      FR-100 still counts the refusal as `unparsed`. Erik took the drafter's recommendation.
- [x] **Q22 RULED 2026-08-24 — its own artifact file.** Not the manifest (written at dispatch, so it
      cannot carry gate outcomes or a QA verdict) and not the checkpoint (unvalidatable when a run dies
      before writing it). The cost is accepted explicitly: one more file the emitter must be trusted to
      write, and FR-101 is what makes its absence harmless.
- [x] **Q23 RULED 2026-08-24 — data only.** A block-vs-prose disagreement is surfaced on
      `/runs/[run-id]` (FR-103) and carries no further consequence. It does NOT become a `defect` row
      and does NOT become a `blocker`. Reason recorded: a disagreement between two records is normal in
      this product, and promoting every one to a defect would make Broken unreadable.
- [ ] **Q24 — NOT RULED.** Recommendation recorded in §9 below, with the measurement that changed it.

---

## 9. Q24 — the coverage register, and the measurement that changes the answer

Erik asked for a best recommendation rather than ruling this himself. Recording the recommendation
here **with the evidence behind it**, because one measurement taken while drafting inverts the
obvious answer.

### The measurement

The register's input **is empty**. Read from the live project on 2026-08-24:

| Table | Rows |
|---|---|
| `stack` | **0** |
| `work_session` | **0** |
| `work_item` with `execution_mode = 'hand'` | **0** |

This corrects a claim made earlier the same day — that FR-31 "has been accumulating stack
attribution since M1.5 shipped." **It has not.** B4 was resolved and the allowlist was built, but
nothing has been captured. Both live engagements also carry `stacks = '{}'`.

### Why that inverts the question

A trigger rule is the cheap half. Written against zero rows, **a coverage register would answer "no
stack has earned a specialist" forever, and be indistinguishable from a register working correctly
in a quiet month.** That is precisely the wrong-`done` this product exists to refuse, aimed at the
one screen whose entire job is to notice a gap.

So the recommendation is not primarily a trigger rule.

### Recommendation, in build order

1. **Seed `stack` from live engagements, per the spec's own §10 Q6 answer** — *"seed from live
   engagements and let mode-2 capture add the rest."* Today that is the fleet stack and nothing else:
   `next.js`, `supabase`, `vercel`, `typescript`. **Deliberately not a portfolio list invented by an
   agent** — the studio's other stacks arrive as capture observes them, which is the mechanism FR-31
   exists to provide.

2. **Make M2.2's first acceptance criterion a capture check, not a register screen.** Before any
   register is built, `work_session` must hold rows from real sessions with a resolved `stack_id`,
   observed rather than assumed. If capture is not live, that is the milestone — the register is a
   view over it and cannot precede it.

3. **Adopt the spec's own trigger verbatim**, because it was written at intake against the practice
   rather than reverse-engineered from an empty table: *"two or more engagements and eight or more of
   Erik's own hours, or one engagement where the missing agent blocks a dated contract milestone."*
   The second limb matters more than the first: it is the case where the register earns its keep, and
   it does not need any hour count to fire.

4. **The register reports its own blindness.** Where the count is zero because nothing was captured,
   it must say so — not render an empty table that reads as "no gaps". Same rule as FR-58's badge and
   B28's fourth counter, both of which exist because a correct-but-empty answer read as an absence.

### What Erik still has to say

Only one thing, and it is the seed list. If the four stacks in (1) are wrong — if he wants his actual
portfolio seeded rather than grown from capture — that is his call and it changes step 1 only. Steps
2 to 4 hold either way.
