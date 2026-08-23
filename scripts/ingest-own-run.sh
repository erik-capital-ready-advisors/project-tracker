#!/usr/bin/env bash
# Mode-1 ingest of this repo's own fleet run, through the real HTTP endpoint.
#
#   export DELIVERY_LEDGER_INGEST_TOKEN=...   # minted in the UI, shown once
#   bash ingest-own-run.sh <engagement-slug> [base-url]
#
# The token is read from the environment and passed to curl on STDIN, never as
# an argument - so it stays out of shell history, out of `ps`, and out of any
# transcript. That is the pattern docs/agent-tokens.md documents.
set -euo pipefail

SLUG="${1:?usage: ingest-own-run.sh <engagement-slug> [base-url]}"
BASE="${2:-http://localhost:3000}"
RUN=b0952e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DELIVERY_LEDGER_INGEST_TOKEN:?set DELIVERY_LEDGER_INGEST_TOKEN first (mint one in the UI)}"

# A paste that went wrong is otherwise indistinguishable from a good one until
# the endpoint answers 401 after a 500 KB upload - `read -rs` echoes nothing, so
# a clipboard holding the wrong thing looks exactly like success. Checked here,
# where it costs a regex. The report is shape only: no byte of the value is
# printed, on the same rule as `describeTokenForLog` - a truncated credential in
# a transcript is still a credential in a transcript.
if ! python3 - <<'PY'
import os, re, sys
raw = os.environ["DELIVERY_LEDGER_INGEST_TOKEN"].strip()
if re.fullmatch(r"dl_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{64}", raw):
    sys.exit(0)
print("DELIVERY_LEDGER_INGEST_TOKEN is not an agent token. Nothing was sent.", file=sys.stderr)
print("  length %d (want 104), %d segment(s) on '_' (want 3), dl_ prefix: %s"
      % (len(raw), len(raw.split("_")), raw.startswith("dl_")), file=sys.stderr)
if raw.split(" ")[0] in ("read", "export", "bash", "cd", "curl"):
    print("  It starts with a shell command, so the clipboard held an instruction", file=sys.stderr)
    print("  rather than the credential. Re-copy from the token panel.", file=sys.stderr)
sys.exit(1)
PY
then exit 1; fi

BODY="$(mktemp -t ledger-ingest)"
trap 'rm -f "$BODY"' EXIT

python3 - "$REPO" "$SLUG" "$RUN" "$BODY" <<'PY'
import glob, json, os, sys
repo, slug, run, out = sys.argv[1:5]

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def opt(p):
    p = os.path.join(repo, p)
    return read(p) if os.path.exists(p) else None

manifests = [{"name": os.path.basename(p), "text": read(p)}
             for p in sorted(glob.glob(os.path.join(repo, ".fleet", "manifest-*-%s.md" % run)))
             + sorted(glob.glob(os.path.join(repo, ".fleet", "manifest-%s.md" % run)))]

# Per-unit question files only. The concatenated `questions-<run>.jsonl` would
# derive a unit id from the run, which is not a unit.
questions = [{"name": os.path.basename(p), "text": read(p)}
             for p in sorted(glob.glob(os.path.join(repo, ".fleet", "questions-*-%s.jsonl" % run)))
             if os.path.basename(p) != "questions-%s.jsonl" % run]

tests = []
for pat in ("tests/**/*.ts", "tests/**/*.tsx", "e2e/**/*.ts"):
    for p in sorted(glob.glob(os.path.join(repo, pat), recursive=True)):
        tests.append({"path": os.path.relpath(p, repo), "source": read(p)})

payload = {
    "engagement": slug,
    "run": run,
    "manifests": manifests,
    "questionFiles": questions,
    "testFiles": tests,
    "specText": opt(".fleet/resolved-spec-%s.md" % run),
    "prodMd": opt("spec/prod.md"),
    "checkpoint": opt(".fleet/checkpoint-%s.md" % run),
    "qaReport": opt(".fleet/qa-report-%s.md" % run),
}

blob = json.dumps(payload)
size = len(blob.encode("utf-8"))
assert size < 8 * 1024 * 1024, "payload %d B exceeds the 8 MiB limit" % size
with open(out, "w", encoding="utf-8") as f:
    f.write(blob)
print("  payload: %d manifests, %d question files, %d test files, %.1f KB"
      % (len(manifests), len(questions), len(tests), size / 1024), file=sys.stderr)
PY

printf 'Authorization: Bearer %s\n' "$DELIVERY_LEDGER_INGEST_TOKEN" \
  | curl -sS -X POST "$BASE/api/ingest/run" \
      -H 'Content-Type: application/json' \
      --header @- \
      --data @"$BODY" \
      -w '\n  HTTP %{http_code}\n'
