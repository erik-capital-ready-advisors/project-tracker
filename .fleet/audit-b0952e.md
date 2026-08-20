ok    MANIFEST-MISSING: manifest present, 20 work-unit rows parsed
ok    CHECKPOINT-MISSING: checkpoint present, phase_complete: final
ok    NO-REPORT-FILE: report-b0952e.md present
ok    IN-PROGRESS: no rows in_progress
ok    PENDING-AT-END: no pending rows on a completed run
WARN  STATUS-UNKNOWN: row man1 has unrecognized status 'not' — audited as if terminal
FAIL  DONE-GATE-FAIL: unit i2 is `done` but its report fails report-gate.sh: FAIL  `## Questions Queued` names /Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-af9a7210a66a86493/.fleet/questions-i2-b0952e.jsonl, which resolves to /Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/agent-af9a7210a66a86493/.fleet/questions-i2-b0952e.jsonl — outside this repo's `.fleet/`. A questions file has to be somewhere the run collects from
ok    DONE-GATE-FAIL: 15 done unit report(s) pass the gate, 1 fail
ok    QA-NO-REPORT: 1 qa-report file(s) on disk for qa1
ok    UNTRACKED-REPORT: every report file for this run has a manifest row
ok    QUESTION-LOSS: 17 per-unit file(s) fully present in the fan-in file
WARN  DISPATCH-COUNT: checkpoint declares disagreeing dispatch counts: 4, 17, 18. The record cannot say how much of the budget was spent — count from traces before trusting any of these (P15)
ok    STATUS-CONTRADICTION: report status is BLOCKED — nothing to contradict
ok    WRITEBACK-MISSING: no spec/prod.md at /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec — writeback correctly skipped
WARN  WORKTREE-LEAK: 2 worktree(s) remain under .claude/worktrees/ after a complete run — Synthesize owes a prune (P23), and leaked worktrees are how stale-report collisions become reachable
ok    BASE-HEAD: no worktree sits at the initial commit

RUN AUDIT b0952e: FAIL — 1 fail, 3 warn, 12 ok
