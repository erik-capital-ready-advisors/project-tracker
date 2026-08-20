# qa-reviewer report - qa1

**Status:** ISSUES  *(was FAIL at `a87fe4d`; the critical is closed — see Re-verification)*
**Run:** b0952e
**Branch:** `agent-build/2026-08-19-b0952e` (HEAD `c65e44d`; first reviewed at `a87fe4d`)
**Reviewed against:** the **resolved spec** `.fleet/resolved-spec-b0952e.md` (base `spec-approved.md` + CR-001, approved 2026-08-18). CR-002 is PENDING and correctly not folded in.
**Critical:** 0 open (1 raised, 1 closed) · **Important:** 3 open (5 raised, 3 closed, 1 new) · **Minor:** 7
**Re-verified:** 2026-08-20 at `c65e44d`, after i10's three fix commits

## Verdict

**The critical is genuinely closed, and I proved it the way I asked i10 to prove it** — through the
product path, over HTTP, as `service_role`, with a negative control. `POST /api/ingest/run` now
answers `200` and persists 3 work items; the identical second post holds at 3; a **different** run
id rises to 6. I did not read i10's table and I did not accept `has_function_privilege` as proof,
because that predicate was the thing nobody checked in the first place.

Closing C1 also unblocked two §7a observations that were impossible before, and both pass: every
`work_item.description` written **through the real ingest route** is pgp ciphertext with no
plaintext leak and a clean decrypt round-trip, and FR-15's `unparsed` classification survives the
full path — the unrecognisable status shape lands as `unparsed` rather than being guessed.

**My I2 was wrong and project-lead is right to have contested it.** Explicit-slug resolution was
never broken; my probe sent `engagementSlug` and the wire field is `engagement`. I2 was I3's defect
wearing a different hat. Corrected below rather than quietly dropped.

**Status is ISSUES, not PASS, and the reason is three open importants** — none of them a ship
blocker, all of them yours to weigh. One is new and it is the same defect class i10 just fixed:
`/api/waits` still accepts unknown body keys in silence. Nothing the three commits changed is
broken; the wire-contract tightening is a real compatibility change and it caught a key **I** had
been getting away with, which is how I learned my own FR-74 coverage row had been passing on a
silently-dropped field.

## Spec coverage

| Requirement | Implemented | Evidence |
|---|---|---|
| FR-1 no public signup | yes (carried) | `disable_signup` verified at provisioning (M1.0); **not re-probed by me**, deliberately — probing it creates an account |
| FR-2 MFA enforced **in RLS**, not only in Next.js | yes | Observed at the database: `app.assurance_satisfied()` = `auth.jwt()->>'aal' = 'aal2'`, called by `app.is_operator()`, which is the `using` clause of all 23 policies. Truth table measured: no-aal → false, `aal1` → false, **`aal2` → true (positive control)** |
| FR-3 new account gets no role | yes | `operator.role` has **no default** (null); `operator.id` is FK'd to `auth.users` so a fresh account has no `operator` row at all; `is_operator()` = false at `aal2` with no row; **zero non-internal triggers on `auth.users`** |
| FR-4 tokens hashed | yes | `app.hash_token` = `crypt(…, gen_salt('bf',12))`; only the 64-hex secret segment is hashed (bcrypt's 72-byte truncation) |
| FR-5 capability split; agents refused `contract_milestone` | yes — **application-layer, NOT database-enforced** | Observed over real HTTP: `answer:read` on `/api/answer/committed` → **`403 forbidden_table`**; `answer:read` on ingest → `403 insufficient_capability`; `ingest:write` on an answer route → `403`. Route handlers read with the service-role key, which holds BYPASSRLS, so this is a handler obligation. Accepted for v1 per Erik's answer 7 |
| FR-6 every token use audited | yes | 163 `audit_log` rows written for my two probe tokens, carrying `capability`, `endpoint`, `outcome`, `status` — including the `429` refusals |
| FR-8 rate limit per token | yes | **Tripped.** 160 concurrent requests in 42s against a 60/60s policy → `{"200":60,"429":100}`, `Retry-After: 29` |
| FR-13 ingest never creates an engagement | yes | `POST /api/ingest/run` with an unregistered slug → `400`, message cites FR-13 |
| **FR-14–FR-23 Mode-1 ingest** | **yes, as of `c65e44d`** | Was `500` on every post at `a87fe4d` (critical C1). Re-verified through the route: `200`, 3 work items, 1 fleet_run, 1 dependency edge, 3 work-item↔requirement links |
| FR-15 unrecognised status → `unparsed` | yes | All 17 classifier enums carry an `unparsed` label. **Now observed end to end:** a manifest row with an unrecognisable status shape persisted as `status='unparsed'` and the response reported `unparsed: 1`. Not guessed, not widened |
| FR-22 idempotency | **yes, both paths** | Run ingest: two identical posts → `200`/`200`, work_item held at 3; **negative control** with a different run id rose to 6. Release ingest: `201` then `200`, same id, one row |
| FR-24/FR-28 session capture | yes | `201`, creates a `work_item` with `execution_mode='hand'`, `executor_kind='erik'`. Explicit slug on the correct wire field `engagement` resolves: `resolvedBy="explicit-slug"`, `unhonouredSlug=null`. A slug that names no engagement now returns `unhonouredSlug` plus an actionable `attributionNote` instead of silence |
| FR-32/FR-33 external waits | yes | `POST /api/waits` → `201`, wait created |
| FR-52–FR-57 the six answers over JSON | yes | All six return `200` under `answer:read`, except `committed` which correctly `403`s an agent token |
| FR-58 every endpoint reports the unparsed count | yes | Seeded 4 unclassified records → **every** answer endpoint, `/api/waits` and `/api/session/unassigned` reported `unparsed=4` (and `=2` on a second seeding). This is the D-P2-2 regression check, and it holds against a **non-zero** count |
| FR-59 append-only audit | yes | UPDATE, DELETE, TRUNCATE on `audit_log` and TRUNCATE on `test_result` all refused `23001` **as the owning `postgres` role** |
| FR-73 release records deployed-at | yes | `deployed_at` stored correctly; `deployedAt` now `400`s with `did you mean \`deployed_at\`?` rather than storing null under a `201` |
| FR-74 release names the refs it ships | yes — **re-tested, my first pass was wrong** | I originally sent `requirementRefs`, which was silently dropped, so my `201` proved nothing about FR-74. With the correct `requirement_refs`: `resolved:[FR-73,FR-74]`, `unresolved:[FR-999]` reported per the FR-65 rule, **3 `release_requirement` rows** written |
| FR-76 release posted over the API | yes | `201` observed end to end |
| FR-77 provisioning identifiers | yes | `db_org`, `db_project_ref`, `hosting_team`, `hosting_project`, `production_url` all present on `engagement` |
| FR-78 identifier columns refuse secret shapes | yes | Against a **real row**: JWT-shaped, `sb_secret_`-prefixed and long-base64 all refused `23514`; positive control (a real project ref) accepted, rows=1 |
| FR-60 export / FR-61 hard deletion (M1.10) | **not built, correctly** | Blocked pending CR-002, which is PENDING. Not a defect |

## Security posture review

**Reviewed against:** spec §7a (**21 tables classified**). Where §7a is silent the source is
`~/.claude/agents/security-baseline.md`, and each control below names which.

| Table | Class per §7a | Treatment found on branch | Verdict |
|---|---|---|---|
| `contract_milestone` | sensitive | `amount` at rest: **148 bytes, prefix `c30d0407…`, does not contain `7500`**; `decrypt_field` returns `7500.00` | MATCHES (§7a) |
| `work_item` | sensitive | `description`, `raw_status` both `bytea`; write path routes through `encrypt_field` | MATCHES (§7a) |
| `work_session` | sensitive | `summary` written by the **real route**: 190 bytes, `c30d0407` prefix, canary absent, decrypts correctly | MATCHES (§7a) |
| `requirement`, `blocker`, `open_question`, `defect` | sensitive | all named columns are `bytea`; `defect.title` clear per CR-001 §4 stated exception | MATCHES (§7a) |
| `agent_token` | sensitive | bcrypt cost 12; `token_hash` granted to nobody; never returned by a read endpoint | MATCHES (§7a) |
| `engagement` | personal | `client_name` clear per the §7a stated exception; FR-78 guard active | MATCHES (§7a) |
| `operator` | personal | RLS restricts to `id = auth.uid()` **and** `aal2` | MATCHES (§7a) |
| `audit_log`, `test_result` | internal, append-only | trigger-enforced, TRUNCATE included | MATCHES (§7a) |
| all 21 | — | RLS on, 23 policies, **`anon` holds zero grants** | MATCHES |
| **retention** (all `see Q3` rows) | — | **no job, no policy, no scheduled function.** `prune_rate_limit_counters` exists and is unscheduled | **GAP — but correct:** FR-62 forbids a retention timer while Q3 is open. Documented, not enforced |

Tables in the migration diff but **not** in §7a: **`app.rate_limit_counters`** — see important I4.
I built this list from `CREATE TABLE` across all seven migrations, not from any specialist's report.
Tables in §7a but not in `api-integrator`'s report: **none**.

| Control | Source | Observed | Verdict |
|---|---|---|---|
| Column encryption real, both directions | §7a | `pgp_sym` packet header `c30d0407`, non-deterministic (`encrypt('same')=encrypt('same')` → false), key from Vault, decrypt **raises** rather than returning null | PASS |
| No decrypting view for a lesser role | §7a | **Zero views exist** in `public` or `app`. `decrypt_field` granted to `service_role` only; `anon` and `authenticated` refused | PASS |
| RLS / `anon` refusal + **positive control** | §7a | 21/21 tables → `42501` for `anon`. Controls: a missing RPC returns `PGRST202` (client is reaching PostgREST), and `service_role` reads **21/21** of the same tables | PASS |
| MFA in RLS | §7a | truth table above; `aal2` positive control fires | PASS |
| New-account role | §7a | no default, no `operator` row, no `auth.users` trigger | PASS |
| Append-only incl. TRUNCATE | §7a | `23001` on all four attempts as `postgres` (non-superuser) | PASS |
| Transit — no `http://`, no disabled cert validation | baseline | no `NODE_TLS_REJECT_UNAUTHORIZED`, no `rejectUnauthorized:false`, no `--insecure` in the tree; `createServiceClient` throws on a non-https project URL | PASS |
| Security headers, **served** not configured | baseline | Full block observed in a real `next start` response and asserted in a committed test. HSTS `max-age=63072000; includeSubDomains`, **no `preload`** (the Vercel-SSO tell), `nosniff`, `DENY`, COOP `same-origin`, 14-feature Permissions-Policy, `x-powered-by` absent. Served on `4xx` too | PASS |
| CSP is a real policy | baseline | `default-src 'self'`, `frame-ancestors 'none'`, `'strict-dynamic'`, per-request nonce that **changes between requests**; every `<script>` in the served document carries it; no blanket `unsafe-inline` on `script-src` | PASS |
| CORS on authenticated routes | baseline | no `access-control-allow-origin` on `/api/answer/blocked`, incl. with a hostile `Origin` | PASS |
| Rate limits on token routes | §7a/FR-8 | tripped, see above | PASS |
| Input validation at the boundary | baseline | 6/6 malformed payloads → `400 invalid_request`; size caps 8 MB / 200 files / 2 MB; path separators in filenames refused (FR-23) | PASS |
| No raw DB error to the client | baseline | the ingest `500` body says "this response deliberately carries no database message" — correct behaviour, and it is what hid C1 | PASS |
| Auth refusals discriminate | baseline | no header → `401 missing_authorization`; garbage → `401 malformed_authorization`; well-formed unknown id → `401 invalid_token`. **This closes d1's undifferentiated-500 blocker for the local path** | PASS |
| `pnpm audit --audit-level=high` | baseline | `No known vulnerabilities found`, exit 0 | PASS |
| Deletion path exercised | §7a | **NOT CHECKED — not built.** M1.10 blocked on CR-002 | N/A |
| Cookie flags on a real session | baseline | **NOT VERIFIED — `auth.users` is 0 rows, so no `Set-Cookie` exists to read.** `proxy.ts` sets `httpOnly`, `secure`, `sameSite:'lax'` in code | NOT CHECKED |
| Third-party destinations | §7a | Vercel and Supabase only; no LLM call, no analytics in the tree | PASS |

## Issues

### Critical

1. ~~**Mode-1 ingest is inoperable**~~ — **CLOSED at `c65e44d`, re-verified by me through the product path.** Original finding retained below as the record. Fix: `grant execute on function app.gates_are_closed_set(jsonb) to service_role;` in migration `20260820011222`, granted to `service_role` **only** — I re-read the full privilege matrix for all 13 `app.*` functions and exactly one row changed; `anon` and `authenticated` remain `false` everywhere they were.

1. **Mode-1 ingest is inoperable: `service_role` cannot execute `app.gates_are_closed_set`** — `supabase/migrations/20260819165903_i5_ingest_idempotency_and_gates.sql:82`
   - What: line 82 is `revoke execute on function app.gates_are_closed_set(jsonb) from public, anon, authenticated;` and **no `grant … to service_role` follows it**. Line 89 adds `check (app.gates_are_closed_set(gates))` to `fleet_run`. A CHECK constraint evaluates in the **caller's** role, and every application write runs as `service_role`. `persistPlan` writes `fleet_run` first, so the whole plan aborts.
   - Why it matters: FR-14–FR-23 — the reason this product exists — cannot store a row. `POST /api/ingest/run` returns `500` for every caller, forever. The route deliberately withholds the database message, so the log says only "The run could not be ingested (fleet_run)".
   - Evidence: reproduced the exact upsert `persist.ts:108-115` emits, as `service_role`: `{"code":"42501","message":"permission denied for function gates_are_closed_set"}`. Route-level: two identical posts → `500`, `500`; work_item count `0 → 0`. My **negative control** (a different run id, which must increase the count) also stayed at `0`, which is how I knew the "idempotent: counts identical" result was a false green rather than a pass. Grant census: `has_function_privilege('service_role', 'app.gates_are_closed_set(jsonb)', 'EXECUTE')` → **false**.
   - Blast radius, measured: exactly **one** CHECK constraint in the database calls an `app.*` function, so `fleet_run` is the only table affected. `app.looks_like_secret` is also unexecutable by `service_role` but is only reached through the SECURITY DEFINER trigger, which is why FR-78 works. `/api/ingest/release`, `/api/ingest/session`, `/api/waits` and all six answer endpoints are unaffected and were observed working.
   - Fix: `grant execute on function app.gates_are_closed_set(jsonb) to service_role;`

### Important

1. **[CLOSED at `c65e44d`]** **`pnpm e2e` is red on any correctly configured machine** — `e2e/sign-in.spec.ts:56`
   - **Re-verified:** `pnpm exec playwright test` now exits **0** — 199 passed, 7 skipped, 0 failed. Fixed at the premise rather than by softening the assertion, which is the right call.
   - What: the test asserts the sign-in screen shows an "unconfigured deployment" error, commented "This build has no Supabase environment." It passes only when the env vars are **absent**.
   - Why it matters: the suite exits `1` (195 passed, 2 failed) precisely because credentials now exist, and it will fail in CI with secrets. A gate that goes red when the app starts working stops being read.
   - Evidence: `E2E_FINAL_EXIT=1`; both failures are this test in the chromium and mobile projects, `waiting for locator('[data-verify-unit=\'auth-error\']')`.
   - Fix: guard on `process.env.NEXT_PUBLIC_SUPABASE_URL` being absent, or split into configured/unconfigured cases. **I left it red rather than softening it.**

2. **[WITHDRAWN — my attribution was wrong]** **An explicit `engagementSlug` is silently discarded by `POST /api/ingest/session`**
   - **Correction:** explicit-slug resolution was never broken. The wire field is `engagement` (`sessions/input.ts:222`); my probe sent `engagementSlug`, which was an unknown key, so this was **I3's defect on a different endpoint**, not a second finding. Re-verified: `engagement: <slug>` → `resolvedBy="explicit-slug"`, `unhonouredSlug=null`. The §7a-vs-FR-24 grant conflict i6 raised is real but degrades only the *no-slug* directory-matching path, and is queued separately. The residual improvement i10 shipped anyway — `unhonouredSlug` + `attributionNote` when a named slug matches nothing — is a genuine gain over the old silence.
   - What: posting a session with a correct, registered `engagementSlug` returns `201` with `"engagement":"unassigned","resolvedBy":"unassigned"`, and nothing in the response says the slug was overridden.
   - Why it matters: FR-26's `unassigned` fallback is for a session resolving to **no known** engagement. Silently reassigning a named one is a wrong attribution that Erik then has to undo by hand — the "wrong `done`" failure in the attribution dimension.
   - Evidence: probe A, run 5. Root cause is i6's documented §7a-vs-FR-24 conflict (an agent token may not read `engagement.repo_path`), which i6 escalated correctly; the defect is the silent discard, not the grant.
   - Fix: report the override in the response, or refuse the post.

3. **[CLOSED for run/session/release; SEE NEW N1 for the gap]** **Unrecognised request-body keys are silently accepted; `deployedAt` loses the deploy date** — `src/lib/server/releases/input.ts:313`
   - **Re-verified:** `deployedAt` → `400` naming `deployed_at`; `requirementRefs` → `400` naming `requirement_refs`; an invented key on `/api/ingest/run` → `400` listing the accepted fields; a nested `workItem.<bogus>` on the session endpoint → `400` with the dotted path. Server-owned `source` on the release endpoint is accepted and reported in `ignored_fields`, which is the right distinction.
   - What: the release endpoint reads `deployed_at`. Posting `deployedAt` (camelCase, the spelling every other ingest endpoint uses) plus a wholly unknown key returns `201` and stores `deployed_at: null`.
   - Why it matters: FR-73 says a release records deployed-at. This is the unparsed discipline broken at the API boundary — i7 already made an unrecognised **query** parameter a `400`, and body keys should not be laxer.
   - Evidence: `deployedAt` → `201`, stored `null`. **Positive control:** `deployed_at` → `201`, stored `"2026-08-19T12:00:00.000Z"`.
   - Fix: reject or report unknown body keys.

4. **`app.rate_limit_counters` shipped with no §7a classification**
   - What: migration `20260819144647` creates a 22nd table. §7a classifies 21. The project rule is that an entity with no §7a row is a blocker, not a default.
   - Why it matters: i1's report states "Unclassified tables refused to guess at: **none** — all 21 have a §7a row", which is true of the public tables and silently excludes the one it created in `app`. The reconciliation reads complete and is not.
   - Evidence: built the table list from `CREATE TABLE` across all seven migrations; 21 public + `app.rate_limit_counters`.
   - **I am filing this `important`, not `critical`, and saying so explicitly:** the mechanical rule in my brief makes an unclassified table `critical`, but the measured exposure is nil — unexposed `app` schema, zero grants to `anon`/`authenticated`, RLS on with zero policies (deny-all), and the contents are a token id, a window and a count. The defect is the undeclared classification. Overrule me if you want the rule applied literally.
   - Fix: add an `internal` row to §7a. Queued for your decision.

5. **i5's FR-22 evidence was measured in the wrong role — an unsound trajectory, and it is how C1 shipped green**
   - What: i5's report presents an 8-table "IDEMPOTENT" table with a negative control, measured with `execute_sql` (trace lines 446–458), i.e. as `postgres`. `postgres` owns `app.gates_are_closed_set` and can execute it; `service_role` cannot. The same upsert through the shipping path fails 100%.
   - Why it matters: the claim is true of the SQL and false of the product. i5 listed "the route end-to-end with a real agent token" as NOT VERIFIED #1, which is honest — but the idempotency table reads as settled, and the gap between the two is where C1 lived.
   - Evidence: trace `a9b4ecf06c24aa62d` lines 446/450/454/458 are `execute_sql`; the migration header at line 2 asserts "no grant added or changed" while adding a function that the writer role cannot execute.
   - Fix: verification of a write path runs as the role the write path uses.

6. **[NEW at `c65e44d`] `/api/waits` still accepts unrecognised body keys in silence** — `src/lib/server/waits/input.ts`
   - What: `unknown-keys.ts` is imported by `releases/input.ts` and `sessions/input.ts` only, and `payload.ts` implements its own check. **`waits/input.ts` has none.** A wait posted with `bogusKey` returns `201` and the key vanishes.
   - Why it matters: this is the identical defect class i10 just fixed on the other three, on a fourth endpoint that is equally agent-writable — FR-33 says a wait may be declared by an agent over the ingest API, under the same `ingest:write` capability. The consequence is concrete rather than cosmetic: the optional fields here are `expectedBy`, `reason`, `ownerType`, `probeTarget` and `blocks`, so a caller sending `expected_by` gets a `201` and a wait with **no expected-by date**, and FR-34's overdue flag is computed from exactly that field. A wait that can never go overdue is a wrong `done` in the blocked-work dimension.
   - Evidence: `{engagement, label, owner, startedAt, resolutionMethod, bogusKey:1}` → `201`, wait created. Required-field checks do still fire (`startedOn` alone → `400 startedAt: required`), so only optional fields are silently lost — which is the harder case to notice.
   - Fix: the same `unknownKeyProblems(...)` call the other two use, with a `WAIT_BODY_FIELDS` allowlist.

### Minor

1. **[NEW at `c65e44d`] Unknown-key rejection does not reach nested entries on `/api/ingest/run`.** A bogus key inside a `manifests[]` entry returns `200` and is dropped silently, while the session endpoint *does* cover its nested `workItem.*` object and answers `400` with a dotted path. The coverage is inconsistent between two endpoints fixed in the same commit. Bounded consequence — only `name` and `text` are meaningful there and a missing one already `400`s — but it is the same silent-drop class the project treats as load-bearing.

2. **Mutation-harness scratchpad collision.** i5, i7, u2, u3 and u4 all wrote a harness to the same `…/ffcafe28-…/scratchpad/mutate.py`. i7's run at trace line 338 executed **u4's** script and printed u4's `M1..M9` results into i7's transcript; i7 caught it, verified its worktree was clean, and renamed to `mutate-i7-b0952e.py`. No other unit shows any sign of noticing. I checked each unit's final claimed numbers against its own correctly-named runs and they hold, so **no shipped claim rests on contaminated output** — but the hazard is real and a unit that is overwritten cannot detect it. Fix: unit-scoped scratchpad paths in the specialist contract.
3. **`CLAUDE.md` names a fixture directory that does not exist.** "Fixtures under `tests/fixtures/`" — there is no such directory; Tier-1 shapes live in five `__fixtures__/` directories under `src/`, Tier-2 in gitignored `fixtures-local/`. doc1 found this and queued it; I confirm it. I did not edit `CLAUDE.md`.
4. **The three ingest endpoints mix body-key casing.** `/api/ingest/release` reads snake_case (`deployed_at`); `/api/ingest/session` and `/api/waits` read camelCase (`workingDirectory`, `startedAt`). One convention, please. Related to important I3 but separately fixable.
5. **i4's report says "Six security controls were mutation-tested" while its own table lists seven.** The table is right (7 mutations, trace lines 371–450). A counting slip in the prose, not in the work.
6. **u4 left a dev server running.** `next-server` pid 6336 on port 3125, started 15:18, cwd `.claude/worktrees/agent-a8ebad97c5e9124c2` — still alive when I finished, ~5 hours later. I killed it. Fix: specialists kill servers in every exit path.
7. **Playwright MCP artifacts landed in the main repo root.** `.playwright-mcp/`, `home-light.png`, `preview-desktop-light.png` are untracked in `/Users/erikmeltzer/Projects/project-tracker` because u2/u3/u4/c1's screenshots wrote outside their worktrees. Repo hygiene: they are one `git add -A` away from being committed.

## Re-verification at `c65e44d`

Three commits landed after my first pass: `d08ea4e` (C1), `575b600` (I1), `c65e44d` (I2+I3).
Everything below I measured myself; I did not take i10's table.

**Gates, re-run by me:** typecheck `0` · lint `0` · build `0` · vitest **958 passed / 6 skipped** ·
**e2e exit `0`, 199 passed / 7 skipped**. The 6 unit skips are still the Tier-2 corpus, gated by
`describe.skipIf(!present)` on `fixtures-local/` in `ingestRun.corpus.test.ts` — untouched, not
synthesised, and still not counted as passing.

**C1, through the product path, as `service_role`, over HTTP:**

| Post | Result | `work_item` |
|---|---|---|
| run `qa1rv` #1 | `200`, 3 work items · 1 dependency · 3 requirement links · `unparsed: 1` | 3 |
| run `qa1rv` #2 (identical) | `200`, same counts | **3 — held** |
| run `qa1rv2` (**negative control**, different id) | `200` | **6 — rose** |

The negative control is the part that matters: without it, "count unchanged after the second post"
is equally consistent with idempotency and with both posts failing, which is exactly how my own
first idempotency probe produced a false green at `a87fe4d`.

**Unblocked by the fix, and observed for the first time:**

- `work_item.description` written through the **real ingest route** — 242 / 186 / 154 bytes, all
  `c30d0407…`, **no plaintext leak on any row**, `decrypt_field` round-trips. §7a's `work_item`
  row is now verified on the path the product actually uses, not just at the function.
- FR-15 end to end: the unrecognisable status shape persisted as `status='unparsed'` and the
  response reported `unparsed: 1`.

**Security posture, re-checked for loosening:** the `app.*` privilege matrix is identical to my
first census except one cell — `gates_are_closed_set` is now `service_role=true`, with
`authenticated=false` and `anon=false`. `anon` reads on all 21 tables still return `42501`, with
the `service_role` 21/21 positive control intact. Nothing widened.

**Compatibility of the wire-contract change.** Refusing a previously-accepted key is a real
breaking change and i10 was right to queue it rather than assume. Two callers would break today,
and **one of them was me**: I had been posting `requirementRefs`, which was silently dropped on
both of my earlier release probes — so my original FR-74 row was passing on evidence that proved
nothing. That is the fix doing its job, and it is a better argument for the change than any I could
have made. My corrected FR-74 test is in the coverage table.

## Trajectory grading

Graded from the specialists' own `agent-*.jsonl` traces. Line numbers are 0-based JSONL record
indices. All 16 agent-id → unit mappings were re-confirmed against each `.meta.json`'s `agentType`
and `description`; **all 16 are correct**. i2 was absent from the dispatched mapping and I located
it at `af9a7210a66a86493`.

| Unit | Specialist | Schema-before-query | Claims evidenced | Verify-after-edit | Unknowns researched | Boundaries escalated | Verdict |
|---|---|---|---|---|---|---|---|
| r1 | researcher | N/A | SOUND | N/A | SOUND | N/A | SOUND |
| i1 | api-integrator | SOUND | SOUND | SOUND | SOUND | **UNSOUND** | **UNSOUND** |
| i2 | api-integrator | N/A (pure) | SOUND | SOUND | SOUND | SOUND | SOUND |
| i3 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | SOUND |
| i4 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | SOUND |
| i5 | api-integrator | SOUND | **UNSOUND** | SOUND | SOUND | **UNSOUND** | **UNSOUND** |
| i6 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | SOUND |
| i7 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | SOUND |
| i8 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | SOUND |
| u1 | ui-designer | N/A | SOUND | SOUND | SOUND | N/A | SOUND |
| u2 | ui-designer | N/A (no query code) | SOUND | SOUND | SOUND | SOUND | SOUND |
| u3 | ui-designer | N/A (see note) | SOUND | SOUND | SOUND | SOUND | SOUND |
| u4 | ui-designer | N/A (no query code) | SOUND | SOUND | SOUND | SOUND | SOUND |
| c1 | copywriter | N/A | SOUND | SOUND | SOUND | N/A | SOUND |
| d1 | devops | N/A | SOUND | N/A (no product code) | SOUND | SOUND | SOUND |
| doc1 | docs-writer | N/A | SOUND | SOUND | SOUND | SOUND | SOUND |

**i1 — UNSOUND on boundaries.** It created `app.rate_limit_counters`, a table with no §7a row, and
did not queue the classification question, while its report states that no table was left
unclassified. The project rule is explicit that an entity with no §7a row is a blocker rather than a
default. Everything else about i1's trajectory is exemplary and is the strongest in the run: it read
live schema state before writing (trace 42–60), generated types rather than hand-writing them (211
→ 219), verified after its last edit (223–229 follow 219), and ran genuine negative controls
including a deliberately-open table that returned `200` with rows to the publishable key while
`relrowsecurity` read `true` — the measurement that makes every other RLS claim in this run
trustworthy.

**i5 — UNSOUND on claims and boundaries.** Claims: the FR-22 idempotency table (trace 446–458) was
measured through `execute_sql` as `postgres`, not through the route as `service_role`, and the
shipping path is broken. Boundaries: it added `app.gates_are_closed_set` to a CHECK constraint and
revoked EXECUTE from three roles without establishing which role evaluates the constraint, under a
migration header asserting "no grant added or changed". Its schema reads (91–116 before writes at
319+) and its verify-after-edit ordering are both correct, and its `ON CONFLICT` partial-index
finding — measured live at 287–306 and fixed in migration `20260819170622` — is genuinely valuable
work that I confirmed still holds (all six upsert targets are plain unique indexes).

**Note on u3's schema check.** u3 edited two files containing database calls without reading a
migration or `database.types.ts`. I graded this N/A rather than UNSOUND: the edit swaps a hardcoded
`unparsed: 0` for a call to i7's existing, tested census helper rather than authoring SQL, so the
rule's purpose — not writing column names from memory — is not engaged. The same reasoning covers
u2 and u4, which wrap i4/i6 modules and read those modules in full first.

**The six sampled mutation claims all hold**, and the sampling was worth doing because three of the
six reached their number through a repaired harness rather than a clean run:

| Unit | Claim | What the trace shows |
|---|---|---|
| i7 | 14/14 | 14 entries in `MUTATIONS`; `SURVIVORS: none`; a two-fixture delta control (+12 red two-actor vs +0 one-actor). **Supported** |
| u4 | 19/19 | 15 + 4 across `mutate2.py`/`mutate3.py`; round one 14 RED + 1 STILL GREEN, fixed, then 4 RED. Only unit to verify restores by sha256. **Supported** |
| i5 | 18/18 | Run 1 **invalid** — `git checkout --` on untracked files, every revert failed, mutations accumulated. Repaired with `restore.py`, then 17 CAUGHT + 1 SETUP FAIL, then run 3 closed the last. **Supported across a repaired sequence** |
| u3 | 17/17 then 9/9 | First run reported **0/15, all `BUILD-BROKEN`** — the harness was measuring its own crash (`--reporter=basic` removed in vitest 4). Then 14/15, survivor M15 fixed, M16/M17 added → 17/17 with a `red=0` negative control run first. **Both supported** |
| i3 | 12/12 | 12 numbered mutations, each its own vitest run and revert, final `git status --porcelain` clean. **Supported** |
| u2 | 12/12 | 9 + 3; survivor diagnosed as an equivalent mutation via `TZ=Pacific/Kiritimati`, which surfaced a real neighbouring defect. **Supported** |

Traces: `/Users/erikmeltzer/.claude/projects/-Users-erikmeltzer-Projects-project-tracker/ffcafe28-dc0e-4d09-95fc-75d5dbad9961/subagents/` (all 16). The second directory named in the dispatch holds none of them.

## Verification performed

**Re-run in full at `c65e44d` after i10's fixes.** Both passes are shown; where they differ, the
`c65e44d` number is the current one.

| Check | at `a87fe4d` | at `c65e44d` |
|---|---|---|
| typecheck | exit 0 | exit 0 |
| lint (oxlint) | exit 0 | exit 0 |
| build | exit 0, 31 routes | exit 0 |
| vitest | 919 passed / 6 skipped | **958 passed / 6 skipped** |
| playwright | **exit 1** — 195 passed / 2 failed / 5 skipped | **exit 0 — 199 passed / 7 skipped** |
| `POST /api/ingest/run` | `500` always | `200`, idempotent, negative control rises |
| anon RLS (21 tables) | `42501` ×21 | `42501` ×21 |
| `pnpm audit --audit-level=high` | no known vulnerabilities | not re-run — no dependency changed |

The detail of the first pass follows.


- **Build** (pnpm): **PASS**, exit 0, 31 routes — re-run after my additions, still exit 0
- **Type-check**: **PASS**, exit 0
- **Lint** (oxlint, not ESLint): **PASS**, exit 0 — **negative control run first**, because a clean oxlint prints nothing and is indistinguishable from linting nothing. Injected `debugger` + `no-unused-vars` → `error eslint(no-debugger)`, exit 1. The pass is real. Reduced ruleset noted as a fact, not filed as a defect
- **Unit tests**: **PASS**, exit 0, **919 passed | 6 skipped (925)**. The 6 skips are the Tier-2 `fixtures-local/` corpus suite and **stay skipped** — I did not synthesise fixtures and I do not report 925 passing
- **Playwright, pre-existing suite**: **FAIL, exit 1** — 195 passed, 2 failed, 5 skipped. Both failures are important I1. The 5 skips are u4's self-cancelling WebKit/`upgrade-insecure-requests` guard, legitimate
- **Playwright, authored by me**: 21 tests × 2 projects = **42 passed**, plus a **valid negative control** (see below)
- **Accessibility**: axe-core (`@axe-core/playwright`, added by me) across **15 routes × 2 projects**. **Zero violations at `critical`, `serious`, `moderate` or `minor`** — confirmed by widening the filter to all four impacts and re-running, which still passed. Caveat stated plainly: these routes render their **refusal state** (no operator session), so this measures a page that is largely one notice. It is not a screen-reader pass and does not substitute for one
- **Security checklist**: 20/22 items checked. Not checkable: session cookie flags (no `auth.users` row exists), deletion path (not built, M1.10 blocked)
- **Live database probes**: ~40 SQL statements plus 5 HTTP probe scripts against the live project `onpvolboecjpdkvurjaf`, every one with a positive or negative control
- **`pnpm audit --audit-level=high`**: `No known vulnerabilities found`, exit 0

**My own false green, recorded.** My first negative control on the authored specs exited `1` and I
nearly banked it — but the `1` came from `[WebServer] Failed to type check`, not from an assertion.
My mutation had introduced a TypeScript error, so the server never started and nothing was measured.
I re-ran with a type-safe mutation: the header spec then failed exactly where intended
(`Received: "DENY"`), 1 failed / 20 passed. Both spec files were restored and **verified
byte-identical by `shasum -c`**.

**What I wrote to the live database, and what I left behind.** I registered and deleted four probe
engagements, minted and deleted six throwaway agent tokens (plaintexts existed in process memory
only — never printed, never written to disk), and inserted and deleted work items, a milestone, a
release, a session and a wait. Final state is **identical to the pre-review state except
`audit_log`**, which grew **3 → 276 rows**; those are append-only by design and I cannot remove
them. Most came from the 160-request burst needed to trip the limiter. Everything else:
`engagement=1` (the `unassigned` sentinel), `operator=0`, `agent_token=0`, `work_item=0`,
`contract_milestone=0`, `fleet_run=0`, `test_result=0`.

## Infrastructure failures (not the fleet's fault)

- **`psql` and the Supabase CLI are absent on this machine.** Worked around with the Supabase MCP `execute_sql` and `@supabase/supabase-js`. No impact on coverage.
- **No accessibility engine in the repo.** Added `@axe-core/playwright@4.13.0` as a dev dependency (the only dependency I added). `pnpm add -D` exit 0.
- **Session limits killed two specialists mid-run**, visible as `isApiErrorMessage`: i6 at trace line 481 ("You've hit your session limit"), u3 at 632. **i6 never committed** — its last action was writing its report. Neither is a reasoning failure and neither counts against those units.
- **The worktree-isolation guard refused commands in 13 of 15 traces** ("this command is too complex to verify that it stays inside the worktree"), almost always a compound loop or a heredoc, and almost always immediately re-issued as simple commands or a script file. It is the single largest source of `TOOL_ERROR` in this run and it is harness policy working, not models failing. Worth tuning if the retry cost matters.
- **Port contention:** my backgrounded e2e run and my probe server briefly collided on 3100/3210. Cleared; both ports free at exit.
- **u4's dev server was still running** on port 3125 after ~5 hours. Killed. Also filed as minor 5.
- **Playwright MCP wrote screenshots outside the worktrees** into the main repo root, leaving `.playwright-mcp/`, `home-light.png` and `preview-desktop-light.png` untracked there. Also filed as minor 6.
- **My first negative control was invalidated by a type error** (above). Self-inflicted, re-run, recorded rather than banked.

## Tests added

Both are committable deliverables and both stay in the branch. Neither requires credentials.

- **`e2e/qa1-security-headers.spec.ts`** — 6 tests. Reads headers off a **real response**, never off `next.config.ts`, because the two came apart once already when `proxy.ts` sat at the repo root and was silently ignored. Asserts the static block, the nonce-based CSP with a **per-request** nonce, every `<script>` carrying it, the block being served on a `4xx` as well as a `200`, no CORS grant under a hostile `Origin`, and — deliberately — that HSTS carries **no `preload`**, which is the tell that distinguishes the app's headers from Vercel's SSO interstitial.
- **`e2e/qa1-accessibility.spec.ts`** — 15 tests. axe-core across every route, WCAG 2.0/2.1 A and AA, failing on `critical`/`serious` and attaching the full per-impact counts so the quieter tiers stay visible. Fails closed: a route that does not render is an explicit failure, not a skip.

Dev dependency added: **`@axe-core/playwright@4.13.0`** (test-only). `package.json` and
`pnpm-lock.yaml` are modified accordingly; no product code was touched.

## Questions queued

`/Users/erikmeltzer/Projects/project-tracker/.fleet/questions-qa1-b0952e.jsonl` — 6 questions:
the §7a classification of `app.rate_limit_counters`, the silent `engagementSlug` override, unknown
body keys and casing, the environment-coupled e2e test, `audit_log` probe volume, and unit-scoped
mutation-harness paths.

## Not reviewed

- **M1.10 (FR-60 export, FR-61 hard deletion)** — deliberately not built, blocked pending CR-002, which is PENDING and correctly not folded into the resolved spec. **A blocked milestone, not a defect.**
- **`docs/user-guide.md`** — `man1` dropped on a session-budget trade; carried in the build report, not filed here.
- **The Tier-2 real-corpus suite (6 tests)** — stays skipped; `fixtures-local/` is absent and I did not synthesise it.
- **The deployed Vercel preview** — d1's blocker stands: `SUPABASE_SERVICE_ROLE_KEY` is absent from Preview, so every `/api/*` route 500s there. devops correctly refused to set a BYPASSRLS credential on a preview URL without your decision. **All my API findings are local-only and say nothing about the preview.** Note that C1 would 500 there too, for a second and independent reason.
- **Screen layout and density of the six answer screens** — §5a reads `Approved design: NOT YET APPROVED`, and design is approved at the token layer only. I made no layout judgements. You have not yet seen these screens populated, and neither have I beyond tiny seeded fixtures.
- **Populated-data behaviour at production volume** — every screen I saw rendered a refusal or a handful of probe rows.
- **Screen-reader and assistive-technology behaviour** — axe is machine-checkable findings only.
- **`disable_signup`** — not re-probed, deliberately; probing it creates an account and re-opens what was closed. Carried from M1.0 as verified by observation.
- **Milestones already `Complete` in `prod.md`** (M1.0 Provisioning) — not this run's work.
