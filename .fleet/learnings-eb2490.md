# Fleet learnings — eb2490

**Run:** eb2490
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-20
**Cleared the bar:** 6 · **Routed:** 5 · **Held back:** 1 — over cap: a Playwright config that correctly fails closed but reports the wrong cause (`Project "x" not found` when two env vars are unset), which reads as "the gate was deleted" rather than "set these".

---

## L1 — A raw NUL byte anywhere in a source file makes `grep` and `git grep` treat the whole file as binary and skip it silently

**Topics:** grep, git-grep, source-hygiene, separators, ci, static-analysis
**Applies to:** any repository searched by `grep`/`git grep`, in any language; most likely where code builds a composite key or a delimiter constant
**Confidence:** high
**Evidence:** a pre-existing `source-hygiene` test failed on a newly written module whose composite-key separator was written as a literal NUL rather than the `\0` escape; the same practice previously produced a wrong remediation instruction on an earlier run because the file holding the answer was invisible to every search

A single `\x00` byte flips `grep`'s binary heuristic for the entire file. `grep` then prints `Binary file X matches` at best, and under `-r` with common flags prints nothing at all — so a search that should have hit returns zero, and zero is indistinguishable from "the code is not there". Every agent and every human who later greps for that symbol concludes it does not exist.

The character is often the *right* choice. A composite key assembled from free text — a label someone typed, a name with spaces — cannot safely use any printable separator, because two different tuples can fuse into one key. NUL is the correct separator precisely because it cannot occur in the text.

The fix is not to change the separator; it is to **write it as the escape sequence `"\0"` rather than as a literal byte in the file**. Same character at runtime, ordinary text on disk. Add a repository test that asserts zero raw NUL bytes across the source tree — it costs one `grep -c` and it defends every future search, including the ones agents run to orient themselves. More generally: when a scan returns zero, verify the scan can return non-zero on this file before concluding anything.

## L2 — A mutation that removes scoping logic survives when every fixture holds one value of the scoping dimension

**Topics:** mutation-testing, test-design, fixtures, scoping, multi-tenant, false-green
**Applies to:** any test suite covering per-tenant, per-account, per-engagement or per-workspace filtering, especially where the fake data layer implements its own filtering
**Confidence:** high
**Evidence:** six mutations applied to a batch resolver; five went red, one — removing the in-memory scoping so a reference could resolve to a row in a different tenant — left the full suite green until the fixture was extended to hold two tenants carrying the same reference

This is the sharpest false-green shape in a stack where a fake database implements query filters. The code under test scopes results by tenant. The fake also applies the query's own filter. With one tenant in the fixture, the filter alone produces the right answer, so deleting the scoping changes nothing observable, and every test passes.

The suite looks thorough — it may have many tests over that function — and it cannot fail on the one property that matters most, which is that a lookup never crosses a tenant boundary.

**Whenever a test covers scoping, the fixture must contain at least two of the scoping dimension, both carrying the same key.** The assertion to write is not "resolves correctly" but "resolves the same reference to a *different* row per tenant, in one batch". And this is the argument for running mutation testing at all: a first-run-green suite is the state to distrust, and the surviving mutation is worth more than the five that died, because it names a test that was decorative.

## L3 — An `oxlint` negative control must plant a violation of a rule oxlint actually enables, or the control is blind

**Topics:** oxlint, linting, negative-control, nextjs, typescript, false-green
**Applies to:** any repository linted by oxlint, which is the practical fallback where typescript-eslint cannot load
**Confidence:** high
**Evidence:** a control planting an unused variable produced no output and exit 0; the linter's own config showed the rule was not enabled; a second control using `no-const-assign` produced a named error at the intended file and exit 1

A linter that prints nothing on success is indistinguishable from a linter that never looked at the directory — so a negative control is mandatory, not optional. But the control only proves something if the planted defect violates an **enabled** rule.

oxlint's default set is much smaller than eslint's. `no-unused-vars` and `eqeqeq` are commonly *not* enabled, so the obvious control — an unused variable — produces silence that looks exactly like the failure it was meant to exclude. The correct conclusion at that point is "my control is blind", not "the linter is clean".

Use `no-const-assign` or `no-debugger`: both are in oxlint's correctness defaults, both fire immediately, and both name the file so you can confirm the linter reached the directory you care about. Read the repo's lint config before choosing the control rather than after the control fails. The generalisation beyond oxlint: **a negative control is itself a measurement and can be wrong; verify the control fired before trusting what its silence means.**

## L4 — When an enum has a wire spelling and a stored spelling, a parser that returns `null` on a miss converts a mapping bug into a confident false statement

**Topics:** enums, postgres, postgrest, closed-sets, parsing, null-on-miss, false-negative
**Applies to:** any stack where a database enum is spelled differently from its API or UI representation — hyphen versus underscore, colon versus underscore, camel versus snake
**Confidence:** high
**Evidence:** two independent instances in one run — a display component whose union used underscores while its data source emitted hyphens, and a filter bar emitting stored spellings into a parser expecting wire spellings, which rejected 8 of 28 option values and rendered an unfiltered list under a "not recognised" banner

Two spellings of one enum is a normal and often unavoidable design: Postgres enums dislike colons, wire formats dislike underscores, and both spellings end up load-bearing. The danger is not the split; it is what the parser does when the two are crossed.

A `parse()` that returns `null` on an unrecognised value is the right shape for untrusted input — it refuses rather than guessing. But it means a **mapping bug is indistinguishable from absent data**, and renderers usually draw `null` as "not recorded". So a crossed spelling does not throw, does not log, and does not render blank: it renders a *positive claim that nothing was recorded* about a row that recorded something. That is worse than an error, because a reader acts on it.

Two defences, both cheap. Route every conversion through one exhaustive `Record<A, B>` so that adding a value to either side is a compile error rather than a runtime `null`. And where a `null` can mean either "absent" or "unmappable", make them **different states in the type**, not one — the same discipline as distinguishing "no value stored" from "a value was stored and could not be read". A green end-to-end test does not protect you here: the one in this run drove two filter values that happened to round-trip while two whole classes were broken.

## L5 — A static route segment beats a sibling dynamic `[id]` at request time in the Next.js App Router, and a clean build is not evidence of it

**Topics:** nextjs, app-router, routing, dynamic-segments, positive-control
**Applies to:** any Next.js App Router tree adding a `[param]` segment beside an existing static sibling — `/things/[id]` next to `/things/new`, `/things/unassigned`
**Confidence:** high
**Evidence:** with both segments present, `next build` listed them separately with no conflict; against a running server the static path returned its own page and contained zero occurrences of the dynamic route's marker, while a positive control request to an arbitrary id returned the dynamic page

Adding a detail route beside an existing static child is a routine change that people avoid out of uncertainty, because the framework documents dynamic segments without stating a precedence rule plainly. The static segment wins, so the existing page keeps working.

The method matters more than the fact. **A build that accepts both routes proves only that they do not conflict at build time; it says nothing about which one answers a request.** Establish it by starting the server and requesting the static path, with a marker string rendered only by the dynamic page so its absence is meaningful — and pair it with a positive control requesting an arbitrary id, so you know the dynamic route was actually live at the moment you observed the static one winning. Without that control, "the marker was absent" is equally consistent with the dynamic route being broken.
