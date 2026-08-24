# CLAUDE.md — Delivery Ledger

A single-operator delivery tracker for a one-person studio. It answers six questions — what's
blocked, what's next, what was committed to a client and when, what's untested, what's broken,
and what Erik is the bottleneck on — in a browser in under thirty seconds, and over a JSON API
for an agent. (The sixth, Broken, was added by approved CR-001.)

Next.js App Router, Supabase, Vercel, TypeScript strict. This stack is a requirement, not a
preference: Erik asked for a product his own autonomous fleet can build, and the fleet's
specialists cover this stack and no other.

## Build session protocol

At the start of every build session, read these three in order:

1. `spec/spec-approved.md` — what was agreed to build. Source of truth. Approved 2026-08-17,
   byte-identical to `spec-v1.md`.
2. `spec/change-requests/*.md` in numerical order — approved scope amendments. The
   highest-numbered approved CR wins where one conflicts with the spec.
3. `spec/prod.md` — build state, active blockers, decisions made along the way.

At the end of every session, update `prod.md`: the next-session pointer, current state, milestone
statuses, a Decisions-log entry for anything that diverges from or extends the spec, resolved
blockers moved to Decisions, and a one-line Session-log entry. Scope changes go to
`spec/change-requests/`, never into `prod.md`.

## Three execution modes, one table

Work reaches this studio three ways and all three are first-class:

- **fleet** — the autonomous fleet, Next.js/Supabase/Vercel only. Leaves artifacts under
  `.fleet/`; the product parses them.
- **hand** — Erik hand-prompting Claude on every other stack. Leaves nothing today; a Claude Code
  session hook captures it, and Erik types nothing to make that happen.
- **external** — waits on people outside the studio: store review, client feedback, a compliance
  sign-off, a vendor. Nobody types these in either; they are declared once and carry their own
  dates.

They differ only in how a work item is created and in the `execution_mode` and `executor_kind` it
carries. **They share one `work_item` table, one set of views, and one set of screens.** Splitting
them yields three lists Erik has to merge in his head, which is the state this product exists to
end.

## `unparsed` is the only default

A wrong `done` is the worst output this product can produce: it tells Erik a client requirement is
satisfied when nothing checked it.

Every classifier therefore has exactly one default, and it is `unparsed`. Every screen and every
endpoint reports the current count. Widening a regex to make a stubborn row classify is the
failure this rule exists to prevent — a build that lowers the unparsed count by loosening a
pattern has made the product worse. Add the shape the artifact actually uses, or leave it loud.

The same rule extends past parsing: emit what an artifact says, and where two artifacts disagree,
record both. In the reference corpus, `manifest-cd414c.md` marks unit `u4` as `pending` while
`checkpoint-cd414c.md` says it merged. That disagreement is data.

## Parsers are pure functions over text

A parser takes artifact text and returns records. It reads no filesystem and touches no database.
That is what makes it testable against a frozen string, and every parser here carries a test that
feeds it a shape it does not recognize and asserts `unparsed` rather than a guess.

Fixtures under `tests/fixtures/` are byte copies of real fleet artifacts. When a test fails, fix
the parser. Editing a fixture to make a test pass is the same move as an orchestrator editing a
specialist's report so it clears the gate — the gate stops being a gate.

## Credentials — read this before touching anything that authenticates

Secrets come from **the environment only**.

- Never write a real key into a committed file. Not `.env`, not a config module, not a JSON
  fixture, not a test file.
- Never write a real key into a scratch file, a `/tmp` note, or a report under `.fleet/`. A
  scratch file is not a safe place; it is an uncommitted place, and those are different things.
- Never echo a secret into a transcript to check it. `echo $KEY | head -c 8` is still the key in
  the transcript.
- `.env.example` documents which variables exist and what shape they take. Placeholders, never
  values.
- If a task appears to require a real secret, that is a **blocker, not a puzzle**. Report it and
  stop.

**There is no local equivalent of a credential vault.** Nothing on this machine is a safe place to
park a key "for now". If a key is needed and absent, the answer is to ask for it to be set in the
environment, not to store it somewhere convenient.

**Agent tokens issued by this product are secrets too.** The plaintext is shown once at creation
and stored only as a hash. Do not reproduce one in a screenshot, a test fixture, or the user
guide.

`.claude/settings.json` in this repo denies reads of the usual secret paths, and that denial
covers Bash too — `cat .env.local` is refused the same way `Read` is. Treat a denial as the rule
working, not as an obstacle to route around.

## Security is declared in the spec, not invented here

The posture lives in `spec/spec-approved.md` §7a — a class per entity, at-rest treatment, retention,
and who may read it. `~/.claude/agents/security-baseline.md` is the floor beneath it, applying
wherever §7a is silent, and the build report says which of the two produced each control.

Three rules hold regardless:

- **An entity with no row in §7a is a blocker, not a default.** Queue the question and stop.
  Deciding a table is "probably internal" is the same class of mistake as guessing a security
  boundary permissive.
- **A control you did not observe is not a control.** Encryption is read back as ciphertext,
  headers are seen in a response, rate limits are tripped, deletion paths are called.
  `NOT VERIFIED — <reason>` is a fine answer; a claim in its place is not.
- **Never disable certificate validation.** Not in dev, not temporarily, not to get past an error.

Two standing facts about this stack, both measured in a prior build in this practice rather than
inferred:

- **`disable_signup` is a dashboard action.** A fresh Supabase project ships with public signup
  on and no migration closes it. Set it at provisioning and verify it by observation — both the
  open and closed states answer `422`, so the error *code* discriminates, not the status.
- **Every new function in schema `public` needs an explicit per-name `REVOKE` from `PUBLIC`.**
  `ALTER DEFAULT PRIVILEGES` does not close it; that was measured, and it is a rule here rather
  than a discovery to repeat.
- **Every per-name `REVOKE ... FROM public` needs a matching `GRANT ... TO service_role` whenever
  the function is reached in the caller's role.** The revoke does not merely withhold — it removes
  the EXECUTE that `service_role` inherited through `PUBLIC`, and `service_role` is not a member of
  `authenticated`, so listing `anon, authenticated` beside `public` hides that. A CHECK constraint,
  a generated column and an RLS policy expression all evaluate in the **caller's** role, so a
  function used by one of them becomes unexecutable by the application and the table silently
  unwritable — the migration succeeds and the first `INSERT` fails `42501` naming the function, not
  the table. A `SECURITY DEFINER` trigger is the case that does not need the grant. Measured on run
  `b0952e`: this killed Mode-1 ingest completely and the whole suite stayed green.

## Provisioning is Erik's decision

No agent creates or selects a Supabase organization or a Vercel account. A prior run in this
practice provisioned into the wrong organization, found six other clients' databases alongside it,
and destroyed the project to recover. The target account is named in `prod.md` before dispatch and
is passed to specialists as a fixed value.

## Agent worktrees

Fleet specialists run in git worktrees under `.claude/worktrees/`. That path is gitignored and
must stay that way: a worktree whose specialist produced changes survives on disk, and an
un-ignored one turns up as `?? .claude/` in `git status` and can be swept into a commit by
`git add -A`.

## Lessons

Behavioral rules earned on this project. Append one line per lesson, in the moment.

- When a prompt arrives visibly truncated (it starts mid-word or mid-sentence), say so and ask for
  the full text before designing anything. The thesis sits in the opening paragraph; a design
  built on the surviving bullets misses it structurally and looks complete while doing so.
- Check what the autonomous fleet can actually build before choosing a stack for Erik's own
  tooling. Its specialists cover Next.js, Supabase and Vercel; a Python CLI is unbuildable by it
  no matter how well the choice is argued on other grounds.
- When a deliverable is superseded, write the replacement to a new path and leave the original
  file alone until Erik says otherwise. Overwriting a long document with a short pointer destroys
  work, and a clause at the end of a long message is not notice — ask first.
- When an API reports a resource missing, verify from a second independent vantage before reporting
  it absent, and run a negative control so you know the check can fail. `get_project` returning 404
  plus a `list_projects` that omitted it looked conclusive and was wrong: the Vercel project existed
  and was deployed, and the MCP connector simply could not see it. "The API cannot see it" and "it
  does not exist" are different claims.
- When dispatching a `researcher`, give it an explicit output path under `.fleet/research/<run-id>/`.
  Handed only a run id and a unit id, it writes its note to
  `.fleet/specialist-reports/<run-id>/<unit>.md` and silently occupies the report path the
  dispatching unit still has to write.
- After `apply_migration`, rename the local file to the version `list_migrations` reports rather
  than a timestamp you picked. Supabase assigns its own version, and a mismatch makes a later
  `supabase db push` read every applied file as pending and re-run it — which fails on
  `create type` and reads like a broken migration instead of a bookkeeping mismatch.
- When mutation-testing new code, snapshot each file's bytes in the harness and write them back;
  never revert with `git checkout --`. New files are untracked, `git checkout --` fails on them
  with `did not match any file(s) known to git`, and if the harness ignores that exit code every
  mutation stays applied and accumulates — so later mutations run against already-broken code and
  the per-mutation verdicts are unattributable. Have the harness restore in a `finally` and print
  the tree state at the end.
- Upsert conflict targets must be PLAIN unique indexes, never partial ones. PostgREST's
  `on_conflict` takes column names and cannot carry a `WHERE` predicate, so `supabase-js`
  `.upsert()` against a partial unique index fails `42P10 there is no unique or exclusion
  constraint matching the ON CONFLICT specification` — and it fails only on the *second* post,
  which is exactly the idempotency case nobody exercises before shipping.
- Read security headers off a protected Vercel preview with `vercel curl`, never a plain `curl`.
  Deployment protection answers first with its own `302` to `vercel.com/sso-api`, and that
  interstitial carries `strict-transport-security` and `x-frame-options` of its own — so a plain
  `curl` returns a header block that looks like the app's and came from the edge. The tell here is
  `preload`, which Vercel's HSTS has and `next.config.ts` deliberately omits; in general, verify a
  header against the value the repo actually sets rather than against its mere presence.
- When a scan for secret shapes returns zero on every pattern, assume it is blind until a pattern
  you know is present also comes back non-zero. A bundle scan pointed at the wrong chunks reported
  a clean result indistinguishable from a real one; adding a control term (`function`, in any React
  chunk) exposed it and moved the scan to the chunks the browser Supabase client actually lands in.
- Run `fleet-preflight.sh <repo_path>` with **one argument**, and never pass `$PWD` as a second.
  As of 2026-08-20 the script derives the session's launch cwd from `$CLAUDE_CODE_SESSION_ID`,
  which no `cd` can alter; argument 2 is a fallback only, and one that disagrees with the derived
  value earns a `WARN`. The rule this replaces existed because the harness resets the Bash cwd per
  call, so `cd <repo> && fleet-preflight.sh .` made the check pass against a repo the session was
  never launched from — the same false-green as a subagent editing its own gate. Read the verdict
  line rather than the exit code: `PREFLIGHT PASS (n WARN)` carrying `launch cwd NOT VERIFIED`
  means the derivation failed and that fallback is back in play.
- When sending a mid-flight `SendMessage` to a background agent, confirm the target `agentId` against
  that agent's own completion notification or its `description` before sending — dispatch order is not
  a reliable index into the ids, and a misdirected brief assigns the work to nobody while looking sent.
  `u2` caught one addressed to `u4` and reported it; nothing else would have.
- Test a React screen the way `next.config.ts` mounts it. `reactStrictMode: true` double-invokes
  effects, and a bare `render(<X />)` cannot reproduce that — an effect guarded by a `useRef` plus a
  cleanup-set cancel flag fires its request, discards the response and renders an empty frame, with
  the whole suite green. Mount under `<StrictMode>` for anything that fetches in an effect.
- Treat everything behind `aal2` as unexercised until a human has signed in. Agent verification
  reaches every surface a token reaches and stops where an authenticator app begins; on run `b0952e`
  the first twelve lines a person touched held two defects that 966 tests could not see.
- When a procedure has Erik copy a secret to the clipboard, every command he must paste has to be
  on screen **before** that copy step. A command block handed to him afterwards overwrites the
  clipboard, and the next paste puts the instruction text into the `read` prompt — which looks
  identical to a successful paste because `read -rs` echoes nothing. Order the steps so the secret
  is the last thing copied, or have him start the waiting `read` before he opens the browser.
- To establish that code *does* something, grep the code form and then confirm at the type or the
  return site — never a bare identifier. `grep -oE "defect\.[a-zA-Z]+"` matched `defect.description`
  inside a **comment** saying the field is deliberately never read, and that was reported as "Broken
  renders the decrypted description" twice, once inside a correction of the first claim, and it
  reached `prod.md` and an approved CR. Comments in this repo describe what the code does NOT do at
  least as often as what it does, so a match in prose is evidence of the opposite. Check the
  interface: `BrokenDefect` had no such field.
- Before hand-building an approved-spec milestone in this repo, offer the fleet first —
  `build-from-spec` / `project-lead` is the default executor for any Next.js/Supabase/Vercel
  milestone here, and hand-building one is a choice that needs Erik's say-so rather than the
  default. The cost is not just his prompting time: a hand-built milestone leaves no `.fleet/`
  manifest for Mode 1 to ingest, and while B4 keeps the session hook uninstalled it leaves no
  `work_session` row either, so the work is invisible to the product it is building.
- When every option produces the same work product, it is not a decision — pick the reversible
  default, state it in one line, and proceed. Reserve `AskUserQuestion` for what is genuinely
  irreversible or outward-facing (merging to `master`, deploying, deleting, anything that leaves the
  machine). The tell: if the branch name changes but the diff does not, do not ask. Dispatching M2.7
  was stopped for a four-option question in which three options built identical code onto different
  refs, which made Erik the bottleneck on a `git checkout -b`.
- Measure a test baseline in a throwaway `git worktree` at the ref, never with `git stash -u` in
  the shared checkout. Sessions run concurrently against this repo, and a stash sweeps another
  agent's uncommitted work out from under it mid-run; the pop restored it here, but nothing about
  the sequence guaranteed that.
- Before pruning a worktree, prove the work is safe with `git cherry` plus a file-set comparison
  (`comm` over `git ls-tree -r --name-only <branch>` against `HEAD`), never with a bare
  `git diff HEAD <branch>`. On a branch that is *behind* HEAD, that diff reports HEAD's newer content
  as the branch's "additions" and answers a question you did not ask. Then remove with
  `git worktree remove` and leave the branch in place — it frees the disk and clears the leak while
  keeping the per-unit history, which is the reversible half of the operation.
- Read and write source files under the agent's OWN worktree path, never the `repo_path` handed
  down as the shared-checkout value. The two can hold different content at the same relative path,
  and nothing about a successful `Read` signals which tree it came from — on run 29b583, `u4` read
  `app-shell.tsx` from the shared checkout and it already contained a finished `SignOutButton`
  wiring from a stale attempt, which would have been reported as pre-existing state instead of the
  worktree's actual pre-B40 file. Only the run-scoped `.fleet/` report path is exempt, and only
  because the brief spells out the worktree-relative form explicitly.
- When sweeping a UI for dialogs, match trigger elements by `[aria-haspopup]` / `[data-state]`
  rather than by button label, and hold an explicit deny-list of destructive labels (Archive,
  Delete, Revoke, Rotate, Resolve). On run `29b583` a label-matched click sweep **archived the
  live `delivery-ledger` engagement** while writing the user guide. It was caught in the same
  output, reversed with Restore, and confirmed against the database rather than the UI that had
  just been used — but the next one may hit a control with no Restore beside it.
- Mocking a component to `() => null` in one test file silences it everywhere that file looks, so
  **check the mocked component has a test of its own** before treating it as covered. `AppShell`'s
  test mocks `CommandPalette` to `() => null` — correct for that file, since the alternative drags
  router context into assertions about the shell — and that mock is exactly why **B46 reached
  production**: the palette threw on every route into it, no test ever mounted it, and 1545 tests
  stayed green. Same shape as B43. When you write such a mock, grep for a test of the real thing.
- `pnpm gate:m27:e2e` needs **both** `M27_BASE_URL` and `M27_STORAGE_STATE`; with the latter unset
  it produces **10 failed / 10, every one "rendered the operator gate (sign-in)"** — which is
  byte-for-byte the signature a revoked session produces. That signature therefore does **not**
  establish a dead credential, and on 2026-08-23 it was read as one. Run
  `M27_BASE_URL=http://localhost:3000 M27_STORAGE_STATE=.playwright-auth/operator.json pnpm
  gate:m27:e2e` and only then conclude anything about the session. Same failure shape as keying an
  auth check on `h1`: the observation was real and the inference from it was not.
- When a suspected defect is reproducible, reproduce it **before** escalating it — escalate the
  measurement, not the claim. The `defect.source_key` overwrite found on 2026-08-24 was handed to
  Erik as a structural argument ("verified in code and schema, not executed") bundled with three
  options to choose between, when one test — plan two runs' QA reports into one engagement and
  count the rows — settles whether it is real in twenty minutes. A menu of options is not a
  substitute for a red test, and asking Erik to adjudicate a claim you own the means to verify
  makes him the bottleneck this product exists to remove.
- Read `run-audit.sh`'s `ok` lines, not only its `FAIL` lines. On run `d4000f` the WRITEBACK-MISSING
  check printed `ok ... no spec/prod.md at <repo> (spec dir: `spec — writeback correctly skipped`
  while `spec/prod.md` existed at 259 KB and had just been written back in commit `6f91fa2`. The
  path lookup broke (note the unterminated backtick), and the check treats "no prod.md found" as
  "writeback correctly skipped" — so it emits `ok` whether the writeback happened or not, and is
  structurally incapable of catching the thing it is named for. Confirm a writeback with
  `git log -1 -- spec/prod.md` plus a `grep -c <run-id> spec/prod.md`, never with the audit's verdict.
- A mutation that survives may be surviving because the FIXTURE cannot tell the two branches
  apart, not because the test is missing — so when one survives, check whether the fixture
  satisfies both halves of the guard for the same reason before writing a new test. Mutating
  `if (task.status === "unparsed" || task.title === null)` down to the second clause alone survived
  on run d4000f, because the only unparsed fixture was a malformed heading whose title was *also*
  null. The discriminating case existed (i2 marks a task unparsed for a duplicate `**Plan-id:**`
  while its title parses fine) and nothing pointed at it but the survivor.
- Never let a persistence result type `extend` the mapping it was built from. `PlanIngestResult
  extends PlanDocumentMapping` silently carried `inputs`, and those hold the §7a `sensitive`
  plaintext `description` — the result object is exactly what ends up in a log line. Pick the
  count fields with `Omit<…, "inputs">` and destructure the prose out at the call site; u2 made
  the same call in leaving `description` off `PlannedWorkRecord`.
