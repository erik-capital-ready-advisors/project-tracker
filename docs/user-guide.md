# Delivery Ledger: user guide

This ledger answers six questions about your delivery work: what is blocked, what you can start
next, what you committed to a client, what nothing has tested, what is waiting on you personally,
and what is broken. It also holds the records those answers are computed from.

One person uses this product. There are no teammates to invite, no roles to assign, and no
permissions to configure. Everything below is written for you as the only operator.

Everything in this guide describes what the screens did when someone opened them on
2026-08-23. Where a screen could not be opened, the section says so and marks itself
`UNVERIFIED`.

## Before you start

You need three things in hand:

- The address the ledger is served from.
- Your email address and password for it. There is no sign-up screen and no "forgot password"
  link. The account was created by hand in the Supabase project behind the ledger, and that is
  also where it gets repaired.
- The authenticator app holding the second factor for that account. A password alone will not
  get you in.

If any of the three is missing, stop here and sort it out first. Nothing in the ledger is
reachable without all three.

## Signing in

Open the ledger and you land on the sign-in screen. It says plainly what it is:

> This ledger has no public surface. The operator account is provisioned by hand, and a second
> factor is required.

Enter your email and password, then press **Sign in**. The screen repeats the warning underneath
the form: there is no account creation here and no self-service reset.

After the password you are asked for the six-digit code from your authenticator app. Enter it and
you arrive at the home screen.

**UNVERIFIED: the code-entry step and the authenticator setup step.** Nobody opened either screen
while writing this guide. Both refuse to render outside the moment they belong to. Signed out,
they bounce straight back to the sign-in form; already signed in and past the second factor, they
bounce to the home screen. Reaching the code-entry screen means being halfway through a sign-in
with a correct password, and reaching the setup screen means holding an account with no
authenticator attached yet. Neither state was available. The two sentences above describing what
you type there come from how the sign-in flow is built, not from watching it happen, so treat
them as a sketch and expect the wording on screen to differ.

If you try to open any ledger screen while signed out, it does not throw you to a login page.
It renders the screen frame with the data replaced by a notice: "Sign in to read this screen.
There is no public signup." Underneath, the counts read `unparsed count unavailable` and
`— work items`, with the line "Nothing was read, so nothing here is a statement about what the
ledger holds." A dash there means nobody looked, not that the answer is zero.

## Moving around

A sidebar sits on every screen. It splits into **The six answers** (Blocked, Next, Committed,
Untested, Bottleneck, Broken) and **Records** (Registry, Work items, Waits, Agent tokens, Export,
Questions). Click any of them to go there.

A badge at the top of the sidebar shows the unparsed count, currently **0 unparsed**. That number
counts records the ledger could not classify. Zero means everything it holds, it understood. When
it climbs, it is telling you something arrived in a shape the ledger does not recognise, and the
honest thing it does is say so rather than guess.

The sidebar also shows a **Jump to...** control marked `⌘K`, and it is the fastest way through the
product. Click it, or press ⌘K (Ctrl+K on Windows), and a search box opens over the screen. Type
any part of a screen's name and press Enter to go there.

It lists everything under the same two headings the sidebar uses — **The six answers** and
**Records** — with each destination's address beside it, so you can see where you are about to
land. Escape closes it and changes nothing.

> This control was broken until 2026-08-24 and earlier versions of this guide told you not to use
> it. It is fixed, and it is now covered by tests so it cannot break again unnoticed.

Most list screens carry filter controls across the top and an **Apply** button. Filters go into
the address of the page, so a filtered view is a link you can keep. Filtering Work items to
`blocked`, for example, narrowed the list from 20 rows to 5.

## The home screen

The home screen is a directory, not a dashboard. It lists the same twelve destinations as the
sidebar, each with the question it answers written underneath:

- **Blocked**: what is stopped, who owns it, and for how long?
- **Next**: what can be worked on right now with nothing in its way?
- **Committed**: what was promised to a client, for how much, and by when?
- **Untested**: which requirements has nothing independently proven?
- **Bottleneck**: what is waiting on Erik personally?
- **Broken**: what is defective or has regressed?

It shows no counts and no summary. Read it as a map, then click through.

## Blocked

Blocked groups everything stopped by owner. Today it shows **5 blocked work items** and
**1 open wait** across **2 owners**.

The top of the screen lists open external waits: what the wait is called, who owns it, when it
started, when it is expected back, and how long it has been sitting. The one open wait is
"§5a design approval", owned by the client, started 2026-08-20, with no expected-by date, waiting
3 days.

Below that, blocked work items appear in a table: the unit, its engagement, its type, what holds
it, its status, its disposition, and how long it has been stopped. Click any row to open the full
record.

Two columns repay attention. **Held by** names the thing doing the blocking. **Disposition** says
`carried` or `closed`: carried means the block is still live and travels to the next session,
closed means it has been dealt with. You can filter on both, plus by engagement and owner.

Where a date is missing the screen prints a dash rather than a guess.

## Next

Next lists work you could start today, with every dependency finished and no blocker or wait
holding it, nearest deadline first.

**This screen is empty, and that is correct rather than broken.** It says:

> Nothing is startable.

Underneath it accounts for the emptiness rather than leaving you to wonder: `0 held by a
dependency`, `0 held by a blocker or wait`, `0 status could not be classified`. All three are
zero because no work item currently sits in the `pending` state that this screen draws from.
Nothing you can do inside the product will put a row here. Rows appear when new work arrives
through ingest.

## Committed

Committed answers whether you may invoice. It totals **committed**, **billable**, **submitted**
and **paid** across the top, then lists contract milestones with due date, amount, state, how
much of the acceptance is covered, how much has shipped, and the invoice position.

The single milestone is "Phase 1 — ingest and the six answers", due 2026-08-22, state `open`,
covered `0/3`, shipped `0/3`, `not submitted`, `not paid`. All four totals read `$0.00`.

A **What these states mean** panel on the screen defines each state. Worth reading once, because
the distinctions carry money:

- **open**: not every acceptance requirement is covered. Nothing to send.
- **claimed**: covered only by tests whose certifier executed the work. A review request, not an
  invoice.
- **billable**: every acceptance requirement is covered by a passing test that somebody other
  than the builder certified.
- **contested**: billable, but an open critical defect stands against one of its acceptance
  requirements. Flagged, and never presented as clean.
- **covered**: a passing test proves the requirement. Says nothing about whether it is deployed.
- **shipped**: a release names the requirement. Built and deployed are different claims and the
  ledger keeps them apart.
- **regressed**: this acceptance requirement was covered and is not covered now.

Filter by engagement, by state, and by what it shipped to.

## Untested

Untested answers which requirements nothing has independently proven. For the delivery-ledger
engagement it reports **79 requirements**, **324 tests**, **0 mapped**, **0 covered**,
**0 unproven**, **79 uncovered**, and **0 self-certified tests**.

Read that carefully: 324 tests exist and none of them is tied to a requirement, so all 79
requirements sit uncovered. The screen states the consequence rather than softening it:

> Nothing passing names these. The work items beside each one claim to implement it.

Each row gives the requirement, its state, and the work items claiming to implement it. Some rows
read "no work item claims to implement this", which is a different and worse finding than an
untested one.

## Bottleneck

Bottleneck answers what is waiting on you personally, ranked by how much other work it would
release.

**This screen is empty, and that is correct rather than broken.** It says:

> Nothing is waiting on Erik.

with `0 Erik-owned items whose status could not be classified` underneath. No work item currently
carries you or an Erik-gate as its executor, so there is nothing to rank. As with Next, no action
inside the product will populate it. Rows arrive through ingest.

## Broken

Broken lists defects and regressions, grouped by severity. Today: **13 open, 0 regressed**, split
into 1 critical and the rest major or minor.

Each row shows the defect reference, its title, its status, why it is still open, the requirement
it violates, the work item fixing it, the tests naming it, and when it was reported. Many rows
read "no passing test names this defect", meaning nothing proves the fix.

**Read the notice at the top of this screen before you write a defect title.** It says a defect
title is the only part of a defect stored unencrypted, because the title is what this list is
made of. Keep it a short label such as "checkout 500s on submit". Reproduction detail, data
samples, and anything specific to a client belong in the description, which is encrypted at rest.
A client's name in a title is a client's name sitting in plain text.

Filter by engagement and by severity, including `unparsed` for defects whose severity the ledger
could not read.

## How the fleet's work gets into the ledger

You never type most of what is in here. When your autonomous fleet finishes a run it leaves
artifacts behind: a manifest of work units, a checkpoint, a QA report, and a queue of questions it
could not answer for itself. The ledger reads those files and turns them into work items,
blockers, requirements, defects, questions and test results.

Two settings on an engagement control this, both on the engagement form: the **fleet artifact
directory**, which is where the ledger looks for those files, and the **spec path**, which is
where it reads requirements from so that acceptance references resolve against real ones.

Ingest happens when an agent posts a run to the ledger using an agent token, not when you press
anything. There is no ingest button on any screen, by design. Your part is to keep the two paths
on the engagement correct and to watch the unparsed count.

The rule the ledger follows when reading an artifact is worth knowing, because it explains
results that look pedantic. Anything it cannot classify becomes `unparsed` rather than a guess,
and it says so on every screen. Where two artifacts disagree, it records both rather than
picking a winner. A blank in this product means nobody looked. It never means zero.

**UNVERIFIED: nobody ran an ingest while writing this guide.** Posting a run would have written
real rows into your ledger, so nobody did it. That ingest has succeeded before is visible in the
data, which holds one recorded fleet run and 20 work items derived from it. Whether it succeeds
today was not tested.

## Work items

Work items lists every piece of work across every engagement and all three execution modes:
**fleet** (your autonomous agents), **hand** (you prompting Claude on other stacks), and
**external** (waiting on somebody outside the studio). One list, deliberately, so you never merge
three lists in your head.

The screen paginates and reports **20 on this page** with **0 unparsed on this page**. Filters
cover engagement, mode, executor, status, disposition, evidence, and the reason something was not
automated. There is also a checkbox for items held by an external wait.

The **Evidence** filter is the one to learn. Its four values stay separate on purpose:
`observed live`, `observed elsewhere`, `asserted`, and `not verified`. An agent claiming it works
and somebody watching it work are different claims, and this filter refuses to collapse them.

A tab at the top switches between **All work items** and **Unassigned sessions**.

## Opening one work item

Click any work item to see everything recorded about it and everything referencing it.

The record opens with identity: engagement, execution mode, status, executor, work type, phase,
disposition, evidence scope, unautomated reason, and start and end dates. Then **Prose**, holding
the description and the raw status text the ledger captured, quoted rather than summarised. Then
**Run and stack**, naming the run, the branch, the run mode, and the verdict. Then two reference
blocks: **References out** (its blocker, its external wait, what it depends on, what it
implements) and **References in** (what it blocks).

The raw status text is the valuable part. On the work item for this very guide it runs to a
paragraph explaining why the unit was not dispatched on an earlier run, preserved word for word
instead of flattened into a status word.

Where a field has no value the screen prints a dash.

## Unassigned sessions

A recorded work session whose working directory matches no engagement lands here instead of being
thrown away, so you can attribute it later.

The queue is currently empty. It says:

> Nothing is waiting to be attributed.

and explains the consequence: every recorded session has an engagement. The tab beside the title
shows a count, currently `0`.

## Waits

Waits lists dependencies on people outside the studio. It shows **1 open** and **0 overdue**,
grouped by owner, with a checkbox to **Include resolved**.

Each wait shows its label, engagement, owner type, start date, expected-by date, how long it has
been waiting, and its resolution method. A **Resolve** button sits on each row.

**Declare a wait** opens a form. It explains the point of recording one: the delay then shows on
Blocked and moves the milestone's projected date. The form asks for engagement, owner, label,
owner type, start date, expected-by date, resolution method, probe target, what it blocks, and a
reason.

Three notes from the form itself:

- The label is the identity. Re-declaring the same label updates the existing wait instead of
  creating a second one.
- Leave **Expected by** blank if nobody has given you a date. Blank is honest; an invented date is
  not.
- Resolution method is `probe` or `manual`. Choose `manual` where nobody can check it
  programmatically. The form calls that the honest value.

**Nobody pressed Resolve or Declare wait while writing this guide.** Both write to your ledger.
The form contents above come from opening it and reading it, not from submitting it.

## Opening one wait

Click a wait to see it in full: engagement, owner, owner type, reason, start date, expected-by
date, resolved date, who resolved it, resolution method, and probe target. A final block lists the
work items the wait holds.

The screen notes that whether a wait is overdue gets decided once, on Waits, from the expected-by
date. It is not recomputed here. That is the pattern throughout the product: one place decides,
every other screen shows.

## The registry

The registry lists your engagements. Two exist: **delivery-ledger** and **Unassigned**, both
`active`.

The line at the top is the one to remember:

> Engagements and their contract milestones are the only records typed by hand. Everything else in
> the ledger is captured or derived.

Columns cover client, status, contract, stacks, database, hosting, and production. Unfilled
columns read `not recorded`. **Register engagement** starts a new one.

## One engagement

Click an engagement to get its contract milestones, its acceptance criteria, and its provisioning
identifiers.

**Contract milestones** lists each milestone with amount, due date, submitted date, paid date, and
its acceptance requirements. Each row carries **Dates** and **Edit** buttons, and **Add milestone**
sits above the table.

The **Dates** button opens a small panel for recording submitted and paid, each in one action,
independently of each other. Clearing a field empties it.

**Add milestone** opens a form asking for the milestone name, amount, currency, due date,
acceptance references, and notes. Two things it tells you: the amount is encrypted at rest and
stored per milestone rather than aggregated in SQL, and an acceptance reference naming a
requirement this engagement has not ingested gets saved and reported rather than rejected.

**Where the work lives** shows the repository, spec, fleet artifact directory, and stacks.
**Provisioning** shows five identifiers: database organisation, database project ref, hosting
team, hosting project, and production URL. Currently `0/5 recorded`. The screen warns that these
are identifiers and never secrets, and that the database refuses a value shaped like a key or a
token.

**Watch the amount column.** On this engagement the milestone amount displays as `unreadable`,
and the screen adds: "One milestone amount could not be read and contributes nothing to these
totals — it is not zero." That is the ledger refusing to invent a number it could not decrypt.
Opening that same milestone on its own screen shows the amount as `not recorded` instead. The two
screens disagree about the same value, and neither is a number you should invoice from.

**Archive and deletion** sits at the bottom with two buttons, **Archive** and
**Delete permanently**, under the line "Archive it first, that step is reversible and this one is
not."

Archive was pressed and reversed while writing this guide. Archiving flips the engagement to
`archived` and replaces the button with **Restore from archive**; pressing that returns it to
`active` with every count intact. Archiving is safe and undoable.

**Delete permanently was not pressed and has never been run against real records.** See "What
this does not do yet".

## Registering an engagement

**Register engagement** opens a form in three parts.

**Engagement** takes the client name and the slug, both required. The client name is the display
and grouping key everywhere else. The slug is the URL key and takes lowercase letters, digits and
single hyphens. Status, contract type and how the work arrived are free text, deliberately not
fixed lists.

**Where the work lives** takes the repository path, the spec path, the fleet artifact directory,
and the stacks. These are the paths ingest reads. Stacks accept commas or newlines and duplicates
get dropped.

**Provisioning identifiers** takes the database organisation, database project ref, hosting team,
hosting project, and production URL, so that a wrong-account mistake is one lookup instead of an
incident. The production URL must begin with `https://`.

Submitting with the required fields empty stops on the form and marks them. Submitting with a
production URL of `http://insecure.example` returned **Not saved** and the message
"`productionUrl` must begin with https://.", with nothing written. The form's own promise holds:
nothing is saved unless the whole thing succeeds.

No engagement was created while writing this guide. The two failures above were exercised
deliberately; the success path was not.

## Editing an engagement

**Edit** on an engagement opens the same three-part form, pre-filled, with the button reading
**Save engagement** instead of Register. Every field and every rule matches the registration form,
including the `https://` requirement and the refusal of anything shaped like a credential.

Nobody saved an edit while writing this guide, since that would change your records.

## One contract milestone

Click a milestone to see what it is worth, when it is due, and which requirements make up its
acceptance. It shows engagement, amount, currency, due date, submitted date, paid date, notes,
and the acceptance requirement references.

The screen says outright that whether the milestone is open, claimed or billable gets decided
once, on Committed, and not recomputed here, "because two answers to 'may I invoice this' is one
answer too many."

Note the amount disagreement described under "One engagement": this screen showed `not recorded`
for a milestone the engagement screen showed as `unreadable`.

## One requirement

A requirement's screen gathers everything recorded against it: what implements it, what tests it,
what violates it, and where it shipped.

It opens with the requirement text, its coverage state, and whether it has shipped. Then four
blocks: **Implemented by** (work items with unit, status and executor), **Tested by**,
**Violated by** (defects with title, severity and status), and **Shipped in** (releases naming
it). A final block, **Contract acceptance**, names the contract milestones whose acceptance
criteria reference it.

Two deliberate refusals show up here. Tests appear as text rather than links, because a test has
no detail screen and the product will not build a link it cannot honour. And Contract acceptance
shows names only, with no amount, because agent tokens are refused contract amounts entirely.

Where nothing tests a requirement, the screen says so and then says what that means: "Nothing has
been claimed about it either way." An absence of evidence, recorded as an absence.

## One defect

A defect's screen holds everything recorded about it and what it points at.

Identity covers engagement, status, severity, how it was graded, its source, when it was reported
and by whom. **Prose** holds the full description, which on a real defect runs to several
paragraphs of what broke, why it mattered, the evidence, the measured blast radius, and the fix.
It is quoted whole rather than summarised.

**References out** links the requirement it violates and the work item fixing it, then lists
**Tests naming this defect**. On the defect inspected here that block read "No test in this
engagement names this defect's reference", which is the ledger saying nothing proves the fix,
even though the status reads `fixed`.

A **Won't-fix reason** field appears for defects that will not be fixed.

Remember the title rule from Broken: the title is stored unencrypted, the description is
encrypted at rest.

## One blocker

A blocker's screen says what the blocker is, who owns it, and what it is holding.

It shows engagement, owner, disposition, opened date and resolved date, then the description in
full, then **What this is holding**.

Blockers have no listing screen of their own. You reach one by following a reference from a work
item or another record that names it. Get there through Blocked and the records it links to.

## Releases

A release records what shipped, into which environments, and which requirements it names. Other
screens read from releases: **Shipped in** on a requirement, and the shipped column on Committed.
The product keeps "covered by a passing test" and "deployed" as separate claims and never merges
them.

**UNVERIFIED: nobody opened a release screen.** No release exists to open. The export reports the
release table holding **0 rows**, and asking for a release by an id that does not exist returns a
not-found page, which is the correct behaviour and tells you nothing about the screen itself.
Everything in the paragraph above comes from how other screens describe releases, not from
watching a release render. Expect to discover its real layout the first time a release lands.

## Questions

Questions lists every question your fleet queued for you, answered or not. It currently shows
**96 open** and **4 with unclassified confidence**.

Each row gives the question, its engagement, the confidence the asking agent attached, its status,
who answered it, and when. Titles carry the run, the unit, and the spec section, so
`b0952e:c1 §FR-58 shell badge at 375px` tells you the run, the unit that asked, and what it was
reading.

A confidence of `unparsed` means the ledger could not read the confidence the agent recorded. It
is not a low-confidence question; it is a question whose confidence nobody knows.

**Include answered** adds resolved questions to the list.

96 open questions is a real number and worth pausing on. Each one is a point where an agent could
not get an answer, guessed, and carried on.

## Opening one question

Click a question to see what it asked, what it assumed in the meantime, and what was decided.

The screen shows the full question text, then a **Best guess** block, then the answer, who gave
it, when, and the status. A final block traces where the question came from: the work item, the
run, the unit, the spec section, the engagement, and the source key.

The **Best guess** block is the one that matters, and the screen explains why it sits beside the
question rather than behind it: it is what shipped if nobody answered. On an open question, the
best guess is the decision that is live in your code right now.

## Agent tokens

This screen lists the credentials your agents use to read and write the ledger. It shows
**4 tokens** with label, capabilities, status, expiry, last used, created date, and **Rotate** and
**Revoke** buttons. Revoked tokens stay listed and marked `kept for audit`.

Two capabilities exist. `answer:read` reads the six answer endpoints. `ingest:write` posts
artifacts, sessions and waits. The screen states that neither reaches contract amounts, on the
grounds that an agent has no reason to read what a client is charged.

**Issue a token** opens a form taking a label, the capabilities, and an expiry date. Read its
warning before you start:

> The token value is shown once, on the next screen, and is stored only as a hash. Have a
> destination for it before continuing.

Once only. Nobody can recover it afterwards, including you, because the ledger keeps a hash and
not the token. If you lose it, issue a new one and revoke the old.

The form also says tokens expire, and to rotate before the expiry date rather than after it.

**Nobody issued, rotated or revoked a token while writing this guide.** Issuing one produces a
live credential and adds a row to your ledger. The description above comes from opening the form
and reading it. The one-time reveal screen was not seen and is not described here.

## Getting your data out

Export writes every record into one file, for the day this system is not here. It reports
**1125 rows across 21 tables**, read in a single database operation so that no row limit can
truncate it, and lists the row count per table.

**Download export** produces a file named for the ledger and the moment you took it, such as
`delivery-ledger-export-2026-08-23T20-57-07Z.json`. The one taken while writing this guide came
to about 531 KB.

**The file is decrypted, and the screen tells you so in bold.** The twelve encrypted columns,
including contract amounts, client prose, blocker and defect descriptions, and open questions,
come out readable. The screen defends that choice: an export exists so this system is not a single
point of failure, and ciphertext whose key died with the project is not a record of anything. The
consequence is yours to manage. Treat the file exactly the way you treat the database. It belongs
in the same places the database credentials belong and nowhere else.

Two things the export withholds, named on the screen rather than dropped in silence:

- **Agent token hashes.** Every other column of that table is included. The hash reads back as
  nothing useful and would be an offline cracking target sitting in a file.
- **Rate limiting counters.** Throttling state that means nothing an hour later and describes no
  client and no delivery.

On deletion: archiving an engagement is reversible and works. Permanent deletion is offered on the
engagement screen and destroys the engagement's work items, blockers, requirements, contract
milestones and questions. It stops at the audit boundary, so the audit log survives a deletion by
design. Read the next section before you use it.

## Fleet runs

Fleet runs lists every autonomous build run that has been read into the ledger, across every
engagement, newest first. Each row states what that run claimed about itself — nothing on this
screen is the product's own opinion of how a run went.

Today it holds **1 run**, `b0952e`, and the line above the table says so. Beside it, **1 reported
no test counts**: an accounting of what the record is missing, printed rather than left for you to
notice.

The table carries nine columns — run, engagement, branch, mode, verdict, duration, dispatches,
tests passed / failed / skipped, and unparsed. It is wider than most windows; scroll it sideways
to reach the last column. Click a run id to open it.

Three columns are worth reading carefully, because each one can say "I don't know" and each says it
differently:

- **Verdict** is the word the run recorded for itself. `b0952e` reads `unparsed`, and underneath,
  *one source, uncorroborated*. The ledger stores a single verdict column, so nothing here confirms
  the word and nothing contradicts it.
- **Dispatches** reads `not recorded`, and a note under the table explains that it always will:
  the columns exist but nothing in this product writes them. The screen prints `not recorded`
  rather than `0 of 0`, which would state a cap no run ever ran under.
- **Unparsed** is that run's own count of what could not be classified. It is not the badge in the
  top bar — see the next section.

**There is no engagement filter, and that is deliberate rather than missing.** This screen is
cross-engagement by design. A filter was proposed and is not approved, so a question was queued
instead of a control built.

## Opening one fleet run

Clicking a run opens everything that run recorded. The heading is the run id itself, with
**← All runs** to go back.

**The first line is the run's own unparsed count, and it will not always match the badge in the top
bar.** Opening `b0952e` reads **1 unparsed in this run**, broken down as `0 work units`, `0 gate
outcomes`, and *the run's own verdict* — while the top bar reads `0`. Both are correct. The badge
counts the ledger's three record tables; this line counts one run, and this run's unparsed item is
its own verdict word, which the badge never looks at.

Directly beneath, the screen names what it deliberately left out of that total: defects and test
results cannot be narrowed to a run, because nothing in the record connects one to a run. It says
their absence is a limit of the record and not a clean result.

The rest of the screen is six blocks:

- **Run** — engagement, branch, mode, verdict, started, ended, duration, dispatches, tests
  reported. For `b0952e`: branch `agent-build/2026-08-19-b0952e`, mode `full`, duration `0m`,
  dispatches *never recorded*, tests *no counts stated*.
- **Gates** — what the run reported passing. One row here: `build_after_phase1`, `PASS`.
- **Work units** — every unit the run dispatched, **20 of them, listed in full**, with type, mode,
  executor, status, disposition, evidence and counts. Units read `done` or `blocked`; one,
  `i9p2`, reads `unassigned` and **NOT DISPATCHED**, which is the record stating that the unit was
  planned and never ran.
- **Questions queued** — **96 questions**, also listed in full and never truncated, each with the
  spec section it came from and its confidence.
- **Defects** — this block answers with a gap rather than a list. It says *which defects this run
  opened is not recorded*, and explains why: nothing connects a defect to the run that opened it.
  An empty list here would claim the run opened none, and nothing checked that. Below it, **Fixed
  by this run's work** shows the one run-to-defect connection the record does hold, which answers a
  different question and is empty today.
- **Requirements touched** — **74 requirements**, every one resolving to a stored record.

If you follow a link or type an id that no run carries, you get the product's **Not found** page —
"That route does not exist in this build" — rather than an empty run.

**One screen here was not seen while writing this guide, and is UNVERIFIED.** Run ids are unique
only within an engagement, so two engagements could one day hold the same id. The product builds a
screen for that case which lists every match and picks none. It cannot appear on today's data — one
run, and nothing to collide with — so it is described here from the build and not from observation.

## What this does not do yet

Every item here was measured, not guessed.

**Next and Bottleneck are empty, and you cannot fill them from inside the product.** No work item
holds the `pending` status that Next draws from, and none carries you or an Erik-gate as its
executor, which is what Bottleneck ranks. Both screens explain their own emptiness with
zero-counts rather than showing a blank. Rows arrive through fleet ingest. Nothing you click will
put one there.

**Permanent deletion has never been run against real records.** The button exists on the engagement
screen and the code behind it is written. Nobody has destroyed real rows with it, so its behaviour
at the moment it runs is unproven, including how completely it cascades and how it behaves at the
audit boundary it is supposed to stop at. Archive instead, which was tested and reverses cleanly.
If you need a permanent deletion, take an export first.

**Signing out is UNVERIFIED.** The control exists. Nobody pressed it, because pressing it would
have destroyed the signed-in session this guide was written from. Assume it ends your session and
returns you to sign-in, and confirm it yourself the first time.

**One milestone amount will not decrypt, and two screens disagree about it.** The engagement
screen shows `unreadable` and excludes it from every total, with a note saying it is not zero. The
milestone's own screen shows `not recorded`. Both totals on Committed read `$0.00` while a
milestone with an unreadable amount exists. Do not invoice from those totals until this is
resolved.

**Nothing tests anything, by the ledger's own count.** Untested reports 79 requirements, 324
tests, and 0 mapped. Broken shows 13 open defects, several marked `fixed` with "no passing test
names this defect" beside them. The ledger is reporting this correctly. It is your delivery state
that the report describes, not a fault in the reporting.

**96 questions are open.** Each carries a best guess that shipped unanswered.

**A reference that points at nothing renders as an ordinary link.** It gets no visual warning to
tell you it is dangling, so a reference that looks navigable may not lead anywhere useful.

**There is no self-service account recovery.** No password reset, no recovery codes for the
authenticator, no way back in from this product if you lose the second factor. Recovery happens in
the Supabase project behind the ledger. If you have not confirmed you can still get in there, do
that before you need to.

**Contract amounts are encrypted at rest; defect titles are not.** Encryption here means specific
columns, not a blanket promise. Anything you type into a defect title is stored in plain text.

## When something looks wrong

**A screen shows "This page couldn't load".** Something crashed in the browser. Press Reload.
Nothing was written — this message means a screen failed to draw, never that data was lost. Note
what you clicked and tell Erik, because there is no longer a known control that does this: the
command palette used to, and that was fixed on 2026-08-24.

**A screen shows "Sign in to read this screen".** Your session ended. Sign in again. The counts
beside it will read `unparsed count unavailable` and the rows will be dashes; that is the ledger
declining to make claims about data it did not read, not an empty ledger.

**The unparsed count is above zero.** Something arrived in a shape the ledger does not recognise
and it is telling you rather than guessing. Go to the screen for that record type and filter on
`unparsed` to see which rows. This is information, not damage. The fix is to teach the ledger the
shape, which is work for Erik and never a matter of loosening a rule until the row classifies.

**A value reads `not recorded`, `unreadable`, or a dash.** These mean three different things.
`not recorded` means nobody entered it. `unreadable` means the ledger holds a value it could not
decrypt, and it will refuse to include it in any total. A dash means nobody looked. None of the
three means zero, and the product will not turn any of them into zero for you.

**A count reads zero and you expected rows.** Check whether a filter is still applied; filters
persist in the address of the page, so a filtered view can be bookmarked or arrive by link. Press
Apply with the filters cleared.

**Next or Bottleneck is empty.** Expected. See the section above.

**An amount looks wrong on Committed.** Read the engagement screen for a note about an unreadable
amount. A milestone whose amount will not decrypt contributes nothing to the totals, so a total
can read `$0.00` while real money is committed.

**An agent gets 401 or cannot write.** Check Agent tokens for that token's status and expiry.
Revoked tokens stay listed for audit, so a revoked token still appears in the table. Confirm it
reads `active` and has not passed its expiry date.

**Stop and contact Erik** when you are about to press **Delete permanently**, when a screen you
reached from the sidebar crashes, when the unparsed count rises and you cannot see why, or when a
milestone amount will not decrypt. None of these is a thing to work around. All four mean
something needs fixing rather than avoiding.
