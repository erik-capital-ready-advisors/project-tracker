# CR-004 — Which of FR-80 and FR-81 governs an engagement reference

**Amends:** `spec/spec-approved.md` (v1, approved 2026-08-17), as already amended by CR-001, CR-002
and CR-003
**Drafted:** 2026-08-20
**Status:** **APPROVED 2026-08-20 by Erik** — FR-81 wins. Drafted at Erik's direction after he
answered blocker **B35**. No entity added and no schema change, so the `security-gate.sh` PASS on the
resolved 21-entity spec (2026-08-20) is unaffected, and `tests/m27-gate.test.ts` stays green
untouched.
**Why now:** M2.7 shipped on a ruling that `project-lead` and `qa-reviewer` reached independently and
that the spec does not actually state. The code is already built the way this CR describes. What was
missing was the sentence saying so, and a ruling that lives only in two agents' reports is a ruling
the next reader has to re-derive.

---

## 1. The conflict, stated exactly

Two approved requirements disagree about whether an engagement is one of the things that gets a
detail view.

- **FR-80** — "Every entity reference rendered on any screen is navigable to that entity: a work-unit
  id, a defect ref, a requirement ref, a blocker ref, a release identifier, **an engagement slug**."
- **FR-81** — names exactly eight entities that get a detail view: `work_item`, `defect`, `blocker`,
  `requirement`, `open_question`, `external_wait`, `release`, `contract_milestone`. **`engagement` is
  not among them.**

So FR-80 names an engagement slug as a navigable reference, and FR-81's closed set has nowhere for it
to navigate to.

This is a real disagreement between two requirements, not an implementation gap. It is also
**load-bearing on a gate**: `tests/m27-gate.test.ts` asserts `[...ENTITY_KINDS].sort()` equals
`[...FR81_ENTITIES].sort()`, and that gate was written red **before** M2.7 was dispatched. Adding a
ninth kind fails a gate nobody was allowed to touch.

## 2. Resolution — FR-81 wins, and its set stays closed

**FR-81's eight kinds are exhaustive.** `engagement` is deliberately outside them.

An engagement reference is still navigable, satisfying FR-80's intent, because **`/registry/[slug]`
already is an engagement's detail view** and predates this CR. It is rendered as an ordinary
`next/link` to that route rather than through the `EntityRef` machinery that serves the eight kinds.

Restating it as a rule the next reader can apply:

1. `ENTITY_KINDS` is the closed set FR-81 names, and it is closed on purpose. A ninth kind is a spec
   change, never a convenience.
2. An engagement slug is navigable via `/registry/[slug]`, as a plain hyperlink.
3. FR-80 is read as a statement about **navigability**, not about membership of FR-81's set. A
   reference is compliant with FR-80 if a reader can click it and arrive at the thing; it does not
   have to arrive there through `EntityRef`.

## 3. The cost, stated rather than buried

**An engagement reference gets no FR-83 dangling treatment.** FR-83's rule — a reference resolving to
nothing renders as dangling and never as an anchor — is implemented inside the shared reference
component. A plain hyperlink has no such behaviour, so an engagement slug pointing at a row that does
not exist would render as a working link to a 404 rather than as a visibly dangling reference.

**This is currently unreachable**, and the reason is worth writing down because it is what makes the
cost acceptable today rather than merely small: every engagement slug rendered anywhere in the
product comes from the engagement row being rendered, so there is no path by which one can fail to
resolve. It is not defended; it is unreachable.

**It stops being unreachable** the moment a slug arrives from somewhere other than the row itself —
an ingested payload naming an engagement, a stored cross-reference, a user-typed slug, or FR-61's
hard deletion removing an engagement that some other surface still names. **Any of those requires
revisiting this decision**, and the honest form of that revisit is to make `engagement` a ninth kind
and amend the gate, not to bolt a dangling check onto one hyperlink.

## 4. Rejected alternative — make `engagement` a ninth entity kind

It satisfies FR-80 literally and gives engagement references the dangling treatment for free.

Rejected for two reasons, the second mattering more than the first:

- It fails `tests/m27-gate.test.ts` test 1, which was written before dispatch specifically to keep
  FR-81's set from drifting. Amending a gate to accommodate the code it governs is the move that gate
  exists to prevent, and doing it here would have taught the next run that gates are negotiable.
- `/registry/[slug]` **already exists and already renders every field an engagement has**. A ninth
  kind would either duplicate it or redirect to it. FR-81's set is a list of entities that *needed* a
  detail view built; engagement did not need one, which is a plausible reason it is absent from FR-81
  rather than an oversight.

## 5. What changes in the spec

- **FR-80** gains a closing sentence: "An engagement slug is navigable via `/registry/[slug]` and is
  deliberately outside FR-81's set; see CR-004."
- **FR-81** gains: "These eight are exhaustive. `engagement` is excluded deliberately — it has a
  detail view at `/registry/[slug]` that predates this requirement."
- **FR-83** gains a stated limit: "The dangling treatment applies to FR-81's eight kinds. An
  engagement slug rendered as a plain hyperlink carries no dangling treatment, which is acceptable
  only while every rendered slug originates from the row being rendered. See CR-004 §3."

## 6. What does not change

- **No entity is added.** The count stays 21 and `security-gate.sh` is unaffected.
- **No migration**, no schema change, no new route.
- **No code change.** M2.7 already implements this reading. This CR ratifies what shipped; it does
  not ask for anything to be rebuilt.
- **`tests/m27-gate.test.ts` and `e2e/m27-navigation.spec.ts` are untouched**, which is the point.

## 7. Provenance

Raised as **B35**. Reached independently by `project-lead` during run `eb2490` and by `qa-reviewer`
in its post-merge review — `qa1`'s own question recorded it at `confidence: high` with the FR-83 cost
already named, in `.fleet/questions-qa1-eb2490.jsonl`. That question never reached the fan-in file
(`RUN AUDIT eb2490: FAIL`), so it reached Erik through `prod.md`'s blocker table instead.
