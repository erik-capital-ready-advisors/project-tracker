# docs-writer report — doc1

**Status:** DONE
**Run:** d4000f
**Mode:** manual

## Summary

Brought `docs/user-guide.md` up to date with M2.9 — a `/work-items/new` section, an engagement-filter
section, and a planned-work/STALE section — and emitted `.fleet/manual-evidence-d4000f.json` with 31
route rows, every one re-observed on this branch. `manual-gate.sh` now PASSES where it was failing
FORWARD on `/work-items/new`. Two claims the existing guide made were falsified by this milestone and
have been rewritten rather than left standing.

## Starting point

- `git rev-parse --short HEAD` → **`df34f44`** on `agent-build/2026-08-24-d4000f`, as briefed.
- Worked directly in the shared checkout, no worktree. `CLAUDE.md`, `docs/Delivery-Ledger-User-Guide.docx`
  and `new-desktop.png` were left untouched; `.fleet/audit-d4000f.md` and `.fleet/report-d4000f.md`
  (other units' untracked files) were left unstaged. No `git add -A`, no `reset --hard`, no `stash`,
  no `checkout --`.

## Technical level

Not applicable in `mode: manual` — the reader is the operator using the product, not the person
deploying it. Pitched as the existing guide is: plain English, second person, no command, no file
path, no environment variable, no repo reference in any section I wrote.

## Files created / modified

- `docs/user-guide.md` (modified) — three new `##` sections, two falsified claims rewritten, five
  smaller corrections. 6354 → 8268 words.
- `.fleet/manual-evidence-d4000f.json` (created) — 31 route rows, 5 `non_screen_sections`, 5 amendments.
- `.fleet/questions-doc1-d4000f.jsonl` (created) — 4 questions.
- `.fleet/specialist-reports/d4000f/doc1.md` (created) — this report.
- `.fleet/manual-traces/d4000f_*.png` (created, **gitignored** by `.gitignore` line 36) — 42 screenshots.

Not modified: any product code, `manual-evidence-29b583.json`, `.gitignore`.

## Every route, and what I saw

All 31 served routes were opened on this branch. Full observations are in the evidence file; this
table is the summary.

| Route | Guide section | Observed |
|---|---|---|
| `/` | The home screen | `d4000f_root.png` — **13** answer cards, not 12 |
| `/blocked` | Blocked | `d4000f_blocked.png` — 5 blocked, 1 wait, 2 owners; picker now present |
| `/next` | Next | `d4000f_next.png` + `d4000f_filter_next_unknown.png` — FR-96c state read verbatim |
| `/committed` | Committed | `d4000f_committed.png` — one milestone, all totals $0.00; picker present |
| `/untested` | Untested | `d4000f_untested.png` — 79 / 324 / 0 mapped / 79 uncovered; picker present |
| `/bottleneck` | Bottleneck | `d4000f_bottleneck.png` — empty state; picker present |
| `/broken` | Broken | `d4000f_broken.png` + `d4000f_filter_broken.png` — 13 open, 1 critical |
| `/work-items` | Work items | `d4000f_work-items.png` + 2 filter states — 20 rows, new third tab |
| `/work-items/[id]` | Opening one work item | `d4000f_work-item-detail.png` + `_filter_detail_nopicker.png` |
| `/work-items/unassigned` | Unassigned sessions | `d4000f_work-items_unassigned.png` — empty, no picker |
| **`/work-items/new`** | **Planning work by hand** | **`d4000f_work-items_new.png` — the new 31st route** |
| `/waits` | Waits | `d4000f_waits.png` — 1 open, 0 overdue; picker present |
| `/waits/[id]` | Opening one wait | `d4000f_wait-detail.png` — Resolve NOT pressed |
| `/registry` | The registry | `d4000f_registry.png` — 2 engagements; picker present |
| `/registry/[slug]` | One engagement | `d4000f_registry_slug.png` — no dialog opened, nothing clicked |
| `/registry/new` | Registering an engagement | `d4000f_registry_new.png` — not submitted |
| `/registry/[slug]/edit` | Editing an engagement | `d4000f_registry_edit.png` — not saved |
| `/milestones/[id]` | One contract milestone | `d4000f_milestone.png` — still `not recorded` vs `unreadable` |
| `/requirements/[id]` | One requirement | `d4000f_requirement.png` — FR-14, five blocks |
| `/defects/[id]` | One defect | `d4000f_defect.png` — D-2, critical |
| `/blockers/[id]` | One blocker | `d4000f_blocker.png` — B14, reached by id |
| `/releases/[id]` | Releases | **UNVERIFIED** — no release exists; re-confirmed HTTP 404 |
| `/questions` | Questions | `d4000f_questions.png` + `_filter_questions_preserve.png` — 96 open |
| `/questions/[id]` | Opening one question | `d4000f_question-detail.png` |
| `/settings/tokens` | Agent tokens | `d4000f_settings_tokens.png` — 4 tokens, no value shown or recorded |
| `/settings/export` | Getting your data out | `d4000f_settings_export.png` — **1138** rows, was 1125 |
| `/sign-in` | Signing in | `d4000f_anon_sign-in.png` — clean context, no storage state |
| `/sign-in/verify` | Signing in | **UNVERIFIED** — renders only mid-sign-in; both ends re-measured |
| `/sign-in/enroll` | Signing in | **UNVERIFIED** — needs an operator with no second factor |
| `/runs` | Fleet runs | `d4000f_runs.png` + `d4000f_filter_runs.png` — **picker now present** |
| `/runs/[run-id]` | Opening one fleet run | `d4000f_run-detail.png` — b0952e, six blocks |

## Manual gate

`manual-gate.sh /Users/erikmeltzer/Projects/project-tracker spec/spec-approved.md` — **PASS**,
verdict block verbatim:

```
ok    docs/user-guide.md present (8268 words)
ok    evidence file manual-evidence-d4000f.json carries 31 route row(s)
ok    branch serves 31 route(s)
ok    31 of 31 served route(s) covered, all observed

MANUAL GATE PASS - /Users/erikmeltzer/Projects/project-tracker
```

At dispatch it read `FAIL  FORWARD: the branch serves /work-items/new and the guide's evidence never
mentions it`. That is the line this unit closed.

## State I reached

Signed in as the operator at `aal2` using `.playwright-auth/operator.json` against `pnpm dev` on
`http://localhost:3000`. The session was alive: every screen rendered records, `sign-out` was present
on all of them, and no operator gate panel appeared on any signed-in route. The ledger was populated —
20 work items, 96 questions, 13 open defects, 79 requirements, 2 engagements, 1 fleet run, 1 open wait.

**An empty screen would have hidden**: the third work-items tab, every engagement-picker state, the
`(whole ledger)` relabelling, and the FR-96c notice, all of which need at least one engagement and one
row to render at all.

**Port 3000**: confirmed free before starting (`lsof -ti:3000` → nothing), and confirmed **DEAD** after
finishing. Reported again in the closing checks below.

## The 30 carried-forward rows — all 30 checked, 15 changed

I re-opened all 30 rather than copying them, and rewrote each `observed` string as my own observation
on this branch. Where run 29b583 recorded an *interaction* I did not repeat (submitting the registry
form, pressing Download export, opening dialogs), the evidence attributes it to that run instead of
restating it as mine.

**Fifteen changed:**

1. `/runs` — the important one. Its 29b583 row read *"No engagement filter is present, which matches
   FR-96 being unapproved."* FR-96 was approved by CR-005 and built this milestone; the picker renders
   there now. Carried forward unchanged, that row would have asserted the opposite of the branch.
2. `/` — twelve destinations → **thirteen** (counted as 13 `answer-card` elements, not from prose).
3. `/settings/export` — 1125 rows → **1138**.
4. `/work-items` — gained the shell picker and the `Plan work item` tab.
5. `/work-items/[id]` — added the confirmation that the picker is **absent** under `?engagement=`.
6–15. `/blocked`, `/next`, `/committed`, `/untested`, `/bottleneck`, `/broken`, `/waits`,
   `/questions`, `/registry` each gained the shell picker; `/next`, `/broken`, `/questions` and
   `/work-items` also carry newly observed filter states.

The remaining 15 were re-observed and stand.

## Spec vs branch — what the guide said that the branch contradicts

Two claims in the shipped guide were falsified by M2.9. Both are rewritten:

- **"There is no engagement filter, and that is deliberate rather than missing."** (Fleet runs
  section.) False as of this branch. Replaced with a statement that the screen is cross-engagement by
  default and now takes the filter, naming the earlier text as having been true when written.
- **"Next and Bottleneck are empty, and you cannot fill them from inside the product."** Half false.
  `/work-items/new` creates a `pending` row, and `pending` is in `READY_STATUSES`
  (`src/lib/server/answers/next.ts:52`, checked at the return site line 168, not by a bare grep), so a
  planned item is a Next candidate on creation. Rewritten to say Next changed and Bottleneck did not.

Also corrected: the sidebar's Records list was missing **Fleet runs**, left over from run 9a320b's
hand amendment.

## Known limitations carried into the guide as UNVERIFIED

- **FR-91's markers were never on screen.** The ledger holds no planned row: all 20 rows on
  `/work-items` report `data-verify-planned="false"`, and `?status=pending` returns none while the
  unfiltered page returns 20 — a control confirming the query is not blind. Creating one means writing
  a real row into a real ledger, which the brief forbids. Marked UNVERIFIED in the STALE section and
  again under "what this does not do yet".
- **FR-96's roster-unavailable notice was never on screen.** Rendering it needs the engagement lookup
  to fail. Marked UNVERIFIED where it is described.
- **Submitting the hand-entry form was not done.** Screen opened, every field read, nothing filed.
  The two refusal sentences are quoted from `planned-work-form.tsx`; marked UNVERIFIED in the body.
- **`/sign-in/verify` and `/sign-in/enroll`** remain unreachable, for the reason the vault note below
  names.
- **`/releases/[id]`** — no release exists to open.

## Broken things found while verifying

- **`.fleet/manual-traces/*.txt` transcripts are committed and carry §7a `sensitive` data.** Only
  `*.png` is gitignored (line 36). The 34 tracked transcripts contain full rendered page text from a
  populated instance — decrypted work-item descriptions, defect prose, client names. I did not extend
  this: my transcripts went to the scratchpad and my evidence cites only the gitignored PNGs. Queued
  as a question; purging history is Erik's call.
- No other defect. `typecheck`, `lint`, `test`, `gate:m27` and `build` all match baseline exactly.

## Verification

| Command | Result | Baseline | Match |
|---|---|---|---|
| `pnpm typecheck` | exit 0, no output | 0 | yes |
| `pnpm lint` | exit 0, no output | 0 | yes |
| `pnpm test` | 1814 passed / 6 skipped, 120 files passed / 1 skipped | 1814 / 6 | yes |
| `pnpm gate:m27` | 5 passed / 5 | 5/5 | yes |
| `pnpm build` | exit 0, 31 page routes served | exit 0, 31 | yes |
| `manual-gate.sh` | **PASS** | was FAIL | fixed, as dispatched |
| `pnpm gate:m27:e2e` | **NOT VERIFIED** — orchestrator-run, per brief | — | — |

Nothing moved. This unit changed documentation only.

## Safety checks

- **Nothing on the deny-list was clicked.** Archive, Delete, Revoke, Rotate and Resolve were never
  pressed. No dialog was opened. No form was submitted, valid or invalid. The sweep navigated by URL
  and read the DOM; it contained no `click()` call at all, which is stronger than a label deny-list
  and was chosen because of the 29b583 incident that archived the live engagement.
- **Port 3000**: free at start, `DEAD` at finish, both by `lsof -ti:3000`.
- **No secret anywhere.** `.env.local` was never read or printed. No agent token value was displayed,
  captured or recorded — `/settings/tokens` shows labels and capabilities only.
- **No real client identifier in my output.** The evidence file names no engagement slug (grep count
  0); my guide additions use the synthetic `acme` (3 occurrences), with a control confirming the grep
  is live (81 hits on "engagement" in the same file). Three pre-existing `delivery-ledger` mentions
  written by run 29b583 were left alone and queued as a question.
- **Scratch files removed**: `doc1-sweep.mjs`, `doc1-links.mjs`, `doc1-anon.mjs` all deleted from the
  repo root.

## Prior fleet learnings used

- `Knowledge/Gates fail by passing in exactly the case they exist to catch - read the failure, not the
  verdict.md` — **CONFIRMED, and extended.** `manual-gate.sh` checks that every served route has a row
  carrying an observation. It cannot tell a fresh observation from a stale one. It would have returned
  PASS with all 30 rows copied verbatim, including `/runs` asserting that no engagement filter exists
  on a branch that ships one. The gate is structurally open to exactly the false green this note
  describes, and re-opening all 30 routes is what caught it, not the verdict. Queued as a question with
  a proposed fix (a per-row `observed_at_commit`).
- `Knowledge/Agent verification stops at a human authentication factor - treat MFA paths as
  unexercised.md` — **CONFIRMED.** `/sign-in/verify` and `/sign-in/enroll` are unobserved for precisely
  this reason and stay UNVERIFIED in the guide, third run running.
- `Knowledge/An agent instruction file is authoritative about why, never about what the code does
  now.md` — **CONFIRMED.** Every string quoted in the new sections was read off the running screen or
  the component that emits it, and the two guide claims M2.9 falsified are the same failure in the
  documentation layer.
- CLAUDE.md lesson on bare greps — **applied.** `READY_STATUSES` including `pending` was confirmed at
  the definition and at the return site, not from a comment.
- CLAUDE.md lesson on blind scans — **applied.** Every zero result in this report carries a control
  that came back non-zero.

## Best-guess decisions

1. **Transcripts to the scratchpad, screenshots to `manual-traces/`.** Run 29b583 committed `.txt`
   page dumps; those carry §7a sensitive prose and I judged extending that worse than diverging from
   the convention. The evidence cites gitignored `.png` paths, which is what the existing rows already
   do. **Confidence: high.**
2. **"Filtering by engagement" and "Planned work, and when it goes stale" declared as
   `non_screen_sections`.** Neither walks a screen: the picker is chrome on eleven paths and staleness
   is a rule. Declared, not inferred, per the gate's own posture. **Confidence: high.**
3. **Carried-forward observations attributed to run 29b583 where I did not repeat the interaction**
   rather than dropped or restated as mine. Dropping them would lose real evidence; restating them
   would be claiming an action I did not take. **Confidence: high.**
4. **Left the three pre-existing `delivery-ledger` mentions in the guide alone.** Editing another
   run's prose on a §7a judgment call is Erik's, not mine. Queued. **Confidence: med.**
5. **Placed "Planning work by hand" after "Unassigned sessions"**, matching the on-screen tab order
   and letting the section that forbids unassigned planned work sit next to the queue it is most
   likely to be confused with. **Confidence: med.**

## Questions queued

Four, in `.fleet/questions-doc1-d4000f.jsonl`: the committed transcripts (§7a), the `delivery-ledger`
slug in the guide (§7a), whether a seeded instance should exist so FR-91 and FR-88 can be verified,
and the `manual-gate.sh` stale-row hole.
