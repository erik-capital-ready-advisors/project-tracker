# Resolved spec — run d4000f

**This is a build artifact. It is not the spec.** `spec/` is input and owned by intake; this
file is `project-lead` run state, folded in Phase 0 and disposable.

## Provenance

**Base spec:** `spec/spec-approved.md` — approved 2026-08-17, byte-identical to `spec-v1.md`.
**Client-approved:** YES.

**Change requests applied, in parsed-integer order (highest-numbered wins on conflict):**

| CR | Approved | What it changed |
|---|---|---|
| CR-001 | 2026-08-18 | Adds defects, regressions, releases and provisioning identifiers. Adds FR-62–FR-79 and the sixth answer (Broken). **Takes §7a from 18 classified entities to 21** by adding `defect`, `release`, `release_requirement`. |
| CR-002 | 2026-08-19 | Resolves FR-61 hard deletion against §7a append-only. **Append-only stands**; `audit_log` and `test_result` refuse UPDATE/DELETE/TRUNCATE for every role. Purge is a separate audited path. |
| CR-003 | 2026-08-20 | Detail views and navigation. FR-80–FR-85. Built as M2.7, Complete. |
| CR-004 | 2026-08-20 | Engagement reference scope — **FR-81 wins over FR-80**; `ENTITY_KINDS` stays exactly eight and `engagement` is not a ninth navigable kind. |
| CR-005 | §3.2 2026-08-23; **§3.1 and §3.3 2026-08-24** | Planned work, fleet run history, engagement scoping. §3.2 built as M2.8 (Complete). **§3.1 (FR-87–FR-91) and §3.3 (FR-96/a/b/c) are this run's entire scope, as M2.9.** |

**Base ref for this run:** `docs/b46-verified-in-production`, commit `3927de4`. Verified in Phase 0
that `627521d` — the commit carrying the CR-005 §3.1/§3.3 approvals — **is an ancestor of HEAD and is
NOT on `master`**. Resolving from `master` would have folded the unapproved CR-005 draft.

## Prior build state (from `spec/prod.md`, 2026-08-24)

**Already Complete. Do NOT rebuild any of it:** M1.0 Provisioning, M1.1–M1.10 (Phase 1 MVP in
full), **M2.7 Detail and navigation** (Complete 2026-08-24, `gate:m27:e2e` 10/10),
**M2.8 Fleet run history** (Complete 2026-08-24, FR-92–FR-95, `/runs` and `/runs/[run-id]`).

**Not started and out of this run's scope:** M2.1 Probes, M2.2 Coverage register, M2.3 Estimate vs
actual, M2.4 Critical path, M2.5 Harness evidence, M2.6 Writeback. Phase 3 (M3.1–M3.3) deferred at
intake.

**This run builds M2.9 — Planned work — and nothing else.**

## Baseline measured in Phase 0 at the base ref (not taken on report)

`pnpm typecheck` 0 · `pnpm lint` (oxlint) 0 · `pnpm test` **1550 passed / 6 skipped** ·
`pnpm gate:m27` **5/5** · `pnpm gate:m27:e2e` **10/10** (9 passed on the full run, the one
`/untested` failure re-run green in isolation — see §7c note below) · `manual-gate.sh` **PASS,
30 of 30 routes covered** · **30 served page routes**.

## Standing rulings carried forward that this run must not re-litigate

- **CR-002 append-only stands.** Nothing in M2.9 transitions or deletes a row. FR-91 staleness is
  **derived**, never stored.
- **CR-004: `ENTITY_KINDS` is exactly eight.** `engagement` is not a navigable entity kind. FR-96's
  filter is a URL parameter and a picker, **not** a ninth `<EntityRef>` kind.
- **B29 is open and stays open:** every operator read runs as `service_role`, which holds
  `BYPASSRLS`, so RLS is not a real control on any read surface. Do not deepen this quietly; if a
  unit's work touches it, say so in the report.
- **B44 is open:** six pages read their own nav metadata as `OPERATOR_ROUTES[0]`…`[5]`. Do not
  insert mid-array — appending is the established correct move.
- **B37 is UNMET, not waived:** no `HttpOnly` session cookie is possible while auth is client-side.
- **`unparsed` is the only default.** A build that lowers the unparsed count by loosening a regex
  has made the product worse.

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

**Recorded design decision (B11, resolved 2026-08-19, run b0952e unit u1) — §5a's `Approved design` line still reads NOT YET APPROVED, so this is the standing in-repo choice, not a client sign-off:** Geist / Geist Mono, a violet accent confined to interactive chrome, and a 16-token state scale with **fuchsia reserved exclusively for `unparsed`**. Match it. Do not introduce a new accent or a new state color.

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

Classes: `public` world-readable · `internal` operational, no personal data · `personal` identifies or describes a person · `sensitive` personal **and** harmful if disclosed.

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


### §7c — MEASURED IN PHASE 0 OF THIS RUN, 2026-08-24

The gate checked that a mechanism was named. Phase 0 ran both, and this is what happened.

**Presented as prose, not as a table, deliberately: a second §7c-shaped table in this file makes
`security-gate.sh` double-count the boundary rows and read a DEGRADED measurement as a declared
`reachable`. The declaration lives in the table above; this is the measurement.**

**Operator sign-in at `aal2` (TOTP) — declared reachable, and MEASURED ALIVE.**
`M27_BASE_URL=http://localhost:3000 M27_STORAGE_STATE=.playwright-auth/operator.json pnpm
gate:m27:e2e` returned **9 passed / 1 failed**, and the single `/untested` failure re-ran
**1 passed** in isolation. Its stated reason was `no-role`, **not** `sign-in` — so this is not the
revoked-session signature B41 recorded, and it is not the both-env-vars-unset signature either
(that is 10 failed / 10, every one `sign-in`). Consequence: authenticated screens **can** be
observed this run, `gate:m27:e2e` runs, and `docs/user-guide.md` (§7b) **can** be written — so the
`docs-writer` manual pass is dispatchable.

**Agent token (`ingest:write`, `answer:read`) — declared reachable, MEASURED DEGRADED: negative
controls only.** No valid token is obtainable by this run. `DELIVERY_LEDGER_INGEST_TOKEN` is absent
from the shell, and `.env.local` is **read-denied by `.claude/settings.json`** — that denial is the
credential rule working and must not be routed around. The negative controls do pass and the
instrument is proven able to fail: `/api/answer/next` no-auth → **401**, bad-auth (well-formed but
invalid token) → **401**, `POST /api/ingest/run` no-auth → **401**.
**NOT VERIFIED for this run, stated before dispatch rather than discovered at the end: any
positive-path agent-token assertion.** The boundary is proven to refuse; it is **not** proven to
admit. No unit may claim an authenticated ingest round-trip it did not make. M2.9's own surfaces
are operator-authenticated, so this degrades a claim rather than blocking the milestone.

**B41 is therefore stale as written** — it records the `aal2` session as revoked, and this run
measured it alive. Report that, do not edit the blocker.

**B38 handling rule travels with this section.** A failing `gate:m27:e2e` prints the live operator
session cookie — access token *and* refresh token — into its output. Phase 0 filtered its gate
output for exactly this reason. **Never paste raw gate failure output into a report, a fixture or a
transcript.**

---

# THIS RUN'S SCOPE — M2.9 Planned work

**CR-005 §3.1 + §3.3, verbatim below. FR-87–FR-91 plus FR-96 with FR-96a, FR-96b, FR-96c.**
Nothing else in CR-005 is in scope: §3.2 (FR-92–FR-95) is already built as M2.8.

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


---

## The Q rulings behind this scope — verbatim, and not to be re-decided

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


---

## Approval text — verbatim


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

---

## Measured facts about THIS repo that shape M2.9 — read before designing anything

These were measured in Phase 0 against the base ref. They are not inferences.

### The schema does not admit a planned row today

`supabase/migrations/20260819144331_schema_21_entities.sql:278` defines `work_item`:

- **`execution_mode public.execution_mode not null`** — enum `('fleet','hand','external')`.
  **FR-87 requires `execution_mode` unset.** This is a real migration, not a code change.
- **`status public.work_status not null default 'unparsed'`** — the enum **already contains
  `pending`** (`'pending','in_flight','done','blocked','superseded','not_dispatched','unparsed'`),
  so FR-87's `status = pending` needs no enum change.
- **`engagement_id uuid not null references public.engagement(id)`** — already NOT NULL, so
  **Q14's "engagement REQUIRED at creation" is already enforced by the schema.** Do not add a
  second check; do surface it as a required field in the FR-88 form.
- **There is no `created_at` / `updated_at` on `work_item`.** Only `started_at` and `ended_at`,
  both nullable. **FR-91's 30-day staleness has no timestamp to derive from today.** One is
  required.
- **There is no plan-id column.** FR-90's reconciliation key does not exist on either side.

### The existing upsert index is PARTIAL, and a new one must not be

```
create unique index work_item_engagement_run_unit_key
  on public.work_item (engagement_id, fleet_run_id, unit)
  where fleet_run_id is not null and unit is not null;
```

**CORRECTED 2026-08-24 by unit i1, and the correction is the orchestrator's error, not i1's.**
The snippet above is the ORIGINAL 2026-08-19 definition and **is no longer the live state.**
`20260819170622_i5_upsert_targets_must_be_inferable.sql:45-48` drops it and recreates it **with no
`WHERE` clause**; its own comment reads *"Deliberately NOT partial."* Verified against the live
index. `project-lead` read the `create` in the first migration, cited the second one in the same
breath, and still stated the wrong conclusion.

**The RULE still binds and is unchanged:** PostgREST's `on_conflict` takes column names and cannot
carry a `WHERE` predicate, so a `supabase-js` `.upsert()` against a partial unique index fails
`42P10` — **and only on the second post**, which is exactly the idempotency case nobody exercises
before shipping. **Any new conflict target for planned work must be a PLAIN unique index.** i1
obeyed this: its `(engagement_id, plan_ref)` index is plain, and it observed `on conflict` **infer
it with no predicate and no `42P10`**, with a duplicate correctly refused `23505`.

### Function grants — the failure that killed Mode-1 ingest once already

Every new function in schema `public` needs an explicit per-name `REVOKE ... FROM PUBLIC`, **and a
matching `GRANT ... TO service_role` wherever the function is reached in the caller's role** —
CHECK constraints, generated columns and RLS policy expressions all evaluate in the caller's role,
and `service_role` is not a member of `authenticated`. Omitting the grant makes the table silently
unwritable and the first `INSERT` fails `42501` **naming the function, not the table**. A
`SECURITY DEFINER` trigger is the one case that does not need it. Measured on run `b0952e`: this
returned `500` on every `POST /api/ingest/run` with the whole suite green.

### Migration bookkeeping

After `apply_migration`, **rename the local file to the version `list_migrations` reports**, not a
timestamp you picked. Supabase assigns its own version and a mismatch makes a later
`supabase db push` re-run every applied file, which fails on `create type` and reads like a broken
migration.

### Routes: 30 today, and the FR-88 form is a decision with a gate consequence

`manual-gate.sh` enumerates the App Router tree and fails **FORWARD** on any served route the
guide's evidence file does not mention. The branch serves **30** routes and the guide covers 30/30.

- **FR-96's filter adds no route** — a query parameter is not a route. CR-005 §3.3 point 4 is
  correct and `manual-gate.sh` is unaffected by the filter itself.
- **FR-88's hand-entry form is a new route.** `/registry/new` already exists as the in-repo
  precedent for a creation form as its own route. **Decision for this run: `/work-items/new`,
  taking served routes 30 → 31.** The guide and `manual-evidence-*.json` must therefore gain a
  section AND an **observed** row for it, or `manual-gate.sh` fails FORWARD. This is budgeted into
  the milestone, not discovered at merge.

### The eleven screens FR-96 touches already read `searchParams`

Per CR-005 §3.3 point 1, the filter applies to: `/next`, `/committed`, `/broken`, `/bottleneck`,
`/blocked`, `/untested`, `/work-items`, `/questions`, `/waits`, `/runs`, `/registry`.
**`[id]` detail views do not take the filter.**

### The FR-58 badge is mounted in the shell, deliberately

`src/components/app-shell.tsx` mounts `<UnparsedCount />` in the chrome (line 64). **FR-96a: it
stays ledger-wide and labels its scope under a filter** — *"3 unparsed (whole ledger)"*. Do not
scope it to the filter. It renders `"unparsed count unavailable"` rather than `0` when the count is
unknown (B12), and that behaviour stays.

### Testing rules this repo enforces

- **Parsers are pure functions over text** — no filesystem, no database. The FR-89 plan parser
  lives beside the others in `src/lib/ingest/` and carries a test feeding it a shape it does not
  recognise, asserting `unparsed` rather than a guess.
- **Fixtures under `tests/fixtures/` are byte copies of real artifacts.** When a test fails, fix
  the parser. **Editing a fixture to make a test pass is forbidden.**
- **Mount anything that fetches in an effect under `<StrictMode>`.** `next.config.ts` sets
  `reactStrictMode: true`, which double-invokes effects; a bare `render()` cannot reproduce that.
- **If you mock a component to `() => null`, grep for a test of the real component.** That exact
  mock is why B46 — a command palette that crashed every page — reached production with 1545 tests
  green.
- **FR-91's 30-day boundary is computed from a date passed in, never from `new Date()` inside**, so
  the rule stays deterministic like every other rule in `src/lib/ingest/`.
