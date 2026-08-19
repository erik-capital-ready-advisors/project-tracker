# Deploy runbook

Deploy, verify, roll back. Read the "Provisioning is fixed" section before you touch an account
picker.

**Nothing in this repository has been deployed as of commit `3b2c81d`.** Every unit in run `b0952e`
reports "not deployed". What is live at `project-tracker-mu-livid.vercel.app` is six production
deployments of a repository that held only markdown. The schema, however, **is** applied to the live
Supabase project: seven migrations, applied by units i1, i4 and i5. That is real shared state and
discarding the branch does not undo it.

---

## Provisioning is fixed, and it is not a decision this runbook reopens

| Thing | Value |
|---|---|
| Supabase project | `onpvolboecjpdkvurjaf` (`project-tracker`), us-east-1, Postgres 17.6.1.155 |
| Supabase organization | `whneklkrjsulgqzqxsks` ("erik-capital-ready-advisors's Org") |
| Supabase API URL | `https://onpvolboecjpdkvurjaf.supabase.co` |
| Vercel team | `team_J6J1LAU19znwJenYFKgVArEV`, slug `erik-capital-ready-advisors-projects` |
| Vercel production URL | `https://project-tracker-mu-livid.vercel.app` |
| GitHub repository | `erik-capital-ready-advisors/project-tracker`, private, default branch `master` |

These are identifiers, not secrets, and `spec/prod.md` records them as such.

**Why they are fixed.** A prior run in this practice provisioned into the wrong organization. The
session found six other clients' databases sitting alongside the one it had just created, and
recovering meant destroying the project. No agent creates or selects a Supabase organization or a
Vercel account on this project. The target is named in `spec/prod.md` before dispatch and passed to
specialists as a fixed value.

`project-tracker.vercel.app` without the suffix belongs to someone else. Do not assume the bare name.

**Verify the account before trusting a provisioning claim, and use a negative control.** On
2026-08-17 a session reported the Vercel project absent on the strength of `get_project` returning
404 and `list_projects` omitting it. Both readings were accurate about the API and wrong about the
world: the project existed and was deployed, and the MCP connector simply could not see it. HTTP
settled it. The project's hostname answers `302` into `vercel.com/sso-api` with a per-request
`_vercel_sso_nonce`, while two invented names under the same wildcard answer `404` with no
`location` header. "The API cannot see it" and "it does not exist" are different claims, and a check
with no negative control cannot tell them apart.

**Blocker B1b is open.** The Vercel MCP connector sees one project; the CLI sees fifteen. It is a
scope-limited token. Until it is reauthorized through `/mcp` or reissued with team-wide access, the
fleet's `devops` specialist cannot configure environment variables or read deploy state through it.
Use the CLI.

---

## Vercel project configuration

### Framework detection

`vercel.json` is committed and contains exactly:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

**Do not delete it, and do not rely on the dashboard field.** Vercel auto-detects the framework
**once, at project creation**. This project was created on 2026-08-17 against a default branch whose
`package.json` did not exist, so detection had nothing to see. A project carrying `"framework":
null` applies Vercel's static-site default and fails a *successful* Next build with
`No Output Directory named "public" found after the Build completed`. That exact failure cost a run
in this practice a debugging session on 2026-08-07. A correctly-detected project and a null one look
identical in the dashboard UI; the committed `vercel.json` is what makes it deterministic.

**UNVERIFIED:** the project's stored `framework` field has not been read. `get_project` is
unavailable through the connector (B1b). Settle it with `vercel project ls` or one API call, and
expect `nextjs` or a committed `vercel.json` overriding a `null`.

### Install command

Vercel installs with `--frozen-lockfile`. Two consequences:

- `pnpm-lock.yaml` must be committed and in sync with `package.json`, or the deploy fails at install.
- `pnpm-workspace.yaml` must be committed with it. It carries `allowBuilds: unrs-resolver: false`,
  and without an answer there pnpm 11 refuses to run *any* script, including the build. Vercel hits
  the same gate a local worktree does.

### Environment variables

Set per environment. **Production and Preview are separate, and setting one changes nothing about
the other.** Read [env.md](env.md) for what each variable is.

| Variable | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set | set | set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | set | set | set |
| `SUPABASE_SERVICE_ROLE_KEY` | set, `Sensitive` | **absent** | absent |

The Preview gap is deliberate as far as anyone has decided, and it is unresolved. See
[env.md#the-preview-gap](env.md#the-preview-gap). While it stands, every server-side database path
fails on preview deployments, which is why several controls in [security.md](security.md) are marked
`UNVERIFIED`.

Set a Preview variable with:

```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

`vercel` CLI 52.0.0 loops on `git_branch_required` when setting Preview variables and its `next[]`
hint suggests the command that produced the loop. Upgrade first:

```bash
npm i -g vercel@latest    # 59.1.4 worked first try on 2026-08-17
```

**Never paste a key into a shell command that a transcript captures.** Let `vercel env add` prompt
for the value on stdin rather than passing it as an argument.

---

## Supabase migrations

Seven migrations, all already applied to `onpvolboecjpdkvurjaf`:

```
20260819144026_foundation.sql                    extensions, app schema, Vault key, crypto helpers
20260819144331_schema_21_entities.sql            17 enums, 21 tables, triggers, 40 indexes
20260819144540_rls_and_grants.sql                is_operator() chokepoint, RLS, 23 policies, grants
20260819144647_rate_limit_and_rpcs.sql           rate-limit counters and the six public RPC wrappers
20260819162731_audit_log_fr6_columns.sql         FR-6 columns on audit_log
20260819165903_i5_ingest_idempotency_and_gates.sql   open_question.source_key, fleet_run gate columns
20260819170622_i5_upsert_targets_must_be_inferable.sql   partial unique indexes replaced with plain
```

Apply new ones with the Supabase CLI or the MCP `apply_migration` tool. **Name the local file to
match the version `list_migrations` reports.** A mismatch there is how a migration ledger drifts out
of alignment with the files, and this project has a lesson recorded about it.

Four things about this database that will otherwise cost you time:

**1. `public.rls_auto_enable()` already existed before this build.** It is an event-trigger function,
`SECURITY DEFINER`, that enables RLS on every new table created in `public`. Nobody in this build
wrote it. It means **"RLS is enabled on this table" proves nothing about your migration.** A test
asserting the flag passes even when a migration forgot, because the trigger did it. Assert the
**policy**, never the flag: query `pg_policies` and expect a row. Unit i1 proved the point by
creating a throwaway table and doing nothing else to it; it came out `relrowsecurity = true` with
zero policies.

**2. Every new function in schema `public` needs an explicit per-name `REVOKE` from `PUBLIC`.**
`ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS` does not close it. Unit i1 re-measured this against a
negative control: a function created *after* the default-privilege revoke still showed
`proacl = {=X/postgres,...}`, and that leading `=` is PUBLIC holding EXECUTE. This is a rule here,
not a discovery to repeat.

**3. `disable_signup` is a dashboard action.** A fresh Supabase project ships with public signup on
and **no migration closes it**. Set it at Authentication → Sign In / Providers → "Allow new users to
sign up" OFF. Erik did that on 2026-08-17.

Verify it by observation, with the right instrument: **both the open and closed states answer
`422`**, so the status code does not discriminate. The error *code* does. Closed answers
`signup_disabled`; open answers `weak_password` (or another validation code) for the same request.
Erik's verification used three parts: the settings flag reading `disable_signup: true`, the `422
signup_disabled` code on a live `POST /auth/v1/signup`, and `auth.users` still at **0 rows**, which
proves it refuses before account creation rather than creating and rejecting.

**4. Never mutation-prove a live database control by disabling it.** "Make the test go red" is safe
advice for application code and dangerous here, because the only way to redden a database control is
to turn it off. A prior run in this practice replaced two purge-guard trigger functions with no-op
stubs against a live project. Use a database branch, a throwaway object, or an aborting transaction.
`NOT VERIFIED — would require disabling a live control` is a complete and correct answer.

---

## Deploying

The Vercel project is connected to the GitHub repository and auto-deploys on push. A push to
`master` produces a production deployment; a push to any other branch produces a preview.

```bash
git push origin <branch>              # preview deployment
git push origin master                # production deployment
```

Or from the CLI:

```bash
vercel deploy                         # preview
vercel deploy --prod                  # production
```

**UNVERIFIED — neither command was run by this unit.** Both need Vercel credentials this session
does not hold, and running `vercel deploy --prod` from a documentation unit would be a production
change nobody asked for. The syntax is the documented CLI surface, not an observation.

---

## Verifying a deploy

**A redeploy does nothing until the branch is merged.** This is the step that gets skipped and it is
the one that costs days. On a git-connected Vercel project, "Redeploy" rebuilds the **current
production branch**. Code sitting on an unmerged branch ships nothing, and a new environment
variable ships nothing on its own either. "I set the variable and redeployed" can be entirely true
and change nothing that is live.

A run in this practice reported auth as deployed twice while `curl` still returned `200`
unauthenticated, because the code was on an unmerged branch and the variable had landed on Preview
only. That cost two days.

So the verification is **not** "the deploy went green". It is two ground-truth checks:

```bash
# 1. Is the commit actually on the production branch?
git fetch origin
git log --oneline origin/master -5      # expect your commit in this list
```

```bash
# 2. Does the live URL show the CHANGED BEHAVIOUR, not just a 200?
curl -sS -D- -o /dev/null https://project-tracker-mu-livid.vercel.app/
```

Then check the things that are specific to this product:

| Check | Command | Expect |
|---|---|---|
| HTTP redirects to HTTPS | `curl -sS -D- -o /dev/null http://project-tracker-mu-livid.vercel.app/` | `301` or `308` |
| Security headers on the live host | `curl -sS -D- -o /dev/null https://.../` | HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and a `content-security-policy` carrying a nonce |
| The CSP nonce changes per request | run the same curl twice | two different `nonce-` values |
| The CSP names the Supabase host | grep `connect-src` | `https://onpvolboecjpdkvurjaf.supabase.co` and the `wss://` form |
| `X-Powered-By` is gone | grep the headers | absent |
| A screen renders | `curl -sS https://.../blocked` | HTML, not an error page |
| An API route refuses cleanly | `curl -sS -D- https://.../api/waits` | `401` with `missing_authorization`, **not** `500` |

That last row is the one that tells you the environment variables landed. A `500` with an empty body
means `SUPABASE_SERVICE_ROLE_KEY` is missing on that environment. A `500` naming the audit log means
the variables are set but the project is unreachable. The table in
[env.md](env.md#diagnosing-a-500-on-an-api-route) has all three.

**UNVERIFIED — every row of that table.** Nothing is deployed, so nothing was observed at a live
URL. The header set and the per-request nonce **were** observed on a local `next start` on
2026-08-19, and against the same build on 2026-08-19 by units i4 and i6. Local `next start` is not
the deployment, and HSTS in particular means something different when a real browser sees it over
TLS.

### After a schema change

```bash
# The migration ledger and the files should tell the same story
supabase migration list
```

Ad-hoc SQL records nothing while a migration repair records everything, so the file count can
legitimately sit **below** the applied-entry count. Do not delete ledger rows to tidy the mismatch.
Document the asymmetry instead.

---

## Rolling back

**Code.** Vercel keeps every deployment. Promote a previous one:

```bash
vercel rollback                       # interactive, most recent previous production deploy
vercel promote <deployment-url>       # a specific one
```

Then re-run the two ground-truth checks above. A rollback that is not confirmed at the live URL is
the same unverified claim as a deploy that is not.

**UNVERIFIED — neither rollback command was run.** Production, and no credential here.

**Schema.** There is no automatic rollback. Write a forward migration. Two constraints make a
backward one hazardous on this database:

- `audit_log` is **append-only, enforced by trigger**, and refuses `UPDATE`, `DELETE` **and
  `TRUNCATE`** even to the table owner. Unit i1 proved all three, and there are three permanent rows
  in it from probe runs that cannot be removed. That is the control working.
- `test_result` carries the same append-only treatment, which means a cascade delete from
  `engagement` will be refused where it reaches those tables. i1 flagged this as a genuine conflict
  between FR-61's hard deletion and §7a's append-only rule. It is queued and unresolved.

**Data.** There is no export path and no deletion path in this build. FR-60 and FR-61 are milestone
M1.10, blocked pending Erik's approval of CR-002, which is **pending approval and not part of the
spec basis**. If you need a copy of the data before a risky change, take it through Supabase's own
backup, not through this application.

---

## What to do when a deploy fails

| Symptom | Likely cause |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` naming `unrs-resolver` | `pnpm-workspace.yaml`'s `allowBuilds` block was removed or the lockfile drifted. Restore it. It reads like an install problem and is an install-policy gate. |
| `No Output Directory named "public" found` after a *successful* build | The project's `framework` is `null`. `vercel.json` should prevent it; check it is committed on the branch being deployed. |
| Install fails on a lockfile mismatch | `pnpm-lock.yaml` is out of sync. Run `pnpm install` locally and commit the lockfile. |
| Build passes, every API route `500`s | Environment variables are missing on that environment. Production and Preview are set separately. |
| Build passes, the live URL shows the old behaviour | The branch is not merged. See the merge rule above. |
| TypeScript errors on Vercel that do not reproduce locally | Check `pnpm typecheck` on a clean checkout with no `.next/`. `typedRoutes` is deliberately off precisely so a cold checkout type-checks. |

## Preflight, before dispatching a fleet run against this repository

`fleet-preflight.sh` checks six things, measured against this repository on 2026-08-16:

- The session's working directory sits inside the target repository. **Pass the launch cwd
  explicitly**, never `$PWD` after a `cd` earlier in the same Bash call. The harness resets the cwd
  per call, so the `cd` makes the check pass against a repository the session was never launched
  from. A green preflight obtained that way is the same false green as a subagent editing its own
  gate.
- `.gitignore` is **committed** and ignores `.claude/worktrees/`.
- A per-project `.claude/settings.json` exists.
- `CLAUDE.md` contains the literal string `no local equivalent of a credential vault`. A paraphrase
  fails the grep.
- No secret-shaped files are committed.
- Settings allow vault `Knowledge/` read and write.

**UNVERIFIED — this unit did not run `fleet-preflight.sh`.** The six conditions above come from a
vault note recording a measured run on 2026-08-16, not from an execution here.
