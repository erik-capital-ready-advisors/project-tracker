ok    MANIFEST-MISSING: manifest present, 5 work-unit rows parsed
ok    CHECKPOINT-MISSING: checkpoint present, phase_complete: final
ok    NO-REPORT-FILE: report-29b583.md present
ok    IN-PROGRESS: no rows in_progress
ok    PENDING-AT-END: no pending rows on a completed run
ok    DONE-GATE-FAIL: 4 done unit report(s) pass the gate, 0 fail
ok    QA-NO-REPORT: 1 qa-report file(s) on disk for qa1
WARN  UNTRACKED-REPORT: report file(s) for this run with no manifest row: u4-first-attempt-superseded.md — work ran outside the orchestrator's accounting (the P15 phenomenon)
ok    QUESTION-LOSS: 3 per-unit file(s) fully present in the fan-in file
ok    DISPATCH-COUNT: one declared dispatch count: 6
ok    STATUS-CONTRADICTION: report status is BLOCKED — nothing to contradict
ok    WRITEBACK-MISSING: no spec/prod.md at /Users/erikmeltzer/Projects/project-tracker (project dir → `spec — writeback correctly skipped
WARN  WORKTREE-LEAK: 4 worktree(s) remain under .claude/worktrees/ after a complete run — Synthesize owes a prune (P23), and leaked worktrees are how stale-report collisions become reachable
ok    BASE-HEAD: no worktree sits at the initial commit

RUN AUDIT 29b583: PASS — 0 fail, 2 warn, 12 ok
