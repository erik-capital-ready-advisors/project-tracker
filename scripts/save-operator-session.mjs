/**
 * Save a signed-in operator session for `pnpm gate:m27:e2e`.
 *
 *     node scripts/save-operator-session.mjs
 *
 * Replaces the `playwright codegen --save-storage=…` ritual, which has two
 * traps. It writes the file only when you close the browser, so it looks like
 * nothing happened; and it will cheerfully save an `aal1` session, which the
 * gate then rejects hours later with `rendered the operator gate` — a message
 * that names neither the cause nor the fix.
 *
 * This refuses to save anything below `aal2`. A saved session that cannot pass
 * the gate is worse than no session, because the failure it produces points at
 * the wrong thing.
 *
 * The file it writes IS A CREDENTIAL. `.playwright-auth/` is gitignored.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const OUT = process.env.M27_STORAGE_STATE ?? ".playwright-auth/operator.json";

// Fail early and in words, rather than opening a browser onto nothing.
try {
  const probe = await fetch(`${ORIGIN}/sign-in`);
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (error) {
  console.error(`\nNothing is answering at ${ORIGIN} (${error.message}).`);
  console.error("Start the app first:  pnpm dev\n");
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${ORIGIN}/sign-in`);

console.log(`
${"─".repeat(68)}
  A browser window is open at ${ORIGIN}/sign-in

  1. Enter your email and password.
  2. Enter the six-digit code from your authenticator app.
  3. Wait until you land on the ledger home page.
  4. Come back HERE and press Enter.  (Leave the browser open.)
${"─".repeat(68)}
`);

await new Promise((resolve) => process.stdin.once("data", resolve));

// Read the assurance level out of the access token rather than trusting the
// landing URL: reaching "/" is not proof of aal2, and aal2 is the whole point.
const cookie = (await ctx.cookies()).find(
  (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
);

if (!cookie) {
  console.error("\nNo Supabase session cookie was found — the sign-in did not complete.");
  console.error("Nothing was saved. Re-run this and finish both steps.\n");
  await browser.close();
  process.exit(1);
}

let aal = null;
try {
  const raw = decodeURIComponent(cookie.value).replace(/^base64-/, "");
  const session = JSON.parse(Buffer.from(raw, "base64").toString());
  aal = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64").toString(),
  ).aal;
} catch {
  console.error("\nThe session cookie could not be read. Nothing was saved.\n");
  await browser.close();
  process.exit(1);
}

if (aal !== "aal2") {
  console.error(`
The session is "${aal}", not "aal2" — the second factor was not completed.

NOTHING WAS SAVED, on purpose. An aal1 session reads no rows (app.is_operator()
demands aal2), so the gate would fail later saying "rendered the operator gate",
which looks like a broken gate rather than an unfinished sign-in.

Re-run this and enter the six-digit code as well as the password.
`);
  await browser.close();
  process.exit(1);
}

mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
writeFileSync(OUT, JSON.stringify(await ctx.storageState(), null, 2));
await browser.close();

console.log(`
Saved ${OUT}  (aal2 confirmed)

Now run the gate:

  M27_BASE_URL=${ORIGIN} M27_STORAGE_STATE=${OUT} pnpm gate:m27:e2e
`);
process.exit(0);
