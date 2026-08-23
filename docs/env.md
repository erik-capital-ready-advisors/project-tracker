# Environment variables

Eight variables exist. Three are read by the application. Five are read by the session-capture hook
from Erik's own shell and belong nowhere near Vercel.

**Placeholders only in this document.** Every value shown below is the shape, not the secret.

## The rule this whole page sits under

Secrets come from the environment and from nowhere else.

- Never write a real key into a committed file. Not `.env`, not a config module, not a JSON fixture,
  not a test file.
- Never write a real key into a scratch file, a `/tmp` note, or a report under `.fleet/`. A scratch
  file is not a safe place; it is an uncommitted place, and those are different things.
- Never echo a secret into a transcript to check it. `echo $KEY | head -c 8` puts the key in the
  transcript.
- `.env.example` documents which variables exist and what shape they take. Placeholders, never
  values.

**There is no local equivalent of a credential vault.** Nothing on this machine is a safe place to
park a key "for now". If a key is needed and absent, ask for it to be set in the environment. Do not
store it somewhere convenient. A task that appears to require a real secret is a blocker to report,
not a puzzle to solve.

`.claude/settings.json` denies reads of `.env`, `.env.local`, `*.pem`, `id_rsa*` and
`service-account*.json`, and that denial covers Bash as well as `Read`. `cat .env.local` gets
refused the same way. Treat the denial as the rule working.

---

## Application variables

### `NEXT_PUBLIC_SUPABASE_URL`

- **Shape:** `https://<project-ref>.supabase.co`
- **Where it comes from:** the Supabase dashboard, Project Settings → API. For this project the ref
  is `onpvolboecjpdkvurjaf`, so the value is `https://onpvolboecjpdkvurjaf.supabase.co`. That is an
  identifier, not a secret, and `spec/prod.md` records it as such.
- **Secret:** no. It ships in the browser bundle by design.
- **Environments:** Production, Preview and Development on Vercel. Already set on all three as of
  2026-08-17.
- **Read by:** `src/lib/supabase/env.ts` (browser and server clients), `src/lib/supabase/service.ts`
  (which additionally asserts the `https://` scheme and throws on anything else), and `src/proxy.ts`.
- **Required to boot?** No. The build and every screen work without it. See the stopping point
  below.

One consequence worth knowing before you chase it as a bug: `src/proxy.ts` derives the CSP's
`connect-src` from this variable **at request time**. Observed on 2026-08-19:

```
# variable unset
connect-src 'self';

# NEXT_PUBLIC_SUPABASE_URL=https://example-ref.supabase.co
connect-src 'self' https://example-ref.supabase.co wss://example-ref.supabase.co;
```

So with the variable absent, the browser Supabase client would be blocked by the page's own CSP even
if it had a key. The two failures look different in the console and have one cause.

### `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

- **Shape:** `sb_publishable_<...>`
- **Where it comes from:** Supabase dashboard, Project Settings → API, the publishable key.
- **Secret:** no, and this is a design property rather than a concession. The key carries no
  privileges of its own; every read it performs stays subject to row-level security. Unit i1 probed
  it against four tables and every one answered `401` with `42501 permission denied`, not `200 []`.
  The grant is gone, not merely filtered.
- **Environments:** Production, Preview and Development. Already set on all three.
- **Read by:** `src/lib/supabase/env.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`,
  `src/proxy.ts`.
- **Required to boot?** No.

### `SUPABASE_SERVICE_ROLE_KEY`

- **Shape:** an opaque service-role key. Never write one down anywhere.
- **Where it comes from:** Supabase dashboard, Project Settings → API. **Erik sets this himself.**
  No agent session has ever read it and none should.
- **Secret:** yes, and it is the sharpest credential in the system. `service_role` holds `BYPASSRLS`.
  Every policy written in `20260819144540_rls_and_grants.sql`, including `app.is_operator()` where
  FR-2's MFA requirement and FR-3's deny-by-default role live, is inert against this key. It is the
  one credential that can read every client's contract amounts.
- **Never prefix it `NEXT_PUBLIC_`.** `src/lib/supabase/service.ts` opens with `import "server-only"`,
  so an import from a Client Component fails the **build** rather than leaking the key at runtime.
- **Environments:** Production only, as of 2026-08-17, marked `Sensitive` (write-only) by Erik.
  **Preview has no copy.** See "The preview gap" below.
- **Read by:** `src/lib/supabase/service.ts` and nothing else.
- **Required to boot?** No, but every API route fails without it. This is the stopping point.

### `APP_ENCRYPTION_KEY_NAME`

- **Shape:** `delivery_ledger_column_key`
- **What it is:** the *name* of a secret in Supabase Vault, not the key. The key itself was generated
  inside Vault by migration `20260819144026_foundation.sql` and has never left it.
- **Secret:** no. It is a lookup name.
- **Read by:** **nothing, at this commit.** No file calls `process.env.APP_ENCRYPTION_KEY_NAME`. The
  name appears once in the tree, inside an error message in
  `src/lib/server/workitems/field-crypto.ts:61`, and `supabase/migrations/20260819144026_foundation.sql`
  hardcodes the literal `delivery_ledger_column_key` in three places instead of reading a variable.
- **Why it still matters:** the hardcoded name in the migration and this variable must be changed
  together. Changing one alone breaks decryption, and it breaks it loudly. Unit i1 renamed the Vault
  secret inside a transaction and observed
  `delivery_ledger: Vault secret "delivery_ledger_column_key" is absent or unreadable`, raised rather
  than returned as `NULL`. Silent data loss was designed out.
- **Do not set it on Vercel.** It would do nothing.

---

## The stopping point

Measured on 2026-08-19 against commit `3b2c81d`, on a clean `pnpm install --frozen-lockfile`, with a
`next start` launched carrying **no environment variables at all**.

**What works with nothing set:**

| Check | Observed |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0, `Done in 2.5s using pnpm v11.1.2` |
| `pnpm typecheck` | exit 0, no diagnostics |
| `pnpm lint` | exit 0, no findings |
| `pnpm vitest run` | 583 passed, 6 skipped |
| `pnpm build` | exit 0, 18 routes, `ƒ Proxy (Middleware)` present |
| `GET /` and all ten other screens | `200` |
| `GET /no-such-page` | `404` |
| Security headers on every response | HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-DNS-Prefetch-Control`, and a per-request nonce CSP |

**You have a working local site at that point.** Stop there if that is what you needed.

**What does not work with nothing set:** every API route answers `500` with an empty body. Seven
routes, all of them:

```
GET  /api/session/unassigned   500
GET  /api/waits                500
POST /api/ingest/run           500
POST /api/ingest/session       500
POST /api/ingest/release       500
POST /api/waits                500
POST /api/waits/resolve        500
```

The cause is `createServiceClient()` throwing on the missing `SUPABASE_SERVICE_ROLE_KEY` outside the
route guard's `try` block, so nothing shapes the error into a response body. Unit i6 recorded the
same behaviour independently.

**Which variable is the one that matters:** `SUPABASE_SERVICE_ROLE_KEY`. Without it, no API route
runs. Without the two `NEXT_PUBLIC_*` variables the screens still render, but no browser-side
Supabase call could reach the project even if it had a key, because the CSP would not name the host.

---

## Diagnosing a `500` on an API route

Three failure modes produce a `500`. The response body tells them apart.

| Body | Meaning | Fix |
|---|---|---|
| *empty* | `SUPABASE_SERVICE_ROLE_KEY` is unset. The client throws before the guard can shape a response. | Set the variable. |
| `{"error":{"code":"internal_error","message":"The request was not completed because it could not be recorded in the audit log. Nothing was served unrecorded."}}` | All three variables are set, but the project is unreachable or the credentials are wrong. The guard writes its audit row before running the handler and **fails closed** by design: a request that cannot be recorded is not served. | Check the URL and the key. Check the project is not paused. |
| Anything else | A handler error. | Read the Vercel runtime logs. The body never carries a database message; unit i8 verified that with the `release` table forced to error, and the response contained no `relation release`. |

Both rows above were observed on 2026-08-19: the first with no variables set, the second with all
three set to placeholder values (`https://example-ref.supabase.co`, `sb_publishable_placeholder`,
`placeholder-not-a-real-key`). No real credential was used.

A correctly configured route answering `401 missing_authorization` to an unauthenticated request is
**UNVERIFIED**. Reaching it needs a live Supabase project, which this unit had no credential for.
The refusal is observed at the unit level through the real `withAgentRoute` in
`src/lib/api/guard.test.ts`, `session-route.test.ts` and `waits-route.test.ts`. One `curl` against a
configured preview deployment settles it.

---

## The preview gap

`SUPABASE_SERVICE_ROLE_KEY` is set on **Production only**. Erik re-added it as `Sensitive` on
2026-08-17 and the re-add dropped the Preview copy.

The fleet builds on a branch, so a fleet build deploys to **Preview**. Every server-side database
path therefore fails on preview deployments until the key is added back, which is why unit i6 could
not verify its routes over HTTP.

Erik has not decided this. Two readings, both defensible:

- **Add it back to Preview.** Preview deployments become testable end to end, and specialists can
  observe the refusals they currently mark unverified.
- **Leave Preview without it.** Preview URLs are more exposed than production, and a key that
  bypasses row-level security is the wrong thing to put behind a URL that leaks into pull requests
  and chat messages.

The consequence of leaving it as it is: **anything a specialist marks NOT VERIFIED for want of a
reachable database stays that way**, and the first real observation of those refusals happens in
production.

---

## Session-hook variables

These five are **not application variables and must not be set on Vercel.** They live in the shell
profile that Claude Code inherits on Erik's machine, and `scripts/claude-session-capture.sh` reads
them there. `.env.example` lists them because that file is where this project records which
variables exist, with a block comment saying they are not read by the app.

| Variable | Required | What it is |
|---|---|---|
| `DELIVERY_LEDGER_URL` | yes | The deployment the hook posts to. **Must be `https://`.** The hook passes `--proto '=https'` to curl, so the token cannot cross a plaintext connection. |
| `DELIVERY_LEDGER_INGEST_TOKEN` | yes | An agent token carrying `ingest:write`. Shape `dl_<uuid>_<64 hex>`. Issued once, shown once, stored only as a hash. See [agent-tokens.md](agent-tokens.md). |
| `DELIVERY_LEDGER_ENGAGEMENT` | no | An engagement slug. **Currently the only way an ingested session resolves to a named engagement.** See the note below. |
| `DELIVERY_LEDGER_STACK` | no | The stack this session worked on. Never inferred from the file tree. |
| `DELIVERY_LEDGER_SUMMARY` | no | A one-line summary. Never invented. |

A sixth variable, `DELIVERY_LEDGER_SESSION_STARTED_AT`, is read by the hook and is **not in
`.env.example`**. The hook expects a `SessionStart` hook to export it. Absent, the record carries an
end time and a zero-length window, which reads as "a session happened here" rather than as a
duration nobody measured. No `SessionStart` hook ships in this repository, so every captured session
currently records a zero duration.

Neither of the two required variables set means the hook exits `0` and posts nothing. Verified on
2026-08-19: run with both unset, exit code `0`, no output, no request.

**Why `DELIVERY_LEDGER_ENGAGEMENT` is the only resolution path today.** FR-24 wants a session to
resolve its working directory to an engagement, which needs `engagement.repo_path`. Spec §7a grants
agent tokens `engagement` **name and slug only**. Unit i6 observed the collision directly: the first
run of its route test returned `403 forbidden_table` on `select("id, slug, repo_path")`. It took the
restrictive reading rather than widening a security grant, so a session with no explicit slug lands
against the `unassigned` engagement and waits in the one-click attribution queue, which is FR-26's
own stated behaviour. Nothing is lost. Adding `repo_path` to `AGENT_ENGAGEMENT_COLUMNS` in
`src/lib/api/capabilities.ts` restores directory resolution with no other change, and that is Erik's
call. It is queued.

---

## Local development

Put local values in `.env.local`. It is gitignored via `.env*.local` and Vercel's CLI writes it:

```bash
vercel link          # already done; .vercel/ exists and is gitignored
vercel env pull .env.local
```

`vercel env pull` will not retrieve `SUPABASE_SERVICE_ROLE_KEY`, because Erik marked it `Sensitive`
(write-only). Sensitive variables are unreadable through the API by design. Set that one by hand,
from the Supabase dashboard, into `.env.local`.

**UNVERIFIED:** neither `vercel link` nor `vercel env pull` was run by this unit. Both need Vercel
credentials this session does not hold, and the Vercel MCP connector cannot see this project
(blocker B1b in `spec/prod.md`). The commands are the documented Vercel CLI surface, not an
observation. Note also that `vercel` CLI 52.0.0 loops on `git_branch_required` when setting Preview
variables; 59.1.4 works. Erik hit that on 2026-08-17 and upgraded with `npm i -g vercel@latest`.
