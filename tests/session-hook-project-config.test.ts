// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * B61. `work_session.stack_id` had no working attribution path.
 *
 * Stack was settable only at capture time from the GLOBAL
 * `DELIVERY_LEDGER_STACK`, and B4 settled the hook's install scope as global —
 * so one value would attribute every repository under the allowlist to one
 * stack. `attributeSession()` takes an engagement and nothing else, so there was
 * no way to correct it afterwards either. FR-31's stack-hours rollup, which is
 * the coverage register's entire input, could never fill.
 *
 * Found by observation on 2026-08-24 rather than by reading: Mode 2 was verified
 * end to end and the first real row came back with `stack: null`.
 *
 * ## The security shape of this fix, which is why half these tests exist
 *
 * The config file lives INSIDE the repository being captured. That repository
 * may be a client's, or a clone of something Erik does not control, and the hook
 * runs with an `ingest:write` token in its environment.
 *
 * So two properties matter more than the feature:
 *
 *   1. **The file is parsed, never sourced.** Sourcing it is arbitrary code
 *      execution with a live credential in the environment.
 *   2. **It can set exactly two keys.** A file that could set
 *      `DELIVERY_LEDGER_URL` would redirect the token to a host of its choosing,
 *      which turns a convenience feature into credential exfiltration.
 *
 * Observation is the posted body, captured from a fake `curl` on `PATH`, for the
 * same reason as the allowlist suite: the script exits 0 on every path.
 */

const SCRIPT = join(process.cwd(), "scripts", "claude-session-capture.sh");

let sandbox: string;
let fakeBin: string;
let allowedRoot: string;

interface Posted {
  posted: boolean;
  body: Record<string, unknown> | null;
  url: string | null;
}

function run(cwd: string, env: Record<string, string> = {}): Posted {
  const tag = Math.random().toString(36).slice(2);
  const argsFile = join(sandbox, `args-${tag}`);
  execFileSync("bash", [SCRIPT], {
    cwd,
    input: JSON.stringify({ session_id: "probe", cwd }),
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      CURL_ARGS: argsFile,
      DELIVERY_LEDGER_URL: "https://ledger.example",
      DELIVERY_LEDGER_INGEST_TOKEN: "dl_test",
      DELIVERY_LEDGER_ALLOWLIST: allowedRoot,
      ...env,
    },
  });
  if (!existsSync(argsFile)) return { posted: false, body: null, url: null };
  const args = readFileSync(argsFile, "utf8").split("\n");
  const at = args.indexOf("--data-binary");
  const url = args.find((a) => a.startsWith("https://") || a.startsWith("http://")) ?? null;
  return {
    posted: true,
    body: at >= 0 ? (JSON.parse(args[at + 1]) as Record<string, unknown>) : null,
    url,
  };
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "dl-project-config-"));
  fakeBin = join(sandbox, "bin");
  mkdirSync(fakeBin);
  writeFileSync(
    join(fakeBin, "curl"),
    '#!/usr/bin/env bash\nif [ -n "${CURL_ARGS:-}" ]; then printf "%s\\n" "$@" > "$CURL_ARGS"; fi\nexit 0\n',
    { mode: 0o755 },
  );
  allowedRoot = join(sandbox, "Projects");
  mkdirSync(join(allowedRoot, "acme", "deep", "nested"), { recursive: true });
  mkdirSync(join(allowedRoot, "no-config"), { recursive: true });
  writeFileSync(
    join(allowedRoot, "acme", ".delivery-ledger"),
    "# which engagement this repo's sessions belong to\nengagement=acme-corp\nstack=react-native\n",
  );
  // A file that tries to take over the destination or the credential.
  mkdirSync(join(allowedRoot, "hostile"), { recursive: true });
  writeFileSync(
    join(allowedRoot, "hostile", ".delivery-ledger"),
    [
      "engagement=hostile-repo",
      "DELIVERY_LEDGER_URL=https://attacker.example",
      "DELIVERY_LEDGER_INGEST_TOKEN=dl_stolen",
      "url=https://attacker.example",
      "token=dl_stolen",
    ].join("\n") + "\n",
  );
  // A file that would execute if the script ever sourced it.
  mkdirSync(join(allowedRoot, "exec-attempt"), { recursive: true });
  writeFileSync(
    join(allowedRoot, "exec-attempt", ".delivery-ledger"),
    `engagement=$(touch ${join(sandbox, "PWNED")})\nstack=\`touch ${join(sandbox, "PWNED2")}\`\n`,
  );
});

describe("B61 — per-project attribution via .delivery-ledger", () => {
  it("reads engagement and stack from the repo's own file", () => {
    const { body } = run(join(allowedRoot, "acme"));
    expect(body?.engagement).toBe("acme-corp");
    expect(body?.stack).toBe("react-native");
  });

  it("finds the file from a nested subdirectory, since cwd is rarely the repo root", () => {
    const { body } = run(join(allowedRoot, "acme", "deep", "nested"));
    expect(body?.engagement).toBe("acme-corp");
  });

  it("omits both when no file exists — unchanged behaviour, not a guess", () => {
    const { posted, body } = run(join(allowedRoot, "no-config"));
    expect(posted).toBe(true);
    expect(body?.engagement).toBeUndefined();
    expect(body?.stack).toBeUndefined();
  });

  it("lets the per-project file win over the global env default", () => {
    const { body } = run(join(allowedRoot, "acme"), {
      DELIVERY_LEDGER_STACK: "nextjs-supabase",
      DELIVERY_LEDGER_ENGAGEMENT: "delivery-ledger",
    });
    expect(body?.stack).toBe("react-native");
    expect(body?.engagement).toBe("acme-corp");
  });

  it("still honours the global env var when the repo states nothing", () => {
    const { body } = run(join(allowedRoot, "no-config"), {
      DELIVERY_LEDGER_STACK: "nextjs-supabase",
    });
    expect(body?.stack).toBe("nextjs-supabase");
  });

  it("SECURITY: a repo file cannot redirect the post to another host", () => {
    const { url } = run(join(allowedRoot, "hostile"));
    expect(url).toBe("https://ledger.example/api/ingest/session");
    expect(url).not.toContain("attacker.example");
  });

  it("SECURITY: a repo file cannot set any key but engagement and stack", () => {
    const { body } = run(join(allowedRoot, "hostile"));
    // It may name its own engagement - that is the feature working.
    expect(body?.engagement).toBe("hostile-repo");
    expect(JSON.stringify(body)).not.toContain("dl_stolen");
    expect(JSON.stringify(body)).not.toContain("attacker.example");
  });

  it("SECURITY: the file is parsed, never sourced — no command substitution runs", () => {
    run(join(allowedRoot, "exec-attempt"));
    expect(existsSync(join(sandbox, "PWNED"))).toBe(false);
    expect(existsSync(join(sandbox, "PWNED2"))).toBe(false);
  });

  it("does not look above the allowlisted root for a config file", () => {
    writeFileSync(join(sandbox, ".delivery-ledger"), "engagement=outside-scope\n");
    const { body } = run(join(allowedRoot, "no-config"));
    expect(body?.engagement).toBeUndefined();
  });
});
