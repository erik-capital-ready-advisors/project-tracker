# QA report eb2490

**Run:** eb2490
**Unit:** qa1 · **Agent:** qa-reviewer
**Status:** BLOCKED
**Branch:** agent-build/2026-08-20-eb2490 (HEAD `8bb896b`)
**Reviewed against:** resolved spec `.fleet/resolved-spec-eb2490.md` (spec-approved.md + CR-001 + CR-002 + CR-003, folded) — **not** the base spec
**Critical:** 0 · **Important:** 3 · **Minor:** 9

## Verdict

**Nothing here must not ship, and I found no critical defect.** I re-ran all six gates and
reproduced the project-lead's numbers exactly; I independently confirmed neither gate file was
edited; and I verified every FR-86 security claim by measurement rather than accepting it — the
decrypt census really is 11 edges, reference resolution really projects no encrypted column,
`OPERATOR_ONLY_KINDS` really is derived rather than copied, and the security headers are observed
in a live response rather than read out of config.

The status is BLOCKED, not PASS, for one reason: **`pnpm gate:m27:e2e` — the ten crawl tests over
populated screens — could not run, and it is the check most likely to find a b0952e-class defect.**
Every loader, every decrypt edge and every resolution query on this branch is tested against
in-memory fakes; no unit held a database credential and neither did I. I closed as much of that gap
as is possible without one (below), and what remains needs Erik's `aal2` session.

Of the eight findings the units raised, **two are overstated and one is refuted**: the
evidence-scope collapse is contained and guarded, the `blocks` uuid defect cannot be reached by any
write path in the repository, and the `isoDay` timezone bug is real in the function but unreachable
through this schema. The one that is *worse* than reported is the money formatters.

## Spec coverage

| Requirement | Implemented | Evidence |
|---|---|---|
| FR-80 every rendered reference is navigable | yes | 74 `<EntityRef>` call sites across 18 files; engagement renders as a plain `next/link` per ruling 3 (see Q1 below) |
| FR-81 eight entities, eight detail views | yes | build emits all eight dynamic routes (41 total, was 33); all eight requested live and returned <500 — `e2e/qa1-detail-routes.spec.ts` 24/24 |
| FR-82 four relationships shown together | yes | `requirement-work-items/-tests/-defects/-releases` markers at `requirement-view.tsx:97-100`, rows at :222,:283,:381,:437 |
| FR-82 "nothing new is derived" | yes | `requirement.ts:1-5` imports and calls `indexCoverage`, `latestResults`, `loadShippedIndex`. No re-implementation |
| FR-83 dangling renders dangling, never a link | yes | `entity-ref.tsx` returns the bare span with no anchor; `id: string \| null` is required with no default, so a caller that never resolved cannot construct one. Tree-wide ancestry verified by `tests/qa1-fr83-no-ancestor-anchor.test.ts` (3/3, incl. positive control) |
| FR-84 filter state restored | yes | all 28 filter option values round-trip; control fires on exactly the 8 stored-spellings f5 found |
| FR-85 every detail view reports `unparsed` | yes | **observed**: exactly one `[data-verify-unit='unparsed-count']` on each of the eight routes, `data-verify-state="unknown"`, and **not** `0` |
| FR-86 no new agent-reachable decryption surface | yes | no `route.ts` added, no migration, no `security_invoker` view; resolution projects zero encrypted columns |
| FR-55 uncovered requirement links to its work item | yes | `engagement-coverage.tsx:178`; the nothing-implements-it case states `no work item claims to implement this` (`data-verify-unit="unimplemented-requirement"`) rather than rendering blank |
| FR-43 four evidence scopes never collapsed | yes (contained) | see Issue M3 — the split is real but guarded; f2 uses the hyphenated spelling correctly, f3 never renders one |

## Security posture review

**Reviewed against:** spec §7a (22 classification rows over 21 entities), with
`~/.claude/agents/security-baseline.md` as the floor. Each control below names its source.

**Table reconciliation.** This run added **no migration and no table** — `git diff 6210318..HEAD`
matches no `.sql` file. So lists 1 and 2 are unchanged from `b0952e` and there is nothing to
reconcile: **zero tables in the migration diff, zero unclassified, zero gaps.** The eight tables
this run *reads* are all classified in §7a.

| Table read by a new loader | Class per §7a | Treatment found on branch | Verdict |
|---|---|---|---|
| `work_item` | sensitive | `description`, `raw_status` decrypted server-side, operator-gated | MATCHES |
| `defect` | sensitive | `description` decrypted; `wont_fix_reason` also decrypted — **§7a is silent on it** (B13), baseline-sourced | MATCHES, debt named |
| `blocker` | sensitive | `description` decrypted server-side | MATCHES |
| `requirement` | sensitive | `text` decrypted; `ref`/`section` clear, matched by ref only | MATCHES |
| `open_question` | sensitive | `question`, `best_guess` decrypted; `answer` also — **§7a silent** (B13), baseline-sourced | MATCHES, debt named |
| `contract_milestone` | sensitive, **agents refused entirely** | `amount` always decrypted (FR-54), `notes` opt-in — **§7a silent on `notes`** (B13), baseline-sourced. Refusal enforced by the `agentScopedDb` runtime Proxy, not a compile-time cast | MATCHES |
| `external_wait` | personal | provider default; **zero decrypt calls** in the loader | MATCHES |
| `release` | internal | provider default; **zero decrypt calls** | MATCHES |

Tables in the migration diff but **not** in §7a: **none** — no migration was written.
Tables in §7a but not in the specialist's report: **none** — i1 reported per table, one row each.

**B29 decrypt-edge census, built from the diff rather than from i1's list.** I extracted every
`decryptProse`/`decryptOne` call in `src/lib/server/detail/` and resolved each to its columns:

`contract_milestone.amount`, `contract_milestone.notes`, `blocker.description`, `defect.description`,
`defect.wont_fix_reason`, `open_question.question`, `open_question.best_guess`, `open_question.answer`,
`requirement.text`, `work_item.description`, `work_item.raw_status` = **11 edges.**

That is exactly i1's claimed 11, and it is exactly the declared encrypted-column set minus
`work_session.summary`, which correctly has no detail view. **The list is complete; B29 was not
deepened quietly.** The three baseline-sourced columns are named above.

| Control | Observed | Verdict | Source |
|---|---|---|---|
| No new JSON route / agent-reachable surface | `git diff --name-status` matches no `route.ts`; build shows all 8 new routes are pages | PASS | §7a / FR-86 |
| `contract_milestone` refused to agents | in `AGENT_FORBIDDEN_TABLES`; `OPERATOR_ONLY_KINDS` derived by `.filter(isEntityKind)` at `entity-routes.ts:130` — **no second literal list** | PASS | §7a |
| Reference resolution decrypts nothing | all 8 `LOOKUP` column lists validated: `id, engagement_id` + one clear natural key each. Zero encrypted columns projected | PASS | FR-86 |
| Requirement view projects milestone `name` only | `requirement.ts:206` selects `id, engagement_id, name` — no `amount` | PASS | FR-86 |
| Operator gate on every read path | 10 exported read functions, **10** `await requireOperator()` calls — no ungated path | PASS | §7a |
| Auth boundary, **observed** | all 8 detail routes, unauthenticated: render `Sign in to read this screen.`, zero `[data-verify-unit='entity-detail']` | PASS | §7a |
| Security headers, **served** not just configured | HSTS `max-age=63072000; includeSubDomains` (no `preload`, so it is the app not the edge), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, and a real nonce CSP with `strict-dynamic` and **no `unsafe-inline`** | PASS | baseline |
| No `security_invoker` view (Q9 forbids) | zero SQL in diff | PASS | CR-003 Q9 |
| Certificate validation | zero matches for `NODE_TLS_REJECT_UNAUTHORIZED`, `rejectUnauthorized: false`, `--insecure` in the diff | PASS | CLAUDE.md |
| No secret in the diff | no literal key, no `NEXT_PUBLIC_` service-role, no fallback default | PASS | CLAUDE.md |
| `migration-grants.test.ts` (guards b0952e C1) | file **unchanged** on this branch and passing in the suite | PASS | measured |
| Dependencies added | **none** — `package.json` diff is empty | PASS | measured |
| `pnpm audit --audit-level=high` | `No known vulnerabilities found` | PASS | baseline |
| Rate limits | unchanged; no new endpoint to meter, no model call anywhere in the product | N/A | §7a |
| Deletion path / retention | unchanged by this run (M1.10's `purge_engagement`) | NOT IN SCOPE | §7a |

## Issues

### Critical

**None.**

### Important

1. **Two money formatters disagree, and one click moves between them** — `src/lib/registry-display.ts:57` (`formatAmount`) vs `src/lib/money-display.ts:44` (`money`)
   - What: same `contract_milestone.amount`, two shapes. Measured on identical input: `formatAmount(111,"USD")` → `$111.00`; `money(111,"USD")` → `111.00 USD`. They also disagree on thousands separators (`12,500.50` vs `12 500.50`, U+202F) and reverse the currency-code position for an unrecognised currency.
   - Why it matters: `/committed` renders `111.00 USD` and links each row via `<EntityRef kind="contract_milestone">` to `/milestones/[id]`, which renders `$111.00`. **This run created that adjacency** — before M2.7 the two screens were not one click apart. §7a calls this the studio's pricing model; two renderings of one amount is exactly the kind of thing that makes a reader check whether they are the same number.
   - Evidence: measured both functions on six inputs; call sites `committed-table.tsx:149`, `committed-totals.tsx:66`, `milestone-table.tsx:118`, `milestones/[id]/page.tsx:130`.
   - Fix: pick one and delete the other. `money-display.ts`'s docstring argues against `Intl` on hydration-mismatch grounds, but `registry-display.ts` pins `LOCALE = "en-US"`, which defuses that — so `formatAmount` is the one to keep.

2. **The four-state prose renderer has three mutually incompatible verification contracts** — five copies across eight views
   - What: `renderProse` (`milestones/_components/prose-value.tsx:49`), `<DetailProse>` (`requirements/_components/detail-prose.tsx:58`), and a byte-identical private `ProseValue` in each of work-item/defect/blocker detail views. They emit `data-verify-unit="prose"` vs `"detail-prose"`, and `data-verify-state` vs `data-verify-prose-state`. On milestones, `absent` emits **no attribute at all**.
   - **The hazard you asked about is REFUTED**: no copy collapses `unreadable` into `absent`. All five render the literal word `unreadable` in `text-state-blocked` with an explanatory title, and four units wrote regression tests for it (`tests/detail-{blocker,defect,milestone,open-question}.test.tsx`). Verified by rendering all five.
   - Why it matters anyway: no single selector covers all eight views, so any future check of "did this field render as unreadable" silently covers a subset. The copies have already drifted in three places *before* merge — `absent` reads `—` in four copies and `not recorded` in the fifth.
   - Evidence: all five rendered under RTL, output captured per state.
   - Fix: hoist one component into `src/components/` and give it one attribute contract. The boundary that caused this (no Wave C unit owning `src/components/`) is the project-lead's, as stated.

3. **`<EntityDetail identifier>` is optional, so forgetting it renders a positive falsehood** — `src/components/entity-detail.tsx:52,68`
   - What: `identifier?: string | null`. Both `null` and *omission* land in the `Absent` branch, whose title asserts `This <entity> carries no reference of its own.` There is no "don't render an identity slot" state.
   - Why it matters: the ninth detail view someone adds without the prop gets a false claim about the row, with a green type-check and no test catching it — nothing in either gate file asserts on `identifier`. Four views (not three) currently print their title twice to avoid it: `waits/[id]:95,98`, `milestones/[id]:136,139`, `releases/[id]:100,103`, `requirement-view.tsx:115,118`. Also `identifier=""` renders an invisible empty slot, unguarded.
   - Evidence: rendered with the prop omitted and with `null` — byte-identical DOM.
   - Fix: make the prop required and discriminated (`string | null | "none"`), so omission is a compile error.

### Minor

1. **`gate:m27:e2e` fails closed but names the wrong cause.** Without `M27_BASE_URL` it exits **1** (verified: real exit code 1, not a skip — the config only defines the project when it can run, which is the right design). But the message is `Project(s) "m27-gate" not found. Available projects: "chromium", "mobile"`, which reads as "the gate was deleted", not "set two env vars". Fix: a `playwright.config.ts` guard that throws a named error.
2. **`isoDay`/`isoMinute` render zone-less timestamps a day early east of UTC — real, but unreachable.** Reproduced exactly: at `TZ=Pacific/Kiritimati`, `isoDay("2026-09-01T00:00:00")` → `2026-08-31`; correct at UTC and UTC-7. **`isoMinute` has the same defect and nobody mentioned it.** Not reachable: a schema-wide sweep finds **no `timestamp without time zone` column** (one hit, inside a SQL comment), and the two wait-list columns that could supply one are pre-normalised by `toIsoDay`. Correction to f3's report: `formatDate` is in `registry-display.ts:91`, not `display-format.ts`. Fix cheaply by routing both through the `ZONELESS_TIMESTAMP` guard `formatDate` already has.
3. **The evidence-scope split is real but contained — finding 1 is not a live defect.** `EvidenceScopeChip` is consumed by only two files, both f1's, and f1 guarded it with an exhaustive `Record<EvidenceScope, StoredEvidenceScope>`. f2 passes the hyphenated value straight to `StateBadge`, which takes the hyphenated union — correct and type-checked. f3's three views never render an evidence scope. The residual risk is one layer down: `from-db.ts:33` is a `Record<string, EvidenceScope>`, not exhaustive against the Postgres enum, so a fifth enum value added by a future migration would silently become `null` → "no scope recorded". Today all four match exactly. Pre-existing M1.x code.
4. **`blocked.ts:266` mixes unit keys and uuids, but no write path can reach the bad state.** `item.unit ?? item.id` is real, and there is a second instance f4 did not name: `src/lib/server/waits/store.ts:420`. The resolver genuinely has no uuid branch, so a uuid *would* render dangling. But `external_wait_id` is written in exactly one place (`store.ts:213`), whose targets are selected by `.in("unit", ...)` with a `row.unit !== null` filter — a null-`unit` row can never carry one. Hand-mode rows never set it; `execution_mode: "external"` is written by no code path at all. Real dead code and a genuine two-key-space smell; **not a user-visible FR-83 false negative today.** f4's comment states the consequence as if it happens.
5. **`/questions/[id]` ships unreachable, and that was the right call.** Confirmed independently: zero foreign keys reference `open_question`, and the only `kind="open_question"` in `src/app/` is the detail view's own header. FR-81 names it and gate test 2 enumerates all eight, so building it is correct — but it should be recorded as a known-dead route so nobody later reports it as a regression.
6. **`work_item` has no uuid-based reference resolution.** `LOOKUP.work_item` matches on `(fleet_run_id, unit)` only. Every screen holding a work item by uuid must go through `readWorkItemRefs` instead. Correct as built; worth stating because it is the assumption minor 4 rests on.
7. **An eleventh `service_role` read surface, unnamed in the census.** f4's note is confirmed: `readRefResolution` is keyed by engagement **uuid** while every answer payload carries only a **slug**, so the five adopting screens each run an extra `engagement` read per render. It decrypts nothing and projects only `id, slug, client_name`, so it does not widen exposure — but it is a tenth-plus-one read surface that i1's count of 10 does not include.
8. **Design deviations — both queued, both defensible.** f5's monospace on milestone names and wait labels rides along with the `ident` utility that `<EntityRef>` uses and cannot be separated without a second class; f4's `/broken` label change replaces a bare 36-character uuid with `fallbackLabel`, which is ruling 2's agreed convention. Neither introduces a new colour: `KNOWN_COLLISIONS` in `tests/state-scale.test.ts` is still `[]`, still asserted exactly, and the file is unchanged on this branch. Fuchsia remains reserved for `unparsed`. Both stay queued until §5a is approved.
9. **`tests/m27-gate.test.ts` test 2 matches routes loosely.** `href.startsWith(pattern) && route.includes("[")` would accept a dynamic route whose prefix merely overlaps. It passes correctly today. Reported rather than touched, per the brief.

## Trajectory grading

| Unit | Specialist | Schema-before-query | Claims evidenced | Verify-after-edit | Unknowns researched | Boundaries escalated | Verdict |
|---|---|---|---|---|---|---|---|
| u1 | ui-designer | N/A (no DB code) | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| i1 | api-integrator | SOUND | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| f1 | ui-designer | N/A | SOUND | SOUND | SOUND (late) | SOUND | **SOUND** |
| f2 | ui-designer | N/A | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| f3 | ui-designer | N/A | SOUND | SOUND | SOUND (late) | SOUND | **SOUND** |
| f4 | ui-designer | N/A | SOUND | SOUND | SOUND | SOUND | **SOUND** |
| f5 | ui-designer | N/A | SOUND | SOUND | SOUND (late) | SOUND | **SOUND** |

**No fabricated claim was found in any of the seven reports.** Every quantitative number sampled —
test counts, suite totals, route counts, lint exits, mutation verdicts, e2e totals — traces to a
tool call with matching output. That is the headline of this section and it is the check nothing
else in the pipeline performs.

**i1's schema-before-query is genuinely clean.** Migration `20260819144331_schema_21_entities.sql`
read at tool 0010; `database.types.ts` column blocks at 0035–0036; first loader Write at 0042. No
query authored ahead of its columns. I re-validated the *product* of that independently: 65
`(table, column)` pairs plus all 8 `LOOKUP` column lists checked against `database.types.ts` —
**every column exists.** Since table and column names are passed as plain untyped strings, a typo
would have compiled and failed only at request time, which is the b0952e shape exactly.

**i1's surviving mutation — confirmed, and the fix is real, not cosmetic.** Trace: tool 0070 shows
`MUTATION 4 scoping … Tests 36 passed (36)` — survived, while all five siblings went red. Tools
0071–0072 edit `detail.test.ts`; tool 0073 re-runs and the same mutation now yields
`1 failed | 36 passed (37)`. **I re-applied that mutation myself** (byte snapshot, restored in a
`finally`, SHA verified identical afterwards): it now kills exactly `resolves the same ref to a
different row per engagement, in one batch`. Genuine fix.

**f3's blind lint control — confirmed.** Tool 0062 planted an unused variable and oxlint returned
nothing, exit 0; f3 correctly refused to conclude the linter was clean, dumped `.oxlintrc.json`,
and at 0064 planted a `no-const-assign` violation that fired with exit 1. That is the right
instinct, and I hit the same failure myself this run — my first filter round-trip check tested 0
values with a control that did not fire, and I discarded it rather than reporting it.

**Corrections to the dispatch brief's framing, on the evidence:**

- **"Every unit ran mutation testing" is not accurate — `u1` ran none.** No mutate script and no
  mutation appears in its transcript. u1's own report says none, so this is a summary error rather
  than a fabrication. The other six did, all restoring from byte snapshots (i1 `trap … EXIT`, f1/f5
  `finally`, f2 per-file restore, f4 four runs each ending `--- restored ---`, f3 a verified `cp`
  restore). **No mutation was left applied anywhere** — every final `git status` shows only intended
  files. f4 had **three** mutations survive, each fixed and re-killed.
- **f1 ran no ancestry command.** f2, f4 and f5 ran `git merge-base --is-ancestor a5f1504 HEAD`;
  f3 used `git cat-file -t` plus `git branch --contains` (containment, not strict ancestry of HEAD);
  f1 read adjacency off `git log --oneline -8`. The conclusion is true and visible in its output,
  but its report says "checked" where the trace shows "read off a log". The `a343cee` reading itself
  is correct: it is a `playwright.config.ts` fix from Erik's own session — gate *mechanics*, not a
  gate assertion.
- **f4's report-gate failure was externally caught, not self-caught.** The project-lead sent the
  verbatim gate failure mid-flight; f4 then read `report-gate.sh`, wrote the missing section, and
  re-ran the gate itself to `REPORT GATE PASS`. Real failure, real repair, real re-verification —
  worth recording accurately because a unit that catches its own gate failure and one that is told
  are different capabilities.
- **f1, f3 and f5 researched after implementing.** All three consulted vault knowledge notes only
  after the code was written, and for f3 and f5 after it was committed. Nothing they read changed
  the code and none used an unfamiliar API blind, so the verdict stays SOUND — but the research
  post-dates the decisions it was meant to inform. u1 is the counter-example, invoking
  `vercel:nextjs` and reading its notes *before* its first Write.

Traces: `/private/tmp/claude-501/-Users-erikmeltzer-Projects-project-tracker/04e0503a-dae3-45ca-9c43-02fa9936123a/tasks/a*.output` — all seven units identified and matched by the files they wrote; none left unverifiable.

## Verification performed

- **Build (pnpm):** PASS — exit 0, 0 errors, **41 routes** (was 33; all 8 new ones are pages, no `route.ts`)
- **Type-check:** PASS — exit 0, 0 errors
- **Lint (oxlint):** PASS — exit 0, 0 findings
- **`pnpm gate:m27`:** PASS — **5 passed / 5**, reproduced independently
- **Gate files unedited:** VERIFIED myself — `git diff 6210318 HEAD -- tests/m27-gate.test.ts e2e/m27-navigation.spec.ts` is empty, and `git log` shows `6210318` is the only commit that ever touched either
- **`pnpm test`:** PASS — 1343 passed / 6 skipped / 0 failed at the merged tip; **1346 / 6 / 0** with my 3 added tests
- **`pnpm e2e`:** PASS — 207 passed / 7 skipped at the tip; **255 passed / 7 skipped** with my 24 added (×2 projects)
- **`pnpm gate:m27:e2e`:** **NOT VERIFIED — requires `M27_BASE_URL` + `M27_STORAGE_STATE`, a live operator session at `aal2` that no agent holds.** Not faked, not stubbed, not pointed at an empty instance. What I *did* establish without a credential: it **fails closed with exit code 1** rather than skipping, because the config only defines the project when it can run. The "skipped gate and passing gate are the same colour" concern is honoured at the exit-code level. See Minor 1 for its misleading message.
- **Live route probes:** all 8 detail routes requested against `next dev` — all returned <500 and rendered their own `<title>`; the auth gate observed refusing each
- **Security headers:** observed in a live response (full block quoted in the posture table)
- **Schema validation:** 65 `(table, column)` pairs + 8 `LOOKUP` column lists checked against `database.types.ts` — all exist
- **Mutation re-test:** i1's engagement-scoping fix re-mutated by me; kills the intended test; file restored (SHA verified)
- **Filter round-trip:** 28/28 option values accepted; control fires on exactly 8 stored-spellings
- **One check of mine was blind, and is recorded rather than quietly rerun.** My *first* filter round-trip harness reported `option values tested: 0` and `all option values accepted`, and its control did not fire — it read the closed sets through property names they do not have and called `parseWorkItemQuery` with a `URLSearchParams` where the function takes a plain object. A green result from it would have been indistinguishable from a real one. I discarded it, found the real API shapes, and re-ran with a control that must fire; only the second run is reported above. This is the second blind control in this run after f3's, and the repository's own lesson — assume a scan is blind until a case you know is present also comes back non-zero — is what caught both.
- **`pnpm audit --audit-level=high`:** `No known vulnerabilities found`
- **Accessibility:** NOT RUN as a new sweep — `e2e/qa1-accessibility.spec.ts` from run `b0952e` passes within the 255. No new axe scan of the eight detail views; they are unpopulated without a credential, and scanning a sign-in prompt eight times would prove nothing.
- **Security checklist:** 14/16 items checked. Not checkable: rate limits (no new endpoint; nothing to trip) and deletion/retention (unchanged by this run).

## Infrastructure failures (not the fleet's fault)

- **No database credential and no `aal2` operator session available to any agent, including me.** This is the block. It makes `gate:m27:e2e` NOT VERIFIED and leaves every loader, decrypt edge and resolution query exercised only against in-memory fakes. Fix: Erik runs `pnpm gate:m27:e2e` with `M27_BASE_URL` and a `M27_STORAGE_STATE` captured from his own signed-in session.
- **No infrastructure *failure* otherwise observed.** No registry timeout, no rate limit, no sandbox crash, no missing binary, no `ERR_PNPM_IGNORED_BUILDS`. `node_modules` was present; no install was needed. Playwright browsers were present and ran.
- **No infrastructure artifact was committed.** No stray lockfile, no `pnpm-workspace.yaml` placeholder, no build output in the diff. `package.json` is unchanged.
- Port 3000 is held by VS Code, not a dev server; I used 3111/3112 and both are free again. **No dev server left running** — verified after each probe.

## Tests added

Both are credential-free, run in the existing suites, and stay in the branch.

- **`tests/qa1-fr83-no-ancestor-anchor.test.ts`** — FR-83 checked tree-wide. `<EntityRef>` guarantees no anchor *it* creates, but `closest("a")` walks the whole ancestry; an `<EntityRef>` inside an enclosing `<Link>` would put a dangling reference in an anchor with every existing component test still green. Scans all `src/**` for that nesting. Fails closed (asserts a non-empty file census first) and carries a positive control that must detect a planted offence. **3/3 passing; the repository is clean.**
- **`e2e/qa1-detail-routes.spec.ts`** — the eight detail routes requested for real: each responds <500 with its own title (nothing in the credential-free half of the repo previously *requested* a detail route), each refuses an anonymous caller with `Sign in to read this screen.` and zero `entity-detail` wrappers, and each renders exactly one unparsed count whose unknown state is not `0`. **24/24 passing.**

No dependency was added for either.

## Not reviewed

- **`pnpm gate:m27:e2e`'s ten crawl tests over populated screens** — the block. Named above.
- **Any behaviour requiring real rows**: decrypt-on-read producing actual plaintext, the `unreadable` state arising from a genuine decrypt failure, FR-82's four relationships rendering with real data, FR-84's filter restoration through a real browser round trip, and reference resolution against a real `engagement_id`. All are tested against fakes and all are unproven against Postgres.
- **Anything behind `aal2`.** Per this repo's own lesson, agent verification stops where an authenticator app begins. On run `b0952e` the first twelve lines a person touched held two defects that 966 tests could not see.
- **Milestones already Complete (M1.0–M1.9)** and **M1.10's carried items** — not this run's work. M1.10's end-user manual (§7b) remains NOT WRITTEN, deliberately, pending §5a approval.
- **M2.1–M2.6** — Not Started, out of scope.
- **Deferred units** — `copy`, `deploy`, `docs`, `research`. All four are deferred with stated reasons in the manifest; none is a defect.
- **Decisions already settled in `prod.md`** were not re-litigated. Ruling 3 (engagement as a plain link) is queued as a question rather than filed as an issue — see below.

## Question queued for Erik

**Q1 — FR-80 vs FR-81, the conflict the project-lead ruled on.** I was asked to second-guess it and
I think the ruling is **right**. FR-80 names "an engagement slug" as a navigable reference; FR-81's
eight kinds contain no `engagement`; gate test 1 asserts `ENTITY_KINDS` equals exactly those eight.
Making engagement a ninth kind would fail a gate written before dispatch, and an engagement already
has a detail view at `/registry/[slug]`. Rendering it as a plain `next/link` satisfies FR-80 in
substance at the cost of one inconsistency: an engagement reference that resolves to nothing gets no
dangling treatment, because plain links have none. That case is currently unreachable (slugs come
from the row being rendered), so it is a latent gap rather than a live one. **The two requirements
genuinely disagree and the spec should be amended to say which wins** — a one-line CR-004 noting
that FR-80's engagement is served by `/registry/[slug]` and is deliberately outside FR-81's closed
set would close it. Filed in `.fleet/questions-qa1-eb2490.jsonl`.
