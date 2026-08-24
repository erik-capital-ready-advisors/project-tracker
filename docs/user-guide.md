# Delivery Ledger: user guide

This ledger answers six questions about your delivery work: what is blocked, what you can start
next, what you committed to a client, what nothing has tested, what is waiting on you personally,
and what is broken. It also holds the records those answers are computed from.

One person uses this product. There are no teammates to invite, no roles to assign, and no
permissions to configure. Everything below is written for you as the only operator.

Everything in this guide describes what the screens did when someone opened them. They were last
opened and re-checked on 2026-08-24, after the engagement filter and hand-entered planned work
were added. Where a screen could not be opened, the section says so and marks itself
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
Questions, Fleet runs). Click any of them to go there.

A badge at the top of the sidebar shows the unparsed count, currently **0 unparsed**. That number
counts records the ledger could not classify. Zero means everything it holds, it understood. When
it climbs, it is telling you something arrived in a shape the ledger does not recognise, and the
honest thing it does is say so rather than guess.

Beside that badge sits a dropdown listing your engagements. It narrows every list in the product
to one client, and it has a section of its own below.

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

## Filtering by engagement

Every list shows every engagement at once, and that stays the default. When you want one client's
slice, one control does it, and it sits in the top bar beside the unparsed count instead of being
repeated on every screen.

Choose an engagement from the dropdown and press the filter button beside it. Eleven screens
honour the choice: Blocked, Next, Committed, Untested, Bottleneck, Broken, Work items, Questions,
Waits, Fleet runs and Registry.

Nothing else does. Open a single work item, wait, defect, milestone, requirement or run and the
dropdown is gone from the top bar, because a record you are already looking at cannot be narrowed
any further.

**The filter lives in the address of the page and nowhere else.** Pick an engagement and the
address gains `?engagement=acme`; clear it and the address goes back to the bare screen name.
No cookie sits behind it and nothing remembers your last choice, so nothing is still filtered when
you come back tomorrow. Two consequences, and both are why it works this way:

- A filtered view is a link. Copy the address out of the browser and it opens filtered for
  whoever you send it to.
- A screen is never secretly filtered. If the address does not name an engagement, you are
  looking at the whole ledger.

The dropdown offers your **active** engagements. An archived one is not in the list, but a link
naming it still works: paste an address carrying an archived engagement's slug and it resolves and
filters exactly as it did before. Tidying an engagement away does not rot the links you already
sent. When the address names something the list does not carry, the dropdown shows it as
`acme — not in the active list` instead of snapping back to "every engagement" while the screen
below shows something else.

Filters you already set survive it. Applying an engagement on top of `?severity=critical` keeps
the severity. The page number is the one exception and resets to the first page, because staying
on page seven of a list that just got shorter shows an empty page that reads like an empty ledger.

### The unparsed count does not follow the filter

This looks like a bug and is not. With a filter on, the badge in the top bar still counts the
**whole ledger**, and it says so:

> 3 unparsed (whole ledger)

The count is left alone on purpose. `unparsed` means the ledger could not classify a record, which
is a fact about the ledger and not about the client you are looking at. Had the number shrunk when
you picked an engagement, you could walk away believing a problem had gone when all you did was
look elsewhere. The `(whole ledger)` note is what stops a ledger-wide number being read as a
scoped one. It shows only while a filter is on; otherwise the badge reads `0 unparsed` and nothing
more.

### When the address names an engagement that does not exist

Mistype a slug and the screen does not quietly show you everything instead. It shows no rows, and
it says which of two different things happened.

If nothing in the ledger carries that slug:

> No engagement has the slug `acme`.
>
> Empty because nothing matched the slug, not because that engagement has nothing in it.

Read the second sentence. An empty list under a filter is ambiguous on its own — the engagement
could be quiet, or the name could be wrong — and that line is the screen telling you which.

If instead the engagement list could not be read at all:

> This is not the claim that no such engagement exists — nothing checked. Reload the page, or
> clear the filter to read the whole ledger.

Different message, different meaning, and the two must not be run together. The first is a fact
about the slug. The second is the product saying it does not know, because the lookup itself
failed. Reload; if it keeps happening, that is one for Erik.

**UNVERIFIED: the second message.** Producing it means making the engagement lookup fail, and
nobody did that against real records. The wording above is the sentence the product carries, but
nobody watched a screen render it.

## The home screen

The home screen is a directory, not a dashboard. It lists the same thirteen destinations as the
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

Broken lists defects and regressions, grouped by severity. Today: **13 defects, 0 regressed** -
**10 still open** (3 major, 7 minor) and 3 already marked fixed. The only critical one is among the
fixed, so nothing critical is currently open.

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

Tabs at the top switch between **All work items**, **Unassigned sessions**, and **Plan work
item** — the last of which is how you add work by hand rather than reading it in.

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

## Planning work by hand

Almost everything in the ledger arrives by ingest. Planned work is the exception: work you have
decided on but not yet dispatched, typed in by hand so that **Next** can answer before a run
exists.

Open **Work items** and choose **Plan work item** from the tabs. The screen states its own purpose
at the head: *"Work that has been decided on but not yet dispatched, so Next can answer before a
run exists."*

Four fields, two of them required.

**Engagement — required.** A dropdown of your engagements, opening on `choose an engagement…`.
Learn this field first, because it encodes a rule and not a convenience: **there is no unassigned
planned work.** Every planned item carries an engagement from the moment you create it. The hint
under the control says so:

> There is no unassigned planned item. The unassigned queue holds ingested sessions nothing could
> attribute; planned work has an owner by the time anybody plans it.

**Unassigned sessions** is not a parking space for work nobody has scoped. It exists for sessions
that were *recorded* and could not be matched to an engagement afterwards — a fact about ingest,
not a shelf to put an idea on. If you do not know which engagement a piece of work belongs to, you
are not ready to plan it here. Register the engagement first; with none registered the screen
tells you so, with *"No engagement to plan against."*

**What the work is — required.** A short description, written for whoever reads Next in ten
seconds rather than for a ticket. It is encrypted at rest.

**Work type** — free text, the same field every ingested row carries. Optional.

**Unit key** — optional, and worth filling only if a manifest already uses a key for this unit.

Press **Record planned work**. Beneath the button the screen states the promise it keeps:
*"Nothing is written until this succeeds."* On success you land on the new item's own screen.

Leave the engagement unchosen and it refuses before sending anything:

> Choose the engagement this work belongs to. There is no unassigned planned work item.

Leave the description empty and it refuses the same way:

> Say what the work is. A planned item with no description tells the person reading Next nothing.

The item is created with status `pending` and **no execution mode** — nobody has yet decided
whether it will be fleet work, hand work, or something waiting on a person outside the studio.
That is what makes it planned rather than assigned.

**UNVERIFIED: submitting the form.** The screen was opened and every field read, but nothing was
submitted, because the only instance available holds your real records and this guide is not worth
a stray row in them. The two refusals and the success path above are quoted from the product
rather than watched.

## Planned work, and when it goes stale

A **planned** row is work recorded before any run has claimed it. The distinction exists so that
*nobody has started this* never reads as *this is in flight*. Those two look identical in a column
of statuses, and confusing them is how a client requirement gets counted as underway when nothing
has touched it.

Wherever a planned row appears, it carries a small marker reading `planned` with its age beside
it, so you can tell at a glance which rows are intentions and which are work.

After **30 days untouched** the marker changes to `planned stale` and takes a warning colour.
Thirty days exactly counts as stale: a row last touched on 25 July is stale when you look on
24 August, and still fresh on the 23rd.

Three things are worth knowing, because each one is easy to assume the other way round:

- **Nothing happens to the row.** The ledger works stale out from the date the row was last
  touched, fresh each time you look. No status changes, nothing is deleted and nothing is
  archived. Touch the row and it counts as fresh again.
- **It prompts you, it does not judge.** A planned item that has sat for a month may be fine. The
  marker tells you how long it has sat; what that means is yours to decide.
- **A third state means neither.** If the ledger cannot read the date a row was last touched, the
  marker shows `planned` with `age?` in place of a number. Read that as the product saying it does
  not know how long the row has sat. It claims neither fresh nor stale, and taking it for either
  one defeats the reason it is drawn differently.

A planned row is already a candidate for **Next**: `pending` is one of the statuses Next draws
from, so planning work by hand is how you put something into Next before any run exists.

**UNVERIFIED: the markers themselves.** The ledger holds no planned rows today — every work item
in it arrived by ingest and carries an execution mode — so no `planned`, `planned stale` or `age?`
marker was on screen while this was written. Filtering Work items to `pending` returned nothing,
which is the same finding from the other direction. The rule above is read from what the product
computes; the appearance of the markers is not.

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

**This screen is cross-engagement by default, and it now takes the engagement filter.** Earlier
versions of this guide said there was no filter here, and that was true when they were written.
The dropdown in the top bar was approved and built since, and Fleet runs is one of the eleven
screens it narrows. With no engagement chosen you see every run, which stays the default.

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

**Bottleneck is empty; Next no longer is.** Bottleneck ranks work whose executor is you or an
Erik-gate, and **no work item carries either**, so the screen explains its own emptiness with a
zero-count rather than showing a blank. Its rows arrive only through fleet ingest, and nothing you
click will put one there.

**Next holds exactly one row, and you can add more.** Planning work by hand creates a `pending`
row, and `pending` is the status Next draws from, so a planned item becomes a Next candidate the
moment you record it. One such row exists today, entered through the form to prove the path works.
Before this milestone Next was empty and could not be filled from inside the product at all.

**Two of the three planned-work markers have still never been seen.** One planned row now exists,
so the `planned` marker and the age chip beside it have been observed on a real screen. **`planned
stale` and `age?` have not.** The first needs a row untouched for 30 days and the second needs a
row whose last-touched date cannot be read, and neither can be produced on demand - so this guide
describes those two from the rule the product computes rather than from a screen.

**One engagement-filter message has never been seen.** The notice shown when the engagement list
itself cannot be read needs the lookup to fail, and nobody forced that against real records.

**Permanent deletion has never been run against real records.** The button exists on the engagement
screen and the code behind it is written. Nobody has destroyed real rows with it, so its behaviour
at the moment it runs is unproven, including how completely it cascades and how it behaves at the
audit boundary it is supposed to stop at. Archive instead, which was tested and reverses cleanly.
If you need a permanent deletion, take an export first.

**Signing out works, and this is now the one claim here confirmed by a person rather than a
measurement.** It was carried as unverified through several milestones because pressing it destroys
the signed-in session any agent check would have been running from. Erik pressed it on 2026-08-24
and it behaved as described: the session ends and you are returned to sign-in.

**One milestone amount will not decrypt, and two screens disagree about it.** The engagement
screen shows `unreadable` and excludes it from every total, with a note saying it is not zero. The
milestone's own screen shows `not recorded`. Both totals on Committed read `$0.00` while a
milestone with an unreadable amount exists. Do not invoice from those totals until this is
resolved.

**Nothing tests anything, by the ledger's own count.** Untested reports 79 requirements, 324
tests, and **0 mapped** - no test in the ledger is tied to a requirement. Broken shows 13 defects,
10 of them open, and the 3 marked `fixed` carry "no passing test names this defect" beside them,
meaning nothing in the ledger proves those fixes. The ledger is reporting this correctly. It is your delivery state
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

**A list is empty and the address names an engagement.** Read what the screen says underneath. It
will tell you either that no engagement carries that slug, or that the lookup failed and nothing
was checked — different problems with different fixes, both covered under *Filtering by
engagement*. Set the dropdown back to "every engagement" to read the whole ledger.

**The unparsed badge did not change when you picked an engagement.** Working as intended. That
count is ledger-wide and stays ledger-wide; while a filter is on it says `(whole ledger)` after
the number so you can see that is what it is.

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
