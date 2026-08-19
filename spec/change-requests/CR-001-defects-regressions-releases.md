# CR-001 — Defects, regressions, releases, and provisioning identifiers

**Amends:** `spec/spec-approved.md` (v1, approved 2026-08-17)
**Drafted:** 2026-08-18
**Status:** **APPROVED 2026-08-18 by Erik**, with Q8 answered `contested`. This CR now amends
`spec-approved.md` per the repo's CR rule. `security-gate.sh` PASS on the merged 21-entity set,
2026-08-18.
**Why now:** M1.1 has not been dispatched. Every item below touches the schema, and the cheapest
moment to add a table is before the fleet builds the 18 that exist. After M1.1 this same change
costs a migration, a §7a re-verification, and a re-test of RLS on live data.

---

## 1. What this CR adds, and why

An audit of the approved spec against the studio's own checklist — bug reports, feature requests,
user stories, manual, automated and regression testing — found the spec covers stories and testing
well and covers three things not at all:

1. **Defects have no home.** The reference corpus itself proves the gap: a qa-reviewer verdict
   reading `FAIL: 1 critical, 2 minor` parses into a work-item *status*, and the three findings it
   counts land nowhere. A bug found by a QA agent, by Erik, or by a client during UAT or after
   delivery has no entity, no severity, no lifecycle. `blocker` is the wrong shape — it records
   what stops work, not what is wrong with the product.
2. **Regressions are derivable and never derived.** `test_result` is append-only, so the history
   exists, but no FR reads it. A test that passed and now fails, and a requirement that was covered
   and is covered no longer, appear on no screen and no endpoint.
3. **Built and shipped are collapsed.** Nothing records what is live for a client: which deploy,
   when, containing which requirements. Flow A2 can say a milestone is billable but not "that fix
   is deployed, here is the URL, it shipped Tuesday."
4. **The engagement row omits the one set of identifiers this practice has been burned by.** A
   prior run provisioned into the wrong Supabase organization and destroyed the project to
   recover. `engagement` stores repo path and stacks but not the account identifiers — org, ref,
   team, production URL — that would have made the wrong account visible in one lookup.

One deliberate consequence: **the five answers become six.** Open defects and current regressions
need a surface, and folding them into Untested would overload a view whose job is coverage. The
sixth question is *what's broken*, and it follows the exact pattern of the other five.

What this CR deliberately does **not** add, and routes to Phase 2 instead (§6): ingest of the CR
files themselves, notifications, cost capture per run, and recurring obligations. None touches the
Phase 1 schema in a way that gets more expensive later.

---

## 2. New functional requirements

Numbering continues from FR-62.

### 6.10 Defects

- **FR-63** A defect records: engagement, a per-engagement reference (`D-1`, `D-2`, …), source
  (`qa-agent`, `operator`, `client`, `api`), severity (`critical`, `major`, `minor`), a short
  title, a description, a status, and reported-at. Status is one of `open`, `fixed`, `verified`,
  `wont_fix`.
- **FR-64** Defects arrive three ways: parsed from a fleet QA report's findings, posted over the
  ingest API under `ingest:write`, or entered by the operator. A finding paragraph the parser does
  not classify is stored `unparsed` and counted per FR-58 — the unparsed discipline extends to
  defects unchanged.
- **FR-65** A defect may name the requirement it violates and the work item that fixes it. A
  reference to a requirement or work item that does not exist is reported, not silently accepted
  (same rule as FR-12).
- **FR-66** A defect's status becomes `verified` only when a passing test names its reference
  (`D-nn` in the test title, read the same way FR-45 reads `FR-nn`) and that test's certifier
  differs from the executor of the fixing work item. The system computes this state; no field sets
  it. This is FR-47's independent-certifier rule pointed at defects, and it is what makes every
  closed bug carry its own regression test.
- **FR-67** `wont_fix` requires a stated reason and is a decision, not a gap — it is filterable
  and distinct from `verified`, exactly as `closed` is distinct from `carried` on work items
  (FR-30).
- **FR-68** A defect may be recorded against an archived engagement. Client-reported breakage does
  not stop arriving because the engagement ended; an archived engagement with a new open defect is
  surfaced for reactivation.

### 6.11 Regressions

- **FR-69** A regression is derived, never asserted, from the append-only `test_result` history:
  a test case whose latest result is `fail` and which has an earlier `pass`, and a requirement
  previously covered under FR-47 whose covering condition no longer holds. These are two distinct
  regression kinds and the system reports both.
- **FR-70** A milestone whose acceptance criteria include a regressed requirement leaves the
  billable state. No new rule produces this — FR-50 already conditions billable on FR-47 coverage,
  and a regression removes the coverage — but it is stated here so a test asserts it: the invoice
  gate must be observed to close when a covering test goes red.

### 6.12 The sixth answer

- **FR-71** Broken lists open defects grouped by severity and current regressions of both kinds,
  per engagement, each linked to the requirement, work item and test it implicates.
- **FR-72** Broken is available at `GET /api/answer/broken` under `answer:read`, with the same
  filters as the screen, and reports the `unparsed` count per FR-58. Every reference to "the five
  answers" in the spec (FR-52–FR-58, §3, §9) now reads "the six answers."

### 6.13 Releases

- **FR-73** A release records: engagement, an identifier (a version or a deploy reference),
  deployed-at, environment, URL, and how it was recorded (`declared` by the operator, or
  `ingested` over the API — automated probes remain Phase 2).
- **FR-74** A release names the requirement references it ships, with ranges expanded per the
  FR-19 rule. A requirement's `shipped` state is derived from the releases naming it; no field
  sets it.
- **FR-75** Committed shows, per milestone, whether its acceptance requirements are shipped,
  distinctly from whether they are covered. Built and deployed are different claims and the system
  never collapses them — the same rule FR-43 states for evidence scopes.
- **FR-76** A release may be posted over the ingest API, so a `devops` unit records the deploy it
  just made in the same call pattern as run ingest.

### 6.14 Provisioning identifiers

- **FR-77** An engagement carries its provisioning identifiers: database organization and project
  ref, hosting team and project, and production URL. These are identifiers, never secrets, and
  they exist so the wrong-account failure mode is visible in one lookup instead of discovered
  during an incident.
- **FR-78** The identifier fields refuse secret-shaped values. Input matching a key or token shape
  (JWT structure, long high-entropy base64) is rejected and reported, because a credential pasted
  where an identifier belongs is a credential in the database.

---

## 3. Data model amendments

Three new entities (18 → 21) and new columns on one existing entity.

### Entity: defect

A reported flaw in a product, distinct from a blocker. Fields: id, engagement, ref, source,
severity, title, description, status, wont-fix reason, requirement ref, fixing work item,
reported at, reported by, verified at.

### Entity: release

A deploy that shipped requirements to an environment. Fields: id, engagement, identifier,
environment, url, deployed at, source, recorded by.

### Entity: release_requirement

Joins a release to a requirement it ships. Fields: id, release, requirement ref.

### Entity: engagement — new columns

`db_org`, `db_project_ref`, `hosting_team`, `hosting_project`, `production_url`. Classification
unchanged (see §4).

### Relationships

An engagement has many defects and many releases. A defect names at most one requirement and at
most one fixing work item. A release ships many requirements. Regressions are not an entity — they
are a view over `test_result` history, which is the point of FR-69.

---

## 4. §7a amendments — classification of the new rows

| Table / entity | Class | Contains | At rest | Retention | Who may read |
|---|---|---|---|---|---|
| defect | sensitive | descriptions of what is broken in a client's product, often quoting the client's own systems and data | **pgcrypto column on `description`**; `title` left clear — see the stated exception below | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| release | internal | version identifiers, URLs, dates | provider default | indefinite | operator, agents |
| release_requirement | internal | two identifiers | provider default | with its release | operator, agents |
| engagement (new columns) | personal | account and project identifiers, a production URL | provider default, per the existing engagement row | with the engagement | operator; agent tokens may read them — a devops unit needs exactly these |

**Why `defect` is `sensitive`:** the same reasoning as `blocker` and `work_item` — the description
is verbatim prose about a client's product failing, and it arrives automatically. It inherits
their treatment: encrypted description, decrypted server-side, no cross-engagement full-text
search in v1.

**Stated exception — `defect.title` is not encrypted, because** it is the display key on the
Broken screen and endpoint, and encrypting it means no list without a decrypt round-trip on every
row. The rule that makes this safe is written into the operator guide: the title is a short label
("checkout 500s on submit"); reproduction detail, data samples and client specifics belong in the
encrypted description. Same structure as the `engagement.client_name` exception, stated as a
reduction in exposure rather than an elimination.

**FR-78's rejection of secret-shaped identifier values** is the control that keeps the new
engagement columns at `personal` rather than `sensitive`: the classification holds because the
system refuses the input that would break it.

---

## 5. Milestone amendments (Phase 1)

No new milestones. Four existing ones grow:

| Milestone | Amendment |
|---|---|
| **M1.1** Foundation | Schema for 21 entities, not 18; the new engagement columns; §4's pgcrypto column on `defect.description` |
| **M1.4** Mode 1 ingest | The QA-report findings parser (FR-64), under the same unparsed discipline and the same pure-function rule |
| **M1.8** QA traceability | `D-nn` parsing in test titles alongside `FR-nn`; the defect verification join (FR-66); regression derivation (FR-69); the shipped-state derivation (FR-74); the `contested` derivation (FR-79, from Q8's answer) |
| **M1.9** The answers | Six screens and six endpoints. FR-71, FR-72 |

**Dispatch note for `project-lead`:** the pure rules this CR adds — the findings parser, `D-nn`
tag reading, the FR-66 join, FR-69's regression derivation, FR-74's shipped state — belong in
`src/lib/ingest/` beside the modules `plan.md` (the `i-core` brief) already defines, under its
Global Constraints verbatim. `plan.md` itself is not amended; decompose these as a follow-on unit
(`i-core-2`) depending on `i-core`, or fold them into the `i-core` dispatch if it has not run.
Everything else in this CR — schema, screens, endpoints — decomposes from this document as usual.

---

## 6. Scope amendments elsewhere

**§4.3 Deferred (Phase 2+) gains four entries**, audit-found gaps that do not touch the Phase 1
schema:

7. Ingest of `spec/change-requests/*.md` across engagements, so approved scope changes are visible
   in the ledger instead of only in each repo — and with it a lightweight intake state for
   client requests that are not yet CRs.
8. Notifications: a daily digest and threshold alerts (overdue wait, milestone at risk, new
   critical defect) over email or Slack. The product is pull-only today; staying on track over
   months should not depend on remembering to open the tab.
9. Cost per fleet run and per engagement — token and subscription spend beside M2.3's
   time-based estimate-versus-actual, so the bid table can say *unprofitable*, not just *long*.
10. Recurring obligations: renewals, cert expiry, scheduled maintenance — external waits that
    re-arm on resolution instead of closing.

**Consequential edits on approval:** the repo `CLAUDE.md` and spec §1/§3 references to "five
questions" become six; `security-gate.sh` must pass on the amended entity set.

---

## 7. Open questions

**Q8. Should an open critical defect affect a milestone's billable state when its tests still pass?**
*Why it matters:* FR-70 handles the case a regression catches — a covering test goes red. But a
client can report critical breakage while every mapped test passes, because the tests simply miss
it. Under this CR the milestone stays billable, which is honest about what was certified and
awkward in front of the client.
*Options:* leave billable untouched (defects and billing stay orthogonal); or report the milestone
as `contested` — billable under FR-50, flagged with the open critical defect — and let Erik decide
whether to invoice; or block billable outright on any open critical defect naming an acceptance
requirement.
*Recommendation:* `contested`. It preserves the derived-never-asserted invoice rule while refusing
to let the system present a disputed milestone as clean. Blocking outright would let a
mis-severity'd defect silently freeze revenue, which is an asserted invoice state by another name.

**Answered by Erik, 2026-08-18: `contested`.** This becomes **FR-79**: a milestone whose
acceptance criteria are covered under FR-47 but which has an open `critical` defect naming one of
its acceptance requirements is reported as `contested` — billable under FR-50, flagged with the
defect, and never presented as clean. The system computes this state; no field sets it. Resolving
or downgrading the defect clears it.

---

## 8. Approval

- [x] Approved by Erik on **2026-08-18**, with Q8 answered `contested` (FR-79) — this CR amends
  `spec-approved.md` per the repo's CR rule: the highest-numbered approved CR wins where it
  conflicts with the spec. `spec-approved.md` itself stays byte-identical to `spec-v1.md`;
  the amendment lives here, by precedence, as the CR mechanism intends.
