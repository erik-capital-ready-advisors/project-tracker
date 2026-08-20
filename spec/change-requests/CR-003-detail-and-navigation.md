# CR-003 — Detail views and cross-entity navigation

**Amends:** `spec/spec-approved.md` (v1, approved 2026-08-17), as already amended by CR-001 and CR-002
**Drafted:** 2026-08-20
**Status:** **PENDING APPROVAL.** Drafted at Erik's direction on 2026-08-20, after the first
populated look at the six answer screens.
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

Broken already renders the full decrypted description inline, along with `ref`, `source`,
`reportedBy`, `reportedAt`, `requirementRef`, `workItem`, `blockedBy` and its test evidence. **The
decryption path exists, is used, and is tested.** Bringing the other three screens to the same level
is closing a gap against a requirement already approved, and needs no CR.

That inconsistency — one screen carrying detail and three carrying identifiers — is worth naming as
its own finding. Nothing decided it; the units that built them made different calls.

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

Two honest options, and this CR does not choose between them. See §6, Q9.

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
  **Recommendation: (b), with the blocker raised in the same commit as the CR's approval.** (a) is
  the correct end state and doing it under the same milestone as eight new views is how a security
  control gets built in a hurry. But (b) is only acceptable if the blocker is written down at
  approval time rather than at build time — the failure mode `i1` named is precisely a unit quietly
  deepening this without anyone recording it.

- **Q10 — Which phase?** Proposed as a new Phase 1 milestone **M1.11**, on the argument that the
  product does not meet its stated purpose without it. The alternative is Phase 2, on the argument
  that the six answers are complete and this is enhancement. **Erik's call**; it decides whether
  PR #1 grows or merges first.

- **Q11 — Does FR-55's "links" mean a hyperlink?** FR-55 reads "Untested reports coverage per FR-48
  and **links** each uncovered requirement to the work item that implements it." It is the only use
  of the word in the spec and it is ambiguous between the data relationship (built) and a hyperlink
  (not built). If a hyperlink, FR-55 is already partly unmet and this CR closes it rather than
  extending it.

---

## 7. Milestone amendment (proposed, pending Q10)

| Milestone | Contents | Requirements |
|---|---|---|
| **M1.11** Detail and navigation | Eight detail views; reference resolution and linking across every screen; the dangling-reference treatment on a navigable surface; filter-state restoration | FR-80–FR-86, and FR-55 if Q11 answers "hyperlink" |

---

## 8. Approval

- [ ] Approved by Erik on **__________**
- [ ] Q9 answered: **(a) build the views** / **(b) ship on `service_role` and raise the blocker**
- [ ] Q10 answered: **Phase 1 as M1.11** / **Phase 2**
- [ ] Q11 answered: FR-55's "links" means **a hyperlink** / **the data relationship**

Until approved, `spec-approved.md` as amended by CR-001 and CR-002 remains the effective spec, and
none of FR-80–FR-86 is buildable. The three defects in §2 are **not** gated on this approval and
should be fixed regardless.
