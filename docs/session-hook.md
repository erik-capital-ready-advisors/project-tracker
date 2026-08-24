# The session-capture hook (mode 2)

`scripts/claude-session-capture.sh` is a Claude Code `SessionEnd` hook. When a session ends it posts
one work-session record to the ledger and exits. Erik types nothing while a session is running, and
that is the whole point of mode 2: FR-25 requires the hook to need no action from him.

---

## Before you install it, read this

**The install scope is decided: global, with an allowlist** (spec Q4 / blocker B4, settled
2026-08-20). The allowlist is now enforced by the script rather than left to the person pasting the
snippet, and **it fails closed** — with `DELIVERY_LEDGER_ALLOWLIST` unset, the hook captures nothing.
See [The install-scope decision](#the-install-scope-decision-blocker-b4).

**It will not record anything yet, and that is not a misconfiguration.** The hook posts over
`--proto '=https'` and nothing is deployed, so `DELIVERY_LEDGER_URL` has nowhere valid to point.
Answering B4 was necessary to make the hook installable; a deployment is what makes it *record*.
Until both exist, `work_session` stays at 0 rows.

---

## What it captures

| Field | Where it comes from | If absent |
|---|---|---|
| `workingDirectory` | The `cwd` field of the JSON Claude Code passes on stdin, falling back to `$PWD` | Never absent |
| `startedAt` | `DELIVERY_LEDGER_SESSION_STARTED_AT`, exported by a `SessionStart` hook | Falls back to the end time, producing a zero-length window |
| `endedAt` | `date -u` at the moment the hook runs | Never absent |
| `filesChanged` | `git status --porcelain \| wc -l` in the working directory | `0` in a non-git directory |
| `commits` | `git log --oneline --since="$STARTED_AT" \| wc -l` | `0` in a non-git directory |
| `stack` | `DELIVERY_LEDGER_STACK` | Omitted. **Never inferred from the file tree.** |
| `summary` | `DELIVERY_LEDGER_SUMMARY` | Omitted. **Never invented.** |
| `engagement` | `DELIVERY_LEDGER_ENGAGEMENT` | Omitted, and the record files against `unassigned` |

Two of those "if absent" rows are deliberate refusals rather than gaps.

**The stack is never inferred.** A guess becomes hours attributed to the wrong stack, and FR-31 feeds
those hours to the decision about which stack earns its own fleet agent. A wrong input there produces
a wrong staffing decision months later.

**The summary is never invented.** An invented one would be prose this product then encrypts and
shows Erik as if a session had written it.

**No `SessionStart` hook ships in this repository.** So `DELIVERY_LEDGER_SESSION_STARTED_AT` is
unset unless you write one, and every captured session currently records a zero duration. That
variable is also absent from `.env.example`. If session duration matters to you, a `SessionStart`
hook exporting `DELIVERY_LEDGER_SESSION_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"` is the missing
half, and nobody has written it.

### Where a session lands

Without `DELIVERY_LEDGER_ENGAGEMENT`, the record files against the `unassigned` engagement and waits
in a one-click attribution queue at `/api/session/unassigned`. That is FR-26's own stated behaviour,
not a failure. Nothing is lost.

The reason it works that way sits in [env.md](env.md#session-hook-variables): resolving a working
directory to an engagement needs `engagement.repo_path`, and spec §7a grants agent tokens
`engagement` name and slug only. Unit i6 took the restrictive reading rather than widening a
security grant, and queued it.

---

## Setting it up

### 1. Get a token

You need an agent token carrying `ingest:write`. Read [agent-tokens.md](agent-tokens.md).

**This document used to say no token-issuing screen existed. That is no longer true** — `/settings/tokens`
ships, and an `ingest:write` token was minted there and used to post run `b0952e` over HTTP on
2026-08-20. The remaining obstacle is not the token; it is that nothing is deployed for the hook to
post *to*.

### 2. Set the environment variables

In the shell profile Claude Code inherits, which is `~/.zshrc` on Erik's machine:

```bash
export DELIVERY_LEDGER_URL="https://project-tracker-mu-livid.vercel.app"
export DELIVERY_LEDGER_INGEST_TOKEN="dl_..."   # issued once, shown once
export DELIVERY_LEDGER_ALLOWLIST="$HOME/Projects:$HOME/Work/clients"
```

All three are **required**. `DELIVERY_LEDGER_ALLOWLIST` is colon-separated absolute roots, like
`PATH`, and it fails closed: unset or empty captures nothing at all. See
[The install-scope decision](#the-install-scope-decision-blocker-b4).

Optional, and each one improves the record without being required:

```bash
export DELIVERY_LEDGER_ENGAGEMENT="delivery-ledger"
export DELIVERY_LEDGER_STACK="nextjs-supabase"
export DELIVERY_LEDGER_SUMMARY="what this session did"
```

`DELIVERY_LEDGER_URL` **must** be `https://`. The hook passes `--proto '=https'` to curl, so the
token cannot cross a plaintext connection even if the URL is wrong.

Verified on 2026-08-19 against a local server, with a placeholder token:

```
$ curl --proto '=https' ... http://127.0.0.1:3178/api/ingest/session
curl: (1) Protocol "http" disabled

$ curl ... http://127.0.0.1:3178/api/ingest/session      # positive control, no --proto
http_code=500
```

The different outcomes prove the `--proto` guard did the refusing, not the network.

### 3. Register the hook

Once, globally, in `~/.claude/settings.json` — the scope is decided. The snippet is in
[The install-scope decision](#the-install-scope-decision-blocker-b4), along with what the allowlist
does and does not protect you from.

### 4. Check it works

Run the hook by hand with a fabricated stdin payload. It posts one record.

```bash
printf '{"session_id":"probe","cwd":"%s"}' "$PWD" | bash scripts/claude-session-capture.sh
echo "exit=$?"
```

Expect `exit=0`. A `0` proves nothing on its own: the hook exits `0` on every path by design. To
confirm the record landed, look for it in the unassigned queue or in `/work-items`.

**Do not run the hook under `bash -x` while a real token is in the environment.** The trace prints
the `printf` line that carries the `Authorization` header, so the token lands in your terminal
scrollback. Verified on 2026-08-19: the `-x` trace showed
`printf 'Authorization: Bearer %s\n' <the token value>`. Under normal execution the token never
appears in `ps`, because `printf` is a shell builtin and the header reaches curl on stdin.

### Verified behaviours

Both observed on 2026-08-19 against commit `3b2c81d`, with the literal string
`placeholder-not-a-real-token` standing in for a credential:

| Condition | Observed |
|---|---|
| Neither `DELIVERY_LEDGER_URL` nor `DELIVERY_LEDGER_INGEST_TOKEN` set | exit `0`, no output, no request |
| `DELIVERY_LEDGER_URL` is `http://` | exit `0`, curl refuses with `Protocol "http" disabled`, nothing sent |

Added 2026-08-20, observed by `tests/session-hook-allowlist.test.ts` rather than by hand:

| Condition | Observed |
|---|---|
| `DELIVERY_LEDGER_ALLOWLIST` unset or empty | exit `0`, no request — fail-closed |
| `cwd` outside every allowlisted root | exit `0`, no request |
| `cwd` is `~/Projects-personal`, root is `~/Projects` | exit `0`, no request — boundary match, not prefix |
| `cwd` inside an allowlisted root | request attempted |
| `cwd` is a symlink into an allowlisted root | request attempted |

**UNVERIFIED:** a successful post against a live deployment. A token now exists, but no deployment
carries the schema. Settled by deploying, setting the three variables, ending a session, and finding
the row.

---

## The install-scope decision (blocker B4)

**Decided 2026-08-20: global, with an allowlist of studio project roots.** Spec question Q4 asked it;
Erik answered it; `spec/prod.md` carries it in the Decisions log. This section used to describe two
options and now describes one.

### Why global

A per-project hook captures only registered engagements. That sounds tighter, and it fails **silently
in the expensive direction**: it misses exactly the ad-hoc work the fleet-coverage register exists to
measure — the hour spent on a stack nobody has an agent for, in a directory that never became a
project. Those are the hours FR-31 needs, and you would never notice they were missing, because
nothing reports a session that was never captured.

### Why an allowlist, and why it is in the script

Global capture sees personal and non-client sessions too, and every one of them would post a summary
of what you were doing into a database classified for client data. The allowlist is what stops that.

A denylist was rejected. It fails **open**: a directory nobody thought to exclude gets captured, and
on this database that is the direction that costs something.

The allowlist is enforced inside `claude-session-capture.sh`, not in the settings snippet, for one
reason: **the snippet is the thing people copy.** An earlier draft of this document shipped a global
registration with the allowlist described in prose beneath it, and noted that pasting it as-is gave
you global capture with no allowlist — the recommendation's failure mode wearing the
recommendation's name. Moving the check into the script makes the safe thing the default thing.

### Install

Set the two required variables and the allowlist in the shell profile Claude Code inherits:

```bash
export DELIVERY_LEDGER_URL="https://<the deployment>"
export DELIVERY_LEDGER_INGEST_TOKEN="dl_..."        # issued once, shown once
export DELIVERY_LEDGER_ALLOWLIST="$HOME/Projects:$HOME/Work/clients"
```

`DELIVERY_LEDGER_ALLOWLIST` is colon-separated absolute roots, like `PATH`. Then register the hook
once in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/erikmeltzer/Projects/project-tracker/scripts/claude-session-capture.sh"
          }
        ]
      }
    ]
  }
}
```

### What the allowlist does and does not do

- **Unset or empty captures nothing.** Fail-closed, on purpose. If you register the hook and set no
  allowlist, you get silence rather than global capture.
- **Matching is on a path boundary**, so a root of `~/Projects` does not swallow `~/Projects-personal`.
- **A root matches itself**, not only directories beneath it.
- **Symlinks are resolved** before matching, because a session's `cwd` can arrive as a symlink into an
  allowlisted root — a Google Drive shared folder pointing at a repository is exactly that shape on
  this machine — and the allowlist is about where the work *is*, not which name reached it.
- **A refusal is silent and exits 0**, indistinguishable from an unconfigured machine. A hook that
  reports on directories it was told to ignore is a hook that gets uninstalled.

`tests/session-hook-allowlist.test.ts` pins all five, with a fake `curl` on `PATH` as the observation
(the script always exits 0, so the exit code cannot be the assertion) and a positive-control case so
a broken fake cannot make the refusals pass for the wrong reason. Three mutations were applied to the
script and each went red: neutering the fail-closed guard, replacing boundary matching with a bare
prefix, and dropping symlink resolution.

### Verified end to end, 2026-08-24

**This section used to say no post had ever succeeded against a live deployment. That is no longer
true.** The round trip was closed on 2026-08-24, once M2.9 shipped and there was something to post
to.

Observed, in this order:

- **Positive:** the hook fired from an allowlisted directory and **one `work_session` row landed** -
  the first ever - carrying `source: session-hook` and the real working directory. Read back off
  `/work-items/unassigned` under a live `aal2` session, not just out of the database.
- **Negative control:** fired from `/tmp`, **no row**. Total 1, from `/tmp` 0.
- **Both invocations exited `0`**, which is why the row count is the evidence and the exit code
  cannot be. The script exits `0` on every path by design.

The first row also exposed **B61**: it landed under `unassigned` with a **NULL stack**, and there was
no way to set a stack after the fact. That is what `.delivery-ledger` below fixes.

## Per-project attribution: `.delivery-ledger`

The hook is installed **globally**, but which engagement and which stack a session belongs to are
**per-repository** facts. A single global `DELIVERY_LEDGER_STACK` cannot be right for more than one
repository, and `attributeSession()` sets only the engagement - so before this, every row had
`stack_id` NULL and FR-31's stack-hours rollup could never fill.

Put a `.delivery-ledger` file at the root of a repository whose sessions you want attributed:

```
# Only these two keys are read.
engagement=delivery-ledger
stack=nextjs-supabase
```

- **It is found by walking up** from the session's `cwd`, so it works from any subdirectory.
- **The walk stops at the allowlisted root.** A config file outside studio scope has no business
  naming a client engagement.
- **The repository's statement wins** over the global env var, which stays a fallback default.
- **A repository with no such file behaves exactly as before** - unassigned, no stack. That is not a
  degradation to fix silently; it is the honest state, and the unassigned queue exists for it.
- **`stack` rows are created on demand** by `upsertStack`. There is nothing to seed.

### Why it is parsed and never sourced

`.delivery-ledger` lives inside the repository being captured. That repository may be a client's, or
a clone of something you do not control, and this hook runs with an `ingest:write` token in its
environment.

- **Sourcing it would be arbitrary code execution with a live credential in scope.** It is parsed
  with `sed`, one key at a time, and the value is only ever carried as a string.
- **It can set exactly two keys.** A file able to set `DELIVERY_LEDGER_URL` would redirect your token
  to a host of its choosing.

`tests/session-hook-project-config.test.ts` pins both with a hostile fixture that tries to set the
URL and the token, and a fixture whose values are `$(touch ...)` command substitutions. **Both
properties were mutation-tested**: making the script `source` the file turns exactly those two tests
red and nothing else.

---

## Why the hook always exits 0

Every failure path exits `0`: an unset variable, a refused protocol, a network timeout, a `500` from
the server.

A capture failure loses one record, which is bad. A hook that returns non-zero at the end of a
session is a hook Erik removes, which loses every future record. The script says so in its own
comments.

The cost is that **the hook is silent when it breaks**, and the most likely way it breaks is an
expired token. Nothing in this build watches for that. See
[agent-tokens.md](agent-tokens.md#expiry-and-the-outage-it-schedules).

## What the hook never does

- It never writes the token to a file.
- It never echoes the token.
- It never puts the token on a command line, where `ps` would show it to every process on the
  machine. It reaches curl through `--header @-` on stdin for that reason.
- It never sends over plaintext HTTP.
- It never invents a stack or a summary.
- It never reports a session as `done`. A session that says nothing about status gets `unparsed`,
  because a hook firing on a session that changed nothing is exactly the payload that would otherwise
  produce a wrong `done`.
