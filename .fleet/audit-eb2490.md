ok    MANIFEST-MISSING: manifest present, 8 work-unit rows parsed
ok    CHECKPOINT-MISSING: checkpoint present, phase_complete: final
ok    NO-REPORT-FILE: report-eb2490.md present
ok    IN-PROGRESS: no rows in_progress
ok    PENDING-AT-END: no pending rows on a completed run
ok    DONE-GATE-FAIL: 7 done unit report(s) pass the gate, 0 fail
ok    QA-NO-REPORT: 1 qa-report file(s) on disk for qa1
ok    UNTRACKED-REPORT: every report file for this run has a manifest row
FAIL  QUESTION-LOSS: per-unit questions never reached the fan-in file: qa1 (5 in questions-qa1-eb2490.jsonl, 0 collected). Uncollected questions are decisions Erik never got to make
ok    DISPATCH-COUNT: checkpoint declares no `N of M` dispatch count — nothing to reconcile
ok    STATUS-CONTRADICTION: report status is BLOCKED — nothing to contradict
ok    WRITEBACK-MISSING: spec/prod.md mentions run eb2490 — writeback ran
WARN  WORKTREE-LEAK: 8 worktree(s) remain under .claude/worktrees/ after a complete run — Synthesize owes a prune (P23), and leaked worktrees are how stale-report collisions become reachable
ok    BASE-HEAD: no worktree sits at the initial commit

RUN AUDIT eb2490: FAIL — 1 fail, 1 warn, 12 ok
