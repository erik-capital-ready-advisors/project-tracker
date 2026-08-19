/**
 * Tier 1 fixtures: hand-authored strings reproducing every artifact *shape* the
 * parsers must handle. They carry tooling detail and no client detail -- no
 * client names, no schema names, no domain terms. Spec section 7a classifies
 * work-item prose `sensitive`, so real fleet artifacts live in the gitignored
 * `fixtures-local/` tier instead and are exercised by `ingestRun.corpus.test.ts`.
 */

export const MANIFEST = `# Build manifest zz01

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Library capability survey | researcher | — | **done** — gate SKIP (research note). |
| u1 | ui | 1 | App shell and design system. FR-1 to FR-5 | ui-designer | — | **done** — gate PASS, merged \`05ac5bd\` (48 files). |
| i1 | integration | 1 | Schema, RLS, encryption. FR-6–FR-9 | api-integrator | r1 | **done** — gate PASS, merged \`71b9683\`. 2 NOT VERIFIED, both named |
| i2 | integration | 2 | Ingest engine. FR-12, FR-15 to FR-18 | api-integrator | i1, u1 | **done (code)** — gate PASS. **All DB-side controls NOT VERIFIED.** |
| u2 | ui | 2 | Dashboard panels | ui-designer | u1, i2 | pending |
| u3 | ui | 2 | Settings surface | ui-designer | u1 | **superseded by u2 — NOT dispatched.** u2 shipped all four items. **Scope moved; this is a decision, not a gap.** |
| d1 | deploy | 2 | Hosting, env vars, observed headers | devops | i2 | **BLOCKED — NOT dispatched. No Vercel account is reachable from this environment.** Measured, not assumed. \`NOT VERIFIED - no deployment exists\` |
| q1 | qa | 2 | Final review pass | qa-reviewer | all | **done** — verdict FAIL: 1 critical, 2 minor. |

## Milestone mapping

| Milestone | Work-units | Notes |
|---|---|---|
| M1.1 Foundation | i1, u1 | FR-1 to FR-9 |
`;

export const MANIFEST_BLOCKED = `# Build manifest zz02

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Constant confirmation | researcher | — | done |

## Blocked — carried, not dispatched

| ID | Type | Milestone | Blocker | Status |
|---|---|---|---|---|
| b-m11 | integration | M1.1 Foundation — schema and auth (FR-1–FR-5) | B1 — hosting unresolved | blocked |
| b-m12 | ui | M1.2 Surfaces — CRUD and import (FR-6–FR-13) | B1, and depends on M1.1 | blocked |
| b-m14 | integration | M1.4 Import — parsers and matching | B3 — no real sample exists | blocked |
| b-cpy | copy | Microcopy and error strings | No UI surface exists | blocked |
| b-m01 | docs | M0.1 Vendor summary | Not blocked — but it is Erik's deliverable, out of the fleet's lane | not dispatched |
`;
