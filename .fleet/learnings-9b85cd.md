# Fleet learnings — 9b85cd

**Run:** 9b85cd
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-24
**Cleared the bar:** 5 · **Routed:** 5 · **Held back:** 1 — one duplicate of an existing vault note (see foot)

---

## L1 — `manual-gate.sh` picks its evidence file lexicographically, so a run whose id sorts low is silently ignored

**Topics:** fleet-tooling, manual-gate, docs-writer, glob, sorting, evidence
**Applies to:** any fleet run using `~/.claude/agents/scripts/manual-gate.sh`
**Confidence:** high
**Evidence:** the script's own line — `ev_paths = sorted(glob.glob(os.path.join(repo, ".fleet", "manual-evidence-*.json")))` then `ev_path = ev_paths[-1]` — confirmed empirically by running that exact glob-and-sort with a synthetic third filename added, which sorted into the **middle**; and by the gate's own output line naming the older file while a newer run was being gated.

The gate selects the **lexicographically last** `manual-evidence-*.json`, not the most recent one. Run ids are hex, so roughly 60% of new run ids sort **below** an existing one. When that happens the correctly-written evidence file for the current run is never read: the gate silently evaluates the previous run's rows, fails on route coverage, and prints a message blaming the guide for not covering a route the new file does cover.

That failure is doubly expensive because it is **misattributed**. Nothing in the output says "I ignored your file"; it says the branch serves a route the evidence never mentions, which sends the next agent to rewrite documentation that was already correct.

Two safe responses. Either **amend the existing highest-sorting evidence file in place**, keeping its old name and adding an `amendments` entry recording which run and branch observed the new rows — this is the pattern that works and it has now been used on two consecutive milestones — or give the new file a name guaranteed to sort last. Prefer amending: one file, one gate, no ambiguity about which one is live. Whichever you pick, **verify the selection before dispatching the documentation pass**, because discovering it afterwards costs an entire manual pass and those are among the most expensive dispatches a run makes.

## L2 — Probe an auth gate with a signed-out control that must PASS, and key it on the marker the screen actually renders

**Topics:** playwright, authentication, verification, negative-control, nextjs, rsc
**Applies to:** any agent verifying that an authenticated web screen is gated, or rendering one to observe it
**Confidence:** high
**Evidence:** a first probe keyed on one `data-verify-*` attribute returned **0 gate nodes signed-out** on a screen that is correctly gated; a DOM sweep of every `data-verify-*` attribute on the same page showed the gate present under a different attribute name. The re-keyed control then returned 1 node signed-out and 0 signed-in.

A selector that matches nothing and a page with no auth gate produce the **same observation**: zero nodes. So "I found no gate" is never evidence the screen is ungated — it is evidence the selector matched nothing, and those two readings differ by the entire severity range from "no finding" to "unauthenticated data exposure".

The fix is a negative control that **must succeed before the real observation runs**: fetch the same route with no session, assert the gate marker IS present, and **abort the whole probe if it is not**. That inverts the failure — a wrong selector now stops the run with "my discriminator cannot fail" instead of quietly producing a false finding. It costs one extra page load.

Two traps sit underneath this. First, **do not key on `h1` or on page title**: where the gate renders *inside* the page shell, the heading is identical signed-in and signed-out, so it discriminates nothing. Second, **the gate marker is often not uniform across a codebase** — older screens and newer screens can use different attributes, and the same attribute name may be **overloaded** for an unrelated concept elsewhere in the same tree. Enumerate the markers on the actual page before writing the selector rather than reusing one from another screen's test.

## L3 — A grep exclusion that filters on the file path blinds the scan to that file's entire contents

**Topics:** grep, verification, blind-scan, code-search, false-negative
**Applies to:** any agent proving a term is absent from a tree
**Confidence:** high
**Evidence:** an absence proof ran `grep -rni "<term>" <dir> | grep -v "…\|<filename-fragment>\|…"`. Because the second `grep -v` matches against the whole line and every line carries its `path:lineno:` prefix, **every line of the named file was filtered out regardless of content**. The scan reported two hits and the claim "it survives in exactly one place"; a later review found a third occurrence inside the excluded file.

`grep -r` prefixes each output line with `path:lineno:`, so an exclusion pattern intended to skip an *identifier* also matches any **path** containing that substring. Exclusion lists get built by pasting in the false positives you saw, and identifiers and filenames routinely share a stem — so this happens exactly when someone is being careful.

Anchor exclusions to the matched text rather than the whole line: strip the prefix first (`grep -h`, or cut after the last `:`), or invert to a positive allow-list of shapes you accept. Then apply the standing rule that makes this catchable at all: **pair every absence proof with a control term you know is present**. A scan reporting zero on every pattern is indistinguishable from a blind one until a control comes back non-zero — and here the control would have had to be *inside the excluded file* to expose it, which is the sharper version of that rule.

## L4 — When a hazard is documented only in comments, a grep for the hazard's code form returns the prose and the false claim becomes self-perpetuating

**Topics:** code-search, comments, stale-documentation, verification, blockers
**Applies to:** any agent establishing that a codebase still has a structural problem
**Confidence:** high
**Evidence:** a claim that N modules read a shared array by positional index was carried in code comments, a specialist report and an orchestrator manifest across three runs. Grepping the indexing form `ARRAY[0-9]` returned matches in `src/` — **every one of them inside a comment describing the hazard**. Checking the actual call sites showed all of them had already migrated to a lookup by key; the only real positional readers left were two test files that pin order deliberately.

This is a self-sustaining error. Someone documents a hazard in a comment. The hazard is later fixed, but the comment stays. The next agent greps for the hazard's code form, matches the comment, concludes the hazard is live, and **writes another comment saying so** — increasing the match count and the apparent corroboration. Each cycle makes the claim look better attested while the underlying fact stays false.

The cost lands on tracking, not on behaviour: the code was fine throughout, but a blocker stayed open on false evidence, and the false sentence propagated into a report and a manifest as fact.

So: to establish a codebase **still** has a structural problem, **count call sites, not textual matches** — filter comments out, or check the construct at its use site — and treat a grep hit inside a comment as *evidence the thing was once true*, not that it is. Where the same repo already warns that comments describe what the code does **not** do at least as often as what it does, a match in prose is weak evidence for the opposite conclusion.

## L5 — An accessibility or coverage gate run without credentials measures the sign-in page and reports green forever

**Topics:** accessibility, axe, playwright, gates, authentication, false-green
**Applies to:** any automated audit gate pointed at an authenticated application
**Confidence:** high
**Evidence:** a repo's a11y gate carried a hardcoded route list that had not gained an entry in several milestones, and its own header stated it measured each route's **signed-out refusal** state. It reported green. Re-running the same engine over the same product with a real operator session found `serious` contrast violations on **every** authenticated screen checked — 96, 27, 22, 12, 4 and 2 nodes across six routes.

An authenticated app serves the same short refusal notice on every gated route. An audit tool pointed at it therefore audits **one tiny page, N times**, and passes — and the pass is indistinguishable from a real one in CI. The newest screen in that measurement was the *least* affected, which is the tell: the violations were inherited from a shared token ladder and had simply never been observed anywhere.

Two independent defects combine here and both are worth checking separately. **The gate ran without a session**, so it saw refusal pages. **The route list was hardcoded**, so it silently stopped covering new routes as the product grew. Either alone produces a green that means nothing.

Drive such a gate's route list off the application's own route table or navigation model so it cannot go stale, require a stored authenticated session, and **fail closed when that session is absent** rather than skipping — a skipped gate is the same colour as a passing one from a distance. Where a gate is currently green, confirm it can go red: point it at a known-bad surface before trusting it.

---

**Held back — 1, as a duplicate rather than a scrub:** that an unimported `'use server'` module in a Next.js App Router build compiles silently, so its reachability must be proved by temporarily importing it into a real route and building. It is genuinely load-bearing and was used to good effect this run, but it is already in the vault from an earlier run and this run only re-applied it. Nothing was held back for client content: no engagement material, spec text, contract data or personal data appears above, and every learning is stated at the level of the stack or the fleet's own tooling.
