# Fleet learnings — 29b583

**Run:** 29b583
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-23
**Cleared the bar:** 6 · **Routed:** 5 · **Held back:** 1 — over cap: a note on positional-index reads into a shared nav config array, which is a code-review pattern rather than a stack fact and is already captured in the run's own blocker record.

---

## L1 — A saved browser session is a perishable credential, and its decoded claims cannot tell you whether it is still alive

**Topics:** playwright, storage-state, supabase, gotrue, jwt, session, agent-verification, fleet
**Applies to:** any agent run whose verification depends on a captured browser session or storage-state file
**Confidence:** high
**Evidence:** decoded `aal: aal2`, `amr: totp,password`, `role: authenticated` locally from a storage state whose session was revoked; the same file then produced 10/10 failures, every one "rendered the operator gate (sign-in)", against 8 passed / 2 failed from the same file three days earlier

A storage-state file carries a JWT, and a JWT is a *claim about the past*. Parsing it tells you what the session was when it was minted — assurance level, factors used, subject, issuer — and every one of those fields decodes perfectly from a session the server has since destroyed. Revocation lives on the server; nothing in the file changes when it happens.

The practical failure is that local inspection produces a confident green. An orchestrator that checks "does the session file exist, and does it claim the assurance level we need?" gets `yes` and `yes` from a dead credential, and then dispatches a full wave of work whose verification silently degrades to nothing. The access token's `exp` is a weak signal too: it is short-lived by design and being expired is normal, because the refresh token is supposed to cover it — so "expired" does not mean "dead" and "unexpired" does not mean "alive".

**Do this instead:** round-trip the session against the real surface before dispatching anything that depends on it. One request that either renders authenticated content or redirects to a sign-in page settles it, and it costs a single call at the start of a run rather than a wave of unobserved work. Treat "the file exists and its claims are correct" as necessary and never sufficient. When a run captures a session for later reuse, record the mint time next to it, because the useful question at the start of the next run is "how old is this?" rather than "what does it say?".

## L2 — A verification boundary that needs a human at an authenticator is not reachable to an unattended run, however it is declared

**Topics:** spec-gates, verification-access, mfa, totp, unattended, agent-verification, fleet
**Applies to:** any spec section that declares which surfaces an agent run can reach, and any MFA-protected surface an agent is expected to verify against
**Confidence:** high
**Evidence:** the renewal script for the boundary launches `chromium.launch({ headless: false })` and blocks on `process.stdin.once("data", ...)` after printing "Enter the six-digit code from your authenticator app" — read from source, not inferred; the boundary was declared `reachable` and no unattended run can restore it

A spec that enumerates agent-reachable boundaries is a genuinely good idea: it moves "we built screens nobody could see" from a discovery at review time to a fact known before dispatch. But the declaration is only as good as its reachability predicate, and there is a failure mode that looks fine on paper.

The boundary here was ruled `reachable` on the reasoning that a human completes the second factor *once*, and the captured session is then usable by any agent for its lifetime. That reasoning is sound and the ruling was deliberate. What it quietly does is make reachability a function of **when a person last sat down**, not a property of the system. The declaration is static; the thing it describes decays. Between the ruling and the run, the session was revoked, and the mechanism to mint a new one cannot be run by an agent at all — it needs a visible browser and a person holding a phone. So the row read `reachable` while being, for an unattended run, permanently unreachable until a human intervenes.

**Do this instead:** distinguish two states in the declaration rather than one. "Reachable by an agent unaided" and "reachable only with a person present" are different capabilities and they fail differently. A boundary in the second class should carry the freshness requirement explicitly — what artifact makes it reachable, how long that artifact lasts, and what the run does when it has lapsed — so a run can check the precondition instead of discovering it. And whichever class it is, run the named mechanism at the start of the run and report what happened: a declaration is a claim, and the run is the only thing that can test it.

## L3 — Agent worktrees are not guaranteed to be cut from the branch you dispatched against, and a merge commit is "not an ancestor" while contributing nothing

**Topics:** git, worktrees, fleet, orchestration, merge-base, dispatch
**Applies to:** any orchestrator dispatching parallel agents into isolated git worktrees
**Confidence:** high
**Evidence:** within one run, three worktrees were cut at the run branch's tip and a fourth at the repository's `master`; the containment check `comm -23 <(git ls-tree -r --name-only <master> | sort) <(git ls-tree -r --name-only <branch tip> | sort)` returned empty while `git merge-base --is-ancestor <master> <branch tip>` returned false

Worktree provisioning picked different base commits for different agents in the same run, with no change in how they were dispatched. So a brief that says "you are cut from X" is a guess, and the safety instruction every agent runs at step zero — prove the tree is clean and prove you hold no commits the branch lacks, then reset — is doing real work rather than ceremony.

The second half is the part that costs an orchestrator time. When an agent lands on a **merge commit**, the check `git log <branch>..HEAD` correctly prints that commit, because a merge node on a mainline is genuinely not an ancestor of a branch that descends from the merge's *source* rather than through the merge itself. The agent stops, as it should. But the commit contributes no file and no line — its content is already in the branch by another path. Topology says "divergent"; content says "identical".

**Do this instead:** when a step-zero guard escalates, adjudicate with a **content** comparison rather than a topology one. Compare the two trees file-by-file (`git ls-tree -r --name-only`, diffed with `comm`) and check whether the merge's source commit is an ancestor. If nothing is present in the agent's base that the branch lacks, authorise the reset explicitly and record the proof; if anything is, stop and escalate to a person. Never tell an agent to "just reset" without doing this — `git reset --hard` discards uncommitted tracked edits with no stash and no reflog entry, and the guard exists precisely because the orchestrator, not the agent, is the one holding enough context to rule.

## L4 — `git diff` cannot see a unit's new files, so a worktree fan-in that enumerates with it silently drops them

**Topics:** git, worktrees, fleet, merge, untracked, orchestration
**Applies to:** any orchestrator merging work out of agent worktrees where agents leave changes uncommitted
**Confidence:** high
**Evidence:** `git diff --name-only <base>` reported one changed file for a unit that had in fact created six new ones; `git status --porcelain` in the same worktree reported all seven

When agents leave their work uncommitted in a worktree, `git diff <base>` compares the base against tracked content only. Every file the agent *created* is untracked and therefore invisible. The failure is quiet and asymmetric: modifications to existing files merge fine, so the branch builds and the tests that existed before still pass, while the new module, the new route, or the new config file simply never arrives. The gap shows up much later as a missing import or an absent feature, far from the merge that caused it.

The same blind spot covers gitignored files, which are frequently the ones that matter — an example env file, generated types, a config the build reads.

**Do this instead:** enumerate a worktree with `git status --porcelain` and handle each status code, including deletions, which a naive file copy also misses. Cross-check the result against the file list the specialist reported, and treat a discrepancy as a finding rather than noise: the specialist's own list is what catches anything the porcelain hides.

## L5 — A gate that greps for placeholder tokens will fail correct prose that quotes a format string

**Topics:** gates, report-validation, fleet, false-positive, tooling
**Applies to:** any automated check that detects unfilled templates by searching for placeholder markers
**Confidence:** high
**Evidence:** a report failed with "still carries template text" because a sentence described rendered output as a number followed by a currency code, written with angle-bracket placeholders inside a quoted example; every other check on the same report passed

Template-detection gates look for the markers a template leaves behind — angle-bracketed words are the usual choice, because they are rare in finished prose. They are not rare in *technical* finished prose. A report describing what a formatter emits, an API's URL shape, or a message format will naturally quote a pattern with bracketed placeholders in it, and the gate cannot tell that from an unfilled section.

The cost is not the false positive itself but what it tempts. The wrong responses are to loosen the gate, or to wave the unit through because the work was obviously fine. Both destroy the gate's value, and the second is indistinguishable from the failure the gate exists to catch.

**Do this instead:** keep the gate, fix the input. Tell specialists up front not to write bare placeholder tokens in report prose and to name the placeholder something specific instead. When the gate fires anyway, adjudicate it — read the flagged line, decide whether it is prose or a template remnant, record the ruling with the evidence, and have the *specialist* reword its own sentence and re-run the gate. Never edit the gate to accommodate an input, and never mark a unit done on a failing gate because you judged the failure spurious.
