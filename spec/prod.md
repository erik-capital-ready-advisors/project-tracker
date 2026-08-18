# Production Plan: Delivery Ledger

**Project:** Delivery Ledger — single-operator delivery tracker for Capital Ready Advisors
**Last updated:** 2026-08-17 — provisioning targets verified against the live APIs
**Current phase:** Pre-build — spec drafted; Supabase and Vercel both provisioned. One dashboard toggle and one connector-scope fix outstanding, neither blocking
**Spec version:** `spec-approved.md` — promoted byte-for-byte from `spec-v1.md` on 2026-08-17 (`6820ade`), verified identical by `diff`
**Active CRs:** none — `spec/change-requests/` does not exist
**Security posture:** declared — spec §7a, 18 entities classified. `security-gate.sh` **PASS on `spec-approved.md`**, and `fleet-preflight.sh` PASS, both 2026-08-17.

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

**Next up: approve the spec and dispatch.** Q7 was answered on 2026-08-17 and **both** provisioning targets are verified. Nothing blocks a dispatch. Two loose ends remain and neither is a build task, so neither has to be closed first.

1. ~~**The Vercel project does not exist.**~~ **CORRECTED 2026-08-17 — it exists and is deployed.** The claim above was wrong and the error is worth keeping: `get_project` on the slug returned 404 and `list_projects` omitted it, and that was read as absence. It is a **visibility limit on the MCP connector**, not absence. Proved by HTTP against a negative control: `project-tracker-erik-capital-ready-advisors-projects.vercel.app` answers **302 to `vercel.com/sso-api`** with a per-request `_vercel_sso_nonce`, identical in shape to the known-good `danishjawaid`, while two invented names under the same wildcard answer **404 with no `location` header**. What remains is **B1b as re-scoped**: the fleet's `devops` specialist drives Vercel through that same connector, so it cannot configure env vars or read deploy state until the connector can see the project.
2. **Public signup is ON.** `GET /auth/v1/settings` on the new project returned `"disable_signup": false` with `"external": {"email": true}` on 2026-08-17. This is FR-1 and it is a dashboard action that **no migration closes**. Authentication -> Sign In / Providers -> "Allow new users to sign up" OFF. **B8 below.**

**Why this order:** the Supabase project is verified empty and correctly located, so M1.4 can be dispatched right now against fixtures with nothing else in place. Everything that touches the database wants signup closed first, because an open signup on a project that is about to hold the studio's whole client book is the one hazard that gets worse the moment there is data.

**Second, before dispatch:** Q2 — whether any client contract restricts where their project details may be stored. This one does not block the build, but it blocks ingesting any engagement other than this repository's own, because ingest copies client prose out of individual repos into one database.

**Dispatch note for `project-lead`:** `plan.md` at the repo root is the detailed brief for **one** work unit — the pure domain core, `src/lib/ingest/`, covering M1.4 plus the pure rules inside M1.6, M1.7 and M1.8. Dispatch it as a single `integration` unit with that file inlined, and decompose every other milestone from the spec as usual. It needs no database, so it does not wait on B1. Its 13 tasks were executed against the real corpus before they were written down; the counts they assert are measured, not estimated.

---

## Current state (one paragraph)

Spec drafted and gated. No product code exists. `spec/spec-v1.md` carries 62 functional requirements across 11 Phase 1 milestones, 18 data entities all classified in §7a, and 7 open questions. `security-gate.sh` and `fleet-preflight.sh` both pass. Nothing has been dispatched and the fleet has not run.

**As of 2026-08-17 the database exists and has been inventoried.** Supabase project `onpvolboecjpdkvurjaf` (`project-tracker`), org `whneklkrjsulgqzqxsks` — Erik's own and the only org his connector can see — us-east-1, Postgres 17.6.1.155, `ACTIVE_HEALTHY`, created 2026-08-17T21:06Z. **Zero `public` tables, zero migrations, zero users.** Two live findings on it: public signup is on (B8), and an event-trigger function `public.rls_auto_enable()` that this build did not write already forces RLS on every new `public` table. **The Vercel project exists and is deployed**, verified by HTTP after the MCP connector reported it absent — see the correction in the Decisions log. The connector still cannot see it, which is the residual B1b.

**Connection facts, recorded because they are identifiers rather than secrets.** Project ref `onpvolboecjpdkvurjaf`, API URL `https://onpvolboecjpdkvurjaf.supabase.co`, Vercel team `team_J6J1LAU19znwJenYFKgVArEV`. **No service-role key has been read or stored by any session, and none should be** — it goes in the environment and nowhere else.

---

## Milestone tracker

### Phase 1 — MVP (estimated 8-10 days)

| Milestone | Status | Notes |
|---|---|---|
| M1.0 Provisioning | **Part done** | Supabase **done and verified** — `onpvolboecjpdkvurjaf`, correct org, empty, inventoried 2026-08-17. Vercel project **exists and is deployed**. Remaining: `disable_signup` OFF (B8), and the Vercel MCP connector cannot see the project (B1b) |
| M1.1 Foundation | Not Started | Schema for 18 entities, RLS everywhere, pgcrypto per §7a with the key in Vault, append-only audit log. **Unblocked — the database exists.** Note that `rls_auto_enable` already forces RLS on new `public` tables, so verification must assert the **policy**, never the flag |
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
| ~~**B1a**~~ | ~~Which Supabase organization~~ | ~~Erik~~ | ~~everything~~ | **RESOLVED 2026-08-17, verified not assumed.** Project `onpvolboecjpdkvurjaf` (`project-tracker`, us-east-1, Postgres 17.6.1.155, created 2026-08-17T21:06Z) in org `whneklkrjsulgqzqxsks`, "erik-capital-ready-advisors's Org". See the Decisions log for the evidence |
| **B1b** | **The Vercel MCP connector cannot see the project.** The project exists and is deployed (verified by HTTP against a negative control, 2026-08-17), but `get_project` 404s and `list_projects` returns only `danishjawaid`. Most likely a project-scoped or stale token | **Erik** | The fleet's `devops` unit only — it drives Vercel through this connector. Does **not** block M1.1 to M1.9 | Reauthorize the Vercel connector via `/mcp`, or reissue its token with access to the whole team. Then re-run `list_projects` and expect two |
| **B8** | **Public signup is enabled** on `onpvolboecjpdkvurjaf`. Observed 2026-08-17: `disable_signup: false`, `external.email: true`. FR-1 says no public signup exists. **No migration closes this** | **Erik** | Nothing mechanically, but it should close before any real data lands | Dashboard: Authentication -> Sign In / Providers -> "Allow new users to sign up" OFF. Then re-probe: both open and closed states answer HTTP 422, so the error **code** discriminates (`signup_disabled` vs `weak_password`), not the status |
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
| 2026-08-17 | **CORRECTION — the Vercel project exists; an earlier entry in this file said it did not** | Reported absent on the strength of a 404 from `get_project` plus an omission from `list_projects`. Both readings were accurate about the API and wrong about the world. HTTP settled it: the project's hostname answers 302 into Vercel's SSO with a per-request nonce, exactly as the known-good `danishjawaid` does, while invented names under the same wildcard answer 404 with no redirect. **The check had no negative control, so nothing established that it could distinguish absent from invisible.** Kept rather than deleted: this is the project's signature defect family pointed at its own tooling |
| 2026-08-17 | **Provisioning target confirmed by observation, not by the URL Erik pasted.** Supabase `onpvolboecjpdkvurjaf` in org `whneklkrjsulgqzqxsks`. Vercel team `team_J6J1LAU19znwJenYFKgVArEV`, slug `erik-capital-ready-advisors-projects` | The account signal was read in the same place it read dirty on run `cd414c`, and it now reads clean: `list_organizations` returns **exactly one** org and it is Erik's; `list_projects` returns exactly two projects, `project-tracker` and `danishjawaid`, both his. On `cd414c` the same call returned six strangers' products. Checking the URL against the API is what separates "Erik says it exists" from "it exists" - and on the Vercel half those two answers disagreed |
| 2026-08-17 | **Inventoried the database BEFORE anything was applied, and it is empty** | Zero `public` tables, `list_migrations` returns `[]`, `auth.users` 0 rows. The only non-zero counts are Supabase's own bookkeeping (`auth.schema_migrations` 77, `storage.migrations` 62), which every fresh project carries. Replay is therefore safe, and this is recorded now because the same inventory was the thing that made `cd414c`'s replay safe - and skipping it is what made the first attempt unsafe |
| 2026-08-17 | **`public.rls_auto_enable()` already exists on the project, and it changes the verification instrument** | An event-trigger function, `SECURITY DEFINER`, `SET search_path TO 'pg_catalog'`, that enables RLS on every new table created in `public`. Nobody in this build wrote it. Two consequences. **(1)** It answers the Danish run's open question about forcing RLS by event trigger - here it is already forced, so that is not a decision left to make. **(2) It means "RLS is enabled on this table" is no longer evidence that the migration enabled it.** A test asserting RLS-on would pass even if a migration forgot, because the trigger did it. Any RLS check must assert the **policy**, not the flag. This is the project's signature defect family - a gate that passes in exactly the case it exists to catch |
| 2026-08-17 | **B13 is live on day zero, and the specific instance is harmless** | `rls_auto_enable`'s ACL reads `=X/postgres | postgres=X/postgres | anon=X/postgres | ...`. The leading `=X` is PUBLIC holding EXECUTE, which is exactly the pattern the reference build documented: `ALTER DEFAULT PRIVILEGES` does not close it and every new `public` function needs a per-name `REVOKE`. **This particular function is not exploitable** - it returns `event_trigger`, so the `/rest/v1/rpc/` path the advisor names cannot actually invoke it. Recorded because the *grant pattern* is real and will apply to every function this build writes, not because this one is dangerous |
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
