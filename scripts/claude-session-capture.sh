#!/usr/bin/env bash
#
# Delivery Ledger — mode-2 session capture (FR-24, FR-25, FR-27).
#
# A Claude Code `SessionEnd` hook. It posts one work-session record to the
# Delivery Ledger and exits. Erik types nothing during a session; that is the
# whole point of mode 2, and FR-25 requires the hook to need no action from him
# while one is running.
#
# ---------------------------------------------------------------------------
# THE TOKEN
# ---------------------------------------------------------------------------
#
# `DELIVERY_LEDGER_INGEST_TOKEN` is read from the environment and from nowhere
# else. This script never writes it to a file, never echoes it, and never puts
# it on a command line where `ps` would show it — it goes to `curl` through
# `--header @-` on stdin for exactly that reason.
#
# Set it in the shell profile that Claude Code inherits:
#
#     export DELIVERY_LEDGER_URL="https://<the deployment>"
#     export DELIVERY_LEDGER_INGEST_TOKEN="dl_..."   # issued once, shown once
#
# There is no fallback and no default. If the variable is absent the hook exits
# quietly with 0: a missing token must never fail Erik's session, and a hook
# that blocks the end of a session is a hook that gets uninstalled.
#
# ---------------------------------------------------------------------------
# INSTALL SCOPE IS AN OPEN DECISION (blocker B4)
# ---------------------------------------------------------------------------
#
# Whether this is registered globally in `~/.claude/settings.json` with an
# allowlist of studio project roots, or per project in each repository's
# `.claude/settings.json`, is **not decided**. Erik's recommendation is global
# with an allowlist; he has not settled it. The documentation unit writes the
# install instructions once he does — this script works under either, because
# it reads the working directory at run time and lets the server resolve the
# engagement (FR-26).
#
# ---------------------------------------------------------------------------
# INPUT
# ---------------------------------------------------------------------------
#
# Claude Code passes the hook a JSON object on stdin. This script reads
# `session_id`, `cwd` and `transcript_path` from it when they are present and
# falls back to the environment and `pwd` when they are not, so it does not
# break if the hook payload's shape changes — it degrades to a less detailed
# record rather than to no record.

set -uo pipefail

: "${DELIVERY_LEDGER_URL:=}"
: "${DELIVERY_LEDGER_INGEST_TOKEN:=}"

# Not configured on this machine. Say nothing, change nothing, exit clean.
if [ -z "$DELIVERY_LEDGER_URL" ] || [ -z "$DELIVERY_LEDGER_INGEST_TOKEN" ]; then
  exit 0
fi

HOOK_INPUT="$(cat 2>/dev/null || true)"

json_field() {
  # Read one top-level string field without requiring `jq`. Deliberately
  # conservative: if it cannot find the field it returns empty and the caller
  # falls back, rather than guessing.
  printf '%s' "$HOOK_INPUT" |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1
}

WORKING_DIRECTORY="$(json_field cwd)"
[ -n "$WORKING_DIRECTORY" ] || WORKING_DIRECTORY="$PWD"

# Whole-session window. `SESSION_STARTED_AT` is exported by the SessionStart
# hook if one is installed; without it the record still carries an end time and
# a zero-length window, which reads as "a session happened here" rather than as
# a duration nobody measured.
ENDED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_AT="${DELIVERY_LEDGER_SESSION_STARTED_AT:-$ENDED_AT}"

# Repository facts, best effort. A non-git directory yields nulls, not errors.
FILES_CHANGED=0
COMMITS=0
if git -C "$WORKING_DIRECTORY" rev-parse --git-dir >/dev/null 2>&1; then
  FILES_CHANGED="$(git -C "$WORKING_DIRECTORY" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  COMMITS="$(git -C "$WORKING_DIRECTORY" log --oneline --since="$STARTED_AT" 2>/dev/null | wc -l | tr -d ' ')"
fi

# The stack, if the session declared one. NOT inferred from the file tree: a
# guess here becomes an hours figure attributed to the wrong stack, and FR-31
# feeds those hours to the decision about which stack earns its own fleet agent.
STACK="${DELIVERY_LEDGER_STACK:-}"

# The one-line summary the session writes (FR-24). Absent unless the session
# set it, and absent is honest — an invented summary would be prose this
# product then encrypts and shows Erik as if a session had written it.
SUMMARY="${DELIVERY_LEDGER_SUMMARY:-}"

json_string() {
  # Escape a value for embedding in JSON. Backslash first, then quote, then the
  # control characters that would otherwise produce an invalid document.
  printf '%s' "$1" |
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' |
    awk 'BEGIN { ORS="" } { if (NR > 1) printf "\\n"; print }'
}

BODY="{"
BODY="$BODY\"workingDirectory\":\"$(json_string "$WORKING_DIRECTORY")\""
BODY="$BODY,\"startedAt\":\"$(json_string "$STARTED_AT")\""
BODY="$BODY,\"endedAt\":\"$(json_string "$ENDED_AT")\""
BODY="$BODY,\"filesChanged\":$FILES_CHANGED"
BODY="$BODY,\"commits\":$COMMITS"
BODY="$BODY,\"source\":\"session-hook\""
[ -n "$STACK" ] && BODY="$BODY,\"stack\":\"$(json_string "$STACK")\""
[ -n "$SUMMARY" ] && BODY="$BODY,\"summary\":\"$(json_string "$SUMMARY")\""
[ -n "${DELIVERY_LEDGER_ENGAGEMENT:-}" ] &&
  BODY="$BODY,\"engagement\":\"$(json_string "$DELIVERY_LEDGER_ENGAGEMENT")\""
BODY="$BODY}"

# The token goes in on stdin, never as an argument: an argument is visible in
# `ps` to every process on the machine for the life of the call.
printf 'Authorization: Bearer %s\n' "$DELIVERY_LEDGER_INGEST_TOKEN" |
  curl --silent --show-error --fail-with-body \
    --max-time 10 \
    --proto '=https' \
    --header @- \
    --header 'Content-Type: application/json' \
    --data-binary "$BODY" \
    "$DELIVERY_LEDGER_URL/api/ingest/session" \
    >/dev/null 2>&1

# Always succeed. A capture failure is a lost record, which is bad; a hook that
# returns non-zero at the end of a session is a hook Erik removes, which is
# every future record. `--proto '=https'` above is what refuses to send the
# token over plaintext rather than trusting the URL to be right.
exit 0
