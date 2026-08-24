// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * B4's allowlist, which is the only thing standing between a global
 * `SessionEnd` hook and a personal project's session summary landing in a
 * database classified for client data.
 *
 * Erik settled the install scope as **global with an allowlist** (spec Q4).
 * Global is what reaches the ad-hoc work FR-31 needs to measure; the allowlist
 * is what keeps the rest out. So the allowlist is not a convenience — it is the
 * half of the decision that makes the other half safe, and it is the half a
 * copied settings snippet cannot express. That is why it lives in the script.
 *
 * ## How this test observes a decision not to post
 *
 * The script always exits 0, deliberately: a hook that fails a session is a
 * hook that gets uninstalled. So the exit code says nothing, and "did it post"
 * has to be observed some other way. A fake `curl` earlier on `PATH` writes a
 * marker file when it is called, and the presence or absence of that marker is
 * the assertion.
 *
 * The fake is also the positive control. Without the `captures` case below, a
 * broken fake — never executable, never found on PATH — would make every
 * refusal assertion pass for the wrong reason, and a suite that cannot fail is
 * not a suite.
 */

const SCRIPT = join(process.cwd(), "scripts", "claude-session-capture.sh");

let sandbox: string;
let fakeBin: string;
let allowedRoot: string;
let outsideRoot: string;

/** Run the hook from `cwd`, and report whether it attempted a post. */
function run(cwd: string, env: Record<string, string> = {}): boolean {
  const marker = join(sandbox, `called-${Math.random().toString(36).slice(2)}`);
  execFileSync("bash", [SCRIPT], {
    cwd,
    input: JSON.stringify({ session_id: "probe", cwd }),
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      CURL_MARKER: marker,
      DELIVERY_LEDGER_URL: "https://ledger.example",
      DELIVERY_LEDGER_INGEST_TOKEN: "dl_test",
      ...env,
    },
  });
  // The absence of the marker is the observation; readFileSync would throw.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").existsSync(marker);
  } catch {
    return false;
  }
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "dl-allowlist-"));

  fakeBin = join(sandbox, "bin");
  mkdirSync(fakeBin);
  writeFileSync(
    join(fakeBin, "curl"),
    '#!/usr/bin/env bash\n[ -n "${CURL_MARKER:-}" ] && printf posted > "$CURL_MARKER"\nexit 0\n',
    { mode: 0o755 },
  );

  allowedRoot = join(sandbox, "Projects");
  outsideRoot = join(sandbox, "Personal");
  mkdirSync(join(allowedRoot, "delivery-ledger"), { recursive: true });
  mkdirSync(join(outsideRoot, "taxes"), { recursive: true });
  // `Projects-personal` is the boundary case: a bare prefix comparison against
  // a root of `.../Projects` swallows it, and that is the exact mistake that
  // would leak a non-studio directory into a client-classified table.
  mkdirSync(join(sandbox, "Projects-personal"), { recursive: true });
  // A Google Drive shared folder pointing at a repository is the real shape on
  // Erik's machine, and the session's `cwd` can arrive as either name.
  symlinkSync(join(allowedRoot, "delivery-ledger"), join(sandbox, "drive-link"));
});

describe("B4 — the session hook's allowlist", () => {
  it("captures a session inside an allowlisted root (positive control for the fake curl)", () => {
    expect(run(join(allowedRoot, "delivery-ledger"), { DELIVERY_LEDGER_ALLOWLIST: allowedRoot })).toBe(true);
  });

  it("captures the allowlisted root itself, not only directories beneath it", () => {
    expect(run(allowedRoot, { DELIVERY_LEDGER_ALLOWLIST: allowedRoot })).toBe(true);
  });

  it("fails closed when no allowlist is set — a global hook must not default to capturing everything", () => {
    expect(run(join(allowedRoot, "delivery-ledger"), { DELIVERY_LEDGER_ALLOWLIST: "" })).toBe(false);
  });

  it("refuses a directory outside every allowlisted root", () => {
    expect(run(join(outsideRoot, "taxes"), { DELIVERY_LEDGER_ALLOWLIST: allowedRoot })).toBe(false);
  });

  it("matches on a path boundary, so `Projects` does not swallow `Projects-personal`", () => {
    expect(run(join(sandbox, "Projects-personal"), { DELIVERY_LEDGER_ALLOWLIST: allowedRoot })).toBe(false);
  });

  it("honours a trailing slash on a root rather than treating it as a different path", () => {
    expect(run(join(allowedRoot, "delivery-ledger"), { DELIVERY_LEDGER_ALLOWLIST: `${allowedRoot}/` })).toBe(true);
  });

  it("accepts several roots, PATH-style", () => {
    expect(
      run(join(outsideRoot, "taxes"), { DELIVERY_LEDGER_ALLOWLIST: `${allowedRoot}:${outsideRoot}` }),
    ).toBe(true);
  });

  it("resolves a symlink into an allowlisted root, because the allowlist is about where the work is", () => {
    expect(run(join(sandbox, "drive-link"), { DELIVERY_LEDGER_ALLOWLIST: allowedRoot })).toBe(true);
  });

  it("still exits 0 when it refuses, because a hook that fails a session gets uninstalled", () => {
    const cwd = join(outsideRoot, "taxes");
    expect(() =>
      execFileSync("bash", [SCRIPT], {
        cwd,
        input: JSON.stringify({ session_id: "probe", cwd }),
        env: { ...process.env, DELIVERY_LEDGER_ALLOWLIST: allowedRoot },
      }),
    ).not.toThrow();
  });
});
