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
