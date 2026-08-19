# Agent tokens

An agent token is a bearer credential that lets a fleet specialist, a session hook, or a script read
and write the ledger over HTTP. It is separate from an operator session: different identity,
different rules, different table.

---

## The one thing to read before anything else

> **The plaintext token is shown exactly once, at creation. It is never stored.**
>
> The database holds a bcrypt hash and nothing else. There is no lookup, no "show token again", no
> recovery. If you lose it, the answer is `rotateAgentToken`, not a query.

That is not a policy someone can waive. `agent_token` has no plaintext column, `listAgentTokens`
selects a fixed column list that excludes `token_hash`, and `authenticated` is refused the hash
column at the grant level (unit i4 observed `42501 permission denied for table agent_token` on a
column-level select). The value simply is not there to retrieve.

**Never put a real token, or anything shaped like one, in a document, a screenshot, a test fixture,
a report under `.fleet/`, a commit message, or a transcript.** Every token in this file is a
placeholder.

---

## Token shape

```
dl_<row uuid>_<64 hex characters>
```

For example, and this is not a real token:

```
dl_00000000-0000-0000-0000-000000000000_0000…0000
```

The row id sits in the token deliberately. Verification is one indexed lookup plus **one** bcrypt
comparison, rather than a bcrypt comparison against every stored hash. An `O(n)` bcrypt on an
unauthenticated path is a CPU-exhaustion surface, not merely slow.

**Only the 64-character secret segment is hashed**, and that is measured rather than assumed.
pgcrypto's `crypt(..., gen_salt('bf', ...))` truncates its input at exactly 72 bytes on Supabase, so
hashing the 104-character full plaintext would push 32 characters of the secret past the boundary
where they contribute nothing. Unit i4 proved the boundary in three probes, including one where the
difference began *at* byte 72, and corrected an off-by-one that had nearly recorded "no truncation".

---

## The two capabilities

Exactly two exist. `src/lib/api/capabilities.ts` is the only module that knows how they are spelled,
and they are spelled two ways because both matter: `answer:read` and `ingest:write` on the wire and
in the audit log, `answer_read` and `ingest_write` in the Postgres enum.

### `answer:read`

Reads the six answer endpoints. At commit `3b2c81d` it also reaches:

| Endpoint | Method |
|---|---|
| `/api/session/unassigned` | GET |
| `/api/waits` | GET |

The six answer endpoints under `/api/answer/*` are being built by unit i7 in this same run and are
**not in this commit**, so nothing here describes them from observation.

### `ingest:write`

Posts artifacts, sessions, waits and releases.

| Endpoint | Method | What it takes |
|---|---|---|
| `/api/ingest/run` | POST | Fleet-run artifact contents. Contents, never paths. |
| `/api/ingest/session` | POST | One hand-prompted work session. The session hook posts here. |
| `/api/ingest/release` | POST | One deploy, idempotent on `(engagement, identifier, environment)`. |
| `/api/waits` | POST | Declare an external wait. |
| `/api/waits/resolve` | POST | Resolve one, recording who and when. |

### What neither capability may do

**Neither may read commercial figures.** An agent has no reason to know what Erik charges. Four
tables are refused outright to any agent-authenticated request:

- `contract_milestone` (FR-5, and §7a says "agent tokens are refused this table")
- `operator`
- `agent_token`
- `audit_log`

The last three are not named in FR-5. Unit i4 added them because §7a's "who may read" column says
"operator only" for all three, and an agent token is not the operator.

`engagement` is readable but **column-restricted**: an agent sees the identifying columns and
nothing else. `select('*')` on `engagement` is refused, along with `source`, `repo_path`,
`contract_type` and `spec_path`. Refusing too much fails loudly in a test naming the column;
allowing too much leaks quietly. Those are not symmetrical, so i4 resolved it restrictively and
queued the question.

### Read this before you trust the refusal

**The refusal is enforced in the application, not in the database.** Route handlers read with the
service-role key, which holds `BYPASSRLS`, so row-level security is inert against them.
`agentScopedDb()` in `src/lib/api/agent-db.ts` is the entirety of the enforcement.

Stated plainly because the alternative is discovering it later: this is a weaker guarantee than §7a
implies. Scoped Supabase JWTs are the real fix and belong in Phase 2 planning, not a silent
downgrade.

What the proxy **does** catch, each tested:

- a direct `.from()` on a forbidden table
- a PostgREST embed by table name or by alias
- an embed by **foreign-key constraint name**, such as `acceptance_criterion_milestone_id_fkey`,
  which contains no table name at all
- the credential and rate-limiter RPCs
- the `engagement` column allowlist, including inside an embed

What it does **not** catch:

- a handler that calls `createServiceClient()` itself instead of using `ctx.db`
- a raw `fetch` to `/rest/v1/`
- **a future foreign key to a forbidden table whose constraint name nobody adds to
  `AGENT_FORBIDDEN_EMBED_ALIASES`**

That last one is a hand-maintained coupling to the schema, and it is exactly the fragility a database
grant would not have. Add the constraint name when you add the foreign key.

---

## Issuing a token

### Through the interface

**There is no token-issuing screen at commit `3b2c81d`.** `/settings/tokens` renders an empty state
shell from unit u1 and calls nothing. Unit u4 is building the screen in this same run, and it is not
in this tree, so nothing below describes it from observation.

FR-7 requires tokens to be revocable and rotatable from the interface without a deploy. At this
commit that requirement is **partial**: the mechanism exists and is tested, the interface does not.
Unit i4 recorded it as PARTIAL rather than satisfied.

### The mechanism behind it

`src/lib/api/token-admin.ts` exports four functions. They carry no React, so the same functions
serve a server action, a route handler and a test.

| Function | What it does |
|---|---|
| `issueAgentToken(client, actor, { label, capabilities, expiresAt })` | Mints a token. **The only place the plaintext ever exists.** |
| `revokeAgentToken(client, actor, tokenId)` | Sets `revoked_at`. Does not delete the row. |
| `rotateAgentToken(client, actor, tokenId, expiresAt)` | Issues a replacement carrying the same label and capabilities, then revokes the original. |
| `listAgentTokens(client)` | Everything except the hash. |

Every one of them takes an `actor` and **requires the caller to have already established that the
actor is the operator.** They run with the service-role client, which is needed because
`hash_agent_token` is granted to `service_role` alone, and `service_role` bypasses RLS. Call
`requireOperator()` first and pass its user id. A caller that skips that step has built an
unauthenticated token-issuing endpoint, which is the worst bug available in that file.

Validation refuses, before anything is written:

- a label shorter than 1 or longer than 120 characters
- an empty capability list, because a token that can call nothing is a revocation rather than an
  issue
- an expiry in the past or on creation, which is almost always a timezone mistake and otherwise
  produces a token that never works plus a support question about why

The hash is computed **before** the `INSERT`, so the row never exists in a state where its
`token_hash` verifies nothing. It is produced by `public.hash_agent_token`, bcrypt at cost 12 inside
Postgres, so the plaintext crosses TLS to the database and is never hashed in the Node process.
There is one implementation of the hashing rule rather than two that can drift.

### Right now, with no screen

There is no supported path. The functions need an operator session at `aal2`, and `auth.users` on
the Supabase project holds **zero rows**. No account exists, no sign-in screen exists, and no MFA
enrolment screen exists.

**Do not work around this by writing a script that calls `issueAgentToken` with the service-role key
and a fabricated actor.** That is an unauthenticated token-issuing path with the audit trail
falsified, and it is the specific bug the `actor` parameter exists to prevent.

The unblocking sequence, in order: provision the operator account, build or reach a sign-in path,
enrol MFA, then issue tokens through the interface u4 is building. That is queued as a question,
because the ordering is Erik's call and the sign-in screen belongs to no unit in this run.

---

## Rotating a token

`rotateAgentToken` issues the new token **first** and revokes the old one **second**, never the other
way round. A fleet run holding the old token keeps working until the new one is in hand. Reversing
the order opens a window in which no valid token exists, which is an outage caused by routine
credential rotation.

The old row stays in place, revoked, so §7a's 90-day audit window still has something to point at.

Rotate when: the token expires soon, a transcript captured it, a machine that held it is gone, or on
a schedule you decide. There is no automatic rotation and no reminder.

## Revoking a token

`revokeAgentToken` sets `revoked_at` rather than deleting the row. §7a's retention for this table is
"until revoked, then 90 days for audit", which a delete would make impossible.

Revoking a token that is already revoked returns success and writes no second audit row. You asked
for it to be revoked; it is revoked.

**No pruning job runs.** The 90-day window is a stated retention, not an implemented one. FR-62
forbids an automatic retention timer while spec question Q3 is open, so revoked rows accumulate
indefinitely. Deleting them by hand is possible and is not currently anyone's job.

---

## Expiry, and the outage it schedules

Tokens expire. That is §7a's requirement and it is correct.

It also means **mode-2 capture stops silently when the session hook's token lapses.** The hook
exits `0` on every failure by design, because a hook that returns non-zero at the end of a session
is a hook Erik removes, and that costs every future record rather than one. So an expired token
produces no error, no warning, and no captured sessions. Spec §9's risk 7 names this.

Nothing in this build watches for it. Two things would: a calendar reminder set to the expiry date,
or a check on `/settings/tokens` for `last_used_at` going stale. Neither exists. Until one does,
**write the expiry date down when you issue the token**, because the token itself will not remind
you and neither will the product.

---

## How authentication actually runs

The order of the checks is the security property, not an implementation detail.

```
header present? → shape valid? → row lookup → verify secret → revoked? → expired?
```

An unknown token id and a wrong secret return a **byte-identical** `invalid_token` response, so ids
cannot be enumerated. `token_revoked` and `token_expired` are specific **only after** the caller has
proved possession, at which point the information is diagnostic rather than a probe. Unit i4 tested
both directions and mutation-proved the path: changing `verified !== true` to `verified === null`
produced two failures including `expected 'token_revoked' to be 'invalid_token'`.

### Rate limiting

Per token, through `public.check_and_increment_rate_limit`. It **fails closed**: an RPC error refuses
the request rather than serving it unmetered.

The numbers are 60 per minute on the answer endpoints and 120 per minute on ingest. §7a states a
traffic shape, not figures, so **those numbers are unit i4's and Erik has not confirmed them.**
Queued.

The limiter is a fixed window, which carries a boundary-burst weakness: the true worst case is twice
the nominal rate across a window boundary. That is stated in the migration rather than hidden.

Rate limiting runs **after** authentication, so a stranger cannot burn a real token's window without
holding it. The cost is that an unauthenticated flood is bounded only by the platform, which is
acceptable because §7a states there is no public surface and authentication is one lookup plus one
bcrypt.

**UNVERIFIED — the limiter has never tripped on a real HTTP route.** Unit i4 observed it trip in
Postgres at request 4 of 5 with a limit of 3, and in the guard with a stubbed RPC. Units i5, i6 and
i8 all inherit it and none could call it. Settled by 121 requests in one minute against a configured
deployment, expecting `429` with a `Retry-After` header.

### Auditing

Exactly one `audit_log` row per request on **every** path, including refusals and including a handler
that threw. Each row carries the token id, the capability in wire spelling, the endpoint as method
plus pathname, the outcome (`allowed`, `refused`, `error`) and the status.

Two properties worth knowing:

- **The audit writer fails closed.** If the audit write fails, the request fails. "Every token use is
  written" quietly becoming "most" would be invisible exactly when something is wrong. This is why an
  unreachable database produces `500 The request was not completed because it could not be recorded
  in the audit log`.
- **The audit row carries no record contents.** The query string is dropped by `endpointOf`, and the
  token plaintext is never written. §7a classifies `audit_log` as `internal` precisely because it
  holds no personal data.

`audit_log` is append-only, enforced by trigger. `UPDATE`, `DELETE` and `TRUNCATE` are all refused
even to the table owner. Three probe rows sit in it permanently and cannot be removed, which is the
control working and is itself the evidence.

---

## Using a token

```bash
curl -sS -X POST https://<deployment>/api/ingest/release \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DELIVERY_LEDGER_INGEST_TOKEN" \
  --data @release.json
```

**Read the token from an environment variable. Never type it into a command.** A literal in a shell
command lands in the shell history, in the transcript, and in `ps` for the life of the call. The
session hook goes further and passes the header to curl on **stdin** (`--header @-`) rather than as
an argument, for exactly that reason.

Responses:

| Status | Code | Meaning |
|---|---|---|
| `401` | `missing_authorization` | No `Authorization` header. |
| `401` | `invalid_token` | Unknown id **or** wrong secret. Deliberately indistinguishable. |
| `401` | `token_revoked` / `token_expired` | You hold a real token that no longer works. |
| `403` | `insufficient_capability` | The token is valid and lacks the capability this route needs. |
| `403` | `forbidden_table` | The request's projection reached a table agents are refused. |
| `400` | `invalid_request` | Body problems. Every problem is returned at once, not one at a time. |
| `429` | | Rate limited. Read `Retry-After`. |
| `500` | `internal_error` | Never carries a database message. Read the Vercel runtime logs. |

**UNVERIFIED — every status in that table over real HTTP.** All of them are observed at the unit
level through the real `withAgentRoute` guard, in `src/lib/api/guard.test.ts`,
`src/lib/server/sessions/session-route.test.ts`, `src/lib/server/waits/waits-route.test.ts` and
`src/lib/server/releases/handler.test.ts`. None was observed on the wire, because no route can reach
a Supabase project from any worktree in this run. One `curl` against a configured preview deployment
with a live `ingest:write` token settles the whole table.

---

## Where a fleet specialist gets its token: unresolved (blocker B5)

**Erik has not decided this.** What follows is his recommendation and the shape the build assumes,
not a settled answer.

A fleet specialist runs in a git worktree with no environment of its own. It needs an `ingest:write`
token to post artifacts, and this practice's standing rule is that an absent credential is a blocker
rather than a puzzle. **A token written into a file to solve this is a credential in a repository.**

Spec question Q5 lists three options:

1. **The dispatching session passes it in the brief.** This puts the token in a transcript, which is
   a durable artifact nobody rotates. It fails toward leaking a live credential into a log.
2. **The token lives in the operator's shell environment, and only main-session ingest is supported
   in v1.** No specialist ever holds it. It fails toward incomplete capture: work done inside
   worktrees posts nothing.
3. **Ingest is deferred to the end of a run and performed by the dispatching session.** Specialists
   never hold the token; the session that dispatched the run posts the artifacts when the run ends.

**Erik's recommendation is the third**, and it is the shape everything currently assumes. Under it,
nothing in v1 is blocked: fleet artifacts land on disk under `.fleet/` during the run and get posted
once, at the end, by the one process that already has the credential in its environment.

**Do not invent a credential-storage scheme to close this.** There is no local equivalent of a
credential vault. If a specialist needs a token and does not have one, that is a blocker to report.

Until Erik answers, `POST /api/ingest/run` is called by whatever process holds
`DELIVERY_LEDGER_INGEST_TOKEN` in its environment, and that is the operator's shell.

---

## Related

- [env.md](env.md) for `DELIVERY_LEDGER_INGEST_TOKEN` and where the hook reads it.
- [session-hook.md](session-hook.md) for the one consumer of an `ingest:write` token that runs
  unattended.
- [security.md](security.md) for what was verified and what was not.
