# CR-003 — Detail views and cross-entity navigation

**Amends:** `spec/spec-approved.md` (v1, approved 2026-08-17), as already amended by CR-001 and CR-002
**Drafted:** 2026-08-20
**Status:** **APPROVED 2026-08-20 by Erik**, with Q9, Q10 and Q11 answered at approval. This CR now
amends `spec-approved.md` per the repo's CR rule, as already amended by CR-001 and CR-002. Drafted
the same day, after the first populated look at the six answer screens. **No entity count change**,
so the 21-entity `security-gate.sh` PASS (2026-08-18) is unaffected. **Nothing here is buildable
until PR #1 merges** — see Q10.
**Why now:** the screens have real data for the first time today, and the gap is only visible with
rows in them. Settling it before M1.10 and before the §5a design approval costs a section; settling
it after means approving a visual design for screens whose interaction model is about to change.

---

## 1. The gap, stated exactly

The repo's own statement of purpose is that this product answers six questions "in a browser in
under thirty seconds". That is true of what is built. It is not sufficient, and the reason is the
sentence Erik used when he raised this:

> the whole purpose of this app is to be a one stop solution for me to keep track of the projects
> I'm working on and to get rid of siloed information.

Those two goals are not in tension, but only the first one has been built. A thirty-second glance
that raises a question you cannot follow **sends the reader back to the silo**. Today the Blocked
screen says `c1` is blocked and does not say what is blocking it; the blocker's description is in
the database, decryptable, and unrendered. To learn what `c1` is waiting on, Erik opens
`manifest-b0952e.md` — which is the exact behaviour this product exists to end.

The failure is not that the screens are wrong. It is that they terminate.

### What makes this a scope question rather than a defect

Some of it is not a scope question, and this CR deliberately excludes it. See §2.

What is genuinely new is **navigation between entities**. The spec describes six screens and six
endpoints. It never describes a path from a row to the thing the row refers to, and it never
describes a view of one entity. Those are features, they have a §7a consequence (§5), and they are
the half that earns a change request.

---

## 2. What this CR does NOT include, and why

**The missing descriptions are defects against existing requirements, not new scope.** They are
listed here so approval of this CR is not mistaken for approval of them, and so they can be fixed
immediately without waiting for it.

| Screen | Requirement | The gap |
|---|---|---|
| Blocked | **FR-52** "What is stopped, who owns it, **and for how long**?" | Renders no blocker description, so it answers *which* is stopped and not *what*. Also renders `—` under `started` and `elapsed` on every row, so the third clause is unanswered from Mode-1 data |
| Next | **FR-53** | No description; a row names a unit and a work type only |
| Bottleneck | **FR-56** | No description |

~~Broken already renders the full decrypted description inline, along with `ref`, `source`,
`reportedBy`, `reportedAt`, `requirementRef`, `workItem`, `blockedBy` and its test evidence. **The
decryption path exists, is used, and is tested.** Bringing the other three screens to the same level
is closing a gap against a requirement already approved, and needs no CR.~~

~~That inconsistency — one screen carrying detail and three carrying identifiers — is worth naming as
its own finding. Nothing decided it; the units that built them made different calls.~~

> **CORRECTION, 2026-08-20, after approval.** The struck paragraphs are **false** and were written
> into this CR, into `prod.md`, and into the conversation that produced this approval. Broken does
> **not** render a decrypted description. `defect.description` appears only in *comments* in
> `broken.ts` and `engagement-broken.tsx`; `BrokenDefect` has no such field. The claim came from a
> grep that matched comment text and was reported as code.
>
> **What was actually true: no screen among the six decrypted prose at all.** `load.ts` decrypted
> exactly one thing — `contract_milestone.amount`, so Committed can total it. There was no
> "inconsistency between one rich screen and three bare ones"; there were six bare ones and a
> product that had never shown an operator a sentence it had stored.
>
> **The ruling is unaffected and stands.** These remain gaps against FR-52, FR-53 and FR-56 rather
> than new scope: the requirements ask what a work item *is*, and the screens answered only which
> one it is. What changes is the size — this was the FIRST decrypt edge on those screens, not the
> reuse of a proven one, and §7a had to be read to confirm it was permitted (`work_item` and
> `blocker` both say "operator, agents, decrypted server-side") rather than assumed from Broken.
>
> **Fixed and shipped 2026-08-20 in `3ee4acb`**, with an opt-in `withProse` so screens that need
> only status do not pay a decrypt round trip per row. Kept struck rather than deleted, because a
> CR that quietly rewrites the premise it was approved on is worth less than one that shows it.

---

## 3. New functional requirements

### 6.15 Detail and navigation

- **FR-80** Every entity reference rendered on any screen is navigable to that entity: a work-unit
  id, a defect ref, a requirement ref, a blocker ref, a release identifier, an engagement slug.

- **FR-81** Each of `work_item`, `defect`, `blocker`, `requirement`, `open_question`,
  `external_wait`, `release` and `contract_milestone` has a detail view showing every field the
  **reading role** is permitted, including decrypted prose, plus its inbound and outbound
  references.

- **FR-82** A requirement's detail view lists every work item implementing it (FR-19), every test
  naming it (FR-45), every defect violating it (FR-65), and every release shipping it (FR-74).
  **Nothing new is derived** — these four relationships are already parsed and stored; this
  requirement is that they be *shown together*, which is the de-siloing the product is for.

- **FR-83** A reference that resolves to nothing renders in FR-12's dangling-reference treatment and
  **is never a link**. It is not a 404, not a search, and not silently plain text. FR-12 and FR-65
  require a reference naming something that does not exist to be reported; a navigable surface must
  not weaken that into a broken link.

- **FR-84** Returning from a detail view restores the filter state of the screen it was entered
  from. A thirty-second glance that costs a re-filter on the way back has spent the saving.

- **FR-85** FR-58 extends to detail views: every detail view reports the current `unparsed` count.

- **FR-86** Detail views and navigation add **no new decryption surface reachable by an agent
  token**. §7a's per-role rules are unchanged: an agent is still refused `contract_milestone`
  entirely, and the operator-only classifications stay operator-only.

---

## 4. What this costs

**It widens what the operator's session can read, and every read still runs as `service_role`.**

That is the live hazard `i1` recorded on 2026-08-19 and it is now load-bearing rather than
theoretical:

> Crypto helpers live in an unexposed `app` schema behind six `public` wrappers granted to
> `service_role` alone — so a decrypted read bypasses RLS. **The failure mode is a later unit
> quietly routing every read through `service_role` until RLS is decorative.** If session-scoped
> decrypted reads are wanted the shape is a `security_invoker = on` view per table; deliberately not
> built, because it widens the decryption-oracle surface.

This CR is the unit that makes that decision unavoidable. It does not create the problem — every
existing screen already reads this way — but it multiplies the number of places that do, and it is
the point at which "RLS is decorative" stops being a risk and becomes a description.

**Settled at approval — Q9 answered (b):** M2.7 ships on the existing read path and the debt is
recorded as **B29**, raised now rather than when the work starts. The risk is carried explicitly:
RLS is not a real control on any operator read surface, and every view this CR adds deepens that.

**It does not add an entity.** No new table, no §7a row, so the 21-entity `security-gate.sh` PASS
stands. What changes is which *fields* reach a screen, and every one of them is already classified.

---

## 5. §7a consequences

No classification changes. Two restatements that this CR makes load-bearing:

- **`contract_milestone` stays refused to agent tokens in full.** FR-81 gives it a detail view for
  the operator; FR-86 keeps the agent's answer a `403`, as `/api/answer/committed` already does.
- **`engagement.client_name` remains the one unencrypted exception**, and detail views make it more
  visible rather than less. §7a records that as a reduction in exposure, not an elimination, and
  this CR does not revisit it. B6 stays open.

---

## 6. Open questions

- **Q9 — Does this CR carry the `security_invoker` work, or record the debt?**
  **(a)** Build `security_invoker = on` views per table now, so detail reads run in the operator's
  role and RLS is a real control on every surface this CR adds. Larger, and it widens the
  decryption-oracle surface `i1` warned about.
  **(b)** Ship detail views on the existing `service_role` read path and raise the debt as a
  standing blocker with a milestone.
  **ANSWERED 2026-08-20: (b).** Detail views ship on the existing `service_role` read path and the
  debt is recorded as **B29**, raised at approval time rather than at build time. (a) is the correct
  end state; building it under the same milestone as eight new views is how a security control gets
  built in a hurry. The defence of (b) is not that the work is deferred — it is that the failure
  mode `i1` named is a unit deepening this *quietly*, and a written blocker with a milestone is
  exactly what makes it not quiet. **The risk is carried explicitly: RLS is not a real control on
  any operator read surface, and every screen this CR adds deepens that.**

- **Q10 — Which phase?** Proposed as a new Phase 1 milestone **M1.11**, on the argument that the
  product does not meet its stated purpose without it. The alternative is Phase 2, on the argument
  that the six answers are complete and this is enhancement. **Erik's call**; it decides whether
  PR #1 grows or merges first.

- **Q11 — Does FR-55's "links" mean a hyperlink?** FR-55 reads "Untested reports coverage per FR-48
  and **links** each uncovered requirement to the work item that implements it." It is the only use
  of the word in the spec and it is ambiguous between the data relationship (built) and a hyperlink
  (not built).

  **ANSWERED 2026-08-20: a hyperlink.** FR-55 is therefore **PARTIALLY MET rather than met**, and
  this CR *closes* it rather than extending it. The reading is the one consistent with the product's
  purpose: an uncovered requirement you cannot follow to its implementing work item is the dead end
  CR-003 exists to remove. M1.8's status is unchanged — the join it built is correct and is what
  makes the link possible.

---

## 7. Milestone amendment (proposed, pending Q10)

| Milestone | Contents | Requirements |
|---|---|---|
| **M2.7** Detail and navigation | Eight detail views; reference resolution and linking across every screen; the dangling-reference treatment on a navigable surface; filter-state restoration; FR-55's hyperlink | FR-80–FR-86, **and FR-55**, which Q11 reclassified as partially met |

**Numbered M2.7 and built FIRST.** Q10 put this in Phase 2, and M2.1–M2.6 are already numbered and
referenced across `prod.md` and CR-001; renumbering them to put this at M2.1 would break every
reference for a cosmetic gain. The number records when it was added, not when it is built.

---

## 8. Approval

- [x] Approved by Erik on **2026-08-20**
- [x] Q9 answered: **(b) ship on `service_role` and raise the blocker** — B29
- [x] Q10 answered: **Phase 2, as M2.7, built first. PR #1 merges before any of it starts**
- [x] Q11 answered: FR-55's "links" means **a hyperlink**; FR-55 is now PARTIALLY MET

The effective spec is `spec-approved.md` as amended by CR-001, CR-002 and this CR. **FR-80–FR-86 and
FR-55's hyperlink are not buildable until PR #1 merges and M1.10 is complete** — that ordering is
part of the approval, not a scheduling preference.

The three defects in §2 are **not** gated on this and should be fixed regardless. They are gaps
against FR-52, FR-53 and FR-56 in the *current* branch, which means they belong to PR #1 rather than
to M2.7.
