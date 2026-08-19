import type { ReleaseDb } from "./db";

/**
 * FR-58's count, for this endpoint's envelope.
 *
 * ## What it counts, stated because nothing else has stated it yet
 *
 * `work_item` rows whose `status` is `unparsed`, across every engagement — the
 * same population the app shell's badge is built to show. The partial index
 * `work_item_unparsed_idx` exists for exactly this predicate.
 *
 * Queried with `count: "exact", head: true` rather than by reading rows and
 * taking `.length`. A read without paging returns at most 1000 rows and reports
 * success, so `rows.length` silently becomes `1000` on any system large enough
 * to matter — measured twice in this practice, both times producing plausible
 * wrong numbers for months. An exact count cannot truncate.
 *
 * ## Why it returns `null` rather than `0` on failure
 *
 * `0` is a positive claim that the system classified everything it was given.
 * `null` is "not counted", which `apiOk` omits from the envelope and
 * `unparsedState` renders as `unknown`. The whole reason FR-58 exists is that a
 * wrong "everything is fine" is the worst output this product can produce, and a
 * failed count rendered as zero is precisely that output.
 */
export async function currentUnparsedCount(db: ReleaseDb): Promise<number | null> {
  const result = await db
    .from("work_item")
    .select("id", { count: "exact", head: true })
    .eq("status", "unparsed");

  if (result.error) return null;
  const count = result.count;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
  return count;
}
