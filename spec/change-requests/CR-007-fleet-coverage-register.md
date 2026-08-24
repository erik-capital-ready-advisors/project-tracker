# CR-007 — The fleet-coverage register

**Date drafted:** 2026-08-24
**Status:** **APPROVED 2026-08-24 by Erik — §3 approved and Q25, Q26, Q27 all RULED** (he took the drafter's recommendation on all three). Dispatched to the fleet as **M2.2** the same day. This CR has no open questions left.
**Amends:** `spec-approved.md` §4.3 (promotes bullet 2 out of Deferred), §10 Q6. Adds FR-104 through
FR-109. Adds Q25 through Q27.
**Depends on:** **B61, which is closed.** Nothing else. Independent of CR-006 entirely — the two can
be built in either order or in parallel.

---

## 1. Why this is draftable today and was not yesterday

M2.2 has sat in `prod.md` as `Not Started` since intake with **zero functional requirements**, and
spec §10 **Q6** — *"Which stacks should the register be seeded with, and what is the trigger for
earning an agent?"* — has been unanswered the whole time. Run `9d4658` established that the status
word was the only thing making it look dispatchable.

The real obstacle was never the trigger rule. It was that **the register's input could not fill.**
`work_session.stack_id` was settable only from a *global* env var, against a hook installed
*globally*, with no post-capture path to correct it. Every row would have carried a NULL stack
forever. That was **B61**, found by observation on 2026-08-24 when Mode 2 was verified end to end and
the first real row came back with `stack: null`.

**B61 is now closed.** A per-project `.delivery-ledger` file supplies engagement and stack, verified
against production:

```
before   engagement=unassigned        stack=NULL
after    engagement=delivery-ledger   stack=nextjs-supabase
```

So FR-31's stack-hours rollup has a working path for the first time, and the register has something
to be a view over.

## 2. Most of this milestone already exists in the schema

Measured, not assumed. `public.stack` ships today with exactly the columns a register needs:

| Column | State |
|---|---|
| `name` | populated on demand by `upsertStack` — **one row exists, never seeded** |
| `first_seen_at`, `last_seen_at` | written by the capture path |
| `agent_covering` | **exists, and nothing in the product reads or writes it** |

And `work_session` carries `stack_id` and `duration_minutes`.

**No route or screen reads the `stack` table.** The only reads anywhere are a detail view fetching a
stack's name (`work-item.ts:165`) and the upsert itself. **This is M2.8's shape exactly** — `fleet_run`
had carried a verdict, a dispatch cap and a gates payload since ingest first landed, and no route had
ever rendered it. The work here is overwhelmingly a read layer and a screen, not a schema.

**Expected §7a impact: none.** No new entity; `stack` is already classified among the 21.

### A naming collision to settle before anyone writes a file

`src/lib/ingest/coverage.ts` is **already taken** and means something else entirely — requirement and
test coverage, FR-45 to FR-51, the `covered` / `claimed` / `selfCertified` / `unproven` index. The
fleet-coverage register is unrelated to it. Whatever this milestone builds must not be called
`coverage.ts`, and the screen should not be called "Coverage" without a qualifier, or the product
grows two different meanings for its most overloaded word.

## 3. Proposed requirements

- **FR-104** A register screen lists every stack the ledger has ever observed, with: hours
  accumulated, how many engagements it appears in, when it was first and last seen, and whether a
  fleet agent covers it (`stack.agent_covering`).

- **FR-105** Hours are summed from `work_session.duration_minutes` per stack. **Every `work_session`
  row is Erik's own hand work** — `work_session` is written only by the Mode 2 capture path, so
  "Erik's own hours" needs no new field and no new attribution concept. This is asserted from the
  write path and must be re-checked at build time rather than trusted here.

- **FR-106** The trigger rule is evaluated and **stated on the screen**, not left for the reader to
  compute: a stack has earned a specialist when it appears in **two or more engagements and carries
  eight or more of Erik's hours**, or when **one engagement's missing agent blocks a dated contract
  milestone**. This is Erik's own §10 Q6 answer, adopted verbatim rather than reverse-engineered.

- **FR-107** A stack that has **earned** a specialist and has **no** `agent_covering` is the one
  actionable state on the screen and is visually distinct from every other. Earned-and-covered is
  settled; unearned is information.

- **FR-108** **The register reports its own blindness.** Sessions carrying no stack are counted and
  shown as their own figure, never silently excluded from the denominator. Where the register has no
  data because nothing has been captured, it **says so** rather than rendering an empty table — an
  empty register and a register reporting "no stack has earned a specialist" are different claims,
  and only one of them is an answer.

- **FR-109** `agent_covering` is set by the operator, not inferred. Which stacks the fleet covers is
  a fact about `~/.claude/agents/`, which is **outside this repo and unreadable from a worktree** —
  the same boundary that cut M2.9's scope and shapes CR-006's FR-97. An inferred value here would be
  a claim about a directory the product cannot see.

## 4. What this costs

- **Migrations: zero expected.** Every column already exists. If FR-107 needs a derived state stored
  rather than computed, that is a build-time call, and computing it is preferred.
- **Routes: one new page route**, so the served count moves **31 → 32** and `manual-gate.sh` will
  fail until `docs/user-guide.md` covers it. **Budget the guide update into the milestone** — the
  lesson M2.8 paid ~157k tokens for and M2.9 then budgeted correctly.
- **B57 applies:** the manual gate cannot tell a fresh observation from a copied one, so re-open the
  guide's rows rather than carrying them forward.
- **The named risk is that the register is honest and empty.** Two sessions exist today, both
  `delivery-ledger`, one with a NULL stack. The register's first true answer will be "no stack has
  earned anything, and here is how little I have seen" — and FR-108 exists so that reads as a
  measurement rather than as a bug.

## 5. Milestone proposal

**M2.2 Coverage register — FR-104 to FR-109.** One milestone, dispatchable as a normal fleet run once
approved and once Q25–Q27 are ruled. Small: no schema, one route, one read layer, one screen.

## 6. Open questions — Erik answers these before any of this is built

**Q25. Does the register count every captured session, or only some?**
Today every `work_session` row comes from Mode 2 capture, so "all of them" and "Erik's hand work" are
the same set. That stops being true the moment anything else writes a session. *Why it matters:* the
hour figures feed a hiring-shaped decision. **Drafter's recommendation: count all `work_session`
rows and say on the screen that they are all Mode 2**, so the day that stops being true, the sentence
is visibly wrong instead of quietly wrong.

**Q26. What is the screen called, and where does it live?**
`coverage.ts` and the word "coverage" are already taken by requirement/test coverage (§2). *Options:*
`/stacks` titled "Stack coverage"; or `/fleet-coverage`. **Drafter's recommendation: `/stacks`,
titled "Stacks".** It names the entity rather than the judgement, and it cannot be confused with
FR-45's coverage index.

**Q27. The trigger's second limb needs a link the schema does not have.**
*"One engagement where the missing agent blocks a dated contract milestone"* requires knowing which
stack a blocked milestone needs. Nothing joins `stack` to `contract_milestone` or to `blocker`.
*Options:* (a) ship limb one only and record limb two as unmet, visibly; (b) add a nullable
`stack_id` to `blocker` so a blocker can name the stack it is waiting on; (c) drop limb two.
**Drafter's recommendation: (a) for v1** — ship what the data supports and list limb two as an
unmet clause the way M2.8's three clauses were ratified as-built, rather than adding schema to
satisfy a rule nothing has exercised yet.

## 7. Approval

**Not approved.** Drafted by Claude on 2026-08-24 at Erik's direction, after B61's closure made the
milestone possible. It amends the approved spec and needs Erik's explicit approval, recorded here
with a date, before any part of it is dispatched.

- [x] **§3 (M2.2, FR-104 to FR-109) APPROVED 2026-08-24 — Erik.**
- [x] **Q25 RULED 2026-08-24 — count every `work_session` row, and say on the screen that they are
      all Mode 2 capture.** The claim is written where a reader sees it, so the day something else
      begins writing sessions the sentence is **visibly** wrong rather than quietly wrong. Erik took
      the drafter's recommendation.
- [x] **Q26 RULED 2026-08-24 — the route is `/stacks` and the screen is titled "Stacks".** It names
      the entity rather than the judgement, and it cannot be confused with FR-45's coverage index.
      **`coverage` is not to be reused as a filename or a screen title** — `src/lib/ingest/coverage.ts`
      already means requirement and test coverage.
- [x] **Q27 RULED 2026-08-24 — ship limb one, record limb two as visibly unmet.** The trigger's
      second limb (*one engagement where the missing agent blocks a dated contract milestone*) needs
      a `stack`→`blocker` link the schema does not have. It is **not** built, **not** silently
      dropped, and **not** worked around with new schema: it is listed as an unmet clause on the
      screen and in `prod.md`, the way M2.8's three clauses were ratified as-built. Adding a column
      to satisfy a rule nothing has yet exercised was rejected.
