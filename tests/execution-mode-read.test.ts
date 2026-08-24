// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EXECUTION_MODES } from "@/lib/ingest/types";
import { fromExecutionMode } from "@/lib/server/answers/from-db";
import { toExecutionMode } from "@/lib/server/ingest/mapping";

/**
 * D-1 (manifest d4000f) — a planned row must not read as fleet work.
 *
 * ## The defect these tests were written against
 *
 * `fromExecutionMode` used to end `?? "fleet"`. `String(null)` is `"null"`,
 * which is not a key of the lookup table, so **`fromExecutionMode(null)`
 * returned `"fleet"`**. i1 made `work_item.execution_mode` nullable so an FR-87
 * planned row can exist with no mode set, which turned that pre-existing
 * asymmetry into a live wrong answer: *"nobody has started this"* rendered as
 * *"this is in flight"*, which is precisely the misread FR-91 exists to prevent
 * and the `wrong done` class the whole product is built against.
 *
 * `tsc` could not see it — the read paths use hand-written row interfaces that
 * do not derive from the generated `Tables<"work_item">`, so i1's correctly
 * widened database type reached nothing — and no test asserted the broken
 * behaviour, so nothing here had to be un-asserted to fix it.
 *
 * ## The rule being asserted
 *
 * A default reached by `??` that asserts a *positive* fact is a fabrication with
 * no error path. `fromWorkStatus` already had this right: unknown becomes the
 * explicit `unparsed` sentinel. Execution mode now does the same.
 *
 * The planned/not-planned distinction is NOT lost by folding SQL NULL and an
 * unreadable value together here: `isPlannedRow` in
 * `@/lib/server/workitems/planned` decides it from the raw column, before this
 * conversion, and every read path records the answer as its own field.
 */
describe("fromExecutionMode", () => {
  it("maps each recognised label to itself", () => {
    for (const mode of EXECUTION_MODES) {
      expect(fromExecutionMode(mode)).toBe(mode);
    }
  });

  /** The regression itself. Red before the fix, green after. */
  it("does not turn a planned row's NULL into fleet", () => {
    expect(fromExecutionMode(null)).not.toBe("fleet");
    expect(fromExecutionMode(null)).toBe("unparsed");
  });

  it("does not turn an absent column into fleet either", () => {
    // The shape a projection that forgot `execution_mode` produces.
    expect(fromExecutionMode(undefined)).toBe("unparsed");
  });

  it("does not round an unreadable value up to a real mode", () => {
    for (const value of ["", "FLEET", "hand-prompted", "robot", 0, {}, []]) {
      expect(fromExecutionMode(value)).toBe("unparsed");
    }
  });

  it("never invents a mode: every non-label input reads as unparsed", () => {
    const labels = new Set<string>(EXECUTION_MODES);
    for (const value of [null, undefined, "null", "undefined", "none"]) {
      expect(labels.has(fromExecutionMode(value))).toBe(false);
    }
  });
});

/**
 * The sentinel is read-only. It has no Postgres label — `execution_mode` is
 * `fleet | hand | external` — so it must never reach the write path as a mode.
 * `toExecutionMode` answers null for it, which `ingest/plan.ts` already counts
 * as an unmappable enum and drops rather than guessing.
 */
describe("the unparsed sentinel is not writable", () => {
  it("does not map to a Postgres execution_mode label", () => {
    expect(toExecutionMode("unparsed")).toBeNull();
  });

  it("is absent from the ingest wire vocabulary", () => {
    expect((EXECUTION_MODES as readonly string[]).includes("unparsed")).toBe(false);
  });
});
