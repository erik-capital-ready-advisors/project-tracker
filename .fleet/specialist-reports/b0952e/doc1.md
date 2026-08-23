# docs-writer report — doc1

**Status:** DONE
**Run:** b0952e
**Mode:** handoff
**Unit:** doc1 — the handoff documentation
**Branch:** `agent-build/2026-08-19-b0952e`, worktree reset `c835cf9` → `3b2c81d` before any work, both preconditions proved empty first.

## Summary

Six documents describing what commit `3b2c81d` actually does: a README, an environment-variable page,
a deploy runbook, agent-token issuance, the session-hook install, and a security posture split into
verified / built-but-unverified / not-built. Every command in the README quickstart was run in order
against a **fresh clone with no `node_modules`** and a scrubbed environment. B4 and B5 are written as
open decisions with both failure modes and Erik's recommendation. Nothing outside `docs/**` and
`README.md` was touched.

## Technical level

**technical** — supplied by the dispatcher and confirmed against spec §7b, which states it in Erik's
own words: "Job title, in his own words: 'me'. Technical level: technical. He has a terminal, writes
the specs this product ingests, and installs the session hook himself." One user, no handover. So the
docs skip installing a package manager and skip explaining React, and spend the space on what was
measured versus assumed instead.

## Files created / modified

All created. Nothing existing was modified.

- `README.md` — product, six answers, three modes, the two disciplines, stack, quickstart with a
  named stopping point, scripts table, layout, build state at this commit
- `docs/env.md` — 4 application variables plus 6 hook variables, the stopping point, a 500-diagnosis
  table, the preview gap
- `docs/deploy.md` — provisioning (fixed, with the reason), Vercel config, migrations, the merge
  rule, verification, rollback, failure table, preflight
- `docs/agent-tokens.md` — shape, the two capabilities, issue/rotate/revoke, expiry, auth order,
  rate limits, audit, B5
- `docs/session-hook.md` — what it captures, setup, **B4 as an open decision**, why it always exits 0
- `docs/security.md` — the three lists, data classes, encryption stated exactly, retention, third
  parties, open questions
- `.fleet/questions-doc1-b0952e.jsonl` — 9 questions
- `.fleet/specialist-reports/b0952e/doc1.md` — this report

**Not created:** `docs/user-guide.md`. That is the later `manual` dispatch's file.
**Not touched:** any source file, `next.config.ts`, `src/proxy.ts`, `package.json`, `.env.example`,
`CLAUDE.md`, `spec/**`, `scripts/**`, `supabase/**`.

## Every command in the docs, and what it actually did

Run on 2026-08-19. The rows marked "fresh clone" ran in
`scratchpad/clean`, a `git clone` of `3b2c81d` with no `node_modules`, in a shell with
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`APP_ENCRYPTION_KEY_NAME`, `DELIVERY_LEDGER_URL` and `DELIVERY_LEDGER_INGEST_TOKEN` all unset.

| Doc | Command | Ran? | Observed |
|---|---|---|---|
| README | `git clone https://github.com/erik-capital-ready-advisors/project-tracker.git` | **no** | `UNVERIFIED` — private repo, no GitHub credential. Cloned from a local path instead to test everything downstream. URL matches `git remote -v`. Marked in the doc. |
| README | `pnpm install --frozen-lockfile` | yes, fresh clone | exit 0, `Done in 2.5s using pnpm v11.1.2`. No `ERR_PNPM_IGNORED_BUILDS`. |
| README | `pnpm typecheck` | yes, fresh clone + worktree | exit 0, no diagnostics |
| README | `pnpm lint` | yes, fresh clone + worktree | exit 0, no findings |
| README | `pnpm vitest run` | yes, fresh clone + worktree | `45 passed \| 1 skipped (46)` files, `583 passed \| 6 skipped (589)` tests |
| README | `pnpm build` | yes, fresh clone + worktree | exit 0, 18 routes, all `ƒ`, `ƒ Proxy (Middleware)` present |
| README | `git status --porcelain` after the full quickstart | yes, fresh clone | **empty**. `CLAUDE.md` not dirtied; `agentRules: false` holds. |
| README | `pnpm next start -p 3000` | yes, port 3179/3177 | serves; 11 screens `200`, `/no-such-page` `404` |
| README / env | 7 API routes, unauthenticated, no env | yes | all `500` with an **empty body** |
| env | `curl -sS -D- http://127.0.0.1:3179/` | yes | full security header set + per-request nonce CSP; `connect-src 'self'` only |
| env | same, with `NEXT_PUBLIC_SUPABASE_URL` set to a placeholder | yes | `connect-src 'self' https://example-ref.supabase.co wss://example-ref.supabase.co` |
| env | `POST /api/ingest/run` with all three vars set to placeholders | yes | `500` `{"error":{"code":"internal_error","message":"The request was not completed because it could not be recorded in the audit log. Nothing was served unrecorded."}}` |
| session-hook | hook with neither required variable set | yes | exit `0`, no output, no request |
| session-hook | hook with `DELIVERY_LEDGER_URL=http://…` | yes | exit `0`; curl refused with `curl: (1) Protocol "http" disabled` |
| session-hook | same curl **without** `--proto` (positive control) | yes | `http_code=500` — the URL was reachable, so the `--proto` guard did the refusing |
| session-hook | the `SessionEnd` JSON snippet for `~/.claude/settings.json` | **no** | `UNVERIFIED` — no hook registered by this unit. Marked in the doc. |
| README | `pnpm e2e` | **no** | `UNVERIFIED` — needs `pnpm exec playwright install`. Marked in the doc. |
| README | `pnpm dev` | **no** | Not run. Documented with i4's measured `agentRules` behaviour rather than a fresh observation. |
| deploy | `vercel deploy` / `vercel deploy --prod` | **no** | `UNVERIFIED` — production, and no Vercel credential. Marked in the doc. |
| deploy | `vercel rollback` / `vercel promote` | **no** | `UNVERIFIED` — production. Marked in the doc. |
| deploy | `vercel env add`, `vercel env pull`, `vercel link` | **no** | `UNVERIFIED` — no Vercel credential; MCP connector cannot see the project (B1b). Marked in the doc. |
| deploy | `supabase migration list` | **no** | `UNVERIFIED` — no Supabase credential. |
| deploy | every live-URL verification row | **no** | `UNVERIFIED` — nothing is deployed. Marked in the doc, including that a local `next start` is not the deployment. |
| deploy | `fleet-preflight.sh` | **no** | `UNVERIFIED` — the six conditions come from a vault note recording a measured 2026-08-16 run, not from an execution here. Marked in the doc. |

**Quickstart run against a clean state: YES.** Fresh `git clone` of `3b2c81d` into a temp directory,
no `node_modules`, environment scrubbed. All five commands exit 0, route statuses identical to the
worktree, working tree clean afterwards. The clone was deleted after the run.

Every unrunnable command carries `UNVERIFIED` **in the document itself**, not only here.

## Spec vs branch — gaps I documented as limitations

- **FR-7 is PARTIAL.** Tokens are revocable and rotatable, but not "from the interface": there is no
  token screen at this commit. Documented in `docs/agent-tokens.md`.
- **No sign-in and no MFA enrolment screen exist anywhere in the App Router**, and no unit in this
  run builds one. `auth.users` is 0 rows. Every operator screen refuses once u2/u4 wire them.
  Documented in `README.md` and `docs/security.md` as the largest gap in the build.
- **FR-5's refusal is application-layer, not database-enforced.** §7a reads as though it is enforced
  in the database. It is not: handlers read with `service_role`, which holds `BYPASSRLS`. Documented
  in `docs/agent-tokens.md` and `docs/security.md`, including what the proxy does not catch.
- **FR-24's directory-to-engagement resolution is unavailable under an agent token**, because §7a
  grants `engagement` name and slug only and resolution needs `repo_path`. Sessions land against
  `unassigned`. Documented in `docs/env.md` and `docs/session-hook.md`.
- **FR-60 export and FR-61 deletion do not exist.** M1.10, blocked on CR-002, which is pending
  approval and not part of the spec basis. Documented as blocked scope with the reason, and with the
  i1 finding that append-only triggers will refuse a cascade into `audit_log` and `test_result`.
- **FR-62's retention timer is not built**, deliberately, while Q3 is open. `agent_token`'s 90-day
  window is a statement, not a mechanism.
- **FR-58 reports a count; nobody watches the rate.** Documented in `docs/security.md` under
  "Not built", with the vault-note precedent about a legitimate empty state hiding an outage.
- **Spec §5a says "five answers"; there are six.** CR-001 added Broken. `src/lib/nav.ts` is correct;
  the spec text predates the CR. Documented in the README.

## Known limitations carried from specialist reports

- Eleven distinct `UNVERIFIED` controls, tabulated in `docs/security.md` §2, each with what would
  settle it. The common cause is that no worktree holds a Supabase credential and Preview has no
  service-role key.
- Rate-limit figures (60/min, 120/min) are unit i4's, not §7a's. Named as such in
  `docs/agent-tokens.md`.
- `engagement`'s agent column allowlist was resolved restrictively by i4 and is queued. Named in
  `docs/agent-tokens.md`.
- Fixed-window rate limiter carries a 2x boundary burst. Named.
- Three permanent `audit_log` rows from probe runs cannot be removed. Named in `docs/deploy.md` and
  `docs/security.md` as the control working.
- Two migrations are applied to the live Supabase project and are not undone by discarding this
  branch. Named at the top of `docs/deploy.md`.

## Broken things found while verifying

1. **`CLAUDE.md` names a fixture directory that does not exist.** It says "Fixtures under
   `tests/fixtures/` are byte copies of real fleet artifacts." There is no `tests/fixtures/`.
   `tests/` holds two `.test.tsx` files. Tier-1 shapes live in five `__fixtures__/` directories under
   `src/`; Tier-2 byte copies live in gitignored `fixtures-local/`. The README documents the tree and
   names the discrepancy. **I did not edit `CLAUDE.md`** — not doc1's file. Queued.

2. **`next.config.ts`'s comment contradicts i4's measurement.** The comment above `agentRules` says
   Next writes the block "on every `next dev` and `next build`". i4 traced it to
   `ensureAgentRulesForDev` and proved `next build` never writes it. The flag is correct; the comment
   would mislead anyone re-testing the flag with a build. **I did not edit the source.** Queued.

3. **`.env.example` omits `DELIVERY_LEDGER_SESSION_STARTED_AT`**, which
   `scripts/claude-session-capture.sh` reads. No `SessionStart` hook ships, so every captured session
   records a zero-length duration. Documented in `docs/env.md` and `docs/session-hook.md`. Queued.

4. **`APP_ENCRYPTION_KEY_NAME` is documented in `.env.example` and read by nothing.** No
   `process.env` reference exists; the migration hardcodes `delivery_ledger_column_key` in three
   places. Not a defect exactly, but a variable that looks configurable and is not. Documented with
   the warning that the two must change together.

5. **Installing the session hook globally, as recommended, is not possible at this commit** without a
   code change. The hook implements no allowlist. Pasting the global snippet gives global capture
   with no filter, which is the failure mode the recommendation exists to avoid. Documented plainly
   in `docs/session-hook.md` and queued.

6. **Agent-token issuance has no reachable path**, so `docs/agent-tokens.md` and
   `docs/session-hook.md` both terminate at the same wall. This is the stopping point for mode-2
   capture and it is queued.

No source defect was papered over by careful wording, and no doc describes a command as working that
does not.

## Best-guess decisions

- **Wrote `docs/security.md`, which the dispatch brief did not list.** The `docs-writer` contract
  requires it whenever the spec carries `## 7a. Security & Data Classification`, and the resolved
  spec does. Six documents rather than five.
- **Split the hook into `docs/session-hook.md`** rather than folding it into the deploy runbook. B4
  needed room to state both failure modes, and burying an unresolved decision in a runbook section
  is how someone installs the wrong thing without noticing they chose.
- **Did not invoke `marketing:draft-content` for the README overview.** The contract scopes it to
  "the README's opening overview, where plain-English framing matters". The reader here is the person
  who wrote the spec, sole user, no handover, and there is no framing gap for it to close. Running
  marketing voice at a runbook audience risked the opposite failure. `stop-slop` was invoked and
  applied throughout. Flagging the deviation rather than hiding it.
- **Ended the README quickstart at `pnpm next start`**, and said in the doc that stopping there
  yields a working local site. Walking the reader to a Supabase step they cannot perform would be
  accurate sentence by sentence and useless, which is the failure the contract names. Verified the
  claim rather than assuming it: the app builds and serves every screen with **zero** environment
  variables set.
- **Documented the 500-with-empty-body vs 500-naming-the-audit-log distinction** as a diagnosis
  table. Both were observed. A reader with seven identical 500s otherwise has no way to tell a
  missing variable from an unreachable project.
- **Named `SUPABASE_SERVICE_ROLE_KEY` as the one variable that matters**, and said the other three
  degrade features. Measured, not inferred.
- **Recorded provisioning identifiers in `docs/deploy.md`** (project ref, org, team). `spec/prod.md`
  records them as identifiers rather than secrets, and FR-78's check constraint refuses
  secret-shaped values in exactly those columns. No secret appears anywhere.
- **Used the literal strings `placeholder-not-a-real-token` and `placeholder-not-a-real-key` in
  probes**, and an all-zeros UUID plus 64 zeros for the token-shape example. No real credential was
  read, written, echoed or requested at any point.
- **Left `docs/deploy.md`'s live-URL verification table in the document although every row is
  unverified.** The table is what someone should run after the first deploy. Deleting it because
  nothing is deployed yet would remove the runbook's most useful page.

## NOT VERIFIED, and what would settle each

| # | Claim | Why | Settled by |
|---|---|---|---|
| 1 | The GitHub clone URL | Private repo, no credential | `git clone` it |
| 2 | `pnpm e2e` | Playwright browsers not installed | `pnpm exec playwright install && pnpm e2e` |
| 3 | `pnpm dev` behaviour | Not run; i4's measurement used instead | `pnpm dev`, then `git status --porcelain CLAUDE.md` |
| 4 | Every `vercel` CLI command | No Vercel credential; B1b blocks the connector | Run them from a session with `vercel login` |
| 5 | Every live-URL check in `docs/deploy.md` | Nothing is deployed | Deploy, then run the table |
| 6 | HTTP→HTTPS redirect and HSTS in production | Local `next start` is not the deployment | `curl -sS -D- -o /dev/null http://<deployment>/` |
| 7 | An API route answering `401` rather than `500` | Needs a reachable Supabase project | One `curl` against a configured preview deployment |
| 8 | The `SessionEnd` settings snippet | No hook registered | Register it, end a session, find the row |
| 9 | A successful hook post | No `ingest:write` token exists | Issue one, set the variables, end a session |
| 10 | `supabase migration list` output | No Supabase credential | Run it |
| 11 | The Vercel project's `framework` field | Connector cannot see the project | `vercel project ls` or one API call |
| 12 | `fleet-preflight.sh`'s six conditions | Not run here | Run it, passing the launch cwd explicitly |

Every one of these appears as `UNVERIFIED` in the document that makes the claim.

## Prior fleet learnings used

- `Knowledge/A redeploy does nothing until the branch is merged - verify deploy state, not the claim.md`
  — **CONFIRMED and load-bearing.** It is the merge rule in `docs/deploy.md`, written as two
  ground-truth checks (`git log origin/master`, then observe changed behaviour at the live URL)
  rather than "the deploy went green". The note's per-environment variable point drove the
  Production/Preview table.
- `Knowledge/Vercel reads framework null as a static site, so a successful Next build fails on a missing public directory.md`
  — **CONFIRMED as a design constraint.** `vercel.json` is already committed with `"framework":
  "nextjs"`. The note's real value is that auto-detection runs once at project creation and this
  project was created before `package.json` existed, so the runbook says to check the field via API
  and not the dashboard, and to never delete `vercel.json`.
- `Knowledge/Next.js 16 + Tailwind v4 Build Gotchas.md` — **CONFIRMED in its corrected form.** The
  `unrs-resolver` build-trust gate is already answered in `pnpm-workspace.yaml`, and the README says
  not to remove it and why it presents as a build failure when it is an install-policy gate.
- `Knowledge/PostgREST silently truncates unbounded reads at 1000 rows.md` — **CONFIRMED via i5 and
  i6**, both of which bounded every read. Not repeated as a runbook step because it is already
  enforced in code.
- `Knowledge/A legitimate empty state hides an outage - monitor the rate, not the count.md` —
  **APPLIED as a documented gap.** It is why `docs/security.md` lists unparsed-rate monitoring under
  "Not built" rather than treating the FR-58 count as sufficient.
- `Knowledge/Mutation-proving a database control means disabling it, so bound the instruction before dispatching.md`
  — **APPLIED.** `docs/deploy.md` carries the bound, and states that
  `NOT VERIFIED — would require disabling a live control` is a complete answer.
- `Knowledge/An agent instruction file is authoritative about why, never about what the code does now.md`
  — **CONFIRMED, twice, on this repository.** `CLAUDE.md`'s `tests/fixtures/` claim and
  `next.config.ts`'s `agentRules` comment are both wrong about the current tree. Shaped the README's
  closing line about reading `CLAUDE.md` for rationale and the code for behaviour.
- `Knowledge/What security-gate.sh and fleet-preflight.sh actually require to pass - measured 2026-08-16.md`
  — **APPLIED** as the preflight section of `docs/deploy.md`, marked `UNVERIFIED` since I did not run
  the script.
- `Knowledge/Enforce MFA in RLS - an app-layer second factor is not a boundary when the anon key ships in the browser.md`
  — **CONFIRMED via i1's truth table**, and it is why `docs/security.md` reports the MFA control as
  verified with the positive control included.
- `Knowledge/ADR-2026-08-16 - Three execution modes converge on one work-item table.md` —
  **CONFIRMED.** The README's three-modes section states the one-table invariant and the "Erik never
  types a status" rule, plus why the stack is fixed.
- `Knowledge/Redact by allow-listing safe keys - a block-list sed pattern can silently no-op.md` —
  **APPLIED to my own conduct.** No secret was printed at any point; the hook probe used a literal
  placeholder rather than redacting a real value.

**Contradiction found and reported rather than propagated:** none of the vault notes conflicted with
the branch. The two contradictions I found are both repo-internal (`CLAUDE.md` and `next.config.ts`)
and are queued rather than fixed, because doc1 owns neither file.

## Questions queued

`.fleet/questions-doc1-b0952e.jsonl` — 9 lines, each carrying `"unit": "doc1"`. In priority order:

1. **B4** session-hook install scope, plus the finding that Option A is not installable as
   recommended without a code change.
2. **Operator sign-in.** No route, no account, no unit building one. The largest gap.
3. **Agent-token issuance is unreachable**, which is what actually blocks the hook.
4. **B5** specialist ingest token: confirm recommendation 3.
5. **Vercel Preview service-role key**, the single change that closes most of the unverified list.
6. `SessionStart` hook and the zero-duration records.
7. `CLAUDE.md`'s non-existent `tests/fixtures/`.
8. `next.config.ts`'s stale `agentRules` comment.
9. Unparsed-rate monitoring: Phase 2 or a CR?

## Verification of the definition of done

```
pnpm typecheck   → exit 0, no diagnostics
pnpm lint        → exit 0, no findings
pnpm vitest run  → 45 files passed | 1 skipped; 583 tests passed | 6 skipped
pnpm build       → exit 0, 18 routes, ƒ Proxy (Middleware) present
```

All four re-run in the worktree **after** the documents were written. The 6 skipped are the Tier-2
`fixtures-local/` corpus assertions; that directory is absent and no fixture was synthesised.

No source file was changed, so those four results are a check that I did not change one rather than
evidence about the code.

## Not deployed

Nothing in this unit is live and nothing in it touches a deployment, a database, an organization or
an account. It is six markdown files on `agent-build/2026-08-19-b0952e` in a worktree.
