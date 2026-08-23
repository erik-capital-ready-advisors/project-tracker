# Delivery Ledger

A delivery tracker for a one-person studio. It answers six questions about the work in flight, in a
browser in under thirty seconds and over a JSON API for an agent: what is blocked, what is next,
what was committed to a client and when, what is untested, what is broken, and what Erik is the
bottleneck on.

The rule underneath all of it: **Erik never types a status.** Work arrives here three ways and every
one of them is automatic. A tracker that asks for status updates gets abandoned by week three, so
this one reads artifacts instead of asking questions.

## Who this is for

One operator, no handover. The documentation in `docs/` assumes a terminal, `git`, `pnpm`, and that
you wrote the spec this product ingests. It does not explain the stack.

---

## The six answers

| Screen | Question it answers | Requirements |
|---|---|---|
| `/blocked` | What is stopped, who owns it, and for how long? | FR-52 |
| `/next` | What can be worked on right now with nothing in its way? | FR-53 |
| `/committed` | What was promised to a client, for how much, and by when? | FR-54, FR-75 |
| `/untested` | Which requirements has nothing independently proven? | FR-55, FR-48, FR-49 |
| `/bottleneck` | What is waiting on Erik personally? | FR-56, FR-40 |
| `/broken` | What is defective or has regressed? | FR-71, FR-69 |

Broken is the sixth, added by approved CR-001. Spec §5a still says "five" because it predates the
change request. Six is correct, and `src/lib/nav.ts` is the single source that says so.

Four operator screens sit behind the answers: `/registry`, `/work-items`, `/waits`, and
`/settings/tokens`.

## Three execution modes, one table

Work reaches this studio three ways. All three are first-class, and they share **one** `work_item`
table, one set of views, and one set of screens. Splitting them would produce three lists to merge
by hand, which is the state this product exists to end.

| Mode | Where the rows come from | `execution_mode` |
|---|---|---|
| **fleet** | The autonomous fleet leaves artifacts under `.fleet/`. The parsers in `src/lib/ingest/` read them and `POST /api/ingest/run` writes them. | `fleet` |
| **hand** | A Claude Code `SessionEnd` hook posts one record per session to `POST /api/ingest/session`. Erik types nothing to make this happen. See [docs/session-hook.md](docs/session-hook.md). | `hand` |
| **external** | Waits on people outside the studio: store review, client feedback, a compliance sign-off, a vendor. Declared once, carrying their own owner and expected-by date. | `external` |

## `unparsed` is the only default

A wrong `done` is the worst output this product can produce. It tells Erik a client requirement is
satisfied when nothing checked it.

Every classifier therefore has exactly one default and it is `unparsed`. Every screen and every
endpoint reports the current count. Widening a regex to make a stubborn row classify is the failure
this rule exists to prevent: a build that lowers the unparsed count by loosening a pattern has made
the product worse. Add the shape the artifact actually uses, or leave it loud.

Two consequences you will meet in the code:

- An **unknown** count renders "unparsed count unavailable", never `0`. Rendering `0` is a positive
  claim that everything classified. `src/lib/unparsed-display.ts` holds the three display states and
  `tests/unparsed-count.test.tsx` pins them.
- Where two artifacts disagree, both readings get recorded. In the reference corpus,
  `manifest-cd414c.md` marks unit `u4` as `pending` while `checkpoint-cd414c.md` says it merged.
  That disagreement is data.

## Parsers are pure functions over text

A parser takes artifact text and returns records. It reads no filesystem, opens no socket, and
touches no database. That is what makes it testable against a frozen string. Every parser in
`src/lib/ingest/` carries a test that feeds it a shape it does not recognize and asserts `unparsed`
rather than a guess.

When a test fails, fix the parser. Editing a fixture to make a test pass is the same move as an
orchestrator editing a specialist's report so it clears the gate: the gate stops being a gate.

Fixtures come in two tiers, and `CLAUDE.md` is out of date about where they live. It names
`tests/fixtures/` as byte copies of real fleet artifacts. **No such directory exists at this
commit.** What the tree actually holds:

- **Tier 1**, under `src/lib/ingest/__fixtures__/` and four `__fixtures__/` directories under
  `src/lib/server/`. Hand-written shapes carrying no client detail. Committed.
- **Tier 2**, under `fixtures-local/`. Byte copies of real fleet artifacts that Erik copies in
  himself. **Gitignored, and it must stay that way.** Spec §7a classifies work-item, blocker and
  open-question prose `sensitive`, and spec question Q2 (whether any client contract restricts where
  their project details may be stored) is open. Real client prose never enters this repository.

The Tier-2 corpus suite **skips** when `fixtures-local/` is absent, which it is on a clean checkout.
Six tests skip for that reason. They are skipped, not passing, and the test output says so.

---

## Stack

Next.js 16.3.1 (App Router, Turbopack), React 19.2.8, TypeScript 7.0.2 strict, Tailwind v4, shadcn
on Radix, Supabase (Postgres 17.6), Vercel, pnpm 11.

The stack is a requirement, not a preference. Erik asked for a product his own autonomous fleet can
build, and the fleet's specialists cover Next.js, Supabase and Vercel and no other stack. A
zero-dependency Python CLI was proposed and rejected on that ground alone. Do not "improve" it.

Two toolchain facts that will otherwise cost you an afternoon:

- **ESLint is not installed, deliberately.** `typescript-eslint` refuses to load against TypeScript
  7 and throws at require time, which takes `eslint-config-next` down with it. `pnpm lint` runs
  `oxlint`, which parses TS/TSX natively and needs no TypeScript compiler. Type-aware checking is
  not lost: `pnpm typecheck` runs the real pinned compiler. The full reasoning sits in
  `pnpm-workspace.yaml`.
- **`pnpm-workspace.yaml` carries `allowBuilds: unrs-resolver: false`.** pnpm 11 refuses to run
  *any* script while a dependency's install-time build script is undecided, so a missing answer here
  fails `pnpm build`, `pnpm test`, `pnpm typecheck` and `pnpm lint` alike, and it presents as a build
  failure when it is an install-policy gate. Vercel hits the same gate. Do not remove that block.

---

## Quickstart

**You need:** Node 22 (`.nvmrc` is absent; 22.22.2 is what this was built and verified against),
`pnpm` 11, and a clone of this repository. **You do not need a database, a Supabase key, or a
Vercel account to get to a running site.** Where that stops being true is stated at the end.

```bash
git clone https://github.com/erik-capital-ready-advisors/project-tracker.git
cd project-tracker
pnpm install --frozen-lockfile
```

That URL is the repository's configured `origin`. **UNVERIFIED against GitHub:** this unit cloned
from a local path to test the rest of the quickstart, because the repository is private and this
session holds no GitHub credential.

`--frozen-lockfile` matters: Vercel installs the same way, so a lockfile that drifts locally fails
the deploy rather than the local install.

```bash
pnpm typecheck    # tsc --noEmit, pinned TS 7.0.2
pnpm lint         # oxlint
pnpm vitest run   # 583 pass, 6 skip
pnpm build        # next build
```

Then serve it:

```bash
pnpm build
pnpm next start -p 3000
```

Open `http://localhost:3000`.

### What you have at that point, and what you do not

Every command above was run in this order on 2026-08-19 against a **fresh `git clone` of commit
`3b2c81d` with no `node_modules`**, in a shell with every Supabase and Delivery Ledger variable
unset. All five exited 0, and `git status --porcelain` was empty afterwards. The port below was
3179 rather than 3000; nothing else differed.

Route statuses, observed on that clean clone **with no environment variables set at all**, not even
a placeholder:

| Route | Status |
|---|---|
| `/`, `/blocked`, `/next`, `/committed`, `/untested`, `/bottleneck`, `/broken` | `200` |
| `/registry`, `/work-items`, `/waits`, `/settings/tokens` | `200` |
| `/no-such-page` | `404` |
| `GET /api/waits`, `GET /api/session/unassigned` | `500`, empty body |
| `POST /api/ingest/run`, `/api/ingest/session`, `/api/ingest/release`, `/api/waits`, `/api/waits/resolve` | `500`, empty body |

**Stop here and you have a working local site.** Every screen renders, the navigation works, the
command palette opens, both themes work, and the full security header set is on every response. The
screens show empty states because no unit has wired them to data yet, not because anything is
misconfigured.

The API routes answer `500` with an empty body because `createServiceClient()` throws on the missing
`SUPABASE_SERVICE_ROLE_KEY` before the route guard's error handling can shape a response. That is
the expected symptom of an unconfigured environment, and the diagnostic table in
[docs/env.md](docs/env.md#diagnosing-a-500-on-an-api-route) tells the three failure modes apart.

To go further you need Supabase credentials, which exist and are held by Erik. Read
[docs/env.md](docs/env.md) next.

---

## Scripts

Every one of these was run against commit `3b2c81d` on 2026-08-19 and the observed result is in
`.fleet/specialist-reports/b0952e/doc1.md`.

| Command | What it runs | Observed |
|---|---|---|
| `pnpm dev` | `next dev` | Not run by this unit. **See the warning below.** |
| `pnpm build` | `next build` | Exit 0. 18 routes, all dynamic, `ƒ Proxy (Middleware)` present. |
| `pnpm start` | `next start` | Serves the production build. Needs `pnpm build` first. |
| `pnpm typecheck` | `tsc --noEmit` | Exit 0, no diagnostics. |
| `pnpm lint` | `oxlint` | Exit 0, no findings. |
| `pnpm test` / `pnpm vitest run` | `vitest run` | 45 files pass, 1 skipped. 583 tests pass, 6 skipped. |
| `pnpm test:watch` | `vitest` | Not run by this unit. |
| `pnpm e2e` | `playwright test` | **UNVERIFIED.** Requires browsers installed via `pnpm exec playwright install`, which this unit did not run. `e2e/shell.spec.ts` carries 12 tests. |

**`pnpm dev` writes to `CLAUDE.md` if you remove one line of config.** Next 16.3.1 injects a
`<!-- BEGIN:nextjs-agent-rules -->` block into `CLAUDE.md` on every `next dev`, and re-adds it when
you delete it. On this repository `CLAUDE.md` is the fleet's operating contract, so a dev server
that edits it is a dev server that edits the instructions, and it shows up as an unstaged change a
`git add -A` will sweep into a commit. `next.config.ts` sets `agentRules: false` to stop it.

Unit i4 measured the exact behaviour and corrected the assumption everyone starts with: **`next
build` never writes the block. Only `next dev` does.** Anyone testing the flag by running a build
will conclude it is unnecessary and be wrong. The comment above `agentRules` in `next.config.ts`
still says "on every `next dev` and `next build`", which contradicts i4's measurement; the flag is
correct either way, the comment is stale.

---

## Repository layout

```
src/lib/ingest/      Pure parsers. No fs, no network, no database. i2 and i3.
src/lib/server/      Persistence and server actions. Touches the database.
src/lib/api/         The agent-request surface: auth, capabilities, rate limit, audit. i4.
src/lib/supabase/    Three clients: browser, request-scoped server, service-role.
src/app/             App Router. 11 screens, 6 API routes at this commit.
src/components/      App shell, nav, design system, shadcn primitives under ui/.
supabase/migrations/ 7 migrations, all applied to project onpvolboecjpdkvurjaf.
scripts/             The mode-2 session-capture hook.
spec/                spec-approved.md, change-requests/, prod.md. Read in that order.
.fleet/              This build's own artifacts. The product parses these.
docs/                What you are reading the rest of in.
```

`src/proxy.ts` lives under `src/`, not at the repository root. With a `src/` directory Next ignores a
root-level `proxy.ts` silently: no warning, no error, and the `ƒ Proxy (Middleware)` line just
disappears from the build output while the CSP quietly stops being served. Unit i4 hit this and
recorded it.

## Documentation

| Document | What it covers |
|---|---|
| [docs/env.md](docs/env.md) | Every environment variable: what it is, where it comes from, what breaks without it. |
| [docs/deploy.md](docs/deploy.md) | Vercel and Supabase configuration, the migration path, and what to verify after a deploy. |
| [docs/agent-tokens.md](docs/agent-tokens.md) | Minting, scoping, rotating and revoking agent tokens. |
| [docs/session-hook.md](docs/session-hook.md) | Installing the mode-2 capture hook, and the two install-scope options Erik has not chosen between. |
| [docs/security.md](docs/security.md) | What was verified, what was built but not verified, and what was not built. |

`docs/user-guide.md` is written by a separate pass after QA passes. It does not exist yet.

`CLAUDE.md` is authoritative about **why** and unreliable about **what the code does now**. Read it
for rationale and constraints. Read the code for behaviour.

---

## Build state at commit `3b2c81d`

Eight units have merged. Do not read the screens as finished.

**Built and merged:**

- The 21-entity schema, RLS on every table, pgcrypto column encryption on 12 columns, the
  append-only audit log, and the rate-limit counter (i1).
- The pure parsers for mode-1 ingest and the CR-001 defect, regression and release rules (i2, i3).
- The agent-request surface: bearer tokens, two capabilities, the FR-5 refusal, rate limiting,
  audit, and the security-header layer (i4).
- Registry server actions and the fleet-run ingest path (i5).
- Session capture, external waits, the unified work-item model, and the `SessionEnd` hook (i6).
- The release path (i8).
- The app shell, design system, navigation, and eleven route pages rendering empty states (u1).

**Arriving in run `b0952e` but not at this commit**, so nothing in these docs describes them from
observation:

- The six answer endpoints under `/api/answer/*` (unit i7).
- The registry screens wired to real data (unit u2).
- The work-item, waits and agent-token screens (unit u4).

**Not built, and not coming in this run:**

- **No operator sign-in screen, and no MFA enrolment screen.** FR-7's mechanism exists in
  `src/lib/api/token-admin.ts` and `src/lib/api/operator.ts`, and `src/proxy.ts` refreshes a session
  it finds, but nothing in the App Router creates one. `auth.users` on the Supabase project holds
  **zero rows**. Every operator screen calls `requireOperator()` once it is wired, so those screens
  will refuse until both a sign-in path and an account exist. This is the largest gap in the build
  and it is queued as a question.
- **No export and no deletion path.** FR-60 (export) and FR-61 (archive and hard deletion) are
  milestone M1.10, blocked pending Erik's approval of CR-002. CR-002 is **pending approval and is
  not part of the spec basis**, which is `spec-approved.md` plus CR-001. Nothing in this build
  deletes a row. Do not plan around an export that does not exist.
- **No retention timer.** FR-62 forbids one while spec question Q3 is open. `on delete cascade` is
  declared on every engagement child, but a declared cascade is not a tested deletion path.
