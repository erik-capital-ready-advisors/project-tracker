# Resolved spec — run 9d4658

**This is a build artifact. It is not the spec.** `spec/` is input and owned by intake; this
file is `project-lead` run state, folded in Phase 0 and disposable.

## Provenance

**Base spec:** `spec/spec-approved.md` — approved 2026-08-17, byte-identical to `spec-v1.md`.
**Client-approved:** YES.
**Base ref:** `0881cf4` on `docs/m29-guide-post-merge`, two commits ahead of `origin/master`
(`11c3924`). Working tree verified clean at Phase 0.

**Change requests applied, in parsed-integer order (highest-numbered wins on conflict):**

| CR | Approved | What it changed |
|---|---|---|
| CR-001 | 2026-08-18 | Defects, regressions, releases, provisioning identifiers. Adds **FR-63–FR-79** and the sixth answer (Broken). **Takes §7a from 18 to 21 classified entities** (`defect`, `release`, `release_requirement`, plus new `engagement` columns). Adds **four more entries to §4.3 Deferred** (CR ingest, notifications, cost-per-run, recurring obligations). |
| CR-002 | 2026-08-19 | Resolves FR-61 hard deletion against §7a append-only. **Append-only wins absolutely**; deletion stops at the audit boundary; dangling ids in `audit_log`/`test_result` are the intended state. No entity change. |
| CR-003 | 2026-08-20 | Detail views and cross-entity navigation. **FR-80–FR-86 plus FR-55.** Built as M2.7 — Complete. No entity change. |
| CR-004 | 2026-08-20 | **FR-81 wins over FR-80.** `ENTITY_KINDS` is exactly eight; `engagement` is not a ninth navigable kind. No code, no schema. |
| CR-005 | §3.2 2026-08-23; §3.1 + §3.3 2026-08-24 | Planned work (**FR-87–FR-91**), fleet run history (**FR-92–FR-95**), engagement scoping (**FR-96/a/b/c**). §3.2 built as M2.8 — Complete. §3.1 + §3.3 built as M2.9 — Complete. **§2's bar ADOPTED AS WRITTEN (Q20)**: every new surface must either be populated by an artifact nobody types, or be typed once and carry its own expiry. Q12–Q20 all resolved; **this CR has no open questions left.** |

**Reconciliation against `prod.md`'s `Active CRs` header:** agrees. Five CR files found, five
recorded, all approved. No discrepancy.

## Prior build state (from `spec/prod.md`, read 2026-08-24)

**Complete — no work-unit may be created for any of it:** M1.0 Provisioning; M1.1 Foundation;
M1.2 Access; M1.3 Registry; M1.4 Mode 1 ingest; M1.5 Mode 2 capture; M1.6 Mode 3 waits;
M1.7 Unified model; M1.8 QA traceability; M1.9 The answers; **M2.7** Detail and navigation
(`gate:m27:e2e` 10/10); **M2.8** Fleet run history (FR-92–FR-95); **M2.9** Planned work
(FR-87–FR-91, FR-96/a/b/c — PR #5 merged `a07f035`, serving in production).

**M1.10 Export and handover — "Code complete", deliberately NOT Complete.** FR-60 export built and
observed. FR-61 archive/restore/purge built; **the refusal path is observed and the destruction
path has NEVER been observed.** Closing it requires destroying rows in the live project.

**Deferred at intake, out of scope:** M3.1 Linear/Notion mirror, M3.2 native mobile,
M3.3 automated invoicing.

**Not Started:** M2.1 Probes, M2.2 Coverage register, M2.3 Estimate vs actual, M2.4 Critical path,
M2.5 Harness evidence, M2.6 Writeback. **See "Requirement coverage of the remaining set" below —
this is the finding of Phase 0 and it decides the run.**

## Requirement coverage of the remaining set — measured, not assumed

Every numbered functional requirement in the resolved spec is **FR-1 through FR-96**, contributed
as: FR-1–FR-62 (base §6), FR-63–FR-79 (CR-001 §2), FR-80–FR-86 (CR-003 §3, as ruled by CR-004),
FR-87–FR-96 (CR-005 §3.1/§3.2/§3.3). **Every one of them belongs to a milestone `prod.md` records
as Complete or code-complete.**

The six Not-Started milestones map to functional requirements as follows:

| Milestone | FRs in the resolved spec | Where its text actually lives |
|---|---|---|
| M2.1 Probes | **none** | §4.3 **Deferred (Phase 2+)** bullet 1; §11 Phase 2 prose |
| M2.2 Coverage register | **none** | §4.3 **Deferred** bullet 2; §11 Phase 2 prose; consumes FR-31's stack attribution |
| M2.3 Estimate vs actual | **none** | §4.3 **Deferred** bullet 3; §11 Phase 2 prose; §7a anticipates the data class only |
| M2.4 Critical path | **none** | §4.3 **Deferred** bullet 4; §11 Phase 2 prose |
| M2.5 Harness evidence | **none** | §4.3 **Deferred** bullet 5; §11 Phase 2 prose |
| M2.6 Writeback | **none** | §12 Assumption 2 — one sentence, and no §4.3 bullet at all |

§4.3 is titled **"Deferred (Phase 2+)"** and sits outside §4.1 "In Scope (This Engagement)".
CR-001 §6 *grows* that same deferred list by four more entries rather than promoting any of it.
§11's entire Phase 2 is a single prose sentence naming the five bullets.

**The established pattern in this project is that a §4.3 bullet becomes buildable only when a
change request turns it into numbered FRs and Erik approves it, having ruled its open questions
first.** That is what CR-003 did for M2.7, CR-005 §3.2 for M2.8, and CR-005 §3.1/§3.3 for M2.9 —
the last of which was explicitly gated on Q12–Q15 and then Q17–Q19, and whose scope the Q13 ruling
*cut* once it was checked against the artifacts. No such CR exists for any of M2.1–M2.6.

## Phase 0 measurements — run against this repo today, not taken on report

- `fleet-preflight.sh /Users/erikmeltzer/Projects/project-tracker` → **PREFLIGHT PASS, 0 WARN.**
  Launch cwd derived and verified as the target repo.
- Working tree at `0881cf4`: **clean** (`git status --porcelain` empty).
- `manual-gate.sh` → **MANUAL GATE PASS**, `docs/user-guide.md` 8379 words, **31 of 31 served
  routes covered, all observed.** Re-run by `project-lead`, not quoted from `prod.md`.
  **B57 caveat stands:** this gate cannot distinguish a fresh observation from a copied one.
- **§7c row 2 (operator sign-in at `aal2`) — MEASURED REACHABLE.**
  `M27_BASE_URL=http://localhost:3000 M27_STORAGE_STATE=.playwright-auth/operator.json
  pnpm gate:m27:e2e` → **10 passed / 10** (1.5m, 5 workers). B41 stays closed. Authenticated
  screens are observable by this run.
- **§7c row 1 (agent token) — DEGRADED for this run: negative controls only.** No token is
  obtainable: `.env.local` is read-denied by design and no environment variable carries one.
  Observed `401` unauthenticated and `401` on a bad bearer against `/api/answer/blocked`.
  **Proven to refuse; NOT proven to admit.** Same finding as run `d4000f`.

## Standing rulings carried forward that no unit may re-litigate

- **`unparsed` is the only default.** A build that lowers the unparsed count by loosening a regex
  has made the product worse.
- **CR-002 append-only stands absolutely.** Deletion stops at the audit boundary.
- **CR-004: `ENTITY_KINDS` is exactly eight.** `engagement` is not a navigable kind.
- **B29 open:** every operator read runs as `service_role`, which holds `BYPASSRLS`.
- **B37 UNMET, not waived:** no `HttpOnly` session cookie while auth is client-side.
- **B44 open:** six pages read nav metadata positionally as `OPERATOR_ROUTES[0]`…`[5]`.
- **CR-005 §2's bar (Q20), adopted as written:** every new surface must either be populated by an
  artifact nobody types, or be typed once and carry its own expiry — and the thirty-second bar
  must hold with N clients active.

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

Classes: `public` world-readable · `internal` operational, no personal data · `personal` identifies or describes a person · `sensitive` personal **and** harmful if disclosed.

**Why the commercial data is `sensitive` rather than `internal`.** An amount on `contract_milestone` is what Erik charges a named client, and the set of them is the studio's pricing model. Disclosure damages every live negotiation at once and every future one, and there is no remediation — a rate card cannot be rotated. The same reasoning covers the Phase 2 estimate-versus-actual data, which is the same information with the reasoning attached, and it inherits this row when it lands.

**Why `work_item`, `blocker` and `open_question` are `sensitive` when they look operational.** They are not summaries; they are verbatim prose written by specialists mid-build. The reference corpus read for this spec contains, in those fields, a client's database identifiers, an account provisioning failure, a named custodian's file format, and the sentence "the wrong-account project was destroyed." Any of that is harmful to the client whose engagement produced it, and it arrives in this system automatically rather than by Erik's choice.

**Stated exception: `engagement` is classified `personal` and `client_name` is deliberately not encrypted, because** it is the display and grouping key on every screen and every endpoint, and encrypting it means no sorting, no filtering and no URL slug. The exposure is a list of who Erik works with, which is materially less than what he charges them; the money sits on `contract_milestone` and is encrypted. This is a reduction in exposure, stated as such, not an elimination, and it is the kind of line worth revisiting if a client's engagement is itself confidential — Q2 asks.

**Searchability, settled here rather than in the build.** Four encrypted columns would otherwise break something:

- `work_item.description` and `raw_status` are encrypted, so **there is no cross-engagement full-text search over work items in v1.** None of the five answers needs one: every view filters on status, executor kind, dates and dependency state, all of which are clear columns. If searching work-item prose becomes a requirement, it is a change request with a design decision attached.
- `requirement.text` is encrypted while `ref` is clear, so requirements are matched, joined and reported by `FR-nn` and never by text.
- `contract_milestone.amount` is encrypted, so **no SQL aggregation over money.** Totals are computed server-side after decryption. The row count is small enough that this is not a performance question at any point in this product's life.
| defect | sensitive | descriptions of what is broken in a client's product, often quoting the client's own systems and data | **pgcrypto column on `description`**; `title` left clear — stated exception, CR-001 §4 | see Q3 — baseline: indefinite | operator, agents, decrypted server-side |
| release | internal | version identifiers, URLs, dates | provider default | indefinite | operator, agents |
| release_requirement | internal | two identifiers | provider default | with its release | operator, agents |
| engagement (new columns) | personal | account and project identifiers, a production URL | provider default, per the existing engagement row | with the engagement | operator; agent tokens may read them |

**CR-001 §4 folded in above — the classified set is 21 entities, not 18.**
**`defect.title` is a stated exception** and not encrypted: it is the display key on Broken.
Reproduction detail, data samples and client specifics belong in the encrypted `description`.
**FR-78's rejection of secret-shaped identifier values** is the control that keeps the new
engagement columns `personal` rather than `sensitive`.

**KNOWN GAP, carried as B24 and NOT closed by any CR:** migration `20260819144647` creates
`app.rate_limit_counters`, a **22nd table with no §7a row.** This project's own rule is that an
entity with no row in §7a is a blocker, not a default. It is Erik's to classify.

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

## 7c. Verification Access

**Added 2026-08-21. Erik's ruling, not an agent's** — recorded in `spec/prod.md`'s Decisions log
the same day. `security-gate.sh` refuses a run whose spec has neither this section nor a waiver
line, and it may not be filled in by an agent, for the same reason §7a may not: an
agent-invented `reachable` reads exactly like a tested one.

| Boundary | Agent reach | Mechanism or reason | Consequence if unreachable |
|---|---|---|---|
| Agent token (`ingest:write`, `answer:read`) | reachable | a token minted per run and placed in `.env.local`; see `docs/agent-tokens.md` | — |
| Operator sign-in at `aal2` (TOTP) | reachable | `node scripts/save-operator-session.mjs` — Erik completes the second factor once, the script refuses to save anything below `aal2`, and the resulting storage state is passed as `M27_STORAGE_STATE` | — |

**On the second row, because it is the one that was ruled rather than observed.** It is
`reachable` with a human in the loop for exactly one step: the script cannot mint a factor, so
Erik completes TOTP once and the captured session is then usable by any agent for its lifetime.
The ruling is that this counts, and the reasoning is that `save-operator-session.mjs` enforces
the only property that matters — it refuses below `aal2` (`scripts/save-operator-session.mjs:78`),
so a session that would have failed the gate later cannot be saved at all.

**What this costs if it turns out to be wrong.** If the captured session is unavailable when a
run starts — expired, revoked, or never minted — this row is `unreachable` in practice while
declaring itself `reachable`, and the run will discover that instead of knowing it. The tell is
`project-lead` Phase 0: it runs every `reachable` mechanism before dispatch and reports what
happened, so a stale session surfaces as a Phase 0 blocker on Erik rather than as a silent
verification gap. **If Phase 0 cannot produce an `aal2` session, this row is to be treated as
`unreachable` for that run** and its consequence is: every authenticated screen is built
unobserved, `pnpm gate:m27:e2e` cannot run in-run, and `docs/user-guide.md` (§7b) cannot be
written.

**One handling rule that travels with this section (B38).** A failing `gate:m27:e2e` prints the
live operator session cookie — access token *and* refresh token — into its output, because
Playwright logs request headers on failure and `M27_STORAGE_STATE` puts the cookie on every
request. It leaked twice on 2026-08-20. Assume any gate failure exposes a live session and
revoke afterwards.

---


## Phase 0 verification-access measurements (run 9d4658)

**Deliberately a `##` section OUTSIDE §7c, not a `###` inside it.** `security-gate.sh` collects every
4-cell table row in the §7c body with no notion of which table it belongs to, so a measurement table
placed inside §7c is parsed as further boundary declarations — and its measured-verdict column is
read as a *mechanism*, which turns a DEGRADED boundary into an `ok ... reachable` line. Observed on
this run before the section was moved. See `.fleet/learnings-9d4658.md` L1.

| Boundary | Declared | Measured this run | Consequence carried |
|---|---|---|---|
| Agent token (`ingest:write`, `answer:read`) | reachable | **DEGRADED — negative controls only.** `401` no-auth and `401` bad-auth observed against `/api/answer/blocked`. No token obtainable: `.env.local` is read-denied by design, no env var carries one. | Proven to refuse, **not** proven to admit. Any claim about an authorised agent read is NOT VERIFIED this run. |
| Operator sign-in at `aal2` (TOTP) | reachable | **REACHABLE — `pnpm gate:m27:e2e` 10 passed / 10** with both `M27_BASE_URL` and `M27_STORAGE_STATE` set. | None. Authenticated screens are observable. |

**B38 handling rule travels with this section:** a failing `gate:m27:e2e` prints the live operator
session cookie — access *and* refresh token — into its output. The gate passed here, so nothing
leaked; assume any future failure exposes a live session and revoke afterwards.

---

## §4.3 Deferred (Phase 2+) — verbatim from the approved spec, as grown by CR-001 §6

1. Automated probes for external waits — App Store Connect, DNS, deploy state, inbox arrival.
2. Fleet-coverage register with a live trigger rule for when a stack has earned a specialist.
3. Estimate-versus-actual rollups and the bid table.
4. Critical-path computation weighted by Erik's own serial time.
5. Per-surface harness evidence beyond code tests: Detox, manual device scripts, store review outcomes.
6. Read-only mirror into Linear or Notion.
7. *(CR-001 §6)* Ingest of `spec/change-requests/*.md` across engagements, plus a lightweight intake state.
8. *(CR-001 §6)* Notifications: a daily digest and threshold alerts.
9. *(CR-001 §6)* Cost per fleet run and per engagement, beside M2.3's time-based rollups.
10. *(CR-001 §6)* Recurring obligations: renewals, cert expiry, scheduled maintenance.

## §11 Phase 2 — verbatim, in full

> Automated probes for external waits; the fleet-coverage register with the trigger rule live;
> estimate-versus-actual capture and the bid table; critical path weighted by Erik's serial time;
> per-surface harness evidence for Detox, manual device and store review.

That sentence is the entirety of Phase 2's specification in the approved spec. It names no
requirement, no entity, no screen, no endpoint and no acceptance criterion.

## §12 Assumption 2 — the only text in the spec that describes M2.6 Writeback

> **The fleet's artifact formats are a moving target.** Parsers are written against the shapes
> present in the reference corpus and report `unparsed` on anything else. The permanent fix is
> writeback — `project-lead` emitting a machine-readable block directly — which is Phase 2 and
> turns every parser into a validator.

## Open questions from §10 that bear on the remaining set

**Q6 — OPEN, and carried as blocker B7.** *"Which stacks should the register be seeded with, and
what is the trigger for earning an agent?"* The spec's own note on this question reads: *"The
coverage register is Phase 2, but the `stack` attribution on work sessions is Phase 1, and a stack
list invented now decides what the register can say later."* **The trigger rule is the substance of
M2.2, and it is unanswered.**

**Q2, Q3 — OPEN**, carried as B2 and B3. Retention is unstated; §7a's baseline is indefinite with
no automatic deletion.
