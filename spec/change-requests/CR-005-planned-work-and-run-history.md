# CR-005 — Planned work, fleet run history, and the limits of "all-in-one"

**Date drafted:** 2026-08-23
**Status:** **DRAFT — NOT APPROVED.** Written at Erik's direction after he asked whether the ledger
shows "what has been built from a `plan.md` and what still needs to be built", and then asked for
three things: multiple concurrent client projects, an easy view of what each fleet run did, and
"an all-in-one solution for everything I could ever need when developing apps as a one man
operation."
**Amends:** `spec-approved.md` §4.2 non-goal 4, §6, §7a. Adds FR-87 through FR-96.
**Depends on:** nothing. None of this is gated on M1.10, M2.7, or PR #1.

---

## 1. What was asked, measured against what exists

The three asks are not equally new. Two of them are partly or wholly built already, and saying so
is the point of this section — a CR that re-specifies working code is how a product grows a second
implementation of something it already has.

| Ask | State today | Verdict |
|---|---|---|
| **Multiple client projects at once** | **Already built.** `engagement` is the top-level entity, two rows exist, and **FR-44** already requires work items "listed, filtered and sorted **across every engagement in one view**". Every answer screen resolves an `engagement` and the registry lists them. | **Not a gap.** One small addition proposed in §3.3 |
| **See what each fleet run did** | **Data ingested, never rendered.** `fleet_run` carries `run_id`, `branch`, `mode`, `started_at`, `ended_at`, `dispatch_cap`, `dispatches_used`, `verdict`, `tests_passed`, `tests_failed`, `tests_skipped`, and a `gates` jsonb. **One row exists. No route renders it** — the branch serves 28 routes and none is `/runs`. | **Real gap, and the cheapest of the three** |
| **Planned vs built** | **Genuinely absent, and deliberately so.** | **Real gap, and a reversal of a stated non-goal** |

### 1.1 Why planned work is absent

Three facts, each checked rather than recalled:

1. **The spec never mentions a plan.** `plan.md`, "planning", "roadmap" and "backlog" return **zero
   matches** in `spec-approved.md`. Mode 1 ingests `manifest-<run-id>.md`, `questions-*.jsonl`,
   `checkpoint-<run-id>.md` and `spec/prod.md` (FR-14 and neighbours) — records of what the fleet
   **was dispatched to do**, never of what a plan **proposed**.
2. **A work item cannot be created by hand.** The application's complete set of server actions is
   `attributeSessionSafe`, `declareWaitSafe`, `resolveWaitSafe`, `submitEngagement`,
   `submitMilestone`, `submitMilestoneDate`, `archiveEngagementSafe`, `restoreEngagementSafe`,
   `purgeEngagementSafe`. There is no `createWorkItem`. Rows reach `work_item` only through ingest,
   session recording, unassigned-session attribution, and waits.
3. **§4.2 non-goal 4 excludes it explicitly:** *"Task assignment, sprints, cycles, or anything
   Linear does well."*

**The model is already most of the way there, which is what makes this cheap.** `work_status` is an
enum reading `pending, in_flight, done, blocked, superseded, not_dispatched, unparsed`. A thing that
has not been built yet is already a first-class state, and `/next` is already the screen that asks
for it. What is missing is not the concept. It is **any path by which a `pending` row comes into
existence.**

This is also the true reason `/next` and `/bottleneck` are empty, and it is worth separating from
**B39**. B39 is that the gate cannot tell a correctly-empty screen from broken navigation. This is
the layer beneath it: nothing is `pending`, and **nothing the operator can click will make anything
`pending`.** Between "I wrote a plan" and "the fleet ran", the ledger is blind.

---

## 2. The boundary this CR draws, and why it refuses "everything"

Erik asked for "an all-in-one solution for everything I could ever need." **This CR deliberately
does not deliver that, and the refusal is the most load-bearing paragraph in the document.**

The product's stated value is §3.1's **thirty-second bar**: from a cold start, every answer without
opening a repo, reading a manifest, or remembering anything. Two things follow that an "everything"
scope would break:

- **Every field a human must type is a field that goes stale.** The product's own thesis is that
  *a wrong `done` is the worst output this product can produce.* A tracker whose accuracy depends on
  a one-person studio remembering to update it will be wrong within a fortnight, and it will be
  wrong **confidently** — which is precisely the failure the `unparsed`-only-default rule exists to
  prevent. Linear and Jira survive manual upkeep because a team notices staleness. One person does
  not.
- **The three execution modes exist so that nothing has to be typed.** `fleet` leaves artifacts the
  product parses, `hand` is captured by a session hook Erik types nothing to trigger, `external` is
  declared once and carries its own dates. That is not an implementation detail; it is the design.

**So the bar this CR proposes in place of "everything I could ever need", and asks Erik to adopt as
the test for every future scope request:**

> **Every new surface must either (a) be populated by an artifact nobody types, or (b) be typed once
> and carry its own expiry.** And the thirty-second bar must still hold with **N clients active, not
> one.**

Planned work is the one place where (b) is genuinely justified — a plan is authored once, deliberately,
at the start of a piece of work, and it is *supposed* to be superseded. Recurring status updates are
not, and this CR does not add them.

**Out of scope here, and proposed to stay out:** time entry, sprints or cycles, sub-tasks, comment
threads, client-facing status pages, notifications, calendar integration, invoicing. §4.2's existing
non-goals stand except for the narrow slice of non-goal 4 amended in §3.1.

---

## 3. Proposed changes

### 3.1 Planned work — FR-87 to FR-91

Amends §4.2 non-goal 4 to read: *"Task assignment, sprints, cycles, or anything Linear does well —
**except that work planned but not yet dispatched is recorded, so `Next` can answer before a run
exists.**"*

- **FR-87** A `work_item` may be created with `execution_mode` unset and `status = pending` before
  any run exists. Such a row is **planned work**.
- **FR-88** Planned work is created two ways: **parsed from a plan document**, and **entered by hand
  through a form**. Both produce ordinary `work_item` rows; neither introduces a new entity.
- **FR-89** The plan parser is a pure function over text, obeys the `unparsed`-only-default rule, and
  carries a test feeding it a shape it does not recognise. A plan line it cannot classify becomes a
  row with `status = unparsed`, never a guess and never a silent omission.
- **FR-90** When an ingested run reports a work unit that a planned row already describes, the two
  **reconcile onto the planned row** rather than producing a second one. The reconciliation key is
  declared in §6 Q13 and is **not** inferred from prose similarity.
- **FR-91** A planned row that no run has claimed is visibly distinguishable on every screen that
  shows it, so "nobody has started this" never reads as "this is in flight."

### 3.2 Fleet run history — FR-92 to FR-95

The data is already ingested. This is a rendering change plus one list query.

- **FR-92** `/runs` lists every ingested fleet run across every engagement, newest first, showing
  run id, engagement, branch, mode, verdict, duration, dispatches used against cap, and the test
  triple.
- **FR-93** `/runs/[run-id]` shows one run: its work units and their outcomes, the questions it
  queued, the defects it opened, the requirements it touched, and its `gates` payload rendered
  rather than dumped.
- **FR-94** Every run row and detail view states its own unparsed count, per FR-58.
- **FR-95** A run's verdict is emitted exactly as the artifact recorded it. Where the manifest and
  the checkpoint disagree, **both are shown** — this is the standing rule that `manifest-cd414c.md`
  marking `u4` pending while `checkpoint-cd414c.md` says it merged is data, not a defect to
  reconcile away.

### 3.3 Engagement scoping — FR-96

FR-44 already puts every engagement in one view, which is the correct default for a one-person
studio and stays the default.

- **FR-96** Every answer screen and record list accepts an optional engagement filter, expressed in
  the URL so a filtered view is a link. **The unfiltered cross-engagement view remains the default**
  and no screen becomes engagement-mandatory.

---

## 4. What this costs

- **No new entity, and therefore no new §7a classification row.** Planned work is a `work_item`;
  run history renders `fleet_run`, which is already classified. This is deliberate: an entity with
  no §7a row is a blocker, not a default, and avoiding one keeps the 21-entity `security-gate.sh`
  PASS intact.
- **One migration at most** — nullable columns on `work_item` to mark a row as planned and to carry
  its plan provenance. No column is dropped and no cascade changes.
- **`/runs` and `/runs/[id]` take the served-route count from 28 to 30**, which means
  `manual-gate.sh` will fail until `docs/user-guide.md` covers both. That is the gate working. Budget
  the doc update into the same milestone rather than discovering it at merge.
- **The plan parser is the risk.** Plan documents are freer in shape than a manifest table, and the
  temptation to widen a regex until a stubborn line classifies is exactly the failure the
  `unparsed` rule names. Expect `unparsed` to be non-zero on the first real plan and treat that as
  the parser working.
- **FR-90's reconciliation is the part most likely to produce a false `done`.** Getting it wrong
  double-counts, and a double-counted work item makes `Next` and `Committed` both lie. If Q13 cannot
  be answered cleanly, ship FR-87 to FR-89 and hold FR-90 rather than guessing a key.

---

## 5. Milestone proposal

- **M2.8 — Fleet run history** (FR-92 to FR-95). Smallest, entirely additive, no schema change, and
  it delivers the ask that has data sitting unused today. Good fleet candidate.
- **M2.9 — Planned work** (FR-87 to FR-91, FR-96). Needs Q12 to Q15 answered first.

Ordering them this way puts the cheap visible win first and keeps the schema change behind the
questions that shape it.

---

## 6. Open questions — Erik answers these before any of this is built

- **Q12 — What is a plan document here?** The `writing-plans` skill's output? A freeform `plan.md`?
  Both? A parser needs a named shape, and "whatever Erik writes" is not one. *Recommendation:* target
  the `writing-plans` output first, since it is already structured and is what the fleet consumes.
- **Q13 — What key reconciles a planned row with an ingested work unit?** An explicit id the plan
  carries and the manifest echoes is the only version that cannot silently mismatch. Title similarity
  will produce a wrong `done`. *Recommendation:* require an explicit id; where absent, leave both rows
  and mark the collision rather than merging.
- **Q14 — Does hand-entered planned work belong to an engagement at creation, or can it be
  unassigned?** `work-items/unassigned` and an `unassigned` engagement already exist, so there is a
  precedent either way. *Recommendation:* allow unassigned, reusing the existing queue.
- **Q15 — Does a planned row expire?** Per §2's bar, a typed row should carry its own expiry. A plan
  item untouched for N days could surface as stale rather than sitting silently in `Next` forever.
  *Recommendation:* yes, and surface staleness rather than deleting anything.
- **Q16 — Does `/runs` show runs from other clients' repos?** Every ingested run today comes from this
  repo. A run belonging to another engagement carries that engagement's branch names and unit
  descriptions. *Recommendation:* yes, scoped by engagement, since cross-engagement in one view is
  the product's existing posture.

---

## 7. Approval

Unapproved. Nothing in this document is built, and no code or schema changes on its account until
Erik rules on Q12 to Q16 and on §2's proposed bar.

Two things are worth ruling on separately, because they are severable: **§3.2 needs none of the
questions answered** and could be approved on its own today; **§3.1 should not start before Q13**.
