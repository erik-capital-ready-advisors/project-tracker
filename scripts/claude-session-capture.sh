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
# INSTALL SCOPE — DECIDED 2026-08-20: GLOBAL, WITH AN ALLOWLIST (blocker B4)
# ---------------------------------------------------------------------------
#
# Erik settled spec Q4 / blocker B4: register this once, globally, in
# `~/.claude/settings.json`, and gate it on an allowlist of studio project
# roots. Global capture reaches the ad-hoc work that never becomes a
# repository — the hours FR-31 exists to measure, and the hours a per-project
# hook is structurally incapable of seeing.
#
# The allowlist is what keeps a personal project's session summary out of a
# database classified for client data, so it is enforced HERE rather than in
# the settings snippet. A wrapper script would have worked equally well; the
# reason it lives in this file is that the snippet is the thing people copy,
# and a snippet that silently captures everything is the recommendation's
# failure mode rather than the recommendation.
#
#     export DELIVERY_LEDGER_ALLOWLIST="$HOME/Projects:$HOME/Work/clients"
#
# Colon-separated absolute roots, like `PATH`. **It fails closed**: an unset or
# empty allowlist captures NOTHING. A denylist was rejected for the opposite
# reason — it fails open, so a directory nobody thought to exclude gets
# captured, which on this database is the expensive direction.
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

# --- B4's allowlist, enforced before anything is built or sent ---------------
#
# Compared on a path boundary, never as a bare prefix: a root of
# `$HOME/Projects/foo` must not swallow `$HOME/Projects/foobar`. Both sides get
# a trailing slash so the only match is "equal to the root" or "underneath it".
#
# The physical path is resolved first, because a session's `cwd` can arrive as
# a symlink into an allowlisted root — a Google Drive shared folder pointing at
# a repository is exactly the shape on this machine — and the allowlist is
# about where the work IS, not which name reached it. A directory that no
# longer exists cannot be resolved, so it keeps its literal path and is matched
# on that; it fails closed like anything else that misses.
: "${DELIVERY_LEDGER_ALLOWLIST:=}"

if [ -z "$DELIVERY_LEDGER_ALLOWLIST" ]; then
  exit 0
fi

RESOLVED="$(cd "$WORKING_DIRECTORY" 2>/dev/null && pwd -P)" || RESOLVED=""
[ -n "$RESOLVED" ] || RESOLVED="$WORKING_DIRECTORY"

allowed=0
MATCHED_ROOT=""
saved_ifs="$IFS"
IFS=":"
for root in $DELIVERY_LEDGER_ALLOWLIST; do
  [ -n "$root" ] || continue
  root_resolved="$(cd "$root" 2>/dev/null && pwd -P)" || root_resolved=""
  [ -n "$root_resolved" ] || root_resolved="$root"
  case "${RESOLVED%/}/" in
    "${root_resolved%/}/"*) allowed=1; MATCHED_ROOT="${root_resolved%/}"; break ;;
  esac
done
IFS="$saved_ifs"

# Not studio work. Say nothing, change nothing, exit clean — the same silence
# as an unconfigured machine, because a hook that reports on directories it was
# told to ignore is a hook that gets uninstalled.
if [ "$allowed" -eq 0 ]; then
  exit 0
fi

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

# ---------------------------------------------------------------------------
# B61 - per-project attribution, read from the repository being captured.
#
# The hook is installed GLOBALLY (B4), but which engagement and which stack a
# session belongs to are per-repository facts. A single global env var cannot be
# right for more than one repository, and `attributeSession()` can set only the
# engagement afterwards - so before this, `work_session.stack_id` was NULL on
# every row and FR-31's stack-hours rollup could never fill.
#
# ## This file is PARSED, never SOURCED, and that is not a style preference
#
# `.delivery-ledger` lives inside the repository being captured. That repository
# may be a client's or a clone of something nobody here controls, and this script
# runs with an `ingest:write` token in its environment. Sourcing it would be
# arbitrary code execution with a live credential in scope.
#
# It can also set exactly two keys. A file able to set `DELIVERY_LEDGER_URL`
# would redirect the token to a host of its choosing, which turns per-project
# convenience into credential exfiltration. `tests/session-hook-project-config.ts`
# pins both properties with a hostile fixture and a command-substitution fixture.
# ---------------------------------------------------------------------------

config_value() {
  # One key, from a bare `key=value` line. No expansion and no substitution: the
  # value is only ever carried as a string into `json_string` below.
  sed -n -e "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\(.*\)$/\1/p" "$2" |
    head -n 1 |
    sed -e 's/[[:space:]]*$//'
}

PROJECT_ENGAGEMENT=""
PROJECT_STACK=""
config_dir="$RESOLVED"
while [ -n "$config_dir" ]; do
  if [ -f "$config_dir/.delivery-ledger" ]; then
    PROJECT_ENGAGEMENT="$(config_value engagement "$config_dir/.delivery-ledger")"
    PROJECT_STACK="$(config_value stack "$config_dir/.delivery-ledger")"
    break
  fi
  # Never walk above the allowlisted root that admitted this session. A config
  # file outside studio scope has no business naming a client engagement.
  [ "$config_dir" = "$MATCHED_ROOT" ] && break
  config_parent="$(dirname "$config_dir")"
  [ "$config_parent" = "$config_dir" ] && break
  config_dir="$config_parent"
done

# The stack. NOT inferred from the file tree: a guess here becomes an hours
# figure attributed to the wrong stack, and FR-31 feeds those hours to the
# decision about which stack earns its own fleet agent. The repository's own
# statement wins over the global default, because it is the more specific fact.
STACK="${PROJECT_STACK:-${DELIVERY_LEDGER_STACK:-}}"
ENGAGEMENT="${PROJECT_ENGAGEMENT:-${DELIVERY_LEDGER_ENGAGEMENT:-}}"

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
[ -n "$ENGAGEMENT" ] &&
  BODY="$BODY,\"engagement\":\"$(json_string "$ENGAGEMENT")\""
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
