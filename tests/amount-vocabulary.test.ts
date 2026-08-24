import { describe, expect, it } from "vitest";

import { formatAmount, NOT_RECORDED, UNREADABLE_AMOUNT } from "@/lib/registry-display";

/**
 * B62 — one milestone amount, three screens, and one of them says something false.
 *
 * `contract_milestone.amount` is a pgcrypto column, so a `null` plaintext has
 * **two causes that mean opposite things**:
 *
 *   * nothing was ever stored — the operator has not entered a figure; or
 *   * a ciphertext exists and would not decrypt — the figure is there and the
 *     product cannot read it.
 *
 * The first is a gap in the record. The second is a fault, and on a contract
 * amount it is the one that costs money. Telling a reader "unreadable" about a
 * milestone nobody ever priced invents a fault, and it points the reader at the
 * Vault key when the actual answer is that somebody has not typed a number.
 *
 * ## Where the discriminator already existed, and where it was dropped
 *
 * `src/lib/server/detail/contract-milestone.ts:147` keys it on the **ciphertext**
 * being present, not on the plaintext, and says so:
 *
 * > A row that stored no amount and a row whose amount could not be read both
 * > arrive as `null`, and only the second one is a problem.
 *
 * `committed.ts` carries the same flag and excludes null amounts from its totals
 * rather than summing them as zero. Only `listMilestones()` dropped it, and only
 * the registry table renders the wrong word as a result.
 *
 * Observed 2026-08-24 on the one milestone in the ledger, whose `amount`
 * ciphertext is NULL: `/registry/delivery-ledger` said **unreadable**,
 * `/milestones/[id]` said **not recorded**, `/committed` showed a dash and
 * excluded it from the totals. Only the first is false.
 */
describe("B62 an unpriced milestone is not an unreadable one", () => {
  it("says NOT RECORDED when no ciphertext was ever stored", () => {
    expect(formatAmount(null, "USD", { unreadable: false }).text).toBe(NOT_RECORDED);
  });

  it("says UNREADABLE only when a ciphertext exists and would not decrypt", () => {
    expect(formatAmount(null, "USD", { unreadable: true }).text).toBe(UNREADABLE_AMOUNT);
  });

  it("marks both as unreadable=false for display, since neither is a figure", () => {
    expect(formatAmount(null, "USD", { unreadable: false }).readable).toBe(false);
    expect(formatAmount(null, "USD", { unreadable: true }).readable).toBe(false);
  });

  it("still refuses to render an absent amount as a number", () => {
    // The original rule, unchanged: `$0` is a positive claim about a contract.
    for (const unreadable of [true, false]) {
      const { text } = formatAmount(null, "USD", { unreadable });
      expect(text).not.toContain("0");
      expect(text).not.toContain("$");
    }
  });

  it("defaults to the safer word when the caller cannot tell", () => {
    // A caller with no ciphertext knowledge must not silently claim the record
    // is merely empty - that is the direction that hides a real fault.
    expect(formatAmount(null, "USD").text).toBe(UNREADABLE_AMOUNT);
  });

  it("formats a real figure unchanged", () => {
    expect(formatAmount(1234.5, "USD", { unreadable: false }).text).toBe("$1,234.50");
    expect(formatAmount(0, "USD", { unreadable: false }).text).toBe("$0.00");
  });
});
