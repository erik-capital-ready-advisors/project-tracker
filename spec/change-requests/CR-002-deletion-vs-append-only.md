# CR-002 — Hard deletion and the append-only tables

**Amends:** `spec/spec-approved.md` (v1, approved 2026-08-17), as already amended by CR-001
**Drafted:** 2026-08-19
**Status:** **APPROVED 2026-08-19 by Erik.** This CR now amends `spec-approved.md` per the repo's
CR rule, as already amended by CR-001. Drafted at Erik's direction on 2026-08-19 during the `b0952e`
Phase 1 checkpoint; the build decision it records was already in `.fleet/answers-b0952e.jsonl` and
Phase 2 proceeded on it. **M1.10 is unblocked and may now be built.** No entity count change, so the
`security-gate.sh` PASS on the merged 21-entity set (2026-08-18) is unaffected.
**Why now:** i1 built the append-only guarantee in M1.1 and discovered the conflict while doing it.
M1.10 is the milestone that implements FR-61, and it has not been dispatched. Settling this before
M1.10 costs a paragraph; settling it after costs a migration against live audit data.

---

## 1. The conflict, stated exactly

Two approved requirements cannot both be satisfied as written.

- **FR-61** requires hard deletion of an engagement as a separate, audited administrative action.
- **§7a** classifies `audit_log` and `test_result` as append-only and retained indefinitely.

i1 enforced §7a with triggers that refuse `UPDATE`, `DELETE` and `TRUNCATE` for **every** role,
including the table owner. That is the correct reading of "append-only" — a guarantee that the
owner can bypass is not a guarantee, it is a convention. The consequence is concrete: a hard delete
of an engagement cannot cascade into `test_result`, so the delete fails at the database rather than
partially succeeding.

This is a genuine spec conflict, not an implementation gap. Neither requirement is wrong on its own
and no amount of care in M1.10 reconciles them.

## 2. Resolution — append-only is absolute

**§7a wins, without exception.** FR-61's hard deletion is redefined to mean:

1. It deletes the engagement's own rows and everything that is *about* the engagement's current
   state — work items, blockers, requirements, contract milestones, questions, defects, releases.
2. It **does not reach** `audit_log` or `test_result`, and it never will. Those two tables retain
   their rows after the engagement they refer to is gone.
3. The deletion is itself an audited action: it writes an `audit_log` row recording what was
   deleted, by whom, and when. The audit trail of a deletion is not deletable — which is the whole
   point of an audit trail.
4. Foreign keys from `audit_log` and `test_result` into deleted rows are **not** enforced as
   cascading references. They record identifiers that no longer resolve, and that is the intended
   state, not a defect. An orphaned audit row is evidence; a deleted one is a gap.

**Rejected alternative:** a privileged escape hatch that lets an administrative path delete from
the append-only tables under audit. It satisfies FR-61 literally and destroys what §7a is for. Once
a role exists that can delete audit rows, the audit log answers "what happened" only for actors who
did not hold that role — and the actor most likely to hold it is the one whose actions the log
exists to record.

## 3. What changes in the spec

- **FR-61** gains the four clauses in §2 above, replacing the unqualified phrase "hard deletion".
- **§7a**, `audit_log` and `test_result` rows: the retention column gains the sentence "Retained
  after the referenced engagement is deleted. No role, including the table owner, may delete or
  truncate these tables."
- **§7a** gains a note that identifiers in these two tables may refer to rows that no longer exist,
  and that a reader must treat an unresolvable reference as expected.

No new entities. No new columns. No change to the 21-entity count, so the merged entity set that
`security-gate.sh` passed on 2026-08-18 is unaffected.

## 4. What this costs

**A right-to-erasure request cannot be fully satisfied by FR-61 alone.** If a client demands
deletion of everything about them, `audit_log` and `test_result` still hold identifiers and test
titles that reference their engagement. Whether that is acceptable depends on what the contracts
say, which is open blocker **B2**. This CR does not resolve B2 and does not pretend to: it records
that the product's deletion path stops at the audit boundary, so that when B2 is answered the gap
is already visible rather than discovered during a client conversation.

If B2 comes back requiring true erasure, the answer is a separate CR that defines what a redaction
(not a deletion) of an audit row means — overwriting the payload while keeping the row and its
timestamps. That is a different mechanism with different guarantees and it should not be smuggled
in here.

## 5. Approval

Approved 2026-08-19. `.fleet/answers-b0952e.jsonl` carried the build decision through Phase 2, and
M1.10 - previously the one milestone blocked on this CR - is now cleared to build against §2 above.

- [x] Approved by Erik on **2026-08-19**
