# Fleet learnings — b0952e

**Run:** b0952e
**Project link:** [[Projects/Delivery Ledger]]
**Date:** 2026-08-19
**Cleared the bar:** 9 · **Routed:** 5 · **Held back:** 4 — all four over cap, none scrubbed: four TypeScript sources carried raw U+0000 bytes (a `\0` spelled as a literal byte) and compiled, type-checked and tested clean until an explicit source-hygiene test was written — **the accompanying claim that this made `grep` skip the files is withdrawn as unreproduced**, since `git grep` located the symbol in an affected file at the pre-fix commit; the real cause of the miss was searching for the module path rather than the imported symbol; Next 16 ignores `proxy.ts` at the repo root and writes its agent-rules block only on `next dev`; a Vercel SSO interstitial mimics the app's own security headers and `preload` is the tell; five specialists wrote mutation harnesses to one shared scratchpad path and one silently executed another's script.

---

## L1 — A Postgres CHECK constraint executes in the *caller's* role, so a function it calls must be granted to every role that writes the table

**Topics:** postgres, supabase, rls, grants, check-constraint, service-role, migrations
**Applies to:** any Postgres schema where a CHECK constraint calls a user-defined function, and the writing role is not the function's owner — the standard shape on Supabase, where applications write as `service_role`
**Confidence:** high
**Evidence:** reproduced the application's exact upsert as `service_role` and got `42501 permission denied for function gates_are_closed_set`; `has_function_privilege('service_role', 'app.<fn>(jsonb)', 'EXECUTE')` returned false; adding the single grant was the entire fix

A validation function referenced by a CHECK constraint is not evaluated with the definer's rights or the owner's. It runs as whoever issues the `INSERT`. So the common hardening idiom —

```sql
revoke execute on function app.some_validator(jsonb) from public, anon, authenticated;
```

— is only half a statement. Without a matching `grant execute … to <writer role>`, the table becomes silently unwritable by the application, and nothing says so at migration time. `CREATE`, `ALTER` and the migration itself all succeed. The failure appears later, at the first insert, as a permission error naming the *function* rather than the table, which reads like an unrelated problem.

**The mechanism, stated exactly, because the revoke is the half that bites.** `revoke execute … from public` does not merely decline to grant the writer role — it *removes* an EXECUTE privilege the writer role already held implicitly, because Postgres grants EXECUTE on new functions to `PUBLIC` by default and every role inherits from `PUBLIC`. On Supabase, `service_role` is **not** a member of `authenticated`, so naming `anon` and `authenticated` in the revoke list gives the false impression that the application's own role was spared. It was not: `public` in that list covers it. Any per-name revoke intended to close a function to the outside also closes it to the writer unless the writer is granted back by name.

On this run that pattern took out the product's primary data-intake endpoint completely, on every request, and the whole test suite was green while it did — because the unit tests never crossed the database boundary and the one probe that did was run in a role that could execute the function. The blast radius is worth knowing how to bound: query `pg_constraint` for CHECK expressions referencing your private schema, and cross-check each against `has_function_privilege` for the writing role. In this database exactly one CHECK called such a function, which is why exactly one table was dead.

The rule to carry: **whenever you revoke EXECUTE on a function in a migration, ask in the same breath which roles still need it, and grant those explicitly.** A `SECURITY DEFINER` trigger is the case that does *not* need the grant — a second unexecutable function in this same database was reached only through such a trigger and worked fine — so the distinction to check is whether the call site runs as the caller (CHECK constraints, generated columns, RLS policy expressions, plain function calls) or as the definer.

## L2 — Verify a write path in the role the write path uses; a SQL-console proof is not a product proof

**Topics:** supabase, postgres, verification, mcp, service-role, testing, false-green
**Applies to:** any verification of Supabase or Postgres behaviour performed through an admin console, `psql` as the owner, or the Supabase MCP `execute_sql` tool, when the application itself connects as a different role
**Confidence:** high
**Evidence:** a specialist proved idempotency with eight table-by-table checks and a negative control, all issued via `execute_sql`; the same statement through the application path failed 100% of the time. `execute_sql` runs as `postgres`, which owned the function the app's role could not execute

The Supabase MCP `execute_sql` tool, and any dashboard SQL editor, runs as a superuser-equivalent role that **owns** the objects in your schema. Applications connect as `service_role` or `authenticated`. Those two roles differ in exactly the dimension that grants, RLS and CHECK-constraint evaluation depend on — so a behaviour confirmed in the console can be, and here was, completely broken in the product.

What makes this hard to catch is that the console proof looks *more* rigorous than an HTTP probe: it inspects rows directly, it can check eight tables at once, and it can carry a negative control. All of that was true here, and the conclusion was still false of the shipping product. The specialist honestly listed "the route end-to-end with a real token" as unverified, but the idempotency table beside it read as settled, and that gap is where the critical defect lived.

Practical rule: **the last hop of any verification must be the one the product takes.** Issue a real HTTP request against a running server with a real credential, and assert on the response *and* on a row count that moves. Where you genuinely must verify in SQL, set the role explicitly (`set local role service_role;`) and state in your report which role you measured as — an unqualified "verified in SQL" should be read by whoever receives it as "verified as the owner", which is usually not the claim anyone wanted.

## L3 — PostgREST `.upsert()` cannot use a partial unique index, and the failure appears only on the second write

**Topics:** supabase, postgrest, postgres, upsert, idempotency, unique-index, 42P10
**Applies to:** any `supabase-js` `.upsert()` or PostgREST `on_conflict` targeting a table whose unique index carries a `WHERE` clause
**Confidence:** high
**Evidence:** both index forms measured against a live project; `ON CONFLICT (cols)` against a partial index raises `42P10`, and PostgREST's `on_conflict` parameter has no syntax for restating the index predicate. Replacing the partial indexes with plain ones fixed it and lost nothing, because `NULLS DISTINCT` already excluded the rows the predicate had been excluding

`ON CONFLICT (column_list)` needs to *infer* an index, and Postgres will not infer a partial one unless the statement repeats the index's `WHERE` predicate. Raw SQL can do that. PostgREST's `on_conflict=` query parameter carries a column list and nothing else, so through supabase-js there is no way to name the predicate — the upsert raises `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`.

The reason this is worth a note rather than a lookup is *when* it fails. The first insert into an empty table takes no conflict path at all and succeeds. The error appears only when a row already exists — which is to say, precisely and only in the idempotency case the upsert was written to handle. A test suite that posts once passes. A schema review passes: the index looks correct and its comment may even quote correct raw SQL. TypeScript compiles. The defect is invisible until a retry, a replay, or a second run of the same job.

Check for it directly: `select indexdef from pg_indexes where schemaname='public'` and look for `WHERE` on anything you upsert against. If the predicate exists only to exclude rows with NULLs in the key, a plain index with `NULLS DISTINCT` (the default) is usually an exact substitute.

## L4 — typescript-eslint cannot load under TypeScript 7, and pnpm 11 silently ignores `overrides` in both documented locations

**Topics:** typescript, eslint, typescript-eslint, pnpm, nextjs, oxlint, tooling
**Applies to:** any project pinning TypeScript 7.x that also wants `eslint-config-next`, and any pnpm 11 project relying on `overrides` to hold a second version of a package
**Confidence:** high
**Evidence:** `@typescript-eslint/parser` throws `Error: typescript-eslint does not support TS 7.0.` at `require` time, taking `eslint-config-next` with it; the documented side-by-side TS 6 workaround failed because pnpm 11.1.2 ignored `overrides` in both `pnpm-workspace.yaml` and `package.json`, and rewrote its own placeholder back over one attempt

typescript-eslint does not degrade under TypeScript 7 — it throws at module load, so the failure is not "some rules stop working" but "the entire ESLint config fails to import", and because `eslint-config-next` depends on it, every Next.js lint preset goes down with it. The usual escape is to install TypeScript 6 side by side and pin the linter to it. On pnpm 11 that escape did not work here: `overrides` was accepted without complaint and had no effect in either supported location, and an `ignoredBuiltDependencies` key was silently discarded and overwritten. **pnpm ignores keys it does not recognise rather than erroring**, so a config that looks applied may be inert — verify by behaviour, never by reading the file back.

The practical resolution was oxlint, which runs without a TypeScript program at all, alongside `tsc --noEmit` for real type coverage. That trade is worth stating explicitly wherever it is made: oxlint's ruleset is materially narrower than `eslint-config-next`, so it is a reduction in coverage, not an equivalent swap.

**Correction to an existing vault note.** `Knowledge/Next.js 16 + Tailwind v4 Build Gotchas.md`, entry #1's second correction (2026-08-06, run `cd414c`), states that `unrs-resolver` is not a build-script gate on Next 16.3.0 and that `sharp` is the only package tripping it. Measured here on `next@16.3.1` with pnpm 11.1.2, the inverse held: `ERR_PNPM_IGNORED_BUILDS: unrs-resolver@1.12.2`, and `sharp` never appeared. The earlier note is accurate about Next *alone* and wrong the moment `eslint-config-next` is in the tree, because the dependency path is `eslint-config-next → eslint-import-resolver-typescript → unrs-resolver` — which is every real Next project. That note should be amended to scope its claim to Next in isolation and to name `eslint-config-next` as the actual source.

## L5 — vitest 4 removed `--reporter=basic`, and a harness that still passes it reports zero detections while measuring its own crash

**Topics:** vitest, testing, mutation-testing, verification, false-green, tooling
**Applies to:** any script that shells out to `vitest` and interprets its exit code — mutation harnesses, coverage gates, CI wrappers — written against vitest 3 or earlier
**Confidence:** high
**Evidence:** a mutation harness reported `0/15 detected` on vitest 4.1.11; the runs were failing on the removed `--reporter=basic` flag before any test executed, so every mutation "survived" because nothing ran

`--reporter=basic` was removed in vitest 4 (the replacement is `--reporter=default --silent`). A harness that passes it gets a non-zero exit for the flag error, and any wrapper reading "non-zero means the tests failed / the mutation was caught" or its inverse will produce a confident, precise, entirely fabricated number.

The failure direction is the dangerous one. `0/15 detected` does not look like a broken tool; it looks like a devastating finding about the test suite, and it invites exactly the wrong follow-up work. The same shape recurs anywhere a verification harness treats a runner's exit code as a verdict without confirming the runner ran: **a harness must prove it can produce a red before its greens mean anything**, and it must distinguish "tests ran and passed" from "tests never started".

Two adjacent instances from the same run, both caught only by looking: a harness that reported per-mutation verdicts while silently failing to restore two mutated files (repaired by verifying every restore against a recorded `sha256`), and a negative control that exited 1 because the injected mutation was a *type* error, so the dev server never started and no assertion was ever evaluated. When you inject a fault to prove a check bites, make the fault type-safe, or you measure the compiler instead of the check.
