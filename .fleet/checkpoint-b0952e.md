# Checkpoint b0952e

phase_complete: 1
spec_path: /Users/erikmeltzer/Projects/project-tracker/spec
spec_basis: spec-approved.md + CR-001 (approved 2026-08-18)
resolved_spec: .fleet/resolved-spec-b0952e.md
branch: agent-build/2026-08-19-b0952e
merged_head: eed0144
mode: full
repo_path: /Users/erikmeltzer/Projects/project-tracker
manifest_path: /Users/erikmeltzer/Projects/project-tracker/.fleet/manifest-b0952e.md
started: 2026-08-19
phase1_completed: 2026-08-19
dispatches_used: 4 of 20
build_after_phase1: PASS

## Gates

security-gate.sh (.fleet/resolved-spec-b0952e.md): PASS — all 21 Section 7 entities classified, 22 rows
fleet-preflight.sh: PASS — 9/9
report-gate.sh r1: SKIP (research note) · u1: PASS · i1: PASS · i2: PASS

## Verification on the merged branch (observed in a clean worktree)

pnpm install --frozen-lockfile: exit 0
pnpm typecheck (tsc --noEmit, TS 7.0.2): exit 0
pnpm build: exit 0 — 13 routes emitted, all static
pnpm test: 98 passed | 6 skipped (16 files) — the 6 skipped are the Tier-2 real-corpus suite
pnpm lint (oxlint): exit 0

## Merged worktrees

u1 = .claude/worktrees/agent-ab70b1cb35970be7b  head aac2260  (63 files, scaffold + design system)
i2 = .claude/worktrees/agent-af9a7210a66a86493  head 878accd  (14 commits, src/lib/ingest/, 29 files)
i1 = .claude/worktrees/agent-a48318ba264e06612  head 757d7de  (4 commits: schema, migration-filename alignment, report, project lesson)
r1 = .claude/worktrees/agent-a1dc0e1a2b9fc3d7e  research note only, nothing to merge

Merge method: fast-forward to i2 (878accd), then cherry-pick i1's four commits. Zero conflicts.
Build re-verified at the exact merged head eed0144, not only at the intermediate fad031c.

## Phase 2 units

i3, i4, i5, i6, i7, i8, u2, u3, u4, c1, doc1, then qa1, then man1 (gated on qa1 PASS)
d1 (deploy) is BLOCKED on B1b and is not dispatched.

## Phase 1 best-guess decisions

1. Next 16.3.1 / TS 7.0.2 pinned together. TS7 removed `baseUrl` (hard TS5102), and Next 15.5
   builds path aliases through it, so the pair is not independently choosable. `types: ["node"]`
   set explicitly because TS7 no longer auto-includes @types/node.
2. `pnpm lint` runs oxlint, not ESLint. typescript-eslint throws at module load on TS 7 and takes
   eslint-config-next with it; the documented TS6 side-by-side workaround failed because pnpm 11
   silently ignores `overrides` in both supported locations. QUEUED for Erik.
3. Visual design chosen from §5a's written direction because §5a reads `Approved design: NOT YET
   APPROVED`. Geist / Geist Mono; violet accent (#6d28d9 / #a78bfa) confined to interactive chrome;
   a separate 16-token semantic state scale with fuchsia reserved exclusively for `unparsed`.
   Violet never appears in the state scale; fuchsia never in the chrome. QUEUED for Erik.
4. `UnparsedCount` has three states, not two. An unknown count renders "unavailable", never `0`,
   because "0 unparsed" is a positive claim that everything classified. QUEUED for Erik.
5. FR-8 per-token rate limiting implemented as a Postgres counter RPC. Vercel WAF on Pro can only
   count by IP or JA4 Digest; keying on an arbitrary header is Enterprise-only. Forced, not chosen.
6. pnpm build-trust for `unrs-resolver` recorded as DECLINED rather than granted. QUEUED for Erik.
7. Crypto/predicate helpers live in an unexposed `app` schema with six thin `public` wrappers granted
   to service_role alone. Consequence for i4: decryption is service-role-only, so a decrypted read
   bypasses RLS.
8. Three prose columns §7a does not name (`contract_milestone.notes`, `open_question.answer`,
   `defect.wont_fix_reason`) encrypted under the baseline, resolving upward. QUEUED for Erik.
9. Requirement references stored as text, never as foreign keys — FR-12 and FR-65 require a dangling
   reference to be reported, and an FK would reject the row and lose the finding.
10. No MFA-enrolment carve-out in RLS. Enrolment runs through GoTrue and touches no RLS-gated table,
    so a never-enrolled operator can still enrol. i5/i8 must tolerate the operator row being
    unreadable at aal1 rather than reading that as "no account".
11. 17 enums where the spec states a closed set; free text where it does not. Four such fields
    QUEUED rather than invented.
12. `plan.md`'s `blocker.owner` default of `"client"` shipped verbatim despite i2 believing FR-52
    contradicts it. QUEUED — not changed in a worktree.
13. One control test added beyond `plan.md` (`coverage.test.ts`) because the plan's own fixture
    cannot detect a widened certifier join. See learnings L1.

## Open questions — 11, in .fleet/questions-b0952e.jsonl

u1 4 · i1 5 · i2 2 · r1 0
Answer in .fleet/answers-b0952e.jsonl, then: /build-from-spec continue b0952e

## Known gaps carried into Phase 2

- Security headers (CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors):
  NOT VERIFIED — no headers() block exists in next.config.ts. A real gap, owned by whichever
  Phase 2 unit takes next.config.ts.
- Deletion path (FR-61): NOT VERIFIED — not built in M1.1, deliberately. Append-only triggers will
  refuse a cascade into test_result; i1 queued this as a genuine spec conflict.
- Tier-2 corpus assertions (31 work items, 45 questions, 61 requirements): SKIPPED, not passed.
  fixtures-local/ is absent on this machine.
- FR-5 "agent tokens refused contract_milestone" is not expressible in RLS. Handler-layer or
  scoped JWTs — i1 queued it, i4 must resolve it.

---

# Resume 3 — 2026-08-19 (this session)

phase_complete: 2-specialists-done
branch_tip: a87fe4d
verified_at_tip: typecheck 0 · lint 0 (oxlint) · build 0 (31 routes) · test 919 pass / 6 skip
merge_state: CONTENT-COMPLETE — every specialist worktree diffed against the tip; the only file
  present in a worktree and absent from the branch is src/lib/server/releases/unparsed.ts, i8's
  local copy of the unparsed definition, deliberately deleted by i7 when it consolidated that
  definition to one function with two call sites.
uncommitted_work_in_worktrees: none (the i6 failure mode did not recur)

branch_worktree: /Users/erikmeltzer/Projects/project-tracker/.claude/worktrees/qa-b0952e
  Relocated from /private/var/folders/.../tmp.aMqsruHklj/m, a temp path that could be swept
  mid-run. node_modules (592MB) preserved across the move. Credentials placed at .env.local
  (gitignored, confirmed invisible to git) so qa1 can close the DB-blocked NOT VERIFIED items.

worktrees: r1=.claude/worktrees/agent-a1dc0e1a2b9fc3d7e, u1=.claude/worktrees/agent-ab70b1cb35970be7b,
  i1=.claude/worktrees/agent-a48318ba264e06612, i2=.claude/worktrees/agent-af9a7210a66a86493,
  i3=.claude/worktrees/agent-a24e81d88da808a01, i4=.claude/worktrees/agent-aae60a3d179101069,
  i5=.claude/worktrees/agent-a9b4ecf06c24aa62d, i6=.claude/worktrees/agent-a6d62458b0e676283,
  i7=.claude/worktrees/agent-a61a0622f1064e3b5, i8=.claude/worktrees/agent-a96b23958985ca423,
  u2=.claude/worktrees/agent-a9709abfd06d4baeb, u3=.claude/worktrees/agent-aec7ceabd2029d7f5,
  u4=.claude/worktrees/agent-a8ebad97c5e9124c2, c1=.claude/worktrees/agent-ac4a073fcc3b7f461,
  doc1=.claude/worktrees/agent-a794c9eba50b99ba0, d1=.claude/worktrees/agent-a1fa13d6ec6194e9e

recovered_at_resume_3:
  questions-c1-b0952e.jsonl (3 lines) and questions-d1-b0952e.jsonl (5 lines) existed only on the
  branch, never in the main tree. Fan-in rebuilt from per-unit files: 69 -> 85 lines, 14 answered.
  specialist-reports/b0952e/c1.md and d1.md likewise recovered from the branch. Both gate PASS.

dispatches_used: 17 of 20

---

# FINAL — 2026-08-19

phase_complete: final
status: ISSUES — build PASS, QA verdict ISSUES (critical found, fixed, re-verified in-run)
branch: agent-build/2026-08-19-b0952e
branch_tip: b980e1a
pushed: NO — local only, per the standing rule that pushing is Erik's call
deployed: NO — the only live change is one applied migration (the service_role grant)

gates_at_tip (re-run by project-lead, not taken on report):
  pnpm typecheck  exit 0
  pnpm lint       exit 0   (oxlint)
  pnpm build      exit 0   (31 routes)
  pnpm test       exit 0   966 passed | 6 skipped
  pnpm e2e        exit 0   199 passed | 7 skipped

units: 16 done, 0 failed, 1 blocked (i9/M1.10 on CR-002), 1 not dispatched (man1)
dispatches_used: 18 of 20
questions: 96 queued, 14 answered, 82 open
report_gates: 16 PASS, 1 SKIP (r1 research note), 1 FAIL (i2 - artifact defect, specialist
  unreachable for self-repair), 1 UNEVALUABLE (qa1 - report-gate.sh has no qa-reviewer entry)

worktrees_pruned: 15 agent worktrees removed after verifying no artifact existed only there.
  .claude/worktrees/qa-b0952e retained: it is the branch checkout with node_modules and .env.local.
  16 worktree-agent-* refs left in place deliberately - they preserve per-unit provenance and are
  not the leak the prune rule targets.

next_action: provision one operator account (B20), then rule on CR-002 (B21)
