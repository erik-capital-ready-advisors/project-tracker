import { describe, expect, it, vi } from "vitest";

import {
  PLANNED_STALE_AFTER_DAYS,
  PLANNED_STATUS,
  daysUntouched,
  isPlannedRow,
  plannedStaleness,
  selectPlanned,
} from "./planned";

/** The day every boundary case in this file is measured against. */
const ASOF = "2026-08-24";

/** `ASOF` minus `days`, as a calendar day. Test-side arithmetic only. */
function dayBefore(days: number): string {
  const ms = Date.parse(`${ASOF}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function planned(updatedAt: string | null) {
  return { planned: true, updatedAt };
}

describe("FR-87 — which rows are planned work", () => {
  it("is planned when execution_mode is NULL and status is pending", () => {
    expect(isPlannedRow({ execution_mode: null, status: "pending" })).toBe(true);
  });

  it("PLANNED_STATUS is the pending member, not a second spelling of it", () => {
    expect(PLANNED_STATUS).toBe("pending");
  });

  it("is not planned when an execution mode is set, for every real mode", () => {
    for (const mode of ["fleet", "hand", "external"]) {
      expect(isPlannedRow({ execution_mode: mode, status: "pending" })).toBe(false);
    }
  });

  it("is not planned when the status is anything other than pending", () => {
    for (const status of [
      "in_flight",
      "done",
      "blocked",
      "superseded",
      "not_dispatched",
      "unparsed",
    ]) {
      expect(isPlannedRow({ execution_mode: null, status })).toBe(false);
    }
  });

  it("refuses to round an UNRECOGNISED execution mode into planned", () => {
    // The dangerous direction: a mode this build has never seen must not put a
    // PLANNED chip on real fleet work.
    expect(isPlannedRow({ execution_mode: "orchestrated", status: "pending" })).toBe(
      false,
    );
    expect(isPlannedRow({ execution_mode: "", status: "pending" })).toBe(false);
    expect(isPlannedRow({ execution_mode: 0, status: "pending" })).toBe(false);
  });

  it("refuses to round an UNRECOGNISED status into planned", () => {
    expect(isPlannedRow({ execution_mode: null, status: "PENDING" })).toBe(false);
    expect(isPlannedRow({ execution_mode: null, status: "planned" })).toBe(false);
    expect(isPlannedRow({ execution_mode: null, status: null })).toBe(false);
    expect(isPlannedRow({ execution_mode: null, status: undefined })).toBe(false);
  });

  it("treats an ABSENT execution_mode column as not planned", () => {
    // A projection that forgot the column yields `undefined`, not SQL NULL.
    // Only an explicit NULL is the FR-87 signal.
    expect(isPlannedRow({ execution_mode: undefined, status: "pending" })).toBe(false);
  });
});

describe("FR-91 — the 30-day boundary, from a date passed in", () => {
  it("the boundary is 30 days and is stated once", () => {
    expect(PLANNED_STALE_AFTER_DAYS).toBe(30);
  });

  it("29 days untouched is FRESH — the day below the boundary", () => {
    const result = plannedStaleness(planned(dayBefore(29)), ASOF);
    expect(result).toEqual({ state: "fresh", daysUntouched: 29 });
  });

  it("EXACTLY 30 days untouched is STALE — the boundary is inclusive", () => {
    const result = plannedStaleness(planned(dayBefore(30)), ASOF);
    expect(result).toEqual({ state: "stale", daysUntouched: 30 });
  });

  it("31 days untouched is STALE — the day above the boundary", () => {
    const result = plannedStaleness(planned(dayBefore(31)), ASOF);
    expect(result).toEqual({ state: "stale", daysUntouched: 31 });
  });

  it("the two boundary days are 2026-07-25 and 2026-07-26, named literally", () => {
    // Spelled out rather than computed, so a change to `dayBefore` cannot move
    // the boundary and leave the tests above green.
    expect(plannedStaleness(planned("2026-07-25"), "2026-08-24").state).toBe("stale");
    expect(plannedStaleness(planned("2026-07-26"), "2026-08-24").state).toBe("fresh");
  });

  it("truncates the instant to its UTC day at both ends of the boundary day", () => {
    // Documented behaviour, not an accident: every instant on the boundary day
    // reads as 30 days, so the whole day is stale.
    for (const instant of [
      "2026-07-25T00:00:00.000Z",
      "2026-07-25T12:00:00Z",
      "2026-07-25T23:59:59.999Z",
    ]) {
      expect(plannedStaleness(planned(instant), ASOF)).toEqual({
        state: "stale",
        daysUntouched: 30,
      });
    }
    // And every instant on the day after it reads as 29, so none of it is.
    for (const instant of ["2026-07-26T00:00:00.000Z", "2026-07-26T23:59:59.999Z"]) {
      expect(plannedStaleness(planned(instant), ASOF)).toEqual({
        state: "fresh",
        daysUntouched: 29,
      });
    }
  });

  it("accepts a full instant as the reference date too", () => {
    expect(plannedStaleness(planned("2026-07-25"), "2026-08-24T09:15:00Z")).toEqual({
      state: "stale",
      daysUntouched: 30,
    });
  });

  it("a row touched today is fresh at 0 days", () => {
    expect(plannedStaleness(planned(ASOF), ASOF)).toEqual({
      state: "fresh",
      daysUntouched: 0,
    });
  });

  it("crosses a month and a leap-year February without drifting a day", () => {
    // 2028-02-01 minus 30 days is 2028-01-02, and 2028 is a leap year.
    expect(plannedStaleness(planned("2028-01-02"), "2028-02-01")).toEqual({
      state: "stale",
      daysUntouched: 30,
    });
    expect(plannedStaleness(planned("2028-01-03"), "2028-02-01").state).toBe("fresh");
    // 2028-03-30 minus 30 days lands on 2028-02-29, which only exists in a leap
    // year — a naive 30-days-is-a-month rule gets this one wrong.
    expect(plannedStaleness(planned("2028-02-29"), "2028-03-30")).toEqual({
      state: "stale",
      daysUntouched: 30,
    });
  });

  it("is unaffected by a daylight-saving transition, because it works in UTC", () => {
    // Europe/Berlin springs forward on 2026-03-29. A local-time day count would
    // read 29 days here and call this row fresh.
    expect(plannedStaleness(planned("2026-03-15"), "2026-04-14")).toEqual({
      state: "stale",
      daysUntouched: 30,
    });
  });
});

describe("FR-91 — a timestamp it cannot read is unknown, never a guess", () => {
  it("a planned row with no timestamp is unknown, not fresh", () => {
    expect(plannedStaleness(planned(null), ASOF)).toEqual({
      state: "unknown",
      daysUntouched: null,
    });
  });

  it("a planned row with an unparseable timestamp is unknown, not fresh", () => {
    for (const bad of ["", "yesterday", "24/08/2026", "2026-08-32T00:00:00Z"]) {
      expect(plannedStaleness(planned(bad), ASOF)).toEqual({
        state: "unknown",
        daysUntouched: null,
      });
    }
  });

  it("an unreadable reference date is unknown rather than a silent NaN", () => {
    expect(plannedStaleness(planned("2026-01-01"), "not a date")).toEqual({
      state: "unknown",
      daysUntouched: null,
    });
  });

  it("daysUntouched returns null rather than 0 for an unreadable value", () => {
    expect(daysUntouched(null, ASOF)).toBeNull();
    expect(daysUntouched("nope", ASOF)).toBeNull();
    expect(daysUntouched("2026-01-01", "nope")).toBeNull();
    // 0 is a real answer and must stay distinguishable from "cannot say".
    expect(daysUntouched(ASOF, ASOF)).toBe(0);
  });

  it("reports a future timestamp as a negative age rather than clamping it", () => {
    expect(daysUntouched("2026-08-30", ASOF)).toBe(-6);
    expect(plannedStaleness(planned("2026-08-30"), ASOF)).toEqual({
      state: "fresh",
      daysUntouched: -6,
    });
  });
});

describe("FR-91 — staleness is derived, and only for planned rows", () => {
  it("a row that is not planned is not-planned, however old it is", () => {
    expect(plannedStaleness({ planned: false, updatedAt: "2020-01-01" }, ASOF)).toEqual({
      state: "not-planned",
      daysUntouched: null,
    });
  });

  it("never reads the clock — the wall clock moves 73 years and nothing changes", () => {
    // FR-91: "computed from a date passed in, never from `new Date()` inside".
    // A derivation that fell back on the clock would call both of these stale
    // once the system time is 2099.
    const item = planned("2026-07-25");
    const fresh = plannedStaleness(item, "2026-08-23");
    const stale = plannedStaleness(item, "2026-08-24");

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
      expect(plannedStaleness(item, "2026-08-23")).toEqual(fresh);
      expect(plannedStaleness(item, "2026-08-24")).toEqual(stale);
      expect(daysUntouched("2026-07-25", "2026-08-24")).toBe(30);
    } finally {
      vi.useRealTimers();
    }

    // And the negative control: the two answers really are different, so the
    // assertions above are not both trivially satisfied by a constant.
    expect(fresh.state).toBe("fresh");
    expect(stale.state).toBe("stale");
  });

  it("selectPlanned keeps the planned rows and drops the rest, in order", () => {
    const items = [
      { id: "a", planned: false },
      { id: "b", planned: true },
      { id: "c", planned: false },
      { id: "d", planned: true },
    ];
    expect(selectPlanned(items).map((one) => one.id)).toEqual(["b", "d"]);
    expect(selectPlanned([])).toEqual([]);
  });
});
