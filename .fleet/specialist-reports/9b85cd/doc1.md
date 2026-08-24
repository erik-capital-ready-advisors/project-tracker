# docs-writer report — doc1

**Status:** DONE
**Run:** 9b85cd
**Mode:** manual
**Branch:** agent-build/2026-08-24-9b85cd

## Summary

Re-opened all 32 served routes against the live instance, wrote the `## Stacks` section for M2.2,
and corrected twelve guide claims the screens no longer supported — two of which were false rather
than stale. `manual-gate.sh` is green on my own run.

## Technical level

`technical` — supplied by §7b. One reader, Erik, the sole operator, who has a terminal and installs
the session hook himself. The guide stays a user guide: no commands, paths or environment variables
in the body, and the session-hook and agent-token operating material it already carried is intact.

## Files created / modified

- `docs/user-guide.md` (modified) — new `## Stacks` section (916 words); 12 sections corrected;
  8,379 → 10,352 words, 901 → 1,073 lines
- `.fleet/manual-evidence-d4000f.json` (modified in place) — 31 → 32 route rows, every row
  rewritten from this run's observation, 4 amendment entries added, `amended_by` added
- `.fleet/questions-doc1-9b85cd.jsonl` (created) — 6 questions, each carrying its best guess
- `.fleet/manual-traces/9b85cd_*.png` (created, 40 files) — gitignored by `.gitignore` line 36

## Every route, and what I saw

32 of 32 covered. 29 observed, 3 carry `unobserved_reason` and are marked `UNVERIFIED` in the guide
body. `CHANGED` means the row's previous claim no longer matched the screen.

| Route | Guide section | Observed |
|---|---|---|
| `/stacks` | Stacks | **NEW** — `register-state=observed`, 1 of 2 sessions name no stack (50%), 1 row `nextjs-supabase` `undetermined`, clause 2 `data-verify-evaluated="false"` |
| `/` | The home screen | **CHANGED** — 13 → 14 destinations; badge 0 → `2 unparsed` |
| `/blocked` | Blocked | **CHANGED** — wait 3 → 4 days; badge 2; filtered view relabels `2 unparsed (whole ledger)` |
| `/next` | Next | **CHANGED** — no longer empty: 1 planned row `b53-seed`; accounting line 3 counts → 4 (`20 not in a startable status`, `2 could not be classified`) |
| `/committed` | Committed | **CHANGED** — amount column prints a dash for the milestone the engagement calls `unreadable`; totals still $0.00 |
| `/untested` | Untested | unchanged — 79 / 324 / 0 mapped / 79 uncovered |
| `/bottleneck` | Bottleneck | **CHANGED** — unclassified count 0 → 2 |
| `/broken` | Broken | **CHANGED** — screen reads `13 open`, `critical 1 open`; guide had said 10 open and nothing critical open |
| `/work-items` | Work items | **CHANGED** — rows 20 → 23, unparsed 0 → 2, third figure `0 only Erik can do`; `?status=blocked` → 5, `?status=unparsed` → exactly the 2 hand rows |
| `/work-items/[id]` | Opening one work item | **CHANGED** — three opened: `man1`, the planned `b53-seed` (`planned` + `0d` marker), a `hand` row carrying stack `nextjs-supabase` |
| `/work-items/unassigned` | Unassigned sessions | unchanged — empty, tab count 0 |
| `/work-items/new` | Planning work by hand | **CHANGED** — form unchanged, but the guide's `UNVERIFIED: submitting the form` was false; not submitted this run |
| `/waits` | Waits | **CHANGED** — 3 → 4 days, method `manual` |
| `/waits/[id]` | Opening one wait | unchanged; Resolve not pressed |
| `/registry` | The registry | unchanged — 2 active; its Stacks column reads `not recorded` while `/stacks` lists a stack |
| `/registry/[slug]` | One engagement | unchanged — amount `unreadable`; no dialog opened, no button pressed |
| `/registry/new` | Registering an engagement | unchanged; not submitted |
| `/registry/[slug]/edit` | Editing an engagement | unchanged; not saved |
| `/milestones/[id]` | One contract milestone | unchanged — `not recorded` |
| `/requirements/[id]` | One requirement | unchanged — FR-59, all five blocks |
| `/defects/[id]` | One defect | unchanged — D-2 detail says `fixed` while Broken counts it critical-open |
| `/blockers/[id]` | One blocker | unchanged — B14; no `/blockers/` href on any of the 18 screens swept |
| `/releases/[id]` | Releases | **UNVERIFIED** — `release` table holds 0 rows; a made-up id returns HTTP 404 and Not found |
| `/questions` | Questions | unchanged — 96 open, 4 unclassified |
| `/questions/[id]` | Opening one question | unchanged — question, Best guess, empty answer, provenance |
| `/settings/tokens` | Agent tokens | **CHANGED** — 4 → 5 tokens, new `session-hook` (`ingest:write`); Rotate/Revoke not pressed |
| `/settings/export` | Getting your data out | **CHANGED** — 1138 → 1174 rows; `stack` 1 and `work_session` 2 now listed; not downloaded |
| `/sign-in` | Signing in | anon context, HTTP 200, stays put; with the session it redirects to `/` |
| `/sign-in/verify` | Signing in | **UNVERIFIED** — both ends measured: anon → `/sign-in`, aal2 → `/` |
| `/sign-in/enroll` | Signing in | **UNVERIFIED** — both ends measured: anon → `/sign-in`, aal2 → `/` |
| `/runs` | Fleet runs | unchanged — 1 run, picker present |
| `/runs/[run-id]` | Opening one fleet run | unchanged — `1 unparsed in this run` beside a badge now reading 2; ambiguous-match screen still UNVERIFIED |

## Manual gate

`manual-gate.sh` — **PASS**, my own run, verbatim:

```
ok    docs/user-guide.md present (10352 words)
ok    evidence file manual-evidence-d4000f.json carries 32 route row(s)
ok    branch serves 32 route(s)
ok    32 of 32 served route(s) covered, all observed

MANUAL GATE PASS - .
```

## Which evidence file I amended, and why that one

`.fleet/manual-evidence-d4000f.json`, **in place, keeping its `d4000f` name**. `manual-gate.sh`
selects `sorted(glob(".fleet/manual-evidence-*.json"))[-1]` — lexicographically last, not newest —
and `9b85cd` sorts below `d4000f` because `9` < `d`. A new `manual-evidence-9b85cd.json` would have
been ignored while the gate kept reading 31 stale rows and failed FORWARD pointing at the wrong
cause. Same pattern M2.8 used with the `29b583` name. The file gained an `amended_by` block naming
run 9b85cd and four amendment entries.

## State I reached

Signed in as the operator at `aal2` via `M27_STORAGE_STATE`, against the dev server already running
at `M27_BASE_URL` on the real Supabase project. The ledger holds 2 engagements, 23 work items across
all three execution modes, 13 defects, 96 questions, 1 fleet run, 1 wait, 1 stack and 2 captured
sessions — enough that no list screen documented here was empty by accident. Three screens are
genuinely empty (Bottleneck, Unassigned sessions, both regression blocks) and the guide says why for
each. The credential was read from the environment variable only; it appears in no file I wrote, and
no Playwright run failed, so B38 exposure did not arise.

## Re-observation, and what B57 caught

**32 rows re-observed. 12 had changed** (d4000f's figure was 15 of 30). Nine changed in the ledger's
own figures, three because this run looked at something the last one could not. Two of the twelve
were claims that had already shipped and were **false**, not merely stale:

- **Broken.** The guide said *"10 still open … The only critical one is among the fixed, so nothing
  critical is currently open."* The screen says `13 open` and `critical 1 open`. Source settles it:
  `broken.ts:177` keeps a defect in the open list unless `isUnresolved(status)` is false, and
  `defects.ts:441` defines that as `status !== "verified" && status !== "wont_fix"`. A defect marked
  `fixed` is still open. The guide now states the rule and stops telling Erik nothing critical is
  open.
- **Planning work by hand.** The guide carried `UNVERIFIED: submitting the form` while `prod.md`
  818-825 records d4000f submitting it and creating `b53-seed`, confirmed against the database. The
  guide had also contradicted itself, saying elsewhere that the row was entered through the form.

Neither would have been caught by re-reading the guide.

## Every guide claim I corrected

1. Sidebar Records list — Stacks added as the eighth entry.
2. Unparsed badge — `0 unparsed` → `2 unparsed`, plus what the two rows are and how to find them.
3. Home screen — thirteen destinations → fourteen.
4. Work-items filter example — "20 rows to 5" → "23 rows to 5".
5. Badge-under-filter example — `3 unparsed (whole ledger)` → the real `2 unparsed (whole ledger)`.
6. Badge with no filter — `0 unparsed` → `2 unparsed`.
7. Next — "This screen is empty" and the 0/0/0 accounting rewritten to one planned row and four counts.
8. Bottleneck — `0 Erik-owned items … could not be classified` → `2`, with what the 2 are.
9. Broken — counts and the open/`fixed`/`verified` rule (above).
10. Work items — 20 → 23 on this page, 0 → 2 unparsed, the `only Erik can do` figure, and that all
    three modes now have rows.
11. Waits — 3 days → 4 days, plus the method.
12. Agent tokens — 4 → 5, and what `session-hook` is for.
13. Export — 1125 → 1174 rows, and the two tables Stacks is built from.
14. Milestone amount — two screens disagreeing → three, in three places.
15. Planned markers — `planned` and the age chip are now observed; only `planned stale` and `age?`
    stay UNVERIFIED.
16. Planning work by hand — the false UNVERIFIED submit block (above).
17. "Nothing tests anything" — the defect arithmetic in it followed Broken's correction.
18. Filtering by engagement — Stacks named as deliberately unfilterable, with the reason.

## Q26 — the word `coverage`

Confirmed absent from the `/stacks` section: `0` occurrences, case-insensitive, across all 916 words
between `## Stacks` and `## What this does not do yet`. The section says stacks, agent covering, and
which stacks have an agent. It is also absent from the rendered page.

## Safety — what I clicked and what the ledger looks like now

**No destructive control was clicked.** Archive, Delete, Destroy, Purge, Revoke, Rotate, Resolve,
Remove and Sign out were never pressed, and no form was submitted. Every trigger I did press was
selected by `data-verify-unit`, never by button label — the rule run 29b583 earned by archiving the
live `delivery-ledger` engagement with a label-matched click.

Two controls were opened and both were closed with Escape:

- the command palette, to confirm it lists Stacks under Records;
- the FR-109 **Set agent** dialog (`agent-covering-trigger`, `aria-label="Set the agent covering
  nextjs-supabase"`), read in full. **Save was never pressed.** The row reported
  `data-verify-covered="false"` before and after, so the reversible write the brief offered me was
  not used and needs no reverting.

**The ledger is exactly as I found it.** No record was created, modified or deleted. The credential
was never printed, copied or committed, and no plaintext agent token was displayed or reproduced.

## Broken things found while verifying

- **Broken's `open` label counts defects whose status reads `fixed`.** Deliberate under
  `isUnresolved()`, and the guide now explains it — but a group headed `critical 1 open` above a row
  whose status column reads `fixed` will be misread by anyone who has not read that paragraph.
  Queued as a question rather than filed as a defect.
- **One milestone amount renders three ways on three screens** — `unreadable`, `not recorded`, and a
  dash. Two of the three are false under the product's own vocabulary. Was two-way at d4000f;
  Committed's dash makes it three.
- Both QA minor issues with a user-visible surface are named in the guide: the two WCAG AA contrast
  failures on `/stacks`, and the `recorded no duration` figure whose denominator is stacked sessions
  rather than all sessions.

## Prior fleet learnings used

- `Knowledge/A gate that checks an observation exists cannot tell a fresh one from a copied one.md`
  — the reason all 31 carried rows were re-opened rather than carried forward. **CONFIRMED**: 12 of
  32 rows changed and 2 of those were false claims already shipped.
- `Knowledge/Gates fail by passing in exactly the case they exist to catch - read the failure, not
  the verdict.md` — read `manual-gate.sh`'s selection rule directly rather than trusting that a
  correctly-named new evidence file would be picked up. **CONFIRMED**: `sorted(...)[-1]` would have
  silently ignored `manual-evidence-9b85cd.json`.
- `Knowledge/An agent instruction file is authoritative about why, never about what the code does
  now.md` — read `broken.ts` and `defects.ts` to settle the open/`fixed` question instead of taking
  the guide's or a comment's word. **CONFIRMED**.
- `Knowledge/Agent verification stops at a human authentication factor - treat MFA paths as
  unexercised.md` — `/sign-in/verify` and `/sign-in/enroll` stay UNVERIFIED for the fourth run
  running. **CONFIRMED**; both ends re-measured rather than assumed.

## Questions queued

Six, in `.fleet/questions-doc1-9b85cd.jsonl`, each with the guess I proceeded on: Broken's `open`
vocabulary; the three-way milestone amount; whether `0h` is a recorded zero or a missing duration;
whether `prod.md` or the guide was right about the form submission; which QA minor issues belong in
a user guide; and whether to exercise the FR-109 save (I did not).
