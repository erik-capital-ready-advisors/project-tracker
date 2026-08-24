# r1 research note - Mode-1 parser/corpus measurement for M2.6 Writeback

**Run:** 9d4658

## Step zero

`git status --porcelain` and `git log --oneline agent-build/2026-08-24-9d4658..HEAD` were both
empty before reset. `git reset --hard agent-build/2026-08-24-9d4658` moved HEAD from `11c3924` to
`0881cf4`.

## 0. The set of Mode-1 fleet-artifact TEXT parsers, confirmed rather than assumed

`src/lib/ingest/` holds 22 non-test source files. Not all of them parse artifact TEXT — several
(`coverage.ts`, `committed.ts`, `regressions.ts`, `billing.ts`, `waits.ts`) are pure computation
over already-parsed records (join/derive logic), not artifact parsers. `releases.ts` has one text
function (`parseReleaseRequirements`, `src/lib/ingest/releases.ts:9-14`) that reuses
`requirementRefs` but reads release/CR prose, not a fleet-run artifact.

The actual TEXT-in/records-out artifact parsers, confirmed by tracing `POST /api/ingest/run`
(`src/app/api/ingest/run/route.ts`) → `planRun` (`src/lib/server/ingest/plan.ts`) →
`ingestRun` (`src/lib/ingest/ingestRun.ts`), are:

| Parser | File | Artifact shape consumed |
|---|---|---|
| `parseWorkUnits` | `workUnits.ts` | manifest `## Work-units` table |
| `parseBlocked` | `blocked.ts` | manifest `## Blocked` table |
| `classifyStatus` | `status.ts` | a manifest Status cell (used by both above) |
| `normalizeQuestions` | `questions.ts` | `questions-*.jsonl` (JSON Lines) |
| `parseRequirements` | `requirements.ts` | spec text, scanned for `FR-nn` |
| `parseTestTags` | `testTags.ts` | test source files, scanned for `it("FR-nn ...")` |
| `parseProdMd` | `prodMd.ts` | `spec/prod.md` `## Milestone tracker` + `## Active blockers` tables |
| `parseCheckpoint` | `runReport.ts` | checkpoint's `key: value` front block |
| `parseQaGates` | `runReport.ts` | QA report `**Status:**` line, severity line, `## Verification performed` bullets |
| `parseQaFindings` | `defects.ts` | QA report `## Issues` section |
| `parsePlanDocument` | `planDocument.ts` | a `writing-plans`-shaped doc: `### Task N:` + `- [ ]` steps |

`markdown.ts` (`tableRows`) and `refs.ts` (`requirementRefs`) are shared helpers, not artifact
parsers on their own.

A **manifest** is read by two parsers (`workUnits`, `blocked`) plus `classifyStatus`. A
**checkpoint** and a **QA report** are both read by `runReport.ts`'s two functions, and the QA
report is additionally read by `defects.ts` for its findings. A **questions file** is read whole by
`questions.ts`. `prod.md` is a fifth artifact type, read only by `prodMd.ts`, and a **plan
document** is a sixth, read only by `planDocument.ts` via a separate endpoint
(`POST /api/ingest/plan`).

## 1. What each parser accepts, extracts, and does on an unrecognised shape

### `parseWorkUnits` (`workUnits.ts:38-83`)
Input: rows of the manifest's `## Work-units` table via `tableRows`, expected 7 columns (`ID | Type
| Phase | Description | Dispatched-to | Depends-on | Status`, `workUnits.ts:6`). Extracts unit id,
work type, phase, description, executor, `dependsOn` (split on `,`, `workUnits.ts:14-21`),
`implements` (FR-refs pulled out of the description via `requirementRefs`), and the full
`classifyStatus` result on the Status cell.
**On a row with != 7 cells** (`workUnits.ts:55-66`): still emits a `WorkItem`, with `status:
"unparsed"`, `rawStatus` set to the joined cells, everything else nulled. This IS counted —
`unparsed` is a real record here.

### `classifyStatus` (`status.ts:38-71`)
Input: one Status cell string. Recognises (case-insensitive, leading `**`/`*` stripped): `done`,
`pending`, `not dispatched`, `blocked`, `superseded`, each as a `^` prefix match
(`status.ts:54-58`). Anything else stays the struct default `status: "unparsed"` (`status.ts:41`).
Also extracts a `NOT VERIFIED` count via `/(\d+)\s+NOT VERIFIED/g` or a bare occurrence
(`status.ts:47-52`), and — only for `blocked`/`superseded`/`not_dispatched` — an
`unautomatedReason` from a small phrase list (`credential-absent`, `budget`, `out-of-scope`) and a
`disposition` (`closed` if the cell contains one of four closed-marker phrases, else `carried`,
conservatively — `status.ts:60-69`).
**Measured against the real manifest-d4000f.md Status cells**: every cell begins with `**done**` or
similar and classifies. The cells are NOT short state words — they run to several hundred words of
specialist-report prose (see `manifest-d4000f.md`'s `i3`/`u4` rows) — but `classifyStatus` only
reads the first token, so the prose after it is inert to this parser and flows through untouched
into `rawStatus`/`description` elsewhere.

### `parseBlocked` (`blocked.ts:40-96`)
Input: manifest `## Blocked` table, expected 5 columns (`ID | Type | Milestone | Blocker | Status`,
`blocked.ts:6`). Extracts a `Bn` blocker id out of the Blocker cell via `/\bB(\d+)\b/`
(`blocked.ts:7,52`); a cell naming no `Bn` gets `blockerId: null` rather than an invented id. Owner
is **never read from prose** — it is hardcoded `DEFAULT_BLOCKER_OWNER = "erik"`
(`blocked.ts:34,68`), because the manifest's Blocked table carries no Owner column at all.
**On a row with != 5 cells** (`blocked.ts:49`): `continue` — **the row is silently dropped**, no
`WorkItem` emitted, no counter incremented. This is a real gap against `workUnits.ts`'s behaviour on
the same failure mode one function above it: one artifact table degrades to `unparsed`, the other
degrades to nothing.

### `normalizeQuestions` (`questions.ts:16-49`)
Input: one or more `.jsonl` files. Each non-blank line is `JSON.parse`d — **a malformed line throws
and is not caught here**; `planRun` catches it one layer up and turns it into a 400
(`src/app/api/ingest/run/route.ts:47-55`). There is **no `unparsed` status for a question at all**:
every record becomes a `Question`, and `status` is computed only as `open`/`answered` from whether
`answer` is present (`questions.ts:44`). Fields read, each independently optional via `asString`:
`run_id` (falls back to the run parsed from the filename, `questions.ts:23,34`), `unit`, `section`,
`question`, `best_guess` OR `assumption_made` (`questions.ts:38` — two field names accepted for one
concept), `confidence` (raw string, mapped to an enum later in `plan.ts`'s `toConfidence`, unmapped
values land in `plan.summary.unmappable`), `blocking` (boolean), `answer`, `answered_by`,
`answered_on`. A field absent or of the wrong JS type is silently `null` — there is no signal that a
key was misspelled or missing versus deliberately empty.

### `parseRequirements` (`requirements.ts:7-26`)
Input: spec text (or a resolved-spec text). Scans every line for `FR-nn`; first mention per number
wins, its line (truncated to 300 chars) becomes the requirement's `text`. No `unparsed` concept —
a line with no `FR-nn` simply contributes nothing.

### `parseTestTags` (`testTags.ts:17-40`)
Input: test source files. Regex-matches `it(...)`/`test(...)` call titles
(`testTags.ts:3`), tags each with any `FR-nn` found inside the title string
(`testTags.ts:4,33`). No `unparsed` concept: a test with no `FR-nn` in its title is still recorded,
just with `covers: []`; there is no signal distinguishing "this test covers nothing" from "this
test's coverage claim could not be read."

### `parseProdMd` (`prodMd.ts:102-147`)
Input: `spec/prod.md`'s `## Milestone tracker` table (3 columns: Milestone | Status | Notes,
spanning multiple `### Phase n` sub-tables, deliberately read as one list — `prodMd.ts:87-100`) and
its `## Active blockers` table (5 columns). Status vocabulary is a fixed 5-word map
(`done`/`complete`→`complete`, `in progress`, `blocked`, `deferred`, `not started`) plus `unparsed`
default (`prodMd.ts:33-40`), documented as read off two different writers of the live `prod.md`
rather than invented (`prodMd.ts:9-20`).
**On a milestone row with != 3 cells** (`prodMd.ts:106`): `continue` — silently dropped, same gap
as `blocked.ts`. **On an Active-blockers row with != 5 cells, or one whose ID cell names no `Bn`**
(`prodMd.ts:121,127`): also silently dropped. `parseProdMd` returns its own `unparsed` count
(`prodMd.ts:145`), but it counts only milestone rows whose *status word* failed to classify — rows
that never made it into the `milestones` array at all (wrong column count, blank name) are absent
from both the array and the count.

### `parseCheckpoint` (`runReport.ts:90-110`)
Input: the checkpoint's leading `key: value` block, everything before the first `## ` heading
(`runReport.ts:93-96`). Every recognised `key:` becomes a `fields[key]`; unrecognised keys are kept
in `fields` too (it is a generic bag) but not surfaced through the named accessors (`branch`,
`mode`, `startedAt`←`fields.started`, `endedAt`←`fields.phase1_completed`,
`buildGate`←`fields.build_after_phase1`). **There is no `unparsed` concept for the checkpoint as a
whole** — a checkpoint with none of the recognised keys returns an object of all-`null` fields, not
a flagged/counted failure.

### `parseQaGates` (`runReport.ts:161-227`)
Input: the QA report's `**Status:**` line (`STATUS_LINE`, `runReport.ts:127`), a Critical/Important/
Minor severity line (`SEVERITY_LINE`, `runReport.ts:128-129`), and lines under
`## Verification performed` (`verificationLines`, `runReport.ts:138-146`) matched against
`GATE_LINE = /^-\s+([A-Za-z][A-Za-z -]*?)(?:\s*\([^)]*\))?:\s*(.+?)\s*$/` (`runReport.ts:130`).
Verdict words are a fixed 4-word list (`PASS`/`ISSUES`/`FAIL`/`BLOCKED`); anything else →
`unparsed` (`runReport.ts:162-167`). Gate labels are a 6-entry map (`build`, `type-check`/
`typecheck`, `lint`, `playwright`, `accessibility` — `runReport.ts:42-49`); a bullet under the
heading whose label isn't in that map increments `unparsed` (`runReport.ts:183-187`); a bullet
whose label IS in the map but whose value word isn't `PASS`/`FAIL`/`NOT RUN` also increments
`unparsed` (`runReport.ts:206-208`).
**A line that does not match `GATE_LINE` at all is silently skipped** (`runReport.ts:177`, `if
(!match) continue;`) — **not counted as unparsed**, because it never becomes a candidate gate.

**Measured against all four real QA reports in this repo's tracked `.fleet/` (`b0952e`, `eb2490`,
`29b583`, `d4000f`), `GATE_LINE` matches ZERO lines in every one of them.** Every real report bolds
its gate label (`- **Build** (pnpm): **PASS**` in `d4000f`, `- **Build (pnpm):** PASS` in `eb2490`
and `29b583`), and `GATE_LINE` requires the label to start immediately with a bare letter — a
leading `*` (bold) or backtick never matches. `b0952e`'s equivalent section is a markdown table, not
bullets, which `GATE_LINE` (anchored on lines starting `- `) cannot match at all either. I verified
this directly by extracting the real bullet lines from `.fleet/qa-report-d4000f.md:238-246`,
`.fleet/qa-report-eb2490.md:203-207` and `.fleet/qa-report-29b583.md:147-153` and running
`GATE_LINE.exec()` against them in Node — every line returns `null`. `runReport.test.ts:91` is the
only fixture I found that exercises `GATE_LINE` with a real match, and its line
(`"- Build (pnpm): NOT RUN no lockfile\n"`) is **unbolded**, unlike every real artifact in this
corpus. Consequence: for every run in this repo's corpus, `fleetRun.gates` in the persisted plan
holds only `build_after_phase1` (from the checkpoint's `key: value` block, a different code path)
— the QA report's own build/typecheck/lint/playwright/accessibility gate outcomes are not being
extracted at all, and neither `qa.unparsed` nor any other counter reflects that, because a
non-matching line is dropped before the unparsed-counting branch is reached.

### `parseQaFindings` (`defects.ts:224-312`)
Input: the QA report's `## Issues` section, split into `### <Severity>` sub-sections
(`findings()`, `defects.ts:141-181`), each containing numbered findings (`^\s*\d+\.\s+`,
`defects.ts:19`). Severity comes from the sub-heading via a 4-word map (`critical`, `important`→
`major`, `major`, `minor` — `defects.ts:36-41`); a finding under no heading, or one whose heading
isn't in the map, gets `severity: "unparsed"` (`defects.ts:281-284`). A per-finding status marker
(`**[CLOSED …]**`, `**[NEW …]**`, `**[WITHDRAWN …]**` etc., both a leading-bold and an
inline-in-title spelling — `defects.ts:64-71,117-133`) is read for fixed/open/retracted state; an
unrecognised marker word → `status: "unparsed"` (`defects.ts:129`). A `WITHDRAWN`/`RETRACTED`
finding, and a struck-through entry successfully paired with a fuller one below it sharing the same
heading and a title-prefix match, are dropped from `defects` entirely and counted separately as
`retracted` (`defects.ts:272-276`), not as `unparsed`.
**Measured against `.fleet/qa-report-d4000f.md:92-108`**: the real `### Critical` / `### Important`
sub-headings and `1. **Title** — path:line` numbered-finding shape match this parser cleanly, unlike
`GATE_LINE` above — this parser's assumptions hold against the live corpus where the gate parser's
do not.

### `parsePlanDocument` (`planDocument.ts`)
Input: a document expected to carry `### Task N: <title>` headings with `- [ ] Step` /
`- [x] Step` lines beneath. **Whole-document rejection, not row-level `unparsed`**
(`planDocument.ts:13-16,140-141,328,333`): a document with no such heading at all, or headings that
carry no checkbox steps, is refused outright as `{ kind: "not-a-plan" }` before any row is written —
enforced at the route (`src/app/api/ingest/plan/route.ts:67-79`, "Q12"). Within an accepted
document, an individual malformed heading or malformed step line becomes `status: "unparsed"`
(`planDocument.ts:194,197,204,238,256,261`) rather than being dropped, and both `unparsedTasks` and
`unparsedSteps` are reported (`planDocument.ts:128,130,344-345`).

## 2. The `unparsed` surface

There is no single global `unparsed` count in this codebase — it is per-artifact-type and the
counters do **not** all mean the same thing:

- `RunResult.unparsed` (`ingestRun.ts:51`) counts only `WorkItem`s with `status === "unparsed"` —
  i.e. only `parseWorkUnits`'s own default. `parseBlocked`'s dropped rows are invisible to it.
- `plan.summary.unparsedDefects` = `findings?.unparsed ?? 0` — QA findings graded `unparsed`
  severity only; `retracted` findings are a separate, non-overlapping count.
- `plan.summary.unparsedTrackerMilestones` = `prod?.unparsed ?? 0` — milestone rows whose status
  *word* failed; rows dropped for wrong column count are excluded from both the numerator and
  denominator.
- `plan.summary.unparsedGates` = `qa?.unparsed ?? 0` — as measured above, this is **structurally
  near-zero on this corpus regardless of how clean the gates actually are**, because a
  non-matching bullet line never reaches the unparsed-incrementing branch.
- Questions, requirements, test tags and checkpoint fields have **no `unparsed` concept at all** —
  a value that fails to parse there is either silently `null` or (for questions) causes the whole
  ingest to 400.

**Numeric size of the class, on this repo's own corpus:** the FR-14/FR-15 corpus test asserts `31`
work items across the two runs it covers and `expect(result().unparsed).toBe(0)`
(`ingestRun.corpus.test.ts:27-31`) — i.e. the *known-good* corpus is asserted to classify
completely on the one counter that exists. That assertion is against `fixtures-local/`, which does
not exist in this worktree (see §4) — I could not re-run it. What I *could* measure directly against
the tracked `.fleet/` artifacts is the gate-line gap above: 0 of the real ~30+ `## Verification
performed` bullets across 3 reports match `GATE_LINE`, and that gap is invisible to
`plan.summary.unparsedGates` by construction. The honest size of "what M2.6 would validate" is
therefore larger than any of the existing counters report, because at least one whole sub-parser
(`parseQaGates`'s bullet reader) is currently failing silently rather than loudly on every real
artifact in the corpus.

## 3. The real corpus, what it carries, and where two artifacts disagree

`.fleet/` in this worktree holds tracked (not gitignored — see §4) artifacts for 5 runs: `b0952e`,
`eb2490`, `29b583`, `9a320b`, `d4000f`. Per-run: 1 `manifest-<run>.md`, 1 `checkpoint-<run>.md` (4 of
5 runs; `9a320b` has none I found), 1 `qa-report-<run>.md` (4 of 5), and multiple
`questions-<unit>-<run>.jsonl` files (one per unit that raised questions, e.g.
`questions-i3-b0952e.jsonl`, plus a bare `questions-<run>.jsonl` in most runs).

- **Manifest** (`manifest-d4000f.md`): a front block of `key: value`-ish prose lines (not the strict
  `KEY_VALUE` shape `runReport.ts` uses for checkpoints — these are free sentences like "Spec basis:
  ..."), a `## Phase 0 measurements` table, then `## Work-units` (7-column table exactly matching
  `WORK_UNIT_COLUMNS`) and (in other runs) `## Blocked`. Status cells are **not short state words**
  — they are paragraph-length specialist summaries beginning with a bolded status token
  (`**done**`, `**NOT DISPATCHED**`) that `classifyStatus` reads only the prefix of.
- **Checkpoint** (`checkpoint-d4000f.md`): matches `parseCheckpoint`'s expectations exactly —
  `key: value` lines (`phase_complete`, `branch`, `mode`, `started`, `phase1_completed`,
  `build_after_phase1`, etc.) before the first `## ` heading, then a "Measured on the merged tree"
  table.
- **QA report** (`qa-report-d4000f.md`): `**Status:** ISSUES`, a `**Critical:** N · **Important:**
  N · **Minor:** N` line (matches `SEVERITY_LINE`), `## Spec coverage` table, `## Issues` with
  `### Critical`/`### Important`/`### Minor` sub-headings and numbered findings (matches
  `parseQaFindings`'s expectations), and `## Verification performed` as bulleted lines that **do
  not match `GATE_LINE`** (§1 above) — this is the sharpest artifact/parser gap I found.
- **Questions**: sampled several `.jsonl` files across runs. Field names are consistent with what
  `questions.ts` reads (`run`/`unit`/`section`/`question`/`best_guess`/`confidence`), but I found
  **zero questions in the entire tracked corpus carrying a non-empty `answer` field** — every
  question in `.fleet/` here is unanswered (`status: "open"` under the parser's rule). The
  `six different record shapes across six files` claim in `questions.ts:13-14`'s own comment is
  plausible from the field-name looseness (`best_guess` vs `assumption_made`, `run` vs `run_id`
  observed directly) but I did not enumerate all six myself — see §6.

**Where two artifacts disagree**: I did not find, in this worktree's corpus, the specific
`manifest`-vs-`checkpoint` `pending`/`merged` disagreement CLAUDE.md cites for run `cd414c` — that
run is not present in this repo's `.fleet/` (it appears to be from a different reference corpus, per
CLAUDE.md's own wording "In the reference corpus"). I did not go looking for other disagreements
beyond the gate-parsing gap above, which is a parser-vs-artifact gap rather than an
artifact-vs-artifact one — flagging the distinction: §12/M2.6 is about the latter kind of drift
being turned into a hard error, and my clearest finding is of the *former* kind (a parser that
already silently fails against every real instance of one artifact section).

## 4. The fixture constraint — and a correction to CLAUDE.md's stated location

CLAUDE.md's Build-session-protocol section states: *"Fixtures under `tests/fixtures/` are byte
copies of real fleet artifacts."* **Measured: this path does not exist in this worktree.**
`find tests/fixtures` returns nothing; `tests/` holds Vitest/Playwright spec files, not fixture
data.

What actually exists, per `.gitignore:22-27` and the `__fixtures__` directories under `src/lib/`:

- **Tier 1** — `src/lib/ingest/__fixtures__/*.ts` (and sibling `__fixtures__` dirs elsewhere): git-
  tracked, **hand-authored strings reproducing artifact shape**, explicitly documented as such
  (`src/lib/ingest/__fixtures__/qaReport.ts:1-5`: *"Tier 1 fixtures: hand-authored strings
  reproducing the shape of the fleet's QA report... Real reports live in the gitignored .fleet
  directory"*). These are what the parser unit tests (`*.test.ts`) run against.
- **Tier 2** — `fixtures-local/`, listed in `.gitignore:27` as real fleet artifacts Erik copies in
  locally, explicitly gitignored because §7a classifies work-item/blocker/question prose
  `sensitive` and spec Q2 (client-data-location restriction) is open. **This directory does not
  exist in this worktree** (`ls fixtures-local` → absent). The corpus tests that exercise parsers
  against it (`ingestRun.corpus.test.ts`, `planDocument.corpus.test.ts`) are wrapped in
  `describe.skipIf(!present)` (`ingestRun.corpus.test.ts:7,17`) and **are silently skipped here** —
  I confirmed `existsSync(join(process.cwd(), "fixtures-local"))` is false in this checkout.

One correction worth flagging plainly, per this run's brief: the `qaReport.ts` fixture comment
calls `.fleet/` "the gitignored .fleet directory," but `.gitignore` does **not** ignore `.fleet/`
(only `.fleet/manual-traces/*.png`) and `git ls-files .fleet` shows the artifacts I read above ARE
tracked. That comment is stale or was written against an earlier state; the artifacts I measured
against in §1–§3 came from this tracked `.fleet/`, not from a gitignored copy, and no test in this
repo currently exercises the parsers against them (`grep` found exactly one test referencing a
`.fleet/` path, and that reference is a synthetic filename string, not a file read —
`src/lib/server/ingest/payload.test.ts:45`).

**What this implies for a validator built for M2.6's writeback block**: the "fix the parser, never
the fixture" rule (CLAUDE.md) presumes the parser is tested against a byte-identical real artifact.
Today that only happens for the row-shaped parsers when `fixtures-local/` is present — which it is
not, here — and never happens automatically for a NEW shape (a writeback block) until Erik supplies
a real one into `fixtures-local/`. Tier-1 hand-authored fixtures can encode whatever shape someone
believes writeback will carry, but (as the `GATE_LINE` finding shows) a hand-authored fixture can
pass while the parser silently fails against every real artifact, because the fixture author and
the parser author share the same — possibly wrong — assumption about the shape. A validator's
fixtures would carry that same risk unless anchored to something `project-lead` actually emits.

## 5. The reflexive constraint

The emitter of any writeback block would be `~/.claude/agents/project-lead.md`. I did not read that
path — per this run's brief it is out-of-tree and not to be edited, and I have no reason to believe
it is read-denied the way `.env.local` is (that denial is repo-scoped, per `CLAUDE.md`'s Credentials
section), but I did not attempt the read since the brief only asks me to record that the emitter is
out-of-tree, not to inspect it.

What I can confirm from this repo's own history: CLAUDE.md's Lessons record that **M2.9's scope was
cut** because "plan and manifest templates live in `~/.claude/agents/templates`, unreachable from a
worktree" — the same class of boundary. A writeback block's *shape* is determined by whatever
`project-lead.md` (and its templates) emit, and neither is visible to, or editable by, a build unit
running in a repo worktree. Any change to what `project-lead` emits is therefore a change Erik (or
someone with access to `~/.claude/agents/`) makes outside this repo, and this repo's parsers can
only ever be *written* in anticipation of a shape — never verified against the emitter's actual
current template — until a real artifact carrying that shape lands in `fixtures-local/` or in a
future run's tracked `.fleet/`.

## OPEN DECISION FOR ERIK

None of the above is a recommendation. Two questions fell out of the measurement that are Erik's
to answer, not mine to answer for him:

1. **Row-level `unparsed` vs whole-document rejection.** This repo's two existing ingest paths use
   two different failure philosophies for a document of the wrong shape: `parseWorkUnits` and
   `planDocument`'s row-level handling emit `unparsed` per malformed row and keep the rest; `Q12`
   at `POST /api/ingest/plan` rejects a whole document that isn't shaped like a plan at all, before
   any row is written. A writeback block is a new document type. Should validating it follow the
   manifest's row-level model (each writeback field either matches what the manifest already says,
   or is flagged) or the plan document's whole-block model (a writeback block that doesn't parse at
   all is refused, nothing written)? I observed both models in this codebase; I did not see
   anything that decides which one a THIRD document type should use.
2. **Whether the `GATE_LINE` gap (§1) belongs to this milestone at all.** It is a bug in the
   *existing* `parseQaGates`, unrelated to writeback — I flag it because it directly measures how
   silent a "validator" built on today's assumptions could be. Whether to fix it now, fix it as
   part of M2.6, or track it separately is Erik's call; I did not touch it.

No entries were queued to `.fleet/questions-r1-9d4658.jsonl` — I judged both of the above to belong
in this note as "options observed" rather than as blocking questions, since neither stops the
measurement task itself. Erik may want the first one moved into that file when the CR is drafted; I
did not do that unilaterally.

## What I could not establish

- **Whether `fixtures-local/`'s corpus (when present) still classifies with `unparsed: 0`, as the
  corpus test asserts.** The directory is absent in this worktree, so `ingestRun.corpus.test.ts`
  and `planDocument.corpus.test.ts` are skipped here (checked: `describe.skipIf(!present)`,
  `existsSync` false). I substituted a direct measurement against the tracked `.fleet/` artifacts
  instead, which is why §1's `GATE_LINE` finding is my own manual regex test in Node against real
  file content, not a test-suite result — I could not run the suite's own corpus assertions to
  cross-check it, and it is possible `fixtures-local/`'s copies are cleaner (differently-bolded)
  QA reports that WOULD match `GATE_LINE`; I have no way to check that without the directory.
- **All six question-file shapes `questions.ts:13-14` claims.** I sampled three files directly and
  found the `best_guess`/`assumption_made` and `run`/`run_id` variance the code anticipates, but did
  not enumerate every file in the corpus (49 `questions-*.jsonl` files exist) to confirm all six
  are actually present versus the comment being aspirational.
- **An artifact-vs-artifact disagreement in this repo's own `.fleet/` matching the `cd414c`
  manifest/checkpoint example CLAUDE.md cites.** I read the manifest and checkpoint for `d4000f`,
  `eb2490`, `b0952e`, `29b583` at their headline fields (status, branch, dates) and did not
  cross-diff every work-unit's status against every downstream artifact's claim about it, which is
  the kind of check that would be needed to find a `cd414c`-shaped disagreement if one exists here.
- **Whether `~/.claude/agents/project-lead.md` or its templates are read-denied from this worktree.**
  I did not attempt the read (see §5), so I cannot report whether the attempt would have succeeded,
  been refused by settings, or simply returned "file not found" because the path is genuinely
  outside anything this session can see.
