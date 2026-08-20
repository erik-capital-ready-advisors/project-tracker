/**
 * Tier 1 fixtures: hand-authored strings reproducing the shape of the fleet's
 * QA report (`.fleet/qa-report-<run>.md`), whose `## Issues` template is fixed
 * by `~/.claude/agents/qa-reviewer.md`. Tooling detail only -- no client names,
 * no schema names, no domain terms. Real reports live in the gitignored
 * `fixtures-local/` tier.
 *
 * Note the vocabulary disagreement this fixture deliberately preserves: the QA
 * agent grades `Important`, the defect enum (FR-63) says `major`. The parser
 * maps it and keeps the artifact's own word in `rawSeverity`.
 */

export const QA_REPORT = `# QA report zz01

**Status:** FAIL
**Branch:** agent-build/zz01 (HEAD 71b9683)
**Critical:** 2 · **Important:** 1 · **Minor:** 1

## Verdict

Do not ship. A boundary is claimed and unproven.

## Issues

### Critical

1. **Anon role can write the ledger table** — \`supabase/migrations/002_core.sql:44\` (FR-6)
   - What: the grant block hands \`anon\` INSERT and UPDATE.
   - Why it matters: an unauthenticated PATCH returns 204 and the row changes.
   - Evidence: anon PATCH observed 204, anon GET observed 200 with rows.
   - Fix: revoke all on the table from anon.
2. **RLS claimed but never probed** — \`.fleet/specialist-reports/zz01/i1.md\`
   - What: the report states "RLS verified" with no status codes behind it.
   - Why it matters: an unverified boundary that reads as verified is worse than one known to be unverified.
   - Fix: run the probe and paste the codes.

### Important

3. **Rate limit missing on the ingest route** — \`src/app/api/ingest/route.ts:12\`
   - What: no limiter on an unauthenticated write path.
   - Why it matters: an unmetered endpoint is a denial-of-service with a one-line exploit.
   - Fix: wrap the handler in the existing limiter.

### Minor

4. **Fragile test selectors** — \`tests/shell.spec.ts:20\`
   - What: queries by class name rather than role.
   - Fix: query by role and accessible name.

## Verification performed

- Build (pnpm): PASS
`;

/**
 * The shapes the parser must refuse. Under a heading it does not know, and a
 * finding with no severity heading above it at all. Both are \`unparsed\` --
 * widening the heading pattern to swallow them is the failure the unparsed
 * discipline exists to prevent.
 */
export const QA_REPORT_UNKNOWN_SHAPES = `# QA report zz02

## Issues

1. **Findings filed before any severity heading** — \`src/x.ts:3\`
   - What: the report author started the list without a heading.

### Blocker

2. **Graded on a scale this parser does not know** — \`src/y.ts:9\`
   - What: "Blocker" is not one of critical / important / minor.

### Nitpick

3. **Also not a known grade** — \`src/z.ts:1\`
`;

/** A report with no `## Issues` section at all. Zero defects, not an error. */
export const QA_REPORT_CLEAN = `# QA report zz03

**Status:** PASS

## Verdict

Nothing to act on.

## Verification performed

- Build (pnpm): PASS
`;

/**
 * The shapes the REAL corpus uses, which the fixtures above do not.
 *
 * `qa-report-b0952e.md` was written once and then edited in place as findings
 * were fixed, so it carries three things the synthetic fixtures never showed:
 * a struck-through closure record that repeats a finding recorded below it, a
 * bracketed status marker as a SEPARATE leading bold span, and the same marker
 * folded INTO the title's own bold span. Copied from that report rather than
 * invented — the first two entries are byte-for-byte, the rest trimmed for
 * length.
 *
 * Wiring the parser into ingest is what exposed all of this: run b0952e's
 * report produced 15 defects, every one `open`, three titled with a status
 * marker, when the report says one critical and two important are closed and a
 * fourth was withdrawn as wrong.
 */
export const QA_REPORT_EDITED_IN_PLACE = `# QA report b0952e

## Issues

### Critical

1. ~~**Mode-1 ingest is inoperable**~~ — **CLOSED at \`c65e44d\`, re-verified by me through the product path.** Original finding retained below as the record.

1. **Mode-1 ingest is inoperable: \`service_role\` cannot execute \`app.gates_are_closed_set\`** — \`supabase/migrations/20260819165903\`
   - What: a CHECK constraint evaluates in the caller's role. FR-14.

### Important

1. **[CLOSED at \`c65e44d\`]** **\`pnpm e2e\` is red on any correctly configured machine** — \`e2e/sign-in.spec.ts:56\`
   - **Re-verified:** \`pnpm exec playwright test\` now exits **0**.

2. **[WITHDRAWN — my attribution was wrong]** **An explicit \`engagementSlug\` is silently discarded**
   - **Correction:** explicit-slug resolution was never broken.

3. **[NEW at \`c65e44d\`] \`/api/waits\` still accepts unrecognised keys** — FR-33
   - What: the tightening did not reach this endpoint.

4. **\`app.rate_limit_counters\` shipped with no §7a classification**
   - What: migration \`20260819144647\` creates a 22nd table.

### Minor

1. **[REOPENED by someone]** **A marker this product has never seen**
   - What: the status vocabulary is not closed, so an unknown marker must not be guessed at.

## Verification performed

- Nothing further.
`;
