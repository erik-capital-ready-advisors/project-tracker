# Security posture

What was verified, what was built and never exercised, and what spec §7a asked for that this build
does not do. The honesty of that split is the point of the page.

Posture is declared in `spec/spec-approved.md` §7a as amended by CR-001 §4, covering 21 entities.
`~/.claude/agents/security-baseline.md` is the floor beneath it, applying wherever §7a is silent.
Each control below names which of the two produced it.

**State of the build:** commit `3b2c81d`, run `b0952e`. Eight units merged. **Nothing is deployed.**
The schema, however, is applied to the live Supabase project `onpvolboecjpdkvurjaf`.

---

## 1. Verified

Controls a specialist observed, with the observation beside each. Every probe in this section had a
positive control or a negative control proving it could report a failure.

### Row-level security

| Control | Source | Observed |
|---|---|---|
| Every one of the 21 tables carries an RLS **policy** | §7a | `pg_policies`: 21 of 21 tables, 23 policies, zero tables at policy count 0 |
| MFA (`aal2`) enforced in RLS, not only in Next.js | §7a / FR-2 | Truth table below. `aal1` and a missing claim both deny |
| A brand-new account gets no role | §7a / FR-3 | `aal2` plus `role NULL` yields `is_operator() = false`; zero non-internal triggers on `auth.users` |
| One chokepoint rather than 23 hand-written predicates | baseline | Zero policies whose `qual`/`with_check` touches neither helper |
| `anon` is refused everything | §7a | `401` with `42501 permission denied` on read, write and RPC across seven tables probed by four units: `contract_milestone`, `agent_token`, `engagement`, `audit_log`, `work_session`, `external_wait`, `work_item` |

**Why "RLS is enabled" is not evidence on this project.** An event-trigger function
`public.rls_auto_enable()` predates this build and turns RLS on for every new table in `public`. Unit
i1 created a throwaway table, did nothing else to it, and it came out `relrowsecurity = true` with
**zero policies**. The flag was measured worthless here. Any RLS check must assert the policy.

**The MFA truth table**, run against synthetic `request.jwt.claims`:

| Session | `assurance_satisfied()` | `is_operator()` |
|---|---|---|
| No `aal` claim at all | false | false |
| `aal1`, password only | false | false |
| `aal2`, no operator row | true | false |
| Role granted, `aal1` | | false |
| **Role granted plus `aal2`** | | **true** (positive control) |

The last row matters as much as the others: without it, the chokepoint could be stuck closed and
every "denied" would prove nothing.

**The refusals are `42501`, not `200 []`.** The grant is gone, not merely filtered by a policy, so a
refusal is diagnostic rather than ambiguous. That distinction is why the probe means something.

### Encryption at rest

Twelve columns hold pgcrypto ciphertext. Nine come from §7a naming them; three were encrypted under
the baseline where §7a was silent, and unit i1 queued the choice rather than assuming it.

`contract_milestone.amount` and `.notes`; `requirement.text`; `work_item.description` and
`.raw_status`; `work_session.summary`; `blocker.description`; `open_question.question`, `.best_guess`
and `.answer`; `defect.description` and `.wont_fix_reason`.

| Control | Observed |
|---|---|
| Columns read back as ciphertext | `contract_milestone.amount`: `\xc30d040703024a1e726c101958c1...`, 73 bytes, `pg_typeof = bytea`, and `amount::text ~ '7500'` returns **false** |
| Round trip works | `decrypt_field(amount)` returns `7500.00` |
| `work_item.description` at rest | 93 bytes, prefix `c30d0407`, plaintext substring absent |
| `work_session.summary` at rest | 112 bytes, prefix `c30d04070302f248`, plaintext absent, round-trips |
| A missing key raises rather than returning `NULL` | Vault secret renamed inside a transaction; observed `delivery_ledger: Vault secret "delivery_ledger_column_key" is absent or unreadable` |
| Ciphertext is non-deterministic | `encrypt_field('same') = encrypt_field('same')` returns **false** |

That last row has a consequence worth carrying: **an encrypted column can never be a dedupe key.**
Unit i5 needed one for FR-22 idempotency on `open_question` and added a clear-text `source_key`
holding a filename and an integer, which changes nothing about the table's classification.

The key was generated inside Supabase Vault and has never left it. The name is
`delivery_ledger_column_key`.

### Credentials

| Control | Source | Observed |
|---|---|---|
| Agent tokens hashed at rest, bcrypt cost 12 | §7a / FR-4 | `$2*$12$`; correct secret verifies, wrong fails, empty fails |
| Plaintext stored never | §7a | `token_hash` is the only stored column; `listAgentTokens` cannot return plaintext |
| Token ids cannot be enumerated | baseline | Unknown id and wrong secret return byte-identical bodies |
| `token_hash` withheld from `authenticated` | §7a | `42501 permission denied` on a column-level select |
| Service-role key cannot reach a client bundle | baseline | `import "server-only"` makes it a **build** error, not a runtime leak |
| Project URL must be `https://` | baseline | `createServiceClient` throws on any other scheme |
| Public signup closed | §7a / FR-1 | `disable_signup: true`; a live signup answers `422 signup_disabled` rather than `weak_password`; `auth.users` still **0 rows** |

That last row used the right instrument. Both the open and closed states answer `422`, so the status
code cannot discriminate. The error **code** does, and the zero row count proves it refuses before
creating an account rather than creating and rejecting.

### The audit log

| Control | Source | Observed |
|---|---|---|
| Append-only, enforced by trigger | FR-59 | `UPDATE`, `DELETE` **and `TRUNCATE`** all refused with `23001`, as the table owner |
| One row per request on every path | FR-6 | Including refusals and including a handler that threw; mutation-proven |
| The writer fails closed | FR-6 | A failed audit write fails the request |
| No record contents | §7a | The query string is dropped by `endpointOf`; asserted in tests |

`TRUNCATE` is the one RLS could never have stopped. Three permanent rows sit in `audit_log` from
probe runs and cannot be removed, which is the control working and is itself the evidence.

### The application layer

| Control | Source | Observed |
|---|---|---|
| Full security header set | baseline §6 | Observed in a real `next start` response by three units and again by this one on 2026-08-19 |
| The app actually runs under its CSP | baseline | 11 `<script>` tags in the production HTML, **11 carrying a nonce, 0 without**; a real browser load produced 1 console error and it was `404 /favicon.ico`, zero CSP violations |
| The nonce differs per request | baseline | Two consecutive requests produced two different nonces |
| `X-Powered-By` removed | mine (i4) | Absent from the observed response |
| No database message reaches a caller | baseline §5 | With the `release` table forced to error, the `500` body contained no `relation release` |
| Secret-shaped identifiers refused (FR-78) | FR-78 | `23514` on `engagement.db_project_ref` and `.hosting_team`; **refused row count 0**, so it fails closed; six legitimate identifiers accepted as the negative control |
| Credential-shaped URL parameters stripped | mine (i8) | `x-vercel-protection-bypass` removed by name and reported back in `url_params_stripped` |
| Rate limiter fails closed | FR-8 | An RPC error refuses the request rather than serving it unmetered |

The header set observed on 2026-08-19 at commit `3b2c81d`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), autoplay=(), camera=(), display-capture=(), ...
Cross-Origin-Opener-Policy: same-origin
X-DNS-Prefetch-Control: off
content-security-policy: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'; ...
                         object-src 'none'; base-uri 'self'; form-action 'self';
                         frame-ancestors 'none'; upgrade-insecure-requests
```

`preload` is deliberately absent from HSTS. It is a submission to a browser-vendor list that is slow
and awkward to reverse, and the baseline says to add it only when the client owns the apex domain and
understands that. Erik has not been asked.

### Function grants

All 18 database functions carry `search_path = ""`. Seventeen are `SECURITY DEFINER`. **None carries a
leading `=` entry in `proacl`**, which is what PUBLIC holding EXECUTE looks like. `anon` appears on
none. `authenticated` appears on exactly two, `assurance_satisfied()` and `is_operator()`, both
required because RLS policy expressions evaluate with the querying role's privileges, and both
disclose one boolean about the caller's own session.

Helpers live in schema `app`, which PostgREST confirmed unexposed: a call with `Content-Profile: app`
answered `406 PGRST106 Only the following schemas are exposed: public, graphql_public`. The per-name
`REVOKE`s are the second layer rather than the only one.

### Tests that can actually fail

Four units mutation-tested their own controls: **i4 applied 7 mutations and caught 7; i5 applied 18
and caught 18; i6 mutation-proved 8 rules; i8 mutation-tested its handler.** Three of i6's first
attempts **survived**, and it rewrote the tests rather than recording a pass. Three fidelity bugs in
a test double were found the same way, one of which had been hiding the `repo_path` refusal.

A green suite proves the tests ran, not that they can fail. This build measured the difference.

---

## 2. Built but not verified

Each of these is in the code and nothing exercised it. **The reason is the same for almost all of
them: no worktree in this run holds a Supabase credential, and `SUPABASE_SERVICE_ROLE_KEY` is
write-only on Vercel Production with no Preview copy.** Obtaining one is a blocker to report, not a
puzzle to solve, so nobody solved it.

| # | Control | Why unverified | What settles it |
|---|---|---|---|
| 1 | **UNVERIFIED** Session cookie flags `Secure`, `HttpOnly`, `SameSite=Lax` | `src/proxy.ts` sets all three explicitly rather than relying on library defaults, but no operator account exists so no `Set-Cookie` was ever produced | Provision the account, sign in, read `Set-Cookie` off the response |
| 2 | **UNVERIFIED** HTTP-to-HTTPS redirect, and HSTS in production | HSTS was observed on a local `next start`, which is not the deployment | `curl -sS -D- -o /dev/null http://<deployment>/`, expecting `301` or `308` |
| 3 | **UNVERIFIED** The FR-5 `contract_milestone` refusal over real HTTP | Proven at unit level against the real `agentScopedDb` proxy, never on the wire | An `answer:read` token against the live project, a request whose projection reaches `contract_milestone`, expecting `403 forbidden_table` |
| 4 | **UNVERIFIED** The FR-8 rate limit tripping on a route | Observed in Postgres at request 4 of 5 with limit 3; every route stubs it in tests | 121 requests in one minute against a deployment, expecting `429` with `Retry-After` |
| 5 | **UNVERIFIED** An `audit_log` row written by a real HTTP request | The guard writes it; no route was ever called over HTTP | One real request, then read `audit_log` |
| 6 | **UNVERIFIED** `contract_milestone.amount` and `.notes` read back as ciphertext | The write path is the same `encryptAll` observed producing ciphertext elsewhere, but `createContractMilestone` was never executed | Call the action with an operator session, read the column raw |
| 7 | **UNVERIFIED** Every registry server action end to end | `requireOperator()` needs an account at `aal2`; `auth.users` is 0 rows | Provision the account, enrol MFA, exercise create/update/submitted/paid |
| 8 | **UNVERIFIED** The route status codes `201`, `200`, `400`, `401`, `403`, `429` on the wire | Observed at unit level through the real guard; the guard's audit write means an unreachable database `500`s everything first | One `curl` against a configured preview deployment with a live token |
| 9 | **UNVERIFIED** `unique (engagement_id, identifier, environment)` rejecting a second insert | The test fake enforces it because i1's migration declares it; no real database rejected anything | Post the same release twice against the live project, observe one row |
| 10 | **UNVERIFIED** FR-37's milestone projection against real rows | `contract_milestone` is empty and agents are refused the table | Seed a milestone, call `getMilestoneProjections` from an operator session |
| 11 | **UNVERIFIED** The Vercel project's stored `framework` field | The MCP connector cannot see the project (blocker B1b) | `vercel project ls`, or one API call, expecting `nextjs` |

**The single change that would close most of this list: add `SUPABASE_SERVICE_ROLE_KEY` to the
Vercel Preview environment.** That is an open decision, with a real argument on the other side.
Preview URLs leak into pull requests and chat messages, and a key that bypasses row-level security
sits badly behind one. See [env.md#the-preview-gap](env.md#the-preview-gap).

### One control that is weaker than §7a implies

**FR-5's refusal is application-layer, not database-enforced.** Route handlers read with the
service-role key, which holds `BYPASSRLS`, so every policy is inert against them.
`agentScopedDb()` is the whole of the enforcement.

This report does not claim §7a's refusal is enforced by RLS. Scoped Supabase JWTs are the real fix
and belong in Phase 2 planning, not a silent downgrade. [agent-tokens.md](agent-tokens.md) lists
exactly what the proxy catches and what it does not, including the one that will bite: a future
foreign key to a forbidden table whose constraint name nobody adds to the alias list.

---

## 3. Not built

Things §7a or the functional requirements ask for that this branch does not do.

### No operator sign-in, and no MFA enrolment screen

FR-7 requires tokens to be revocable and rotatable from the interface. Unit i4 recorded it
**PARTIAL**: the mechanism exists in `src/lib/api/token-admin.ts` and is tested; the interface does
not exist. Beyond that, **nothing in the App Router signs anyone in.** `src/proxy.ts` refreshes a
session it finds and creates none, and no unit in run `b0952e` is building a sign-in route.

`auth.users` on the Supabase project holds **zero rows**. There is no account, no way to make one
through the product, and no way to reach any operator screen. This is the largest gap in the build.

One design note that will matter when someone does build it: **MFA enrolment must remain reachable at
`aal1`.** Enrolment runs through GoTrue (`/auth/v1/factors`), which touches no RLS-gated table, so a
never-enrolled operator can still enrol. Unit i1 checked this deliberately, because a blanket `aal2`
requirement across every surface locks the operator out of the screen that would fix it, and no unit
test sees that.

Related: **`requireOperator()` at `aal1` is not "no account".** The `operator` row is unreadable below
`aal2` because `app.is_operator()` gates it. Treating a null profile as "no such user" is how Erik
gets locked out of his own product.

### No export path (FR-60)

Milestone M1.10, **blocked pending Erik's approval of CR-002**, which is pending approval and is not
part of the spec basis. The basis is `spec-approved.md` plus CR-001.

§7a treats export as a v1 requirement on the argument that this system is the studio's operational
memory and an export path is what keeps it from becoming a single point of failure. That argument
stands and the path does not exist. Take a Supabase backup if you need a copy.

### No deletion path, and no archive (FR-61)

Same milestone, same blocker. **Nothing in this build deletes a row.**

`on delete cascade` is declared on every engagement child, but a declared cascade is not a tested
deletion path, and unit i1 flagged a genuine conflict: the append-only triggers on `audit_log` and
`test_result` will **refuse** a cascade that reaches them. That is a spec conflict between FR-61's
hard deletion and §7a's append-only rule, and it is queued and unresolved.

Do not promise anyone that data can be deleted from this product today.

### No retention timer (FR-62)

None built. No cron, no TTL, and the prune function that exists is unscheduled. FR-62 forbids an
automatic timer while spec question Q3 is open, so this is deliberate rather than forgotten.

The practical effect: `agent_token`'s stated "90 days after revocation" retention is a statement, not
a mechanism. Revoked rows accumulate.

### No unparsed-rate monitoring

Every screen and endpoint reports an unparsed **count**, which is FR-58 and is built. Nobody watches
the **rate**.

That distinction has bitten this practice before. A legitimate empty state hides an outage: when zero
is a valid answer, no per-record check can detect the failure, only a share across a defined
population can. A format change on a scraping integration blanked a field on every record for twelve
days while fifteen production invariants and the whole unit suite stayed green.

`unparsed` is a legitimate state here by design, which is exactly the shape of that trap. Nothing in
this build would notice the unparsed share going from 3% to 100% overnight.

### No language model, and no analytics

Stated because its absence is a security property. No language model is called by this product and no
third-party analytics are installed. Adding a natural-language query over the ledger is an obvious
temptation and would be a **change request**, because it would send encrypted-at-rest client prose to
a third party.

---

## What this product holds, and who can see it

### The data

The sharpest fact shaping every decision above: **this is the only database in the studio that holds
every client's name, every contract amount, and the studio's own pricing model in one place.** A
disclosure here is worse than a disclosure of any single client project, because it is all of them
plus the commercial terms.

Four classes, applied per table across 21 entities:

- **`internal`** operational, no personal data. `fleet_run`, `test_case`, `test_result`, `stack`,
  `audit_log`, `release`, and the join tables.
- **`personal`** identifies or describes a person. `operator`, `engagement`, `external_wait`.
- **`sensitive`** personal **and** harmful if disclosed. `agent_token`, `contract_milestone`,
  `requirement`, `work_item`, `work_session`, `blocker`, `open_question`, `defect`.

Three columns are deliberately left in clear text, each with the reasoning written down:

- **`engagement.client_name`**, because it is the display, sort and slug key on every surface.
  Encrypting it means no sorting, no filtering and no URL slug. The exposure is a list of who Erik
  works with, which is materially less than what he charges them. This is a **reduction** in exposure,
  stated as such, not an elimination.
- **`defect.title`**, because it is the display key on the Broken screen. The rule that makes it safe:
  the title is a short label like "checkout 500s on submit". Reproduction detail, data samples and
  client specifics belong in the encrypted description.
- **`requirement.ref` and `.section`**, so requirements can be matched and joined by `FR-nn` rather
  than by text.

Two consequences of encrypting the rest: **there is no cross-engagement full-text search over
work-item prose in v1**, and **no SQL aggregation over money.** Totals are decrypted server-side and
summed in TypeScript, and mixed currencies return `null` rather than a plausible wrong number.

### On encryption, exactly rather than reassuringly

**"Encrypted at rest" is true of almost every managed database and means only that the disk is
encrypted.** It protects against a stolen drive and against very little else. Supabase's provider
default is what covers every column not named above.

What this build adds on top is **column-level pgcrypto encryption on twelve columns**, listed in
section 1. Those columns are ciphertext in the table. Reading them requires calling `decrypt_field`,
which is granted to `service_role` alone, using a key held in Supabase Vault.

What that protects against: a `SELECT` by anything that reaches the table without the decrypt
function, which includes a leaked publishable key, a misconfigured grant, and a database dump.

What it does **not** protect against, stated plainly so nobody walks away believing otherwise:

- **Supabase, as the operator, can read everything.** The key lives in their Vault and the decryption
  runs in their Postgres.
- **Anyone holding `SUPABASE_SERVICE_ROLE_KEY` can read everything**, including every contract amount.
  That key bypasses row-level security entirely.
- **Vercel sees decrypted payloads in transit**, because the application function is where decryption
  is consumed.

### Retention

**Indefinite, for almost everything.** §7a's baseline is 7 years on `contract_milestone` for tax
records and indefinite elsewhere, and **spec question Q3 is open**: Erik has not stated how long
financial records must be kept or whether anything may be deleted.

No automatic deletion runs. See "No retention timer" above.

### Who can read it

- **Erik**, as the operator, through an account that does not exist yet, requiring MFA at `aal2`.
- **Agent tokens**, scoped to two capabilities, refused four tables outright and restricted to
  identifying columns on `engagement`. Enforced in the application, not the database.
- **`anon`**, meaning anyone with the publishable key, which ships in the browser: **nothing.** Units
  i1, i4, i5 and i6 each probed it independently against the tables they touched, and every read,
  write and RPC came back `42501 permission denied`.

### Which third parties receive a copy

Two, both named, and this is the item people are most often surprised by.

1. **Vercel** hosts the application and terminates every request. It sees decrypted payloads passing
   through the function, as any host does.
2. **Supabase** holds the data at rest and runs the decryption functions.

No language model is called. No third-party analytics are installed. Client data reaches no vendor
that the client's own engagement has not already reached.

### Deletion requests

There is no deletion path in this build. A request to delete data today is satisfied by acting
directly on the Supabase project, and the append-only triggers on `audit_log` and `test_result` will
refuse part of it. That conflict is unresolved and queued.

---

## Open security questions Erik owns

These are in `spec/prod.md` as active blockers. None of them blocks the build; all of them shape what
this page can honestly say.

| ID | Question |
|---|---|
| **B2** | Does any client contract restrict where that client's project details may be stored? This product copies spec text, defect prose and blocker descriptions out of individual client repos into one database. At least one engagement in the reference corpus is for a Registered Investment Adviser. **No contract or policy text was ever supplied**, so this is a gap, not an absence. |
| **B3** | How long must commercial and client-prose data be kept, and may anything be deleted? |
| **B5** | How does a fleet specialist in a fresh worktree obtain the ingest token without it landing in a file? |
| **B6** | Does `engagement.client_name` stay unencrypted? §7a states the exception and the reasoning, but it is a judgment about relative harm made by the spec author rather than by the person who bears it. |
| | Whether Preview carries a service-role key. |
| | Whether §7a's `engagement` "name and slug" is a strict column allowlist, as implemented, or shorthand for the identifying fields. |
| | Confirm or set the rate-limit numbers. §7a gives the traffic shape; 60 and 120 per minute are unit i4's. |

**§7a is a stated baseline, not a decision Erik has made.** The intake session wrote it, deliberately
conservative, as what the build proceeds on if nobody answers. Four questions settle it and they sit
in spec section 10.
