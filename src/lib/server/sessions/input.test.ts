import { describe, expect, it } from "vitest";

import { durationMinutes, parseSessionPayload } from "./input";

const VALID = {
  workingDirectory: "/Users/erik/Projects/acme-site",
  startedAt: "2026-08-19T09:00:00Z",
  endedAt: "2026-08-19T10:30:00Z",
  stack: "n8n",
  filesChanged: 12,
  commits: 3,
  summary: "Rebuilt the lead-router workflow and fixed the webhook retry.",
};

function expectErrors(body: unknown): string[] {
  const result = parseSessionPayload(body);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

describe("FR-24 the session record carries what the spec names", () => {
  it("FR-24 accepts a complete session-hook payload", () => {
    const result = parseSessionPayload(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workingDirectory).toBe("/Users/erik/Projects/acme-site");
    expect(result.value.startedAt).toBe("2026-08-19T09:00:00.000Z");
    expect(result.value.endedAt).toBe("2026-08-19T10:30:00.000Z");
    expect(result.value.stackName).toBe("n8n");
    expect(result.value.filesChanged).toBe(12);
    expect(result.value.commits).toBe(3);
    expect(result.value.summary).toContain("lead-router");
  });

  it("FR-24 requires the working directory, because it is what resolves the engagement", () => {
    expect(expectErrors({ ...VALID, workingDirectory: "" })).toContain(
      "workingDirectory: required",
    );
  });

  it("FR-24 refuses a timestamp with no offset, which is ambiguous", () => {
    const errors = expectErrors({ ...VALID, startedAt: "2026-08-19 09:00:00" });
    expect(errors.join(" ")).toContain("startedAt");
    expect(errors.join(" ")).toContain("ISO-8601");
  });

  it("FR-24 refuses a session that ended before it started", () => {
    expect(
      expectErrors({ ...VALID, endedAt: "2026-08-19T08:00:00Z" }),
    ).toContain("endedAt: is before startedAt");
  });

  it("FR-24 collects every problem at once rather than stopping at the first", () => {
    const errors = expectErrors({
      workingDirectory: "",
      startedAt: "nonsense",
      filesChanged: -4,
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("body: refuses anything that is not a JSON object", () => {
    expect(expectErrors("a string")).toEqual(["body: expected a JSON object"]);
    expect(expectErrors([VALID])).toEqual(["body: expected a JSON object"]);
    expect(expectErrors(null)).toEqual(["body: expected a JSON object"]);
  });
});

describe("FR-27 a session may be posted mid-session", () => {
  it("FR-27 accepts a payload with no end time", () => {
    const { endedAt: _dropped, ...midSession } = VALID;
    const result = parseSessionPayload(midSession);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endedAt).toBeNull();
  });

  it("FR-27 leaves duration null while the session is still running", () => {
    expect(durationMinutes("2026-08-19T09:00:00Z", null)).toBeNull();
  });

  it("FR-31 measures duration in whole minutes for the stack-hours rollup", () => {
    expect(durationMinutes("2026-08-19T09:00:00Z", "2026-08-19T10:30:00Z")).toBe(90);
    // 90 seconds of work is one minute, not zero.
    expect(durationMinutes("2026-08-19T09:00:00Z", "2026-08-19T09:01:30Z")).toBe(2);
  });
});

describe("FR-25 the documented hook snippet and this parser agree", () => {
  /**
   * A byte copy of what `scripts/claude-session-capture.sh` actually emitted,
   * captured by running it with the curl call replaced by an echo. It is here
   * because the hook and the endpoint are two artifacts that have to agree
   * about one shape, and nothing else checks that they do — a renamed field on
   * either side would otherwise surface as sessions silently failing to record.
   */
  const HOOK_OUTPUT =
    '{"workingDirectory":"/Users/erik/Projects/acme","startedAt":"2026-08-19T09:00:00Z",' +
    '"endedAt":"2026-08-19T17:17:12Z","filesChanged":5,"commits":25,' +
    '"source":"session-hook","stack":"n8n",' +
    '"summary":"Rebuilt the \\"lead router\\" workflow"}';

  it("FR-25 accepts the hook's own output verbatim", () => {
    const result = parseSessionPayload(JSON.parse(HOOK_OUTPUT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe("session-hook");
    expect(result.value.stackName).toBe("n8n");
    expect(result.value.commits).toBe(25);
    expect(result.value.summary).toBe('Rebuilt the "lead router" workflow');
  });

  it("FR-25 accepts the minimum the hook emits when nothing is configured", () => {
    // No stack, no summary, no engagement — the degraded record the hook posts
    // from a machine where only the URL and token are set. It is a less
    // detailed record, not a rejected one.
    const result = parseSessionPayload({
      workingDirectory: "/Users/erik/Projects/acme",
      startedAt: "2026-08-19T17:17:12Z",
      endedAt: "2026-08-19T17:17:12Z",
      filesChanged: 0,
      commits: 0,
      source: "session-hook",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.stackName).toBeNull();
    expect(result.ok && result.value.summary).toBeNull();
  });
});

describe("§7a the summary is never echoed back in an error", () => {
  it("§7a reports only the length when the summary is too long", () => {
    const secret = "CLIENT-CONFIDENTIAL-".repeat(400);
    const errors = expectErrors({ ...VALID, summary: secret });
    expect(errors.join(" ")).toContain("summary: longer than");
    // The one assertion that matters in this file.
    expect(errors.join(" ")).not.toContain("CLIENT-CONFIDENTIAL");
  });

  it("§7a does not echo an over-long enum value either", () => {
    const errors = expectErrors({
      ...VALID,
      workItem: { evidenceScope: "CLIENT-CONFIDENTIAL-".repeat(40) },
    });
    expect(errors.join(" ")).not.toContain("CLIENT-CONFIDENTIAL");
    expect(errors.join(" ")).toContain("the supplied value");
  });

  it("echoes a short enum token, because that is what makes the error actionable", () => {
    expect(
      expectErrors({ ...VALID, workItem: { evidenceScope: "observed" } }).join(" "),
    ).toContain('"observed"');
  });
});

describe("FR-28 to FR-30 the work item a session produces", () => {
  it("FR-28 defaults the executor kind to Erik", () => {
    const result = parseSessionPayload(VALID);
    expect(result.ok && result.value.workItem.executorKind).toBe("erik");
  });

  it("FR-15 defaults the status to unparsed, never to done", () => {
    // The whole product exists to avoid a wrong `done`. A hook that fired on a
    // session which changed nothing is exactly the payload that would produce one.
    const result = parseSessionPayload(VALID);
    expect(result.ok && result.value.workItem.status).toBe("unparsed");
  });

  it("FR-30 defaults the disposition to carried, so the gap stays Erik's", () => {
    const result = parseSessionPayload(VALID);
    expect(result.ok && result.value.workItem.disposition).toBe("carried");
  });

  it("FR-43 leaves evidence scope null when nothing claimed one", () => {
    // Null is "nobody said", which is distinct from `not-verified`, which is
    // "somebody looked and could not confirm". FR-43 forbids merging those.
    const result = parseSessionPayload(VALID);
    expect(result.ok && result.value.workItem.evidenceScope).toBeNull();
  });

  it("FR-29 accepts each of the six reason classes", () => {
    for (const reason of [
      "no-agent-for-stack",
      "credential-absent",
      "human-judgment",
      "client-action",
      "out-of-scope",
      "budget",
    ]) {
      const result = parseSessionPayload({ ...VALID, workItem: { unautomatedReason: reason } });
      expect(result.ok).toBe(true);
    }
  });

  it("FR-29 refuses a reason class it does not recognise instead of defaulting", () => {
    const errors = expectErrors({
      ...VALID,
      workItem: { unautomatedReason: "no-time" },
    });
    expect(errors.join(" ")).toContain("unautomatedReason");
    expect(errors.join(" ")).toContain("no-agent-for-stack");
  });

  it("FR-42 reads dependency edges as unit keys", () => {
    const result = parseSessionPayload({
      ...VALID,
      workItem: { dependsOn: ["i1", "i2"] },
    });
    expect(result.ok && result.value.workItem.dependsOn).toEqual(["i1", "i2"]);
  });
});
