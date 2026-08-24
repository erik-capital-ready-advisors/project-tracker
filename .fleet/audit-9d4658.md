ok    MANIFEST-MISSING: manifest present, 1 work-unit rows parsed
ok    CHECKPOINT-MISSING: checkpoint present, phase_complete: final
ok    NO-REPORT-FILE: report-9d4658.md present
ok    IN-PROGRESS: no rows in_progress
ok    PENDING-AT-END: no pending rows on a completed run
FAIL  DONE-NO-REPORT: unit r1 is `done` with no report at .fleet/specialist-reports/9d4658/r1.md (or legacy .fleet/specialist-reports/r1.md). A status cell is a claim; the report is the evidence
ok    DONE-GATE-FAIL: 0 done unit report(s) pass the gate, 0 fail
ok    QA-NO-REPORT: no done qa rows to check
ok    UNTRACKED-REPORT: every report file for this run has a manifest row
ok    QUESTION-LOSS: 1 per-unit file(s) fully present in the fan-in file
ok    DISPATCH-COUNT: one declared dispatch count: 1
ok    STATUS-CONTRADICTION: report status is BLOCKED — nothing to contradict
ok    WRITEBACK-MISSING: no spec/prod.md at /Users/erikmeltzer/Projects/project-tracker (spec dir: `spec — writeback correctly skipped
ok    WORKTREE-LEAK: no worktrees remain
ok    BASE-HEAD: no worktree sits at the initial commit

RUN AUDIT 9d4658: FAIL — 1 fail, 0 warn, 14 ok
