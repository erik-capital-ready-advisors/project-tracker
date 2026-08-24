# CR-005 — Planned work, fleet run history, and the limits of "all-in-one"

**Date drafted:** 2026-08-23
**Status:** **§3.2 APPROVED 2026-08-23 — BUILT as M2.8, COMPLETE 2026-08-24** (three clauses ratified as-built and unmet; see `prod.md`). **§3.1 AND §3.3 BOTH APPROVED 2026-08-24 by Erik — planned work (FR-87 to FR-91) and engagement scoping (FR-96, FR-96a, FR-96b, FR-96c), together as milestone M2.9**, on the back of his rulings on **Q12 to Q19**. **§2's bar is ADOPTED AS WRITTEN (Q20)**, as guidance with force rather than as an enforceable gate. **Q12 to Q20 are all RESOLVED in §6 — this CR has no open questions left, and every section of it is now either approved or explicitly out of scope.** Written at Erik's direction after he asked whether the ledger
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
the test for every future scope request — ADOPTED AS WRITTEN 2026-08-24 by Erik (Q20):**

> **Every new surface must either (a) be populated by an artifact nobody types, or (b) be typed once
> and carry its own expiry.** And the thirty-second bar must still hold with **N clients active, not
> one.**

**This is now the standing test every future scope request is measured against**, and it cost
nothing retroactively: §3.1 as ruled already clears it — Q15's 30-day expiry is exactly limb (b) —
and §3.3 clears it under limb (a), a filter being a view over ingested data with no typed field at
all. **Adopted as guidance with force, not as a gate script.** Erik declined the enforceable
variant, so no CR fails review automatically on this ground; it is argued, not asserted. **The first
real test will be the one that hurts** — a surface that is genuinely useful, genuinely typed, and
genuinely has no natural expiry. This paragraph exists so that request meets the bar as a written
rule rather than as a recollection.

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
  any run exists. Such a row is **planned work**. **Amended by the Q14 ruling 2026-08-24: a planned
  row carries an `engagement_id` at creation. There is no unassigned planned row** — the
  `work-items/unassigned` queue stays what it is today, a destination for *ingested* sessions that
  could not be attributed, and never becomes a parking space for things nobody has scoped.
- **FR-88** Planned work is created two ways: **parsed from a plan document**, and **entered by hand
  through a form**. Both produce ordinary `work_item` rows; neither introduces a new entity. **Both
  paths require an engagement**, per FR-87 as amended.
- **FR-89** The plan parser is a pure function over text, obeys the `unparsed`-only-default rule, and
  carries a test feeding it a shape it does not recognise. A plan line it cannot classify becomes a
  row with `status = unparsed`, never a guess and never a silent omission. **Scoped by the Q12
  ruling 2026-08-24 to the `writing-plans` output shape** — `### Task N: <title>` headings with
  `- [ ]` steps — which is what `plan.md` in this repo already is and what the fleet already
  consumes. A document not of that shape is not a plan document; it is not partially parsed.
- **FR-90** When an ingested run reports a work unit that a planned row already describes, the two
  **reconcile onto the planned row** rather than producing a second one. **The reconciliation key,
  ruled at Q13 on 2026-08-24, is an explicit id the plan carries and the manifest echoes. Where the
  id is absent on either side, BOTH rows stand and the collision is marked — never merged.**
  Prose similarity is excluded absolutely.

  **§3.1a — FR-90 splits, and M2.9 builds only the near half.** Measured 2026-08-24 rather than
  assumed: **no artifact carries such an id today.** `plan.md` heads its tasks `### Task 5: Parse the
  work-unit table` — positional numbering that shifts the moment a task is inserted — and
  `manifest-9a320b.md` has no per-unit plan-id field at all. The two artifacts share **zero** keys.
  Both templates live in `~/.claude/agents/templates`, **outside this repo**, so a worktree-isolated
  fleet run cannot reach them.

  - **M2.9 builds the read side, and it is complete and correct on its own.** The parser accepts an
    explicit id where one is present and **marks a collision where one is absent**. Because no plan
    carries an id today, **every reconciliation marks rather than merges** — which is exactly what
    Q13 ruled, and it yields a false `done` rate of **zero by construction** rather than by care.
  - **Emitting the id is a separate change to the plan and manifest templates**, outside this repo
    and outside this milestone. Until it lands, FR-90 is honestly *"holds, merges nothing"*. That is
    a stated limitation, **not an unmet clause** — the requirement as ruled is satisfied.
  - **Do not close this gap by widening the key.** The pressure, when the first real plan produces
    all-collisions-no-merges, will be to fall back on titles. That is the wrong `done` this CR was
    written to prevent, and §4 already names it as the likeliest way to break `Next` and
    `Committed` at once.
- **FR-91** A planned row that no run has claimed is visibly distinguishable on every screen that
  shows it, so "nobody has started this" never reads as "this is in flight." **Extended by the Q15
  ruling 2026-08-24: a planned row untouched for 30 days surfaces as STALE.** Staleness is
  **derived from a timestamp, never stored as a status** — nothing transitions, nothing is deleted,
  and CR-002's append-only ruling is untouched. The 30-day boundary is computed from a date passed
  in, never from `new Date()` inside, so the rule stays testable and deterministic like every other
  rule in `src/lib/ingest/`.

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

**APPROVED 2026-08-24 by Erik, on his rulings on Q17 to Q19. FR-96 rejoins M2.9.**

FR-44 already puts every engagement in one view, which is the correct default for a one-person
studio and stays the default.

- **FR-96** Every answer screen and record list accepts an optional engagement filter, expressed in
  the URL so a filtered view is a link. **The unfiltered cross-engagement view remains the default**
  and no screen becomes engagement-mandatory.
- **FR-96a — the FR-58 badge states its scope (Q17, ruled 2026-08-24).** The unparsed count in the
  app shell **stays ledger-wide** under a filter and **labels itself as such** when one is active —
  *"3 unparsed (whole ledger)"*. **This extends FR-58, it does not violate it.** FR-58 requires the
  count on every surface, and `app-shell.tsx` mounts it in the chrome precisely so that is
  structural rather than a rule each screen remembers; the label is what keeps a ledger-wide number
  from reading as a scoped one. **The failure being prevented is already on the record:** M2.8
  logged a run's own unparsed count disagreeing with the global badge (badge 0, run `b0952e` 1). A
  filtered list under an unlabelled global count is that same disagreement one layer up.
- **FR-96b — one picker, in the shell (Q18, ruled 2026-08-24).** Every list screen honours the URL
  parameter, and **a single engagement picker lives in the app shell** beside the unparsed badge.
  It is not built eleven times on eleven screens — the same structural argument `app-shell.tsx`
  already makes for the badge. Because the state is the URL, the filter survives navigation and a
  filtered view is copy-pasteable, which is FR-96's own stated point.
- **FR-96c — an unresolvable filter renders nothing, loudly (Q19, ruled 2026-08-24).** A slug naming
  no engagement — mistyped, or purged — renders an **explicit "no such engagement" state with no
  rows**. It **never silently falls back to the unfiltered view.** A screen that looks scoped while
  showing everything is the same class of lie as a wrong `done`, and the whole product is built
  against that class.

**Decided rather than asked, and written down so they are not silent defaults:**

1. **Which surfaces take the filter:** the answer screens and record lists — `/next`,
   `/committed`, `/broken`, `/bottleneck`, `/blocked`, `/untested`, `/work-items`, `/questions`,
   `/waits`, `/runs`, `/registry`. **`[id]` detail views do not**, because a detail view already
   *is* one record and filtering it can only produce a page that hides itself. Eleven of these
   screens already read `searchParams`, which is why FR-96 is cheap.
2. **Archived engagements:** the picker lists **active engagements only**, but a URL naming an
   archived-not-purged engagement **still resolves and filters**. A permalink should not rot because
   the engagement was tidied away. A *purged* engagement has no slug left to resolve and falls to
   FR-96c.
3. **No hidden stickiness.** No cookie, no session-stored last filter. The URL is the entire state,
   which is what makes a filtered view a link; a filter that persisted invisibly across navigation
   would mean two operators on the same URL see different data.
4. **Served routes stay 30.** A query parameter is not a route, so `manual-gate.sh`'s count is
   unaffected — but **the guide still needs a filter section**, and that is budgeted into M2.9
   rather than discovered at merge. M2.8 paid ~157k tokens to learn that the expensive way.

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
  **→ BUILT. COMPLETE 2026-08-24.**
- **M2.9 — Planned work** (FR-87 to FR-91, FR-96). Needs Q12 to Q15 answered first.
  **→ Q12 to Q20 ALL ANSWERED 2026-08-24; §3.1 AND §3.3 both APPROVED; M2.9 is dispatchable.
  Final scope: FR-87 to FR-91, plus FR-96 with FR-96a, FR-96b and FR-96c.** FR-96 was briefly
  dropped earlier the same day — §3.3 being unapproved at that point, and bundling unapproved text
  into an approved milestone is how a fleet ends up building spec nobody ruled on — then **restored
  hours later when Erik ruled Q17 to Q19 and approved §3.3.** The milestone therefore ends up
  exactly where §5 proposed it on the day this CR was drafted. **The detour is recorded rather than
  tidied away, because it arrived back here by approval instead of by assumption, and in a diff a
  month from now those two are indistinguishable.**

Ordering them this way puts the cheap visible win first and keeps the schema change behind the
questions that shape it.

---

## 6. Open questions — Erik answers these before any of this is built

**Q12 to Q15 are all RESOLVED as of 2026-08-24**, ruled in one sitting, and that is what unblocked
§3.1. Each is recorded ruling-first with its original text kept beneath, so a later reader can see
what was asked as well as what was decided. **Q16 was already resolved at §3.2's approval.**

- **Q12 — What is a plan document here?** **RESOLVED 2026-08-24: the `writing-plans` output shape
  only** — `### Task N: <title>` headings carrying `- [ ]` steps. That is already what `plan.md` in
  this repo is and already what the fleet consumes, so the parser targets a shape that exists rather
  than one that has to be invented. A file not of that shape is **not a plan document**: it is not
  partially parsed, and it does not produce a page of `unparsed` rows. Folded into FR-89.
  *Original text and recommendation:* The `writing-plans` skill's output? A freeform `plan.md`?
  Both? A parser needs a named shape, and "whatever Erik writes" is not one. *Recommendation:* target
  the `writing-plans` output first, since it is already structured and is what the fleet consumes.
- **Q13 — What key reconciles a planned row with an ingested work unit?** **RESOLVED 2026-08-24: an
  explicit id the plan carries and the manifest echoes. Where the id is absent on either side, BOTH
  rows stand and the collision is marked. Nothing merges without one.** Prose similarity is excluded
  absolutely. **This ruling was checked against the artifacts before it was recorded, and the check
  changed what M2.9 builds:** no artifact carries such an id today — `plan.md` numbers its tasks
  positionally (`### Task 5:`), `manifest-9a320b.md` has no plan-id field — so plan and manifest
  share **zero** keys, and both templates live outside this repo in `~/.claude/agents/templates`.
  **FR-90 therefore splits; see §3.1a.** M2.9 builds the read side, which marks every collision and
  merges nothing — correct by construction rather than by care.
  *Original text and recommendation:* An explicit id the plan
  carries and the manifest echoes is the only version that cannot silently mismatch. Title similarity
  will produce a wrong `done`. *Recommendation:* require an explicit id; where absent, leave both rows
  and mark the collision rather than merging.
- **Q14 — Does hand-entered planned work belong to an engagement at creation, or can it be
  unassigned?** **RESOLVED 2026-08-24: an engagement is REQUIRED at creation. There is no unassigned
  planned row.** This went against the drafting recommendation, and the reasoning is worth keeping:
  `work-items/unassigned` exists to hold *ingested* sessions that could not be attributed — work that
  certainly happened, to an owner the parser could not determine. Planned work is the opposite case.
  It has not happened, and whoever creates it is the one person who knows whose it is. Letting it
  land unassigned would merge two queues that mean different things and quietly grow a backlog nobody
  owns. Folded into FR-87 and FR-88.
  *Original text and recommendation:* `work-items/unassigned` and an `unassigned` engagement already
  exist, so there is a precedent either way. *Recommendation:* allow unassigned, reusing the existing
  queue.
- **Q15 — Does a planned row expire?** **RESOLVED 2026-08-24: yes — STALE at 30 days untouched,
  surfaced and never deleted.** This is the clause that makes planned work meet §2's own bar: typed
  once, carrying its own expiry, which is the only ground on which §2 admitted a typed field at all.
  Staleness is **derived from a timestamp, never stored as a status** — nothing transitions and
  nothing is deleted, so CR-002's append-only ruling is untouched. Folded into FR-91.
  *Original text and recommendation:* Per §2's bar, a typed row should carry its own expiry. A plan
  item untouched for N days could surface as stale rather than sitting silently in `Next` forever.
  *Recommendation:* yes, and surface staleness rather than deleting anything.
- **Q16 — Does `/runs` show runs from other clients' repos?** **RESOLVED at approval, 2026-08-23: yes.** This question belonged to the approved §3.2 and the drafting summary wrongly called §3.2 question-free. It needed no separate ruling in the end because **FR-92 already says "across every engagement"** — approving §3.2 approved that reading. Recorded rather than quietly dropped, because a question that dissolves on inspection and one that was never asked look identical later.
  *Original text and recommendation:* Every ingested run today comes from this
  repo. A run belonging to another engagement carries that engagement's branch names and unit
  descriptions. *Recommendation:* yes, scoped by engagement, since cross-engagement in one view is
  the product's existing posture.

**Q17 to Q20 were raised on 2026-08-24**, after Erik asked what would be needed to pull §3.3 and §2's
bar into the build rather than leave them behind. They were not in the original drafting — §3.3 was
written as though "an optional engagement filter" settled itself, and it does not. **All four are
RESOLVED the same day.**

- **Q17 — Under a filter, what does the global FR-58 unparsed badge count?** **RESOLVED 2026-08-24:
  ledger-wide, and it says so.** Folded into FR-96a. The badge keeps FR-58's always-visible alarm —
  which is precisely what breaks if it goes filter-scoped, since heads-down in one client is exactly
  when unparsed rows elsewhere go unnoticed — and labels its scope so the number cannot be misread
  as belonging to the filtered list. *Why this was asked at all:* `app-shell.tsx` mounts the count in
  the chrome for every screen, so a filter would have put a ledger-wide number above a scoped list
  **by default and silently**. M2.8 already logged that exact disagreement one layer down.
- **Q18 — Does M2.9 build a control, or only honour the URL?** **RESOLVED 2026-08-24: both — the
  parameter on every list screen, and one picker in the app shell.** Folded into FR-96b. FR-96's
  "expressed in the URL so a filtered view is a link" fixes the *state model* and says nothing about
  the *control surface*; that gap was the question. One shell control rather than eleven per-screen
  ones, on the same argument `app-shell.tsx` already makes for the badge.
- **Q19 — What renders when the slug resolves to nothing?** **RESOLVED 2026-08-24: an explicit "no
  such engagement" state with no rows. Never a silent fall-back to unfiltered.** Folded into FR-96c.
  A screen that looks scoped while showing everything is the same class of lie as a wrong `done`.
- **Q20 — Is §2's bar adopted?** **RESOLVED 2026-08-24: adopted as written**, not as an enforceable
  gate. See §2. Costs nothing retroactively — §3.1 clears it under limb (b), §3.3 under limb (a).

---

## 7. Approval

**§3.2 — APPROVED 2026-08-23 by Erik. BUILT as M2.8, COMPLETE 2026-08-24.** FR-92 to FR-95.
Additive, no schema change, no new entity, and it renders `fleet_run` data that had been ingested
and unused since it first landed. Q16 resolves by construction through FR-92's own wording.
**Three clauses were ratified as-built and are recorded as UNMET rather than satisfied** — FR-93's
"the defects it opened", FR-92's "dispatches used against cap", and `/runs/[run-id]` addressing a
run unambiguously. See the Decisions log in `prod.md`.

**§3.1 — APPROVED 2026-08-24 by Erik.** FR-87 to FR-91, to be built as **M2.9 — Planned work**.
Approved on the back of his rulings on **Q12 to Q15**, which were the stated gate. The four rulings
are folded into the requirement text rather than left in §6 to be cross-referenced: Q12 into FR-89
(the `writing-plans` shape only), Q13 into FR-90 and the new **§3.1a**, Q14 into FR-87 and FR-88
(engagement required at creation — Erik overrode the drafting recommendation), Q15 into FR-91
(stale at 30 days, surfaced, never deleted).

**The Q13 ruling was verified against the artifacts before this approval was written, and the
verification changed the milestone's scope.** Plan and manifest share no key today, and neither
template lives in this repo, so **M2.9 builds the read side of FR-90 only** — it marks collisions
and merges nothing, which is what the ruling requires and which makes a false `done` impossible by
construction. Emitting the id is separate work on the plan and manifest templates, and until it
lands FR-90 is honestly *"holds, merges nothing"*: a stated limitation, **not an unmet clause**.

**§3.3 — APPROVED 2026-08-24 by Erik, later the same day.** FR-96, joined by **FR-96a, FR-96b and
FR-96c** carrying his rulings on **Q17 to Q19**. It rejoins **M2.9**, which is where CR-005 §5 put it
at drafting. Cross-engagement-in-one-view already works via FR-44 and **stays the default**; FR-96
adds the optional URL-expressed filter on top, and eleven of the affected screens already read
`searchParams`, so the plumbing exists.

**The question that mattered here was not the filter — it was the badge.** `app-shell.tsx` mounts
the FR-58 unparsed count in the chrome, deliberately, so that "on every surface" is structural
rather than a rule six screens remember. Adding a filter would therefore have put a **ledger-wide
number above a scoped list, silently, on every screen at once** — which is the disagreement M2.8
already logged one layer down (global badge 0, run `b0952e` 1). FR-96a settles it: the badge stays
ledger-wide, keeping FR-58's alarm, and **states its scope** when a filter is on.

**§2's bar — ADOPTED AS WRITTEN 2026-08-24 by Erik (Q20).** See §2. Adopted as guidance with force,
**not as an enforceable gate** — Erik declined the variant that would fail a CR automatically. It
cost nothing retroactively: §3.1 clears it under limb (b) via Q15's expiry, §3.3 under limb (a), a
filter being a view over ingested data with no typed field at all.

**Still unapproved, and unchanged by any of this:**

- **A `fleet_run_id` column on `defect`**, which would actually deliver FR-93's unmet clause. Wants
  its own CR. **Do not build FR-93 on `source_key` string-parsing** — B47 made a run→defect
  association *derivable* from a key, but a key is not a foreign key.
- **Everything §2 lists as out of scope** — time entry, sprints or cycles, sub-tasks, comment
  threads, client-facing status pages, notifications, calendar integration, invoicing. Now that §2's
  bar is adopted, **that list is not merely a preference; each of those has to clear the bar to come
  back**, and most of them cannot.
