# Fleet learnings — 9d4658

**Run:** 9d4658
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-24
**Cleared the bar:** 3 · **Routed:** 3 · **Held back:** 0

---

## L1 — `security-gate.sh` reads every 4-cell table row inside §7c as a boundary declaration, so a second table there launders a DEGRADED boundary into an `ok ... reachable` line

**Topics:** fleet, security-gate, verification-access, spec-gates, orchestration, false-green
**Applies to:** any spec passed to `~/.claude/agents/scripts/security-gate.sh` whose `## 7c. Verification Access` section contains more than one table — in particular an orchestrator appending its own Phase 0 measurements there
**Confidence:** high
**Evidence:** observed directly on this run, before and after. The §7c body carried the declared 2-row boundary table plus a 4-column "measured this run" table appended under a `###` heading. The gate printed `ok section 7c declares 4 boundary row(s)` and then `ok 7c 'Agent token (...)' reachable via **DEGRADED — negative controls only.** ...`. Moving the measurement table to its own `##` section outside §7c and re-running produced `ok section 7c declares 2 boundary row(s)` and no DEGRADED line. Cause confirmed in the script source: the parser iterates `for line in body7c.splitlines()` over the whole section body and appends every row with the expected cell count, with no notion of which table a row belongs to; the §7c section itself is delimited by `(?=^##\s|\Z)`, so only a `##` heading ends it.

A spec section that a gate parses is a **machine interface**, not prose, and adding a second table to it silently extends the data the gate believes was declared. The gate takes column 2 as the reach word and column 3 as the mechanism. A measurement table whose columns happen to be `Declared | Measured | Consequence` therefore feeds the *measured verdict* into the mechanism slot, and any row whose column 2 still reads `reachable` emits a green `reachable via ...` line no matter what the verdict said.

The failure is worse than cosmetic because of who reads the output. `qa-reviewer` takes §7c as a required input and an orchestrator carries it into specialist briefs; a reviewer or a downstream agent reading the gate's `ok` lines rather than the table would conclude a boundary was reachable that the orchestrator had just measured as degraded. It is a false-green of exactly the shape these gates exist to prevent, produced by the orchestrator's own diligence in recording what it measured.

A future orchestrator should put Phase 0 verification measurements in a section of their own under a `##` heading, never a `###` inside §7c, and should re-run the gate after writing them and read the declared-row count against the number of boundaries the spec actually declares. If those two numbers disagree, the gate is parsing something that is not a boundary. More generally: after appending anything to a gated section, re-run the gate and check its *counts*, not just its exit code.

## L2 — A build log's milestone tracker is not a scope authority; the requirement set is, and the two drift in opposite directions

**Topics:** fleet, orchestration, spec-resolution, scope, build-log, phase-0
**Applies to:** any project carrying both an approved spec and a long-lived build log with a milestone tracker (the `client-project-intake` + `prod.md` shape)
**Confidence:** high
**Evidence:** measured in Phase 0 of this run. The build log's tracker listed six milestones as `Not Started` — a status that reads as ready-to-dispatch, and which the dispatching brief had itself read that way, naming them "the actual candidate scope for this run". Cross-checking each against the resolved spec found that all six carry **zero** numbered functional requirements between them: five appear only as bullets under a spec section titled "Deferred (Phase 2+)", and the sixth appears only in a single sentence in the Assumptions section. The tracker reserved a separate `Deferred` status which it used for a different set of milestones entirely, so nothing in the tracker signalled that these six were the deferred ones.

The drift is structural rather than sloppy. A tracker is written forward — a milestone is named as soon as someone can imagine it, and `Not Started` is the natural placeholder. The requirement set moves only when a change request is approved. So the tracker accumulates rows that no approved requirement backs, and it is the document a human or an orchestrator actually reads at the start of a session, because it is the one that describes the present.

The consequence is specific: an orchestrator that decomposes from the tracker will dispatch specialists to build milestones whose requirements do not exist, and those specialists will write the requirements themselves as a side effect of building. An agent-invented requirement is indistinguishable at read time from a client-approved one, and the difference surfaces at delivery.

A future orchestrator should, in Phase 0, enumerate the requirement identifiers the resolved spec actually defines, map each Not-Started tracker row onto that set, and treat any row that maps to nothing as **not dispatchable** — reporting what decision would make it dispatchable rather than proceeding on the tracker's status word. The check is cheap: it is one pass for requirement identifiers across the base spec and every change request, and it runs before any decomposition.

## L3 — A gitignored fixture directory behind `describe.skipIf` turns the suite's only real-artifact tests into silent no-ops, and hand-authored fixtures then agree with the bug

**Topics:** vitest, fixtures, testing, skipif, parsers, false-green, ingest
**Applies to:** any repo that tests parsers against two fixture tiers — hand-authored strings committed to the repo, and real captured artifacts kept out of it for privacy — and gates the second tier on the directory being present
**Confidence:** high
**Evidence:** measured on a parser whose regex matched **zero** of 103 non-empty lines across all four real artifacts it exists to read, while the full suite reported 1817 passed / 6 skipped. The regex required a bullet label to begin with a bare letter; every real artifact bolds the label, so the leading `*` never matched. The one committed fixture exercising that regex used an unbolded line. The real-artifact corpus tests were wrapped in `describe.skipIf(!existsSync(dir))` against a gitignored directory that was absent from the checkout, so they did not run and did not report as failures — they reported as nothing. Confirmed the directory's absence and the skip guard directly, and reproduced the regex failure in Node against the real files.

Two mechanisms combine here and neither is visible in a green test run. The first is that `skipIf` on a filesystem predicate degrades to silence rather than to failure: a suite that "passes" in CI and on a fresh clone is passing *without* the only tests that compare the parser to reality, and nothing in the output distinguishes that from a suite where those tests ran. The second is that hand-authored fixtures are written by someone holding the same mental model as the parser author — often the same person in the same sitting — so they encode the assumption rather than testing it. A fixture that agrees with the bug is worse than no fixture, because it converts an open question into a green check.

The compounding effect is that the parser can be wrong about **every** real input it will ever see while its unit tests are green, its fixtures are green, and its own error counters read zero — because a line that fails to match is typically dropped before reaching whatever counts unrecognised input.

A future specialist should, before trusting a parser's test suite, check whether the real-artifact tier actually ran in that checkout — count skipped suites and look at what gates them — and should treat an absent fixture directory as a blocking gap to report rather than an environment quirk to work around. When writing a fixture by hand, derive it by copying a real artifact and redacting, never by typing what the format is believed to be. And when a parser has a "did not recognise this" counter, verify the counter increments on real malformed input rather than only on the fixture's malformed input: a `continue` placed above the counting branch makes the counter structurally incapable of firing.
