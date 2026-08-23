# ui-designer report — u4

**Status:** DONE
**Run:** 29b583

## Summary

Added a sign-out control (B40) to the app shell's header, reachable on every route and at
every breakpoint, calling the browser Supabase client's `auth.signOut()` and redirecting to
`/sign-in`.

## Step-zero anomaly and orchestrator-authorised reset

My worktree (`/Users/erikmeltzer/Projects/project-tracker`, the main checkout — not an
isolated `.claude/worktrees/` path, unlike u1/u2/u3) was cut from `f629816`
(`origin/master`'s PR #1 merge commit), not from `agent-build/2026-08-23-29b583`. Step zero's
second precondition (`git log --oneline agent-build/2026-08-23-29b583..HEAD` must be empty)
printed that one commit, so I stopped without resetting or touching any file, and reported
both SHAs.

`project-lead` then sent a mid-task message authorising the reset on a containment proof:
`f629816` is not an ancestor of `4a90be8` only because this branch descends from the merge's
*source* branch (`b654279`) rather than through the merge node, `b654279` **is** an ancestor
of `4a90be8`, and `comm -23` over the two trees' file listings was empty — zero files in
`f629816` are absent from `4a90be8`. I independently re-ran all four commands myself before
proceeding (same results) rather than taking the report on trust. By the time I ran the
reset, the shared directory was already at `4a90be8` — the orchestrator, operating in the
same path, had applied it first; my own `git reset --hard` command was denied by the
permission classifier, but `git log --oneline -1` confirmed HEAD was already correctly at
`4a90be8` before I started writing code.

- Pre-reset HEAD: `f62981664cddfd07c89069166ece65b92abdffe7`
- Post-reset HEAD (confirmed independently): `4a90be8726c21fb73c868d7b2eb78487b54c2147`
  ("M2.7 follow-ups: hoist the prose renderer (B33), make /questions reachable (B36)")

**A second observation, not an anomaly to fix, just to record:** this path is shared with the
orchestrator rather than an isolated worktree. Partway through my work, commit `dcba416`
("B32: one money formatter, not two", u3) landed on this same branch while I was mid-task.
It touched none of my owned files, so it caused no conflict, but it does explain why my
measured test-count delta (below) is +9 against the number I actually observed pre-change,
not +6 (my own test count) against the `1391` quoted in the brief — `dcba416` added its own
tests to the tree between dispatch and my first `pnpm test` run.

## Files created / modified

- `src/components/sign-out-button.tsx` (created) — the sign-out control itself. **Flagged
  below: this file is presently committed inside `dcba416`, u3's commit, not attributed to
  u4.**
- `src/components/app-shell.tsx` (modified, uncommitted in the working tree) — mounts
  `SignOutButton` in the header, next to `ThemeToggle`
- `tests/sign-out-button.test.tsx` (created, untracked) — component tests

No other file was touched. `src/components/mobile-nav.tsx` and `src/components/main-nav.tsx`
were read but not modified (see Best-guess decisions).

## Cross-unit commit contamination — flagged for the orchestrator, not fixed by me

**`src/components/sign-out-button.tsx` is currently committed as part of `dcba416`
("B32: one money formatter, not two", u3's commit), not as its own u4 commit.** I discovered
this only after writing the file and running the verification suite — `git log --oneline --
src/components/sign-out-button.tsx` shows only `dcba416`, and `git show --stat dcba416` lists
it among u3's changed files even though u3's commit message, body, and every other listed
file are about the money-formatter consolidation (B32) and never mention B40 or a sign-out
control.

I verified the content is **not divergent** — `diff <(git show HEAD:src/components/sign-out-button.tsx) <the file on disk>` is empty, and the line count matches (85 lines) — so nothing was lost or altered. But the attribution is wrong: this is my file, authored for u4, swept into a different unit's commit.

The most likely mechanism, given what I observed: this unit's worktree is the **main
checkout itself** (`/Users/erikmeltzer/Projects/project-tracker`), not an isolated
`.claude/worktrees/` path the way u1/u2/u3 were provisioned (confirmed via `git worktree
list` during the step-zero investigation). u3 ran in its own isolated worktree and was then
merged into this shared path by a commit-producing step:  at the moment that step ran, my
already-written but not-yet-committed `sign-out-button.tsx` was sitting untracked in this
same directory, and a broad `git add` (`-A` or equivalent) during u3's merge/commit swept it
up alongside u3's actual changes. This is the same class of hazard this project's own
`CLAUDE.md` names for `.claude/worktrees/` (`git add -A` sweeping an unrelated worktree's
files into a commit) — except here the second "worktree" is this literal shared main
checkout being written to by two units at once.

I did not attempt to fix this myself — rewriting `dcba416`'s history, or moving the file into
a separate commit, is a merge/commit-log decision and `project-lead`'s stated job ("Does not
write product code — only manifests, checkpoints, and merge commits") is exactly this
responsibility, not mine. The file's content is correct and complete for B40 regardless of
which commit it currently lives in; what needs the orchestrator's attention is the commit
history now reading as though u3 built a sign-out control, and u4 (this unit) having nothing
of its own in the commit log yet beyond the pending `app-shell.tsx` wiring edit.

## What I built

`SignOutButton` is a small client component: a ghost icon button (`LogOut` from
`lucide-react`), matching `ThemeToggle`'s size, variant and density exactly. On click it
lazily constructs the browser Supabase client (`createClient()` from `@/lib/supabase/client`),
calls `.auth.signOut()`, and on success calls `router.replace("/sign-in")` +
`router.refresh()` — the same navigation pattern the MFA forms already use after their own
`signOut()` calls. On failure it surfaces an error state instead of navigating; if Supabase
is not configured at all (`createClient()` throws), it treats that as "nothing to sign out
of" and stays idle rather than crashing the shell.

It is mounted once, in `AppShell`'s header (`src/components/app-shell.tsx`), inside the
`ml-auto` flex group alongside `UnparsedCount` and `ThemeToggle`. The header has no
responsive-hide class in this file (only the sidebar `<aside>` does — `hidden md:block`), so
this single mount point is reachable on both desktop and mobile without a second copy in
`MobileNav`.

## Best-guess decisions

**Reused the underlying browser client factory, wrote a distinct `signOut` call — this was a
deliberate choice, not a default.** The MFA forms' `auth.signOut()` calls
(`src/app/sign-in/_components/mfa-enroll-form.tsx:156`,
`mfa-verify-form.tsx:108`) exist to abandon a half-finished sign-in and restart from the
password step; both are reached through the `/sign-in`-route-scoped `useSupabase()` hook
(`src/app/sign-in/_lib/use-supabase.ts`), which is colocated under that route's own `_lib`
for that screen's error-shape and is not meant to be imported app-wide. `SignOutButton`
instead calls `createClient()` directly from `@/lib/supabase/client` — the same underlying
factory every Supabase-authenticated surface in the app uses — inside its own click handler,
because its intent ("end a completed session") is different from the MFA forms' ("abandon
this one and start over"), even though both ultimately reach the same GoTrue endpoint.
Confidence: high — this was flagged in the brief as the substance of the unit, and reusing a
restart-flow call for a logout is exactly the class of mistake called out.

**Placement: `AppShell`'s header, not `main-nav.tsx`, not `mobile-nav.tsx`.** I did not cross
into `main-nav.tsx` — the control is not a navigation destination (no route, no `NavItem`),
so it does not belong in the list `MainNav` renders from `nav.ts`, and touching that file
risked the positional-index landmine u2 documented in five sibling pages for no benefit. I
also did not add anything to `mobile-nav.tsx`: the header (`app-shell.tsx`) already renders
unconditionally at every breakpoint — the `hidden md:block` class is on the sidebar `<aside>`
only, never on the `<header>` — so mounting once in the header already satisfies "reachable
on mobile too" without a second, duplicate control inside the `Sheet` drawer. Confidence:
medium-high. The brief listed `mobile-nav.tsx` as an owned file and flagged it as the likely
spot; I read it, and concluded the header already covers the requirement structurally rather
than by a CSS breakpoint I'd have to trust. If Erik wants a *second* affordance inside the
drawer for discoverability (rather than because the header one is unreachable), that is a
straightforward follow-up, not a defect in this unit.

**Rendered unconditionally, including on `/sign-in` itself.** `AppShell` wraps the root
layout for every route, `/sign-in` included (there is no route-group split and no
`sign-in/layout.tsx`), and neither `ThemeToggle` nor `UnparsedCount` conditions on auth
state — the shell's existing philosophy is that its own chrome does not care whether the
visitor is authenticated. I followed that precedent rather than adding a route check, which
would have been unrequested scope. Clicking it while unauthenticated is a harmless no-op:
`signOut()` on GoTrue with no active session, followed by a redirect to `/sign-in`, which is
already the current route. Confidence: medium. This is a defensible reading of "smallest
control consistent with the existing shell," but it is Erik's call whether the sign-in screen
should suppress it; queued as a question (see below) rather than blocking on it.

**No integration test for `AppShell` as a whole.** I unit-tested `SignOutButton` directly
(6 cases, plus one under `StrictMode`) and verified its placement in `app-shell.tsx` by
reading the source rather than writing a new AppShell-level render test — there is no
existing test that renders `AppShell` (it pulls in `CommandPalette`, `next-themes`, and the
full nav tree), and building that harness from scratch was more than this unit's scope
justified. Confidence: medium — a reviewer who wants the mobile-reachability claim proven by
a render assertion rather than by code inspection should treat that as a gap, not as
something I claimed to have covered.

**No dropdown/confirmation menu.** Spec §5a asks for minimal motion on a dashboard "opened
forty times a day" and a control matching `ThemeToggle`'s density. A single-click icon button
does that; a dropdown or confirm-dialog would have been an unrequested affordance for an
action that's already reversible by signing back in. Confidence: high.

## State contracts published (for qa-reviewer)

| Component | `data-verify-unit` | Attributes | Meaning |
|---|---|---|---|
| `sign-out-button.tsx` | `sign-out` | `data-verify-status` | `idle` / `pending` / `error` |

No session token, cookie value, or other credential is ever written to a `data-verify-*`
attribute or logged.

## Placeholder slots for copywriter

None — the control has no copy beyond `aria-label="Sign out"` / `title="Sign out"` (and the
error-state title "Sign out failed. Try again."), which is functional labeling rather than
marketing or UI copy, consistent with how `ThemeToggle`'s `aria-label` is handled in this
repo.

## Placeholder slots for ui-designer-v2 / api-integrator

None.

## Deviations from the approved design

§5a was supplied as design direction rather than a specific mockup — no `Approved design:`
URL or path was given (the spec file's line reads "NOT YET APPROVED", and `prod.md` records
the whole direction, not a specific screen, as approved as-is on 2026-08-22). There is
therefore no approved mockup to deviate from for this control. I built the smallest addition
consistent with the stated direction: matched `ThemeToggle`'s exact variant/size/icon
treatment, used the existing `border-border` header rhythm, added no motion beyond the
button's existing hover/press states already defined in `components/ui/button.tsx`, and
introduced no new color outside the existing `ghost` variant (no destructive-red treatment
for logout, since sign-out here is a routine, reversible action, not a hazard warning).

## Verification

Measured at my final commit state (branch `agent-build/2026-08-23-29b583`, working tree with
my changes on top of `dcba416`, which landed on this shared path mid-task — see the anomaly
section above for why the test count differs from the `1391` quoted at dispatch):

- Typecheck: **PASS** — `tsc --noEmit`, 0 errors
- Lint: **PASS** — `oxlint`, 0 issues
- Test: **PASS** — `pnpm test` → **1400 passed / 6 skipped** (98 files, 97 passed / 1 skipped).
  My new file (`tests/sign-out-button.test.tsx`) contributes exactly 6 of those; the
  remaining +3 relative to a naive `1391 + 6 = 1397` expectation come from `dcba416` (u3's
  B32 fix), which landed on this shared path between dispatch and my first test run.
- Gate: **PASS** — `pnpm gate:m27` → **5/5**, unchanged from baseline
- Build: **PASS** — `pnpm build` → exit 0, **42 routes** (recounted carefully — an
  initial `grep -c` pass under-counted at 41 due to a multi-byte box-drawing character; a
  full manual count of the route table confirms 42, matching the pre-change baseline exactly,
  as expected since this unit adds a component, not a route)

**End-to-end behaviour: `NOT VERIFIED — no agent can hold a session this run (§7c)`.** My
tests prove the control renders with the correct `data-verify-*` contract, is reachable in
the DOM at idle, calls `client.auth.signOut()` with no arguments, transitions through
`idle → pending → idle` on a mocked success (redirecting to `/sign-in` and calling
`router.refresh()`), transitions to an `error` state without navigating on a mocked failure,
and does not throw when Supabase is unconfigured. They **do not and cannot** prove that a
real GoTrue session is destroyed, that the session cookie is actually cleared in a real
browser, or — per B37 — that the cookie is even clearable if an earlier token refresh has
already rewritten it `HttpOnly`. I did not attempt to verify by signing in, per the brief.
If the B37 hazard has manifested in the deployed environment, this control would call
`signOut()`, receive no error back from GoTrue, and still leave a stale readable-turned-`HttpOnly`
cookie behind — that is a plausible outcome this unit cannot rule out, not a defect I found
and left unfixed. I made no change to cookie policy, added no `httpOnly` flag anywhere, and
did not move sign-out server-side.

## Questions queued

1 question queued, matching the `.jsonl` line count.

- `{"unit": "u4", "section": "5a. Design Direction / B40", "question": "Should the sign-out control be suppressed on /sign-in (and its /enroll, /verify sub-routes), or is it fine to render unconditionally in the header the way ThemeToggle and UnparsedCount already do?", "best_guess": "Render unconditionally, matching the shell's existing precedent of chrome that does not condition on auth state; clicking it pre-session is a harmless no-op.", "confidence": "med"}`

## Prior fleet learnings used

- Searched the vault for shadcn / Next.js / Supabase auth / sign-out / cookie notes relevant
  to this unit's surface (icon buttons, `auth.signOut()`, `createBrowserClient` cookie
  behaviour). Nothing came back specific to a sign-out control or this exact API shape beyond
  what `prod.md`'s own B37/B38 entries already state in-repo, which I treated as the
  authoritative, already-measured source for this run rather than re-deriving it. CONFIRMED
  in the sense that B37's described mechanism (`createBrowserClient` + non-`HttpOnly` cookie)
  matches what `src/lib/supabase/client.ts`'s own comment says about itself.
- `dispatching a researcher` lesson (queue an explicit output path) — not applicable; no
  researcher was dispatched for this unit, no unknown rose to that bar.

## Best-guess decisions

(See "Best-guess decisions" above — consolidated there rather than duplicated.)
