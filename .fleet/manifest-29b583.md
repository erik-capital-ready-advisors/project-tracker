# Build manifest 29b583

Spec: /Users/erikmeltzer/Projects/project-tracker (project dir → `spec/`)
Spec basis: `spec-approved.md` + CRs [CR-001, CR-002, CR-003, CR-004]
Spec approved: yes — `spec-approved.md`, client-approved 2026-08-17, byte-identical to `spec-v1.md`
Security posture: declared (22 rows over 21 entities classified) — `security-gate.sh` PASS on the resolved spec
Verification access: §7c declares 2 boundary rows, BOTH declared `reachable` — **BOTH MEASURED UNREACHABLE AT PHASE 0.** See "Verification access — measured" below.
Resolved spec: .fleet/resolved-spec-29b583.md
Prior state: spec/prod.md — M1.1–M1.10 code complete (M1.10 not Complete), M2.7 code complete (not Complete, B31); 14 active blockers
Mode: full
Branch: agent-build/2026-08-23-29b583 (cut from HEAD `8b311c4`, not from `master`)
Started: 2026-08-23T12:35:39Z

## Preflight

`fleet-preflight.sh /Users/erikmeltzer/Projects/project-tracker` → **PREFLIGHT PASS**, 0 WARN, all
nine checks ok, including "session was LAUNCHED in the target repo (derived from
`$CLAUDE_CODE_SESSION_ID`)". Re-run by this agent, not taken from the caller.

`security-gate.sh .fleet/resolved-spec-29b583.md` → **SECURITY GATE PASS**. 22 classification rows,
all 22 Section 7 entities classified, new-account role answered `none`, §7c declares 2 boundary rows.

## Baseline, measured at HEAD `8b311c4` before any dispatch

`pnpm typecheck` **0** · `pnpm lint` **0** · `pnpm test` **1359 passed / 6 skipped** (93 files
passed / 1 skipped) · `pnpm gate:m27` **5 passed / 5**. These agree with `spec/prod.md`'s recorded
numbers exactly, which is what makes a delta at the end meaningful.

## Verification access — measured at Phase 0, not assumed

§7c declares both boundaries `reachable`. **Both were run. Both are unreachable for this run.**

| §7c boundary | Declared | Measured 2026-08-23 | Evidence |
|---|---|---|---|
| Agent token (`ingest:write`, `answer:read`) | reachable | **UNREACHABLE** | `DELIVERY_LEDGER_INGEST_TOKEN` is absent from `.env.local`. The declared mechanism is "a token minted per run", and minting runs through `/settings/tokens`, which needs the operator session below — which is dead. Negative control confirms the probe can detect a working token: `/api/answer/blocked` with no auth → `401 missing_authorization`; with a syntactically wrong token → `401 malformed_authorization`. Two distinct codes, so the surface is live and discriminating |
| Operator sign-in at `aal2` (TOTP) | reachable | **UNREACHABLE** | `.playwright-auth/operator.json` exists (saved 2026-08-20 19:08, `aal2`, `amr: totp,password`) but its access token expired **2026-08-21T00:08:08Z** and the session is revoked. `M27_BASE_URL=http://localhost:3000 M27_STORAGE_STATE=.playwright-auth/operator.json pnpm gate:m27:e2e` → **10 failed / 10**, every one `"/<route> rendered the operator gate (sign-in), so this gate saw no data"`. On 2026-08-20 the same command was 8 passed / 2 failed, so this is a regression in session liveness, not in the product. Consistent with `prod.md`: both sessions leaked by B38 were revoked by hand |

**§7c anticipated exactly this and rules on it**, so this is a declared state rather than a
discovery: *"If Phase 0 cannot produce an `aal2` session, this row is to be treated as `unreachable`
for that run"*, and its stated consequence, verbatim:

> every authenticated screen is built unobserved, `pnpm gate:m27:e2e` cannot run in-run, and
> `docs/user-guide.md` (§7b) cannot be written.

**Three consequences carried into this run before dispatch:**

1. **`docs/user-guide.md` is NOT dispatched.** Its acceptance criterion lives entirely behind the
   unreachable boundary; `docs-writer` in `mode: manual` would return `BLOCKED` for a reason already
   known at Phase 0, and spending a dispatch to collect a predicted `BLOCKED` is the cost §7c exists
   to avoid. **§7b is NOT waived**, so **M1.10 does not reach Complete this run.** Blocker on Erik.
2. **Every unit below builds screens no agent in this run can see.** Each brief says so explicitly,
   so no specialist reports a screen as observed. Verification available to this run is
   typecheck + lint + `pnpm test` + `pnpm build` + `pnpm gate:m27` — code-level only.
3. **B31 stays open and `pnpm gate:m27:e2e` is NOT VERIFIED for this run**, on top of the two
   pre-existing failures (`/next`, `/bottleneck`, which are B39 and not defects).

**One command fixes all of this**, and it is Erik's to run:
`pnpm dev`, then `node scripts/save-operator-session.mjs`.

## Scope ruling — what is dispatched and what is deliberately not

Taken from `spec/prod.md`'s resume board, which names what is fleet-suitable. Honoured as written.

**Dispatched:** B33, B36, B32, B40.

**NOT dispatched, by `prod.md`'s own ruling — recorded so no unit picks them up:**

| Item | Why not |
|---|---|
| **B39** — gate conflates empty with broken | Edits a gate file. Gate-file integrity needs Erik's explicit per-instance authorisation, and the *decision* is his |
| **B38** — gate prints the live session cookie | Edits gate and Playwright config. Same rule |
| **M1.10 purge destruction path** | Deliberately destroys a live engagement. Erik's hands only |
| **B37 follow-up** — auth server-side for Baseline §1 | Changes the auth architecture; wants a CR before anyone builds it |
| **`docs/user-guide.md`** | §7c row 2 unreachable, see above. Not a scope decision — a blocked one |

**Standing rule binding every unit:** `tests/m27-gate.test.ts` and `e2e/m27-navigation.spec.ts` must
not be edited. `6210318` is the only commit that has ever touched either, verified twice by
different agents, and that is the evidence M2.7's gate was written red before dispatch.

## Phase assignment — the reasoning, so it can be overruled

**All four units are phase=1, so this run has no phase=2 units and does not pause for a `continue`.**
The phase model splits structural work from feature pages so Erik can review foundations before
features are built on them. Here every unit is a cross-cutting fix to shared infrastructure of an
already-built app — a shared component (B33), the global navigation model (B36), a shared display
library (B32), the app shell (B40) — and **nothing in this run is built on anything else in this
run**, so a checkpoint between them buys no review and costs an invocation. The one unit that
creates a page, `u2`, completes *navigation* to an entity whose detail view already exists, which
the phase-1 definition names explicitly. **If Erik disagrees, the fix is to split `u2` to phase=2
and re-run; the reasoning is recorded here rather than left implicit.**

## Work-units

File ownership is disjoint by construction — no two units may edit the same file. `u4` is
sequenced after `u1` so that `u1` holds **sole ownership of `src/components/`** for its whole life,
which is the shape `prod.md` names as what avoids the three-way merge that blocked all five of run
`eb2490`'s Wave C units. `u2` and `u3` touch `src/components/` not at all — verified by reading
`main-nav.tsx`, which renders purely from `src/lib/nav.ts` data.

| ID | Type | Phase | Wave | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|------|-------------|---------------|-----------|--------|
| u1 | ui | 1 | A | **B33** — hoist the four-state prose renderer from five copies into one component with one verification contract | ui-designer | — | in_progress (dispatched 2026-08-23T12:52Z) |
| u2 | ui | 1 | A | **B36** — `/questions/[id]` is unreachable: add a `/questions` list route and a nav entry so an open question is linked from somewhere | ui-designer | — | **done** — report gate PASS; +15 tests, 41→42 routes; found a positional-index landmine in 5 sibling pages |
| u3 | ui | 1 | A | **B32** — the money-formatter split: `formatAmount` `$111.00` vs `money` `111.00 USD`, one click apart since M2.7 | ui-designer | — | in_progress — returned, **report gate FAIL**, resumed to fix (see note) |
| u4 | ui | 1 | B | **B40** — no sign-out control exists anywhere in the signed-in app | ui-designer | u1 | pending |
| qa1 | qa | final | C | Independent review of the merged branch, incl. trajectory grading | qa-reviewer | u1,u2,u3,u4 | pending |

### Owned files, per unit

- **u1** — NEW `src/components/prose-value.tsx` (its only file in `src/components/`); and the five
  existing copies: `src/app/blockers/[id]/_components/blocker-detail-view.tsx`,
  `src/app/defects/[id]/_components/defect-detail-view.tsx`,
  `src/app/milestones/_components/prose-value.tsx`,
  `src/app/requirements/_components/detail-prose.tsx`,
  `src/app/work-items/[id]/_components/work-item-detail-view.tsx`.
- **u2** — `src/lib/nav.ts`; NEW `src/app/questions/page.tsx` and `src/app/questions/_components/*`;
  the questions list loader (extend `src/lib/detail-load.ts` or a sibling). **Not** `src/components/`.
- **u3** — `src/lib/money-display.ts`, `src/lib/registry-display.ts`, and the four consumers:
  `src/app/committed/_components/committed-totals.tsx`,
  `src/app/committed/_components/committed-table.tsx`, `src/app/milestones/[id]/page.tsx`,
  `src/app/registry/_components/milestone-table.tsx`. **Not** `src/components/`.
- **u4** — `src/components/app-shell.tsx`, `src/components/mobile-nav.tsx`, and a NEW sign-out
  component. **Not** `src/lib/nav.ts`, **not** `src/components/main-nav.tsx`, **not** `u1`'s file.

## Defer list — with reasons, distinguishing "out of scope" from "not yet implemented"

**No type is deferred because its specialist is a stub.** Every specialist in the roster is
functional; `mode: full` makes every type dispatchable. These are scope decisions:

- **`integration`** — out of scope. No unit in this run needs schema, RLS, a route handler or an
  auth flow. `u2`'s list loader is a read following the eight loaders `i1` already built, inside a
  `ui` unit. No migration is written this run.
- **`deploy`** — out of scope, and deliberately so. Vercel's Production Branch is `master` and
  nothing has ever been deployed to production; the first production deploy is Erik's decision,
  not an agent's. `B22` (Preview carries no service-role key) is his too.
- **`copy`** — out of scope. This is an internal single-operator tool with no marketing surface.
  What copy exists is microcopy inside the four `ui` units (a sign-out label, a nav entry, an
  empty state), which those units write in place; a separate `copy` unit would grep for
  `COPY:` markers these units do not leave.
- **`research`** — out of scope. No unknown in these four items needs resolving before build; each
  is a defect with a named cause and a named file set in `prod.md`.
- **`docs`** (operator handoff) — out of scope. `docs/` already carries `agent-tokens.md`,
  `deploy.md`, `env.md`, `security.md`, `session-hook.md`, and these four fixes change nothing an
  operator runbook documents.
- **`docs` (§7b end-user manual)** — **NOT out of scope: BLOCKED.** See "Verification access" above.

## Dispatch budget

5 of 20 planned: u1, u2, u3, u4, qa1.

## Report-gate results

Run as `report-gate.sh <path the specialist returned> 29b583` — the returned path, never a
constructed one, and this run's id, never the report's own.

- **u3** — `REPORT GATE FAIL`, verbatim: ``FAIL  `## Questions Queued` still carries template text: <code>``.
  **Adjudicated a false positive on real prose, not an unfilled placeholder.** Line 206 of the
  report describes the rendered format string ``"<number> <code>"`` — the specialist quoting actual
  output — and the gate greps for the literal token `<code>` as a template marker. Every other
  check passed: run id matched, all 6 mandated sections present, 11 files listed, Verification
  carried observations, and the 1 queued question was present on disk in the named per-unit file.
  **Not merged on a failing gate, and the gate was not edited.** The specialist was resumed to
  reword its own sentence and re-run the gate itself. Recorded as a fleet learning: the gate's
  template-text check cannot distinguish a placeholder from prose that legitimately quotes a
  format string containing angle brackets.
- **u2** — `REPORT GATE PASS`. Run id matched, all 6 mandated sections, 9 files listed,
  Verification carried observations, 2 queued questions present on disk in the named per-unit file.
