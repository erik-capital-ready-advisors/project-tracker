ok    MANIFEST-MISSING: manifest present, 15 work-unit rows parsed
ok    CHECKPOINT-MISSING: checkpoint present, phase_complete: final
ok    NO-REPORT-FILE: report-d4000f.md present
ok    IN-PROGRESS: no rows in_progress
ok    PENDING-AT-END: no pending rows on a completed run
WARN  STATUS-UNKNOWN: row u4 has unrecognized status 'null`.' — audited as if terminal
WARN  STATUS-UNKNOWN: row d1 has unrecognized status 'service_role=x`,' — audited as if terminal
WARN  STATUS-UNKNOWN: row man1 has unrecognized status 'not' — audited as if terminal
ok    DONE-GATE-FAIL: 11 done unit report(s) pass the gate, 0 fail
ok    QA-NO-REPORT: 1 qa-report file(s) on disk for qa1
ok    UNTRACKED-REPORT: every report file for this run has a manifest row
ok    QUESTION-LOSS: 14 per-unit file(s) fully present in the fan-in file
WARN  DISPATCH-COUNT: checkpoint declares disagreeing dispatch counts: 4, 15. The record cannot say how much of the budget was spent — count from traces before trusting any of these (P15)
ok    STATUS-CONTRADICTION: SUCCESS is consistent with the report's own Verification block
ok    WRITEBACK-MISSING: no spec/prod.md at /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec — writeback correctly skipped
WARN  WORKTREE-LEAK: 13 worktree(s) remain under .claude/worktrees/ after a complete run — Synthesize owes a prune (P23), and leaked worktrees are how stale-report collisions become reachable
ok    BASE-HEAD: no worktree sits at the initial commit

RUN AUDIT d4000f: PASS — 0 fail, 5 warn, 12 ok
