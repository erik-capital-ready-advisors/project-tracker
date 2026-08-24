# Fleet learnings — d4000f

**Run:** d4000f
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-24
**Cleared the bar:** 6 · **Routed:** 5 · **Held back:** 1 — over cap: an auth-gate failure signature that is byte-identical for "credential revoked" and "harness misconfigured" cannot establish either, so such a gate needs a discriminating reason string before any conclusion is drawn from it. Already captured as a project-level lesson; the general kernel restates a principle the vault covers.

---

## L1 — Widening a Postgres column to nullable is a type-level no-op wherever the app's row types are hand-written, and `tsc` reporting zero errors is evidence of that disconnection rather than of safety

**Topics:** postgres, supabase, typescript, nullability, migrations, generated-types, type-safety
**Applies to:** any TypeScript app over Supabase/Postgres where row-mapping functions declare their own interfaces instead of deriving from the generated `Tables<"…">` / `Database` types
**Confidence:** high
**Evidence:** after a migration made an enum column nullable, `tsc --noEmit` returned **0 errors** and a 1638-case suite stayed green. Running the real mapper with a control showed `fromExecutionMode(null) → "fleet"` against `fromExecutionMode("fleet") → "fleet"`; the return site reads `LOOKUP[String(value)] ?? "fleet"`, and `String(null)` is `"null"`, which is not a key.

A nullability change in the database propagates into application types only through the generated type file **and only if the application actually consumes it**. Hand-written row interfaces are a parallel, unversioned copy of the schema. When they exist, a `NOT NULL` → `NULL` widening changes the set of values arriving at runtime while changing nothing the compiler can see, so the type checker's silence after the migration is not a pass — it is the measurement that the two are disconnected.

The failure is worse than a plain type hole because of how these mappers are usually written. The idiomatic shape is `LOOKUP[String(value)] ?? SOME_DEFAULT`, and that default was chosen when the column could not be null. A new `null` therefore does not throw, does not log, and does not render blank — it silently becomes **the most common legacy value**, which is the one a reader is least likely to question. In this run the new state meant "planned, not yet started" and the default meant "being worked on by an automated fleet", so a row would have asserted the precise opposite of its own meaning. A sibling mapper in the same file defaulted to the codebase's explicit unknown sentinel and was safe, so the same file contained both the correct and incorrect handling of the identical situation.

**What to do differently.** After any migration that widens nullability, do not treat a clean `tsc` as verification — treat it as the trigger for a check. Grep for functions that map that column and call each one with `null`, with a known-good control alongside so the probe is provably not blind. Where a default is returned, ask whether it is a neutral unknown or a positive claim; a positive claim reached by `??` is a fabrication with no error path. The durable fix is deriving row types from the generated types so the compiler carries the change, but the immediate fix is a runtime probe, because the compiler has already told you it cannot help.

## L2 — jsdom does not implement `requestSubmit()`, so a React form-submit test can pass against a handler that never ran

**Topics:** jsdom, vitest, react, testing-library, forms, false-green, mutation-testing
**Applies to:** any React component test running under jsdom (vitest or jest) that triggers submission programmatically rather than through a click on a submit control
**Confidence:** high
**Evidence:** found by mutation testing during this run — a submit test was observed staying green after the submit handler was deliberately broken, and the cause was `requestSubmit()` being absent from jsdom rather than a defect in the assertion.

`HTMLFormElement.prototype.requestSubmit` is unimplemented in jsdom. Calling it does not throw a clear "not implemented" in every path, and a test that invokes it and then asserts on a spy or on resulting UI can pass while the submit pipeline never executed. The test is not weak — it is inert, and it reads exactly like a passing test of the real behaviour.

This belongs to a family worth recognising generally: jsdom implements the DOM API surface unevenly, and the gaps are concentrated in the newer imperative methods rather than in the old declarative ones. A test that drives a component through such a method inherits the gap silently, because the missing implementation produces no output.

**What to do differently.** Drive form submission through the control a person would use — a click on the submit button — rather than through `requestSubmit()`. More importantly, treat this as the standing argument for mutation-testing any new test that guards a side effect: break the handler the test exists to protect and confirm the test goes red. That single step distinguishes a real test from an inert one, and it is the only step that would have caught this. A test never observed failing is not known to be a test.

## L3 — A verification-access section duplicated in a resolved spec makes the security gate double-count boundaries and read a measured DEGRADED as a declared reachable

**Topics:** fleet, security-gate, spec-resolution, orchestration, false-green, tooling
**Applies to:** any fleet run whose orchestrator folds change requests into a resolved spec and adds its own Phase 0 measurements beside the declared sections
**Confidence:** high
**Evidence:** the gate printed `section 7c declares 4 boundary row(s)` against a spec whose real declaration held two, and reported the degraded boundary as `reachable`. Converting the measurement block from a markdown table into prose returned it to `2 boundary row(s)`, and the gate still passed.

The gate parses sections positionally by heading and scans the markdown tables beneath them for declaration keywords. It cannot distinguish a table that **declares** a posture from a table that **reports a measurement about** that posture — both are tables under the same heading with the same keywords in the same column position. Adding a measurement table therefore inflates the boundary count and, worse, lets a row whose measured state is "degraded" be counted as declared-reachable, because the declared value still appears in the row.

This inverts the section's purpose. Verification-access exists so a run knows before dispatch which surfaces it can actually observe; a parse that reports a degraded boundary as reachable produces exactly the false confidence the section was written to prevent, and it does so inside the artifact that is supposed to be the correction.

**What to do differently.** Keep declarations as tables and measurements as prose, in any spec section a gate parses. Where an orchestrator records what it measured against what was declared, write it as labelled paragraphs rather than a parallel table, and state in the artifact why the shape was chosen so a later editor does not tidy it back into a table. After folding a resolved spec, read the gate's **counts** rather than only its exit status — a gate that passes while reporting twice the expected number of rows is parsing something you did not intend it to.

## L4 — A worktree-isolated agent cannot run an end-to-end suite that needs gitignored environment files, so that verification belongs to the orchestrator post-merge

**Topics:** fleet, git-worktrees, playwright, e2e, env-files, orchestration, verification
**Applies to:** any fleet build where specialists work in `git worktree` isolation and the acceptance gate is an end-to-end suite requiring credentials or environment configuration held in a gitignored file
**Confidence:** high
**Evidence:** a specialist reported the suite unrunnable from its worktree because the environment file is gitignored and therefore absent, and the copy was refused by the permission system. It declined to run the suite against the shared checkout's already-running server. The orchestrator ran the same suite after merging and got a full pass.

A `git worktree` contains committed content only. Gitignored files — environment configuration, saved auth state, local fixtures — do not exist in it, by design and correctly. Any gate needing them is structurally unrunnable from inside a worktree, and no amount of care by the specialist changes that.

The dangerous part is the workaround that presents itself. A development server for the same project is frequently already running against the shared checkout, on a predictable port. A specialist can point its e2e run at that server, get a green result, and report it — but that green describes **the shared checkout's code, not the worktree's**, so it is a pass for a tree that does not contain the work being verified. It is indistinguishable in a report from a real pass. The orchestrator should also expect this and shut down any such server before dispatching, because leaving one up is an invitation.

**What to do differently.** Assign environment-dependent e2e verification to the orchestrator as a post-merge step and say so in the brief, rather than asking each unit for a result it cannot honestly produce. Instruct specialists to report it `NOT VERIFIED` with the reason instead of finding a way, and treat a unit that reports a green e2e from an isolated worktree as a finding to investigate rather than a unit that did well. Budget the post-merge run into the orchestrator's own verification pass.

## L5 — Read schema state from the newest migration touching an object, never from its `CREATE`; citing a superseding migration is not the same as reading it

**Topics:** postgres, migrations, supabase, schema-drift, evidence, orchestration
**Applies to:** any project whose schema is a directory of ordered migration files rather than a single declarative schema
**Confidence:** high
**Evidence:** an orchestrator-authored brief asserted a unique index was partial, quoting the `CREATE` from the original migration. A later migration had dropped and recreated it without the predicate, and that migration's own comment stated the change explicitly. The brief cited that later migration by filename in the same paragraph while stating the opposite conclusion, and a specialist caught it.

In a migration-based project, the `CREATE` statement is the object's **first** state, not its current one. Any later `DROP`/`CREATE`, `ALTER`, or replacement supersedes it, and a grep that stops at the first match of a table or index name lands on the definition most likely to be stale — the oldest one. The file ordering that makes migrations correct at apply time makes naive reading systematically wrong.

The specific trap worth naming: **citing a file is not reading it.** Mentioning a superseding migration as context while drawing the conclusion from the superseded one produces a claim that looks well-sourced and is wrong, and the citation makes it *less* likely a reviewer re-checks. This is the same shape as reading a code comment instead of the return site — the artifact describing the change is not the change.

**What to do differently.** When stating current schema state, grep every migration for the object name, take the **last** hit in apply order, and read it. Prefer reading the live object over any file — the catalog is the only authority, and one query settles it. When an orchestrator hands measured schema facts to specialists, mark which were read from the database and which from files, so a specialist knows which claims to re-verify. And when a specialist corrects the brief, record the correction with attribution rather than editing it away: a brief that was silently right differs from one that was caught being wrong, and only the second teaches anything.
