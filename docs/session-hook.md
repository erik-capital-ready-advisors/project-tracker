# The session-capture hook (mode 2)

`scripts/claude-session-capture.sh` is a Claude Code `SessionEnd` hook. When a session ends it posts
one work-session record to the ledger and exits. Erik types nothing while a session is running, and
that is the whole point of mode 2: FR-25 requires the hook to need no action from him.

---

## Before you install it, read this

**The install scope is an open decision and it is yours to make.** Global with an allowlist, or per
project. The two options fail in opposite directions, Erik has a recommendation, and he has not
chosen. Skip to [The install-scope decision](#the-install-scope-decision-blocker-b4) before you paste
anything into a settings file.

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

You need an agent token carrying `ingest:write`. Read [agent-tokens.md](agent-tokens.md), including
the part where **no token-issuing screen exists at commit `3b2c81d`**, so there is currently no
supported way to mint one. That is the real blocker on installing this hook today.

### 2. Set the environment variables

In the shell profile Claude Code inherits, which is `~/.zshrc` on Erik's machine:

```bash
export DELIVERY_LEDGER_URL="https://project-tracker-mu-livid.vercel.app"
export DELIVERY_LEDGER_INGEST_TOKEN="dl_..."   # issued once, shown once
```

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

**This is the step the open decision governs.** Read the next section first.

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

**UNVERIFIED:** a successful post against a live deployment. No `ingest:write` token exists yet and
no deployment carries the schema. Settled by issuing a token, setting the two variables, ending a
session, and finding the row.

---

## The install-scope decision (blocker B4)

**Erik owns this and has not decided it.** Spec question Q4 asks it and `spec/prod.md` lists it as an
active blocker. It blocks these install instructions, not the hook's code: the script works under
either scope, because it reads the working directory at run time and lets the server resolve the
engagement.

Whoever installs this hook is making an unresolved choice. Here is what each one costs.

### Option A: global, with an allowlist of studio project roots

Register it once in `~/.claude/settings.json` and gate it on the working directory.

**Captures:** every Claude Code session under an allowlisted root, including the ad-hoc work that
never gets a repository of its own.

**Fails toward:** capturing too much. A global hook sees personal and non-client sessions, and every
one of them posts a summary of what you were doing into a database classified for client data. The
allowlist is what stops that, and the allowlist is a file you maintain by hand. Forget to narrow it
and a personal project's session summary lands in a table holding every client's contract data.

### Option B: per project

Register it in each repository's `.claude/settings.json`, committed or local.

**Captures:** only registered engagements, and nothing else.

**Fails toward:** capturing too little, and **silently**. A per-project hook misses exactly the ad-hoc
work the fleet-coverage register exists to measure: the hour spent on a stack nobody has an agent
for, in a directory that never became a project. Those are the hours FR-31 needs, and a per-project
hook is structurally incapable of seeing them. You will not notice, because nothing reports a
session that was never captured.

### Erik's recommendation

**Global with an allowlist of the studio's project roots.** It captures the ad-hoc work while keeping
personal sessions out of a database classified for client data.

Spec Q4 also lists a third option, global with a denylist. A denylist fails open: a directory nobody
thought to exclude gets captured. Given the classification of this database, the allowlist is the
fail-closed form of the same idea.

### If you choose A (global with an allowlist)

Add to `~/.claude/settings.json`. **This snippet is UNVERIFIED**: no hook was registered by this
unit, so nothing here was observed running as a real `SessionEnd` hook.

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

That registers it everywhere. **The allowlist is not in the snippet, because the hook does not
implement one.** Under Option A you need one of:

- a wrapper script that checks `$PWD` against a list of roots and calls the capture script only on a
  match, or
- an allowlist check added to `claude-session-capture.sh` itself, which is a code change and belongs
  to a build unit rather than to this document.

Neither exists at commit `3b2c81d`. **Installing the snippet above as-is gives you global capture
with no allowlist**, which is not the recommendation. It is the recommendation's failure mode.

### If you choose B (per project)

Add the same `hooks` block to `<repo>/.claude/settings.json` in each engagement's repository, with
the command path pointing at wherever the script lives on your machine. No allowlist is needed,
because the registration itself is the allowlist.

`.claude/settings.json` in this repository is committed and currently carries no `hooks` key.

### What settles it

Erik answering Q4. The answer belongs in `spec/prod.md`'s Decisions log, and this section gets
rewritten to describe one option rather than two.

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
