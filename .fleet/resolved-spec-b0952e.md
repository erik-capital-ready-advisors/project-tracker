<!-- RESOLVED BUILD SPEC — generated artifact, do not edit by hand. Source of truth stays in spec/. -->

# RESOLVED SPEC — run b0952e

**Base spec:** `spec/spec-approved.md` — client-approved 2026-08-17, byte-identical to `spec-v1.md`.
**Change requests applied, in `CR-NNN` integer order:**

1. `spec/change-requests/CR-001-defects-regressions-releases.md` — **APPROVED 2026-08-18 by Erik.**
   Adds FR-63–FR-79. Takes the data model from 18 to 21 entities (`defect`, `release`,
   `release_requirement`) and adds five provisioning-identifier columns to `engagement`.
   Adds a sixth answer, **Broken** (FR-71, FR-72). Amends §7a with four classification rows and
   two stated exceptions. Answers Q8 as `contested` (FR-79). Amends milestones M1.1, M1.4, M1.8,
   M1.9. Routes four audit-found gaps to Phase 2 (§4.3 items 7–10).

**Conflict rule applied:** the highest-numbered approved CR wins. CR-001 wins over
`spec-approved.md` wherever the two differ.

**Not applied, and why:** nothing. CR-001 is the only change request on disk and it is approved.

**Prior build state folded in from `spec/prod.md` (2026-08-18):** M1.0 Provisioning is **Done and
verified by observation** — Supabase project `onpvolboecjpdkvurjaf` in org `whneklkrjsulgqzqxsks`,
Vercel team `team_J6J1LAU19znwJenYFKgVArEV`, `disable_signup` verified true, database inventoried
empty. **No work-unit in this run re-provisions anything.** M1.1–M1.10 are Not Started. Phase 2
(M2.x) and Phase 3 (M3.x) are out of scope for this run.

**Standing environment facts a specialist must not rediscover:**

- An event-trigger function `public.rls_auto_enable()` already exists on the database and forces
  RLS on every new `public` table. **This build did not write it.** Any RLS verification must
  therefore assert the **policy**, never the flag — the flag reads true whether or not a policy
  exists.
- Every new function in schema `public` needs an explicit **per-name `REVOKE` from `PUBLIC`**.
  `ALTER DEFAULT PRIVILEGES` does not close it; measured in this practice, not inferred.

---

# Project Specification: Delivery Ledger

**Client:** Capital Ready Advisors (Erik Meltzer — operator, sole user)
**Prepared:** 2026-08-17
**Spec version:** v1 — pending Erik's approval, then promoted byte-for-byte to `spec-approved.md`
**Repo:** github.com/erik-capital-ready-advisors/project-tracker (private)
**Build mode:** autonomous fleet (`/build-from-spec`)

---

## 1. Executive Summary

Delivery Ledger is a single-operator delivery tracker for a one-person studio running concurrent client builds across several stacks. Work in this studio gets executed three ways — an autonomous agent fleet, Erik hand-prompting Claude, and external waits nobody controls — and today only the first leaves any trace on disk. The product's job is to give all three the same trace quality, then answer five questions off the result: what's blocked, what's next, what was committed to a client and when, what's untested, and what Erik is personally the bottleneck on.

It answers those questions in a browser in under thirty seconds and over an authenticated JSON API for an agent. It does not replace Linear, Notion or TestRail; it makes the join those tools do not make, between an executor, a certifier, a contract milestone and a stack.

---

## 2. What the Client Showed Us

Erik supplied a written brief and pointed at the artifacts his existing fleet already produces. The brief's opening line is the design constraint the rest of this spec answers: work is executed three ways, "all three have to be first-class; today only the first leaves any trace."

The fleet's own output was read directly rather than described. One engagement's `.fleet/` directory holds 1.0 MB across 26 files. `manifest-cd414c.md` carries a work-unit table with the right columns — ID, Type, Phase, Dispatched-to, Depends-on, Status — and then puts a five-fact paragraph in the Status cell. The single machine-readable artifact, `questions-*.jsonl`, holds 45 records across six files in six different record shapes, of which three are answered and only one file carries an `answered_by` field. That spec defines 61 numbered requirements and the branch carries 925 unit tests and 38 Playwright specs, with no mapping between them.

The distinctions Erik asked for already exist in that prose, and they are sharp. The manifest separates work "not dispatched, with reasons — these are decisions, not gaps" from a Defer list. The checkpoint separates evidence "OBSERVED, against a host that no longer exists" from evidence "NOT VERIFIED against the deployment," and warns against flattening them in either direction. The fleet reasons correctly and writes its reasoning where only a human reader with forty minutes can use it.

Erik also stated two build constraints directly: the product must be built by his own fleet, which covers Next.js, Supabase and Vercel only, and it must ship with encryption and sound security practice.

---

## 3. Goals & Success Criteria

1. **The thirty-second bar.** From a cold start, Erik answers all six questions — blocked, next, committed, untested, bottleneck, **broken** (CR-001 FR-71) — without opening a repo, reading a manifest, or remembering anything.
2. **The same answers programmatically.** Every one of those six is a JSON endpoint an agent can call with a scoped token.
3. **All three execution modes leave a trace, and Erik types no status to produce it.** Fleet work is parsed from artifacts, hand-prompted work is captured by a session hook, external waits are declared once and then carry their own dates.
4. **No work item exists without an executor.** Where work is unautomated, the reason is recorded as a class, and a gap Erik is carrying is distinguishable from a decision made against it by a query rather than by reading.
5. **No agent certifies its own work.** A requirement is covered only when a passing test carries a certifier other than the executor of the work item implementing it.
6. **An invoice is derived, never asserted.** A contract milestone becomes billable only when every acceptance criterion it names is independently certified.
7. **The build's own record is the first acceptance test.** This repo is a fleet build; its `.fleet/` artifacts and `spec/prod.md` are ingested by the product it produces.

---

## 4. Scope

### 4.1 In Scope (This Engagement)

1. Single-operator authenticated web application, plus a scoped-token JSON API for agents.
2. Ingest of fleet artifacts: `manifest-<run>.md` work-unit and blocked tables, `questions-*.jsonl`, `checkpoint-<run>.md` header fields, and `spec/prod.md` milestone and blocker sections.
3. Capture of hand-prompted Claude sessions through a Claude Code session hook, with zero typing by Erik.
4. Declaration and tracking of external wall-clock waits, including their contribution to delivery dates.
5. A unified work-item model spanning all three execution modes, with executor, non-automation reason class, and carried-versus-closed disposition.
6. Contract registry: engagements, milestones, acceptance criteria expressed as requirement ids, and invoice state.
7. Requirement-to-test traceability with an independent-certifier rule, over the harnesses the fleet already runs.
8. The six answers, as screens and as endpoints (CR-001 FR-71, FR-72).
9. Column encryption on commercial and client-descriptive data, row-level security on every table, an append-only audit log, and full export.

### 4.2 Out of Scope

1. Time tracking with timers. Durations come from artifacts and session hooks.
2. Moving money. Invoice submission and payment stay in Upwork and Stripe; this product records two dates and an amount.
3. Multi-user, teams, roles beyond operator and agent. There is one human.
4. Task assignment, sprints, cycles, or anything Linear does well.
5. Client-facing status pages.
6. Editing spec or manifest artifacts. Ingest is read-only against source repos.
7. Native mobile applications.

### 4.3 Deferred (Phase 2+)

1. Automated probes for external waits — App Store Connect, DNS, deploy state, inbox arrival.
2. Fleet-coverage register with a live trigger rule for when a stack has earned a specialist.
3. Estimate-versus-actual rollups and the bid table.
4. Critical-path computation weighted by Erik's own serial time.
5. Per-surface harness evidence beyond code tests: Detox, manual device scripts, store review outcomes.
6. Read-only mirror into Linear or Notion.
7. *(CR-001 §6)* Ingest of `spec/change-requests/*.md` across engagements, plus a lightweight intake state for client requests that are not yet CRs.
8. *(CR-001 §6)* Notifications: a daily digest and threshold alerts (overdue wait, milestone at risk, new critical defect) over email or Slack.
9. *(CR-001 §6)* Cost per fleet run and per engagement — token and subscription spend beside M2.3's time-based estimate-versus-actual.
10. *(CR-001 §6)* Recurring obligations: renewals, cert expiry, scheduled maintenance — external waits that re-arm on resolution instead of closing.

---

## 5. User Personas & Primary Flows

### Persona A: Erik — operator, sole human user

Runs concurrent client builds. Technical. Opens this product between sessions, on a phone as often as a laptop, usually to decide what to do next or to answer a client asking where something stands.

**Flow A1 — The morning read.** Signs in. The dashboard shows five panels, one per question. Blocked is grouped by owner so the rows he owns are separated from the rows a client or a vendor owns. He reads it and closes the tab.

**Flow A2 — Answering a client.** Opens Committed, filters to one engagement, and reads back the milestone, its acceptance criteria, its due date, and whether it is billable. Every criterion shows the test that covers it and who certified it.

**Flow A3 — Declaring a wait.** A build stops because an App Store review has started or a client owes feedback. He declares the wait with an owner and an expected-by date, links it to the work it blocks, and the affected milestone's projected date moves.

**Flow A4 — Reviewing his own bottleneck.** Opens Bottleneck. Sees only work whose executor is him — decisions no agent can take, and stacks with no agent — ordered by how much downstream work each unblocks.

### Persona B: A build agent — fleet specialist or a hand-prompted Claude session

Calls the API with a scoped token. Reads the same five answers as JSON to orient before working. Writes back at the end of a session or a run. Never reads commercial figures.

**Flow B1 — Orientation.** `GET /api/answer/next?engagement=<id>` before starting work, so the agent picks up what is actually ready rather than what its prompt happened to name.

**Flow B2 — Session capture.** At the end of a hand-prompted session, the Claude Code session hook posts a work-session record: which engagement, how long, which stack, what changed, and a one-line summary. Erik types nothing.

**Flow B3 — Run ingest.** At the end of a fleet run, the run's artifacts are posted for parsing. Work items, questions, blockers and test counts land in one call.

---

## 5a. Design Direction

### Aesthetic positioning

An instrument panel, not a project management app. It is read in ten-second glances between other work, so density and state legibility beat whitespace and delight. The nearest reference points are a build dashboard and a flight strip — one screen, five answers, state encoded in form as well as in number.

### Reference points

Linear's keyboard-first speed and typographic restraint; Vercel's observability dashboards for density and state chips; the fleet's own gate output (`ok` / `FAIL` lines in a fixed column) as the vocabulary for status, since it is the language Erik already reads.

### Preserve from the MVP

No MVP exists. The closest existing artifact is the manifest work-unit table, and its column set — id, type, executor, depends-on, status — is worth preserving as the shape of a work-item row, because it is already the mental model.

### Rebuild from the MVP

Not applicable.

### Component library

shadcn/ui on Tailwind CSS v4. Tables, badges, dialogs, tabs, and a command palette. No charting library in Phase 1; the register and bid table in Phase 2 decide whether one is earned.

### Typography direction

One sans for the interface and one monospace for identifiers, durations and status tokens. Work-unit ids, run ids, requirement refs and dates are monospace with tabular figures throughout, because they are read in columns and compared.

### Color direction

Neutral ground with a single accent. Semantic state colors are a separate scale from the accent and carry meaning consistently across every surface: verified, carried, blocked, decided-against, and unparsed each keep one color everywhere they appear. Both light and dark themes are first-class.

### Motion direction

Minimal. Transitions on state change only. No entrance animation on a dashboard that is opened forty times a day.

### Approved design

Approved design: NOT YET APPROVED

---

## 6. Functional Requirements

### 6.1 Operator access and agent credentials

- **FR-1** The application has no public signup. The single operator account is provisioned by hand, and `disable_signup` is set on the Supabase project at provisioning time.
- **FR-2** Multi-factor authentication is required for the operator account, and it is enforced in row-level security rather than only in the application layer.
- **FR-3** A brand-new account, should one ever exist, receives no role and can read no table. Role elevation is a deliberate administrative act and is written to the audit log.
- **FR-4** Agents authenticate with bearer tokens, not with the operator's session. A token names a capability set, carries an expiry, and is stored hashed.
- **FR-5** Two capabilities exist: `answer:read`, which may call the five answer endpoints, and `ingest:write`, which may post artifacts, sessions and waits. Neither may read commercial figures.
- **FR-6** Every token use is written to the audit log with the capability, the endpoint and the outcome.
- **FR-7** Tokens are revocable and rotatable from the interface without a deploy.
- **FR-8** All ingest and answer endpoints are rate-limited per token.

### 6.2 Engagement and contract registry

- **FR-9** Erik registers an engagement: client, how the work was sourced, contract type, status, the source repository path, and the stacks it uses.
- **FR-10** An engagement carries zero or more contract milestones, each with a name, an amount, a due date, and a list of requirement references that constitute acceptance.
- **FR-11** A milestone records a submitted date and a paid date, each entered in one action.
- **FR-12** Requirement references on a milestone resolve against requirements ingested from that engagement's spec. A reference naming a requirement that does not exist is reported rather than silently accepted.
- **FR-13** Engagement and milestone records are the only data Erik types. Every other record in the system is captured or derived.

### 6.3 Mode 1 — fleet artifact ingest

- **FR-14** The system parses a fleet run's `manifest-<run-id>.md` work-unit table into work items, preserving id, type, phase, description, dispatched-to, depends-on and the raw status text.
- **FR-15** The system classifies each work-unit status paragraph into one of: pending, in flight, done, blocked, superseded, not dispatched. A paragraph it does not recognize is stored as `unparsed` and surfaced as a count on every screen. It is never defaulted to a status.
- **FR-16** Work-item identifiers are scoped by engagement and run. Two runs in the same repository may each define a unit called `i1` and they remain distinct records.
- **FR-17** The system parses the manifest's Blocked table into work items and the blockers they name.
- **FR-18** The system parses `questions-*.jsonl` from every shape the fleet has emitted into one normalized question record with an answer, an answering party, and an open-or-answered status.
- **FR-19** The system parses the requirement references named in a work unit's description, expanding ranges, so a work item knows which requirements it implements.
- **FR-20** The system parses `spec/prod.md`'s milestone tracker and active blockers.
- **FR-21** The system parses a run's reported test counts and gate outcomes from its checkpoint and QA report.
- **FR-22** Ingest is idempotent. Posting the same run twice produces the same records, not duplicates.
- **FR-23** Ingest never writes to the source repository.

### 6.4 Mode 2 — hand-prompted session capture

- **FR-24** A Claude Code session hook posts a work-session record when a session ends. The record carries the working directory, the engagement it resolves to, start and end times, the stack worked in, files changed, commits made, and a one-line summary the session writes.
- **FR-25** The hook installs from a documented snippet and requires no action from Erik during a session.
- **FR-26** A session that resolves to no known engagement is stored against an `unassigned` engagement and listed for Erik to attribute in one click, rather than discarded.
- **FR-27** A work session may be posted mid-session by a running agent to record a decision, a blocker hit, or a stack encountered.
- **FR-28** A work session produces or updates a work item whose executor is Erik and whose execution mode is hand-prompted, so mode-2 work appears in the same lists as fleet work.
- **FR-29** Each hand-prompted work item records why it was not automated, from a fixed set of reason classes: no agent for the stack, credential absent, human judgment required, client action, out of scope, budget.
- **FR-30** Every work item carries a disposition of `carried` or `closed`. Carried means Erik still owns the gap; closed means it was decided against. Both are filterable.
- **FR-31** Session records are attributed to a stack, and stacks accumulate hours. This is the input the Phase 2 coverage register consumes.

### 6.5 Mode 3 — external wall-clock waits

- **FR-32** An external wait is declared with an owner outside the studio, a reason, a started date, an expected-by date, and the work items it blocks.
- **FR-33** A wait may be declared by Erik or by an agent that encounters one, over the ingest API.
- **FR-34** A wait past its expected-by date is flagged as overdue and appears in Blocked with the elapsed count.
- **FR-35** A wait carries a resolution method: a named probe for Phase 2 automation, or `manual` where nobody can check it programmatically.
- **FR-36** Resolving a wait records who resolved it and when, and unblocks its dependent work items.
- **FR-37** A milestone's projected date accounts for the external waits between now and its acceptance criteria. A seven-day store review moves a date that no amount of build speed can recover.
- **FR-38** External waits appear in the same Blocked view as fleet and hand-prompted blockers, grouped by owner, so the studio's dependencies on other people are visible in one place.

### 6.6 Unified work items

- **FR-39** Every work item carries an execution mode of `fleet`, `hand`, or `external`, and an executor kind of agent, Erik, Erik-gate, client, vendor, or unassigned.
- **FR-40** An `erik_gate` is work only Erik can perform: a provisioning decision, an account transfer, a judgment call an agent must not make. It is a first-class executor kind, not a note.
- **FR-41** A work item blocked because no agent exists for its stack is automatically an `erik_gate` with reason `no-agent-for-stack`.
- **FR-42** Work items carry dependency edges. An edge naming a unit that does not exist is dropped and counted rather than stored.
- **FR-43** A work item records an evidence scope for its claims: observed live, observed elsewhere, asserted, or not verified. These are distinct states and the system never collapses them.
- **FR-44** Work items are listed, filtered and sorted across every engagement in one view.

### 6.7 QA traceability and certification

- **FR-45** A test declares the requirements it covers by naming them in its own title. The system reads that mapping from test files in the source repository.
- **FR-46** A test record carries its harness, its author and its certifier. Harnesses in Phase 1 are vitest, Playwright and database probe.
- **FR-47** A requirement is covered only when a passing test names it and that test's certifier differs from the executor of the work item implementing the requirement. A test failing this rule is reported as self-certified, which is a finding.
- **FR-48** The untested view reports, per engagement, the requirement count, the test count, the mapped count, the uncovered requirements, and the self-certified tests.
- **FR-49** A requirement whose only covering test carries evidence scope `not-verified` is reported as unproven, distinctly from uncovered.
- **FR-50** A contract milestone is billable only when every acceptance criterion it names is covered under FR-47. The system computes this state; no field sets it.
- **FR-51** A milestone whose criteria are covered only by self-certified tests is reported as claimed, which is a review request and not an invoice.

### 6.8 The answers (six, as amended by CR-001)

- **FR-52** Blocked lists every blocked work item and open external wait, grouped by owner, with elapsed time and disposition.
- **FR-53** Next lists work items whose dependencies are all satisfied and which no open blocker or wait holds, ordered by the nearest dated milestone they serve.
- **FR-54** Committed lists contract milestones across all engagements with amount, due date, acceptance criteria, coverage state and invoice state.
- **FR-55** Untested reports coverage per FR-48 and links each uncovered requirement to the work item that implements it.
- **FR-56** Bottleneck lists work whose executor is Erik or an Erik-gate, ranked by downstream work unblocked and by the nearest milestone at risk.
- **FR-57** Each of the answers is available at `GET /api/answer/<name>` returning JSON, under the `answer:read` capability, with the same filters the screens offer.
- **FR-58** Every screen and every endpoint reports the current `unparsed` count. A system that cannot classify something says so on every surface rather than on a diagnostics page.

### 6.9 Records, export and retention

- **FR-59** Every write is recorded in an append-only audit log carrying actor, action, target and timestamp, with no record contents.
- **FR-60** A full export produces every record in one machine-readable document, read through a single database function rather than table by table.
- **FR-61** An engagement can be archived, and archiving is reversible. Hard deletion is a separate administrative action, audited, and never the default.
- **FR-62** Nothing is deleted automatically. No retention timer runs until a retention period is stated.

---

### 6.10 Defects *(CR-001)*

- **FR-63** A defect records: engagement, a per-engagement reference (`D-1`, `D-2`, …), source (`qa-agent`, `operator`, `client`, `api`), severity (`critical`, `major`, `minor`), a short title, a description, a status, and reported-at. Status is one of `open`, `fixed`, `verified`, `wont_fix`.
- **FR-64** Defects arrive three ways: parsed from a fleet QA report's findings, posted over the ingest API under `ingest:write`, or entered by the operator. A finding paragraph the parser does not classify is stored `unparsed` and counted per FR-58 — the unparsed discipline extends to defects unchanged.
- **FR-65** A defect may name the requirement it violates and the work item that fixes it. A reference to a requirement or work item that does not exist is reported, not silently accepted (same rule as FR-12).
- **FR-66** A defect's status becomes `verified` only when a passing test names its reference (`D-nn` in the test title, read the same way FR-45 reads `FR-nn`) and that test's certifier differs from the executor of the fixing work item. The system computes this state; no field sets it.
- **FR-67** `wont_fix` requires a stated reason and is a decision, not a gap — it is filterable and distinct from `verified`, exactly as `closed` is distinct from `carried` on work items (FR-30).
- **FR-68** A defect may be recorded against an archived engagement. An archived engagement with a new open defect is surfaced for reactivation.

### 6.11 Regressions *(CR-001)*

- **FR-69** A regression is derived, never asserted, from the append-only `test_result` history: a test case whose latest result is `fail` and which has an earlier `pass`, and a requirement previously covered under FR-47 whose covering condition no longer holds. These are two distinct regression kinds and the system reports both.
- **FR-70** A milestone whose acceptance criteria include a regressed requirement leaves the billable state. No new rule produces this — FR-50 already conditions billable on FR-47 coverage, and a regression removes the coverage — but it is stated here so a test asserts it: the invoice gate must be observed to close when a covering test goes red.

### 6.12 The sixth answer *(CR-001)*

- **FR-71** Broken lists open defects grouped by severity and current regressions of both kinds, per engagement, each linked to the requirement, work item and test it implicates.
- **FR-72** Broken is available at `GET /api/answer/broken` under `answer:read`, with the same filters as the screen, and reports the `unparsed` count per FR-58. Every reference to "the five answers" elsewhere in this spec (FR-52–FR-58, §3, §9) now reads "the six answers."

### 6.13 Releases *(CR-001)*

- **FR-73** A release records: engagement, an identifier (a version or a deploy reference), deployed-at, environment, URL, and how it was recorded (`declared` by the operator, or `ingested` over the API — automated probes remain Phase 2).
- **FR-74** A release names the requirement references it ships, with ranges expanded per the FR-19 rule. A requirement's `shipped` state is derived from the releases naming it; no field sets it.
- **FR-75** Committed shows, per milestone, whether its acceptance requirements are shipped, distinctly from whether they are covered. Built and deployed are different claims and the system never collapses them — the same rule FR-43 states for evidence scopes.
- **FR-76** A release may be posted over the ingest API, so a `devops` unit records the deploy it just made in the same call pattern as run ingest.

### 6.14 Provisioning identifiers *(CR-001)*

- **FR-77** An engagement carries its provisioning identifiers: database organization and project ref, hosting team and project, and production URL. These are identifiers, never secrets, and they exist so the wrong-account failure mode is visible in one lookup instead of discovered during an incident.
- **FR-78** The identifier fields refuse secret-shaped values. Input matching a key or token shape (JWT structure, long high-entropy base64) is rejected and reported, because a credential pasted where an identifier belongs is a credential in the database.

### 6.15 Contested milestones *(CR-001, Q8 answered)*

- **FR-79** A milestone whose acceptance criteria are covered under FR-47 but which has an open `critical` defect naming one of its acceptance requirements is reported as `contested` — billable under FR-50, flagged with the defect, and never presented as clean. The system computes this state; no field sets it. Resolving or downgrading the defect clears it.

---

## 7. Data Model

### Entity: operator

The single human account. Fields: id, email, display name, role, MFA enrolled at, created at.

### Entity: agent_token

A scoped credential for programmatic access. Fields: id, label, token hash, capabilities, expires at, last used at, revoked at.

### Entity: engagement

A client relationship. Fields: id, slug, client name, source, contract type, status, repo path, spec path, fleet dir, stacks, created at, archived at, **and (CR-001 FR-77) the provisioning identifiers: `db_org`, `db_project_ref`, `hosting_team`, `hosting_project`, `production_url`**. The identifier columns refuse secret-shaped input per FR-78.

### Entity: contract_milestone

A contract line with money attached. Fields: id, engagement, name, amount, currency, due date, submitted at, paid at, notes.

### Entity: acceptance_criterion

Joins a milestone to a requirement. Fields: id, milestone, requirement ref.

### Entity: requirement

A numbered requirement from an engagement's spec. Fields: id, engagement, ref, section, text.

### Entity: work_item

The unified unit of work across all three execution modes. Fields: id, engagement, run, unit, execution mode, work type, phase, description, executor, executor kind, status, unautomated reason, disposition, evidence scope, not-verified count, stack, blocker, raw status, started at, ended at.

### Entity: work_item_dependency

A dependency edge between two work items. Fields: id, work item, depends on.

### Entity: work_item_requirement

Links a work item to a requirement it implements. Fields: id, work item, requirement ref.

### Entity: work_session

One hand-prompted Claude session. Fields: id, engagement, work item, started at, ended at, duration minutes, stack, working directory, files changed, commits, summary, source.

### Entity: external_wait

A wall-clock dependency on someone outside the studio. Fields: id, engagement, label, owner, owner type, reason, started at, expected by, resolved at, resolved by, resolution method, probe target.

### Entity: fleet_run

One autonomous fleet run. Fields: id, engagement, run id, branch, mode, started at, ended at, dispatch cap, dispatches used, verdict.

### Entity: test_case

A test and what it claims to cover. Fields: id, engagement, harness, file, title, covers, authored by, certified by.

### Entity: test_result

The outcome of running a test case. Fields: id, test case, status, evidence scope, evidence ref, run at, certified by.

### Entity: blocker

Something stopping work, carried across runs. Fields: id, engagement, ref, owner, description, opened at, resolved at, disposition.

### Entity: open_question

A question a specialist queued rather than guessing. Fields: id, engagement, run, unit, section, question, best guess, confidence, answer, answered by, answered at, status.

### Entity: stack

A technology a work item can be attributed to. Fields: id, name, agent covering, first seen at, last seen at.

### Entity: audit_log

Append-only record of every write. Fields: id, actor, actor type, action, target table, target id, created at.

### Entity: defect

A reported flaw in a product, distinct from a blocker. Fields: id, engagement, ref, source, severity, title, description, status, wont-fix reason, requirement ref, fixing work item, reported at, reported by, verified at.

### Entity: release

A deploy that shipped requirements to an environment. Fields: id, engagement, identifier, environment, url, deployed at, source, recorded by.

### Entity: release_requirement

Joins a release to a requirement it ships. Fields: id, release, requirement ref.

### Relationships

An engagement has many contract milestones, requirements, work items, fleet runs, blockers and external waits. A contract milestone has many acceptance criteria, each naming one requirement. A work item belongs to one engagement, optionally one fleet run, has many dependencies and many implemented requirements, and may be produced by one work session. A test case has many test results and covers many requirements. An external wait blocks many work items. A stack is referenced by many work items and work sessions. **(CR-001)** An engagement has many defects and many releases. A defect names at most one requirement and at most one fixing work item. A release ships many requirements. Regressions are **not** an entity — they are a view over `test_result` history, which is the point of FR-69.

---

## 7a. Security & Data Classification

**Provenance, stated plainly.** Erik asked for "encryption and other best security practices" and stated that this system holds his client book. He was not asked, and has not answered, the four questions that settle this section: what would cause harm if it leaked, what contractual or client-confidentiality language applies, how long financial records must be kept and whether anything may be deleted, and what a new account may do. Section 10 puts all four in front of him.

**Therefore the table below is a stated baseline, not a decision Erik has made.** It is what the build proceeds on if nobody answers, and it is deliberately conservative. The single sharpest fact shaping it: this is the only database in the studio that holds every client's name, every contract amount, and the studio's own pricing model in one place. A disclosure here is worse than a disclosure of any single client project, because it is all of them plus the commercial terms.

### Classification per table

| Table / entity | Class | Contains | At rest | Retention | Who may read |
|---|---|---|---|---|---|
| operator | personal | Erik's email, display name, role | provider default | until account removal | operator only |
| agent_token | sensitive | bearer credentials granting API access | **hashed with pgcrypto `crypt()`; the plaintext token is shown once at creation and never stored** | until revoked, then 90 days for audit | operator only; never returned by any read endpoint |
| engagement | personal | client name, how the work was sourced, repo paths | provider default — **stated exception, see below** | see Q3 — baseline: indefinite | operator; agent tokens may read name and slug |
| contract_milestone | sensitive | what Erik charges each client, and when he was paid | **pgcrypto column on `amount`**, key in Supabase Vault | see Q3 — baseline: 7 years for tax records | operator only; agent tokens are refused this table |
| acceptance_criterion | internal | two identifiers, no content | provider default | with its milestone | operator, agents |
| requirement | sensitive | the client's approved specification text | **pgcrypto column on `text`**; `ref` and `section` left clear | see Q3 — baseline: life of the engagement | operator, agents, decrypted server-side |
| work_item | sensitive | descriptions and status prose quoting client systems, schemas, defects and blockers | **pgcrypto columns on `description` and `raw_status`** | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| work_item_dependency | internal | two identifiers | provider default | with its work item | operator, agents |
| work_item_requirement | internal | two identifiers | provider default | with its work item | operator, agents |
| work_session | sensitive | a summary of hand-prompted work, which may quote anything Erik was working on | **pgcrypto column on `summary`** | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| external_wait | personal | the name of a client, vendor or reviewer, and dates | provider default | see Q3 — baseline: indefinite | operator, agents |
| fleet_run | internal | run identifiers, branch names, dispatch counts, verdicts | provider default | indefinite | operator, agents |
| test_case | internal | test titles and the requirement refs they name | provider default | life of the engagement | operator, agents |
| test_result | internal | pass or fail, evidence pointer, certifier | provider default | indefinite, append-only | operator, agents |
| blocker | sensitive | descriptions of why a client engagement is stalled, often quoting the client's own situation | **pgcrypto column on `description`** | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| open_question | sensitive | questions and best guesses quoting spec sections and client decisions | **pgcrypto columns on `question` and `best_guess`** | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| stack | internal | technology names and which agent covers them | provider default | indefinite | operator, agents |
| audit_log | internal | actor, action, target identifiers, no record contents | provider default | indefinite, append-only | operator only |
| defect | sensitive | descriptions of what is broken in a client's product, often quoting the client's own systems and data | **pgcrypto column on `description`**; `title` left clear — see the stated exception below | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| release | internal | version identifiers, URLs, dates | provider default | indefinite | operator, agents |
| release_requirement | internal | two identifiers | provider default | with its release | operator, agents |
| engagement (new columns) | personal | account and project identifiers, a production URL | provider default, per the existing engagement row | with the engagement | operator; agent tokens may read them — a devops unit needs exactly these |

Classes: `public` world-readable · `internal` operational, no personal data · `personal` identifies or describes a person · `sensitive` personal **and** harmful if disclosed.

**(CR-001 §4) Why `defect` is `sensitive`:** the same reasoning as `blocker` and `work_item` — the description is verbatim prose about a client's product failing, and it arrives automatically. It inherits their treatment: encrypted description, decrypted server-side, no cross-engagement full-text search in v1.

**(CR-001 §4) Stated exception — `defect.title` is not encrypted, because** it is the display key on the Broken screen and endpoint, and encrypting it means no list without a decrypt round-trip on every row. The rule that makes this safe is written into the operator guide: the title is a short label ("checkout 500s on submit"); reproduction detail, data samples and client specifics belong in the encrypted description. Same structure as the `engagement.client_name` exception, stated as a reduction in exposure rather than an elimination.

**(CR-001 §4) FR-78's rejection of secret-shaped identifier values** is the control that keeps the new engagement columns at `personal` rather than `sensitive`: the classification holds because the system refuses the input that would break it.

**Why the commercial data is `sensitive` rather than `internal`.** An amount on `contract_milestone` is what Erik charges a named client, and the set of them is the studio's pricing model. Disclosure damages every live negotiation at once and every future one, and there is no remediation — a rate card cannot be rotated. The same reasoning covers the Phase 2 estimate-versus-actual data, which is the same information with the reasoning attached, and it inherits this row when it lands.

**Why `work_item`, `blocker` and `open_question` are `sensitive` when they look operational.** They are not summaries; they are verbatim prose written by specialists mid-build. The reference corpus read for this spec contains, in those fields, a client's database identifiers, an account provisioning failure, a named custodian's file format, and the sentence "the wrong-account project was destroyed." Any of that is harmful to the client whose engagement produced it, and it arrives in this system automatically rather than by Erik's choice.

**Stated exception: `engagement` is classified `personal` and `client_name` is deliberately not encrypted, because** it is the display and grouping key on every screen and every endpoint, and encrypting it means no sorting, no filtering and no URL slug. The exposure is a list of who Erik works with, which is materially less than what he charges them; the money sits on `contract_milestone` and is encrypted. This is a reduction in exposure, stated as such, not an elimination, and it is the kind of line worth revisiting if a client's engagement is itself confidential — Q2 asks.

**Searchability, settled here rather than in the build.** Four encrypted columns would otherwise break something:

- `work_item.description` and `raw_status` are encrypted, so **there is no cross-engagement full-text search over work items in v1.** None of the five answers needs one: every view filters on status, executor kind, dates and dependency state, all of which are clear columns. If searching work-item prose becomes a requirement, it is a change request with a design decision attached.
- `requirement.text` is encrypted while `ref` is clear, so requirements are matched, joined and reported by `FR-nn` and never by text.
- `contract_milestone.amount` is encrypted, so **no SQL aggregation over money.** Totals are computed server-side after decryption. The row count is small enough that this is not a performance question at any point in this product's life.
- `agent_token` stores a one-way hash rather than reversible ciphertext, because nothing ever needs to read a token back.

### Deletion and export

- Can data be deleted? Yes, by explicit administrative action (FR-61). Archiving is the default and is reversible; hard deletion is separate and audited. **No automatic deletion runs until a retention period is stated** — Q3.
- Is a data export required? Yes, treated as a v1 requirement (FR-60). This system is the studio's operational memory; an export path is what keeps it from becoming a single point of failure. It reads through one database function returning a single document, rather than table by table, because a table-by-table export ships silently incomplete the day any table crosses the API's row cap, and `audit_log` gets there first.
- **Does personal data leave our infrastructure?** Two destinations, both named:
  1. **Vercel** — hosts the application and terminates every request. It sees decrypted payloads in transit through the function, as any host does.
  2. **Supabase** — holds the data at rest and runs the decryption functions.

  No language model is called by this product and no third-party analytics are installed. Client data reaches no vendor that the client's own engagement has not already reached. If a language model is added later — a natural-language query over the ledger is an obvious temptation — it is a change request, because it would send encrypted-at-rest client prose to a third party.

### Authentication posture

- Who can create an account: **admin-provisioned only.** `disable_signup` is set on the Supabase project at provisioning, which is a dashboard action that no migration can close, and is verified by observation rather than assumed (FR-1).
- **What role does a brand-new account get?** none — it can read no table until a role is granted deliberately
- MFA: **required**, and enforced in row-level security rather than only in the Next.js layer. A prior build in this practice shipped MFA enforced only in the application layer and a review classified it critical; that finding is the reason this line is here.
- Password policy: provider default, plus MFA as above.
- Session lifetime and refresh rotation: provider default with refresh-token rotation on.
- Agent tokens are separate from operator sessions, hashed at rest, scoped by capability, expiring, revocable, and refused the `contract_milestone` table entirely (FR-5). An agent has no reason to read what Erik charges.

### Contractual and regulatory language

No contract or policy text was supplied. Erik's client work is performed under Upwork's terms and under whatever confidentiality language individual engagements carry, and at least one engagement in the reference corpus is for a Registered Investment Adviser whose own compliance posture is strict. **This is a gap, not an absence** — Q2 asks whether any client contract restricts where their project details may be stored, because this product stores details from every engagement in one place.

- [ ] No contractual or regulatory privacy language exists for this engagement — **cannot be checked; not established either way**

### Abuse and cost controls

- Unauthenticated endpoints that cost money per call: **none.** Every route requires either an operator session or an agent token. There is no public surface.
- Expected traffic shape: one human opening the dashboard perhaps forty times a day; agent reads on the order of tens per day; ingest a few times per day, spiking to a few dozen during an active fleet run. Rate limits are set per token against that shape.
- No language-model or metered third-party API is called, so there is no runaway-spend surface beyond hosting.

**Anything not stated above falls back to `~/.claude/agents/security-baseline.md`**, and the build reports which controls came from this section and which came from the baseline.

---

## 7b. End-User Manual

**Who opens this product on an ordinary working day?**

- Job title, in his own words: "me" — Erik, operator and sole user.
- Technical level: **technical.** He has a terminal, writes the specs this product ingests, and installs the session hook himself.
- What he is trying to get done when he opens it: decide what to work on next, or answer a client asking where something stands.
- Does he train anyone else on it? No. There is one user and no handover.

**How does the documentation agent get in?** Erik provisions an account at run time and supplies credentials to the run; there is no seed script in Phase 1. The agent must also be given a populated state — an empty ledger renders five empty panels and a guide written from route handlers would read identically to one written from screens.

- Test credentials, seed script, or fixture command: none in Phase 1 — Erik provisions at run time, and a fixture ingest of this repo's own fleet artifacts populates the ledger.
- Anything the agent will not be able to reach, and why: the token-creation flow shows a plaintext token exactly once, so a screenshot of it must not be taken or reproduced in the guide.

**Where does the finished guide go?** In the repo at `docs/user-guide.md`. There is no client to send it to, and it doubles as the setup runbook for the session hook and the agent tokens.

---

## 8. Integrations & APIs

### 8.1 Supabase (Postgres, Auth, Storage)

Primary datastore, authentication, and row-level security. Postgres with `pgcrypto` for column encryption and Supabase Vault for the key. Auth provides the operator session and MFA. No storage buckets are used in Phase 1 — this product holds no files. Credential status: a project must be created; **the account it is created in is Erik's decision and no agent may choose it.** A prior run in this practice provisioned into the wrong organization and destroyed the project to recover.

### 8.2 Vercel (hosting)

Hosts the Next.js application and runs the Phase 2 probe cron. Deployment protection stays on. Credential status: no Vercel account was reachable from the fleet's environment during the reference build; this is a live blocker (Q7) rather than a task.

### 8.3 Claude Code session hook (local, not a network service)

The mode-2 capture path. A `SessionEnd` hook in Erik's Claude Code settings posts a work-session record to the ingest endpoint. It needs the ingest token in the environment and the tracker's base URL. Not a vendor integration; it is a local configuration this product documents and depends on.

### 8.4 GitHub

Source of the artifacts ingested in mode 1, read from a local working copy rather than over the API in Phase 1. Phase 2 probes may read pull-request and check state over the API.

### 8.5 Libraries, not services

Tailwind CSS v4, shadcn/ui, and a date library. No charting library in Phase 1. No test-management, project-management or invoicing SDK: the commodity tools this product deliberately does not integrate with are named in Section 9.

---

## 8a. API Audit Table

| Service | Purpose | Auth model | Credential status | Cost | Blocker risk |
|---|---|---|---|---|---|
| Supabase | database, auth, MFA, RLS, pgcrypto, Vault | project keys; service role server-side only | **project must be created — account choice is Erik's** | ~$25/mo Pro | **High** — the account question, see Q7 |
| Vercel | hosting, cron | project token | **no account reachable in the fleet environment** | $20/mo Pro | **High** — Q7 |
| GitHub | artifact source | local filesystem in Phase 1 | present | none | Low |
| Claude Code hook | mode-2 capture | ingest bearer token in environment | to be issued by this product | none | Medium — the token must reach the environment without landing in a file |
| Tailwind v4 / shadcn | interface | none | none | none | Low |

Total recurring: roughly $45/month.

---

## 9. Architecture Summary

Next.js App Router on Vercel, Supabase Postgres for state, TypeScript strict throughout. This is the studio's default stack and it is the only stack the autonomous fleet can build, which is a requirement rather than a preference: Erik asked for a product his own fleet builds, and his fleet's specialists cover Next.js, Supabase and Vercel.

Reads for the six answers are SQL views over the ledger, executed in server components. Writes arrive three ways — a fleet-artifact ingest endpoint, a session-capture endpoint, and operator server actions — and all three converge on the same `work_item` table, which is what makes a single ordered "what's next" possible across three execution modes.

**Parsers are pure functions over text.** Each takes artifact text and returns records; none reads the filesystem or the database. That is what makes them testable against a frozen string, and every parser in this build has a test that feeds it a shape it does not recognize and asserts it returns `unparsed` rather than a guess.

### The unparsed discipline — the load-bearing decision

A wrong `done` is the worst output this product can produce: it tells Erik a client requirement is satisfied when nothing checked it. Every classifier therefore has exactly one default, and that default is `unparsed`, surfaced as a count on every screen and every endpoint (FR-58). Widening a pattern to make a stubborn row classify is the failure mode this rule exists to prevent, and a build that reports a lower unparsed count by loosening a regex has made the product worse.

### Three modes, one table

The three execution modes differ only in how a work item is created — parsed, hooked, or declared — and in the `execution_mode` and `executor_kind` they carry. They do not get separate tables, separate views or separate screens. A design that splits them produces three lists Erik has to merge in his head, which is the state he is in today.

### Encryption

`pgcrypto` with the key in Supabase Vault, decryption through `SECURITY DEFINER` functions with `search_path` set empty. Every new function in schema `public` needs an explicit per-name `REVOKE` from `PUBLIC`: `ALTER DEFAULT PRIVILEGES` does not close it, which was measured in a prior build in this practice and is a standing rule here rather than a discovery to repeat.

### What this deliberately does not build

Linear does work items, dependencies and a good mobile client. It is not adopted as the source of truth because agents write files and manifests, not issues, so adopting it means a sync layer between the fleet's artifacts and Linear's database — and a sync layer that drifts is worse than no tracker, because it makes both untrustworthy. Notion is not adopted because the narrative layer already exists in Erik's Obsidian vault and Notion's API is too slow to be the surface an agent calls. TestRail does genuine requirement-to-test traceability and is built for a manual QA team executing cases by hand; here the tests are code that already runs, so the mapping is read from test titles instead. Invoicing stays in Upwork and Stripe, permanently.

### Known stack constraint

The reference build in this practice pinned TypeScript 7, which removed `baseUrl`, and Next.js 15.5 builds its path aliases from it. That combination does not resolve. If TypeScript 7 is pinned here, Next.js 16 is required and the two are not independently choosable.

---

## 10. Open Questions for Client

**Q1. What would hurt most if this database leaked, and does that change any classification in 7a?**
*Why it matters:* This is the one system holding every client name, every contract amount and the studio's pricing model together. The baseline in 7a encrypts the money and the prose and leaves client names clear so the interface works. That is a judgment about relative harm, made by the person writing the spec rather than the person who bears it.
*Options:* accept the baseline; or encrypt `engagement.client_name` too and address engagements by slug throughout, losing sort and filter on name; or store client codenames and keep the mapping outside this system entirely.
*Recommendation:* accept the baseline for v1. Revisit if Q2 turns up a confidentiality clause.

**Q2. Does any client contract restrict where their project details may be stored?**
*Why it matters:* This product copies specification text, defect descriptions and blocker prose out of individual client repositories and into one shared database. An engagement with a confidentiality clause about third-party storage may not permit that, and the RIA engagement in the reference corpus is exactly the profile where such language usually exists.
*Options:* review the live contracts and exclude any engagement that restricts it; or store only structural data for restricted engagements and leave their prose in the source repo.
*Recommendation:* answer before ingesting any engagement other than this repo's own build.

**Q3. How long is this data kept, and does anything get deleted?**
*Why it matters:* Financial records have a statutory retention floor and client project detail usually has a ceiling. The baseline is indefinite retention with no automatic deletion, which is safe against the first and careless about the second.
*Options:* 7 years on `contract_milestone` for tax and indefinite elsewhere; or a stated ceiling on client prose with an archive path.
*Recommendation:* 7 years on the commercial tables. Name a ceiling for work-item prose only if Q2 forces one.

**Q4. Should the session hook be installed globally, or per project?**
*Why it matters:* This is the entire mode-2 capture path, and the two choices fail in opposite directions. A global hook captures every Claude Code session including personal and non-client work, and posts a summary of it to this database. A per-project hook captures only registered engagements and silently misses exactly the ad-hoc work the coverage register exists to measure.
*Options:* global with a directory allowlist; global with a denylist; per project.
*Recommendation:* global with an allowlist of the studio's project roots. It captures the ad-hoc work while keeping personal sessions out of a database classified for client data.

**Q5. How does a fleet specialist in a fresh worktree get the ingest token?**
*Why it matters:* Agents run in git worktrees with no environment of their own, and this practice's standing rule is that an absent credential is a blocker rather than a puzzle. A token written into a file to solve this is a credential in a repository.
*Options:* the dispatching session passes it in the brief, which puts it in a transcript; the token lives in the operator's shell environment and only main-session ingest is supported in v1; ingest is deferred to the end of a run and performed by the dispatching session rather than by specialists.
*Recommendation:* the third. Specialists never hold the token; the session that dispatched the run posts the artifacts when the run ends.

**Q6. Which stacks should the register be seeded with, and what is the trigger for earning an agent?**
*Why it matters:* The coverage register is Phase 2, but the `stack` attribution on work sessions is Phase 1, and a stack list invented now decides what the register can say later.
*Options:* seed from the engagements currently live; or seed from every stack named in the studio's portfolio.
*Recommendation:* seed from live engagements and let mode-2 capture add the rest. The proposed trigger is: two or more engagements and eight or more of Erik's own hours, or one engagement where the missing agent blocks a dated contract milestone.

**Q8. Should an open critical defect affect a milestone's billable state when its tests still pass?** — **ANSWERED by Erik 2026-08-18: `contested`.** Recorded as FR-79. A milestone whose acceptance criteria are covered under FR-47 but which carries an open `critical` defect naming one of its acceptance requirements is reported as `contested` — billable under FR-50, flagged with the defect, never presented as clean.

**Q7. Which Supabase organization and which Vercel account does this get provisioned into?** ✋
*Why it matters:* This blocks the build. No Vercel account was reachable from the fleet's environment during the reference build, and a prior run provisioned a Supabase project into the wrong organization and destroyed it to recover. This decision is Erik's and no agent may take it.
*Options:* name the organization and account explicitly in `prod.md` before dispatch.
*Recommendation:* answer before running `/build-from-spec`. Milestone M1.0 exists to hold this.

---

## 11. Phased Build Plan

### Phase 1 — MVP (estimated: 8-10 days)

| Milestone | Contents | FRs |
|---|---|---|
| **M1.0** Provisioning | Supabase project in the named organization, `disable_signup` set and verified by observation, Vercel project, environment documented | — |
| **M1.1** Foundation | Schema for all **21** entities *(CR-001: + `defect`, `release`, `release_requirement`, and the provisioning-identifier columns on `engagement`)*, RLS on every table, pgcrypto columns per 7a with key in Vault, append-only audit log, generated types | FR-59, FR-62, FR-77, FR-78 |
| **M1.2** Access | Operator sign-in, MFA enforced in RLS, agent token issue, hash, scope, expiry, revoke, rate limits, audit of token use | FR-1 to FR-8 |
| **M1.3** Registry | Engagement and contract milestone entry, acceptance criteria resolving against requirements | FR-9 to FR-13 |
| **M1.4** Mode 1 ingest | Manifest work-unit and blocked tables, questions normalization, prod.md, requirement ranges, idempotency, the unparsed discipline, **plus the QA-report findings parser** *(CR-001 FR-64)* | FR-14 to FR-23, FR-64 |
| **M1.5** Mode 2 capture | Session hook, ingest endpoint, engagement resolution, unassigned queue, reason classes, dispositions, stack attribution | FR-24 to FR-31 |
| **M1.6** Mode 3 waits | Declaration, expected-by, overdue flagging, resolution, milestone date contribution | FR-32 to FR-38 |
| **M1.7** Unified model | Execution modes, executor kinds, Erik-gates, dependency edges, evidence scopes | FR-39 to FR-44 |
| **M1.8** QA traceability | Test title parsing, harness records, the independent-certifier rule, coverage and billable derivation, **plus CR-001's pure rules: `D-nn` tags, defect verification, regression derivation, shipped state, contested** | FR-45 to FR-51, FR-66, FR-69, FR-70, FR-74, FR-79 |
| **M1.9** The six answers | **Six** screens and **six** endpoints *(CR-001 adds Broken)*, unparsed count everywhere | FR-52 to FR-58, FR-71, FR-72, FR-75 |
| **M1.10** Export and handover | Full export through one function, archive and purge, user guide, runbook | FR-60, FR-61 |

### Phase 2 — Automation and the feedback loops (estimated: 4-6 days)

Automated probes for external waits; the fleet-coverage register with the trigger rule live; estimate-versus-actual capture and the bid table; critical path weighted by Erik's serial time; per-surface harness evidence for Detox, manual device and store review.

### Phase 3 — Deferred

Read-only Linear or Notion mirror; native mobile; automated invoice submission.

---

## 12. Assumptions

1. **Erik is the only human user.** Every design decision assumes one operator; multi-user is not a deferred feature, it is a different product.
2. **The fleet's artifact formats are a moving target.** Parsers are written against the shapes present in the reference corpus and report `unparsed` on anything else. The permanent fix is writeback — `project-lead` emitting a machine-readable block directly — which is Phase 2 and turns every parser into a validator.
3. **This repository's own build is the first ingest.** Its manifest, checkpoint and questions files are the fixture corpus, which means the product is exercised against real input on day one rather than against fabricated seeds.
4. **Test-title tagging is a backfill Erik owns.** The reference engagement has 925 tests and none names a requirement. v1 will honestly report zero mapped coverage until tests are tagged, and that report is the point rather than a defect.
5. **No language model is called by this product.** A natural-language query over the ledger would send client prose to a vendor and is a change request, not an enhancement.
6. **Amounts are stored in one currency.** Multi-currency is not modeled.
7. **The session hook depends on Claude Code's hook interface.** If that interface changes, mode-2 capture breaks silently unless the ingest endpoint alerts on a gap, which M1.5 covers by flagging engagements with no session in a stated window.
