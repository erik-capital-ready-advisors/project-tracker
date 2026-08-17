# Production Plan: Delivery Ledger

**Project:** Delivery Ledger — single-operator delivery tracker for Capital Ready Advisors
**Last updated:** 2026-08-17 by the intake session
**Current phase:** Pre-build — spec drafted, awaiting Erik's approval and one provisioning decision
**Spec version:** spec-v1.md (not yet approved; promote byte-for-byte to `spec-approved.md` on approval)
**Active CRs:** none — `spec/change-requests/` does not exist
**Security posture:** declared — spec §7a, 18 entities classified. `security-gate.sh` **PASS** on spec-v1.md, 2026-08-17.

---

## What this file is

This file is the **build log**. It tracks the live state of development: what's done, what's next, what's blocked, and what decisions were made during the build that aren't in the spec.

**Three documents, three jobs — don't confuse them:**

- **`spec/spec-approved.md`** — what was agreed to build. Source of truth. Changes only via a formal revise.
- **`spec/change-requests/CR-NNN-*.md`** — approved amendments to scope. Append-only.
- **`spec/prod.md`** (this file) — internal build state and decisions.

**Erik is both the client and the operator on this engagement.** That collapses the usual approval loop but it does not remove it: §7a is a stated baseline written by the intake session, not a decision Erik has made, and the four questions that settle it are Q1 through Q3 in Section 10. Treat them as client questions, because on this project they are.

---

## Next session pointer

**Next up: answer Q7, then dispatch.** The spec is written, the security gate passes, and the milestone tracker below maps every FR to a milestone. Exactly one thing blocks dispatch and it is not a build task.

**Q7 — which Supabase organization and which Vercel account does this get provisioned into.** This is B1 below. It is Erik's decision and no agent may take it. The reference build in this practice provisioned a Supabase project into the wrong organization, discovered six other clients' databases alongside it, and destroyed the project to recover; it also found no Vercel account reachable from the fleet's environment at all (`list_teams` returned `{"teams": []}`, and `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` were all absent). Both facts are why M1.0 exists as a milestone rather than as a step inside M1.1.

**Why this next:** every other milestone can be built on fixtures, but M1.0 decides where the client book lives. Getting it wrong is not recoverable by a later migration.

**Second, before dispatch:** Q2 — whether any client contract restricts where their project details may be stored. This one does not block the build, but it blocks ingesting any engagement other than this repository's own, because ingest copies client prose out of individual repos into one database.

---

## Current state (one paragraph)

Spec drafted and gated. No code exists. `spec/spec-v1.md` carries 62 functional requirements across 11 Phase 1 milestones, 18 data entities all classified in §7a, and 7 open questions. `security-gate.sh` passes. The repository is empty apart from `spec/` and `CLAUDE.md`. Nothing has been dispatched, and the fleet has not run.

---

## Milestone tracker

### Phase 1 — MVP (estimated 8-10 days)

| Milestone | Status | Notes |
|---|---|---|
| M1.0 Provisioning | **Blocked** | B1 — the account decision is Erik's. Supabase project, `disable_signup` set and verified by observation, Vercel project |
| M1.1 Foundation | Not Started | Schema for 18 entities, RLS everywhere, pgcrypto per §7a with the key in Vault, append-only audit log. Depends on M1.0 |
| M1.2 Access | Not Started | Operator sign-in, MFA enforced in RLS not only in Next.js, agent tokens hashed and scoped, rate limits. FR-1 to FR-8 |
| M1.3 Registry | Not Started | Engagements, contract milestones, acceptance criteria. FR-9 to FR-13 |
| M1.4 Mode 1 ingest | Not Started | Manifest tables, questions normalization, prod.md, requirement ranges, idempotency, the unparsed discipline. FR-14 to FR-23. Buildable on fixtures with no database |
| M1.5 Mode 2 capture | Not Started | Session hook, ingest endpoint, unassigned queue, reason classes, stack attribution. FR-24 to FR-31. Blocked on Q4 for the hook's install scope |
| M1.6 Mode 3 waits | Not Started | Declaration, expected-by, overdue, resolution, date contribution. FR-32 to FR-38 |
| M1.7 Unified model | Not Started | Execution modes, executor kinds, Erik-gates, dependency edges, evidence scopes. FR-39 to FR-44 |
| M1.8 QA traceability | Not Started | Test-title parsing, the independent-certifier rule, billable derivation. FR-45 to FR-51 |
| M1.9 The five answers | Not Started | Five screens, five endpoints, unparsed count on every surface. FR-52 to FR-58 |
| M1.10 Export and handover | Not Started | Export through one function, archive and purge, `docs/user-guide.md`. FR-60, FR-61 |

### Phase 2 — Automation and feedback loops (estimated 4-6 days)

| Milestone | Status | Notes |
|---|---|---|
| M2.1 Probes | Not Started | Automated resolution for external waits. Needs per-vendor credentials, which is a blocker class of its own |
| M2.2 Coverage register | Not Started | The trigger rule live. Consumes M1.5's stack attribution |
| M2.3 Estimate vs actual | Not Started | The bid table by work type and stack |
| M2.4 Critical path | Not Started | Weighted by Erik's serial time, not by agent time |
| M2.5 Harness evidence | Not Started | Detox, manual device scripts, store review outcomes |
| M2.6 Writeback | Not Started | `project-lead` emits the machine-readable block itself, turning every Mode 1 parser into a validator. Retires the whole `unparsed` risk class |

### Phase 3 — Deferred at intake

| Milestone | Status | Notes |
|---|---|---|
| M3.1 Linear or Notion mirror | Deferred | Read-only, client-facing status |
| M3.2 Native mobile | Deferred | The web app is responsive; this is a want, not a need |
| M3.3 Automated invoicing | Deferred | Money stays in Upwork and Stripe permanently |

---

## Active blockers

| ID | Blocker | Owner | Blocks | Resolution path |
|---|---|---|---|---|
| **B1** | Which Supabase organization and which Vercel account this is provisioned into. No Vercel account was reachable from the fleet environment during the reference build, and a prior run destroyed a Supabase project after provisioning into the wrong organization | **Erik** | M1.0, and therefore everything except M1.4 | Name both explicitly here before dispatch. Spec Q7 |
| **B2** | Whether any client contract restricts where that client's project details may be stored. This product copies spec text, defect prose and blocker descriptions out of individual client repos into one database | **Erik** | Ingesting any engagement other than this one | Review live contracts. Spec Q2. Does not block the build |
| **B3** | Retention on commercial and client-prose data is unstated. The §7a baseline is indefinite with no automatic deletion | **Erik** | Nothing — the baseline ships | Spec Q3. Baseline: 7 years on `contract_milestone`, indefinite elsewhere |
| **B4** | Session hook install scope — global with an allowlist, or per project. This is the entire Mode 2 capture path and the two options fail in opposite directions | **Erik** | M1.5's install documentation, not its code | Spec Q4. Recommendation: global with an allowlist of studio project roots |
| **B5** | How a fleet specialist in a fresh worktree obtains the ingest token without it landing in a file | **Erik** | Nothing in v1 under the recommended answer | Spec Q5. Recommendation: specialists never hold it; the dispatching session posts artifacts at end of run |
| **B6** | Whether `engagement.client_name` stays unencrypted. §7a states the exception and the reasoning; it is a judgment about relative harm made by the spec author, not by the person who bears it | **Erik** | Nothing — the baseline ships | Spec Q1. Revisit if B2 turns up a confidentiality clause |
| **B7** | Which stacks seed the register, and the trigger for earning an agent | **Erik** | M2.2 only | Spec Q6. Proposed trigger: two engagements and eight of Erik's hours, or one engagement where the gap blocks a dated milestone |

---

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-17 | Next.js + Supabase + Vercel, not a local CLI | Erik requires a product his own fleet can build. The fleet's specialists cover this stack and no other. A first draft of this design proposed a zero-dependency Python CLI on the strength of running in a fresh worktree with no install; that argument was sound and irrelevant, because the fleet cannot build it |
| 2026-08-17 | Three execution modes converge on one `work_item` table | Separate tables produce three lists Erik merges in his head, which is the state the product exists to fix |
| 2026-08-17 | `unparsed` is the only default for every classifier | A wrong `done` tells Erik a client requirement is satisfied when nothing checked it. Stated in §9 as the load-bearing decision |
| 2026-08-17 | Agent tokens are refused `contract_milestone` entirely | An agent has no reason to read what Erik charges. Least privilege where it is cheap and absolute |
| 2026-08-17 | `engagement.client_name` left unencrypted, stated as an exception in §7a | It is the display, sort and slug key on every surface. The money it would otherwise protect sits on `contract_milestone` and is encrypted. Recorded as a reduction in exposure, not an elimination |
| 2026-08-17 | MFA enforced in RLS, not only in the Next.js layer | The reference build shipped it in the application layer only and a review pass classified that critical |

---

## Open threads

- **The dogfood loop.** This repository's own fleet run produces the first artifacts the product ingests. That makes M1.4 testable against real input on day one, and it makes the product's first honest report a report about itself.
- **Test-title tagging is a backfill Erik owns.** The reference engagement has 925 tests and 38 Playwright specs, none of which names a requirement. M1.8 will correctly report zero mapped coverage across 61 requirements until tags exist. That report is the deliverable, not a defect, and it should not be softened.
- **Writeback is the real fix for Mode 1.** Every hour spent hardening a prose parser is an hour Phase 2's M2.6 makes unnecessary. Build M1.4 to the shapes in the corpus and no further.

---

## Session log

| Date | Session | What happened |
|---|---|---|
| 2026-08-17 | Intake | Read the reference corpus — both manifests, the checkpoint, `prod.md`, the four gate scripts, the questions files. Drafted `spec-v1.md`: 62 FRs, 18 entities, 11 Phase 1 milestones, 7 open questions. `security-gate.sh` PASS. No code written |

---

## Notes on maintaining this file

**For Claude Code / project-lead:** at the end of every build session or run, update the Next session pointer, Current state, milestone statuses, the Decisions log for anything that diverges from or extends the spec, and a one-line Session log entry. Move resolved blockers into the Decisions log with their resolution.

`prod.md` is build-internal. Scope changes go through `spec/change-requests/`, never into this file.
