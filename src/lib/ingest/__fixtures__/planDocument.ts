/**
 * Tier 1 fixtures for the FR-89 plan parser: hand-authored strings reproducing
 * every `writing-plans` document *shape* the parser must handle. They carry
 * tooling detail and no client detail — no client names, no schema names, no
 * domain terms. Spec section 7a classifies work-item prose `sensitive`.
 *
 * The Tier 2 oracle for this parser is `plan.md` at the repository root, a real
 * `writing-plans` artifact that is already committed here. It is read by
 * `planDocument.corpus.test.ts` and never copied into this file.
 */

/** The shape as the `writing-plans` skill emits it. Fences, prose, mixed marks. */
export const PLAN = `# Widget Pipeline Implementation Plan

> **For agentic workers:** Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** A pure module, written test-first.

## Global Constraints

- Pure functions only. No clock inside a rule.
- \`unparsed\` is the only default.

---

### Task 1: Package skeleton and types

Everything downstream produces records this module validates.

**Files:**
- Create: \`src/lib/widget/types.ts\`
- Create: \`src/lib/widget/types.test.ts\`

- [x] **Step 1: Write the failing test**

\`\`\`md
### Task 99: A heading inside a fence is not a task
- [ ] A step inside a fence is not a step
## Work-units
\`\`\`

- [ ] **Step 2: Run it and watch it fail**

### Task 2: The reader. FR-12 to FR-14

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Commit**

## Done when

Every task above is checked.
`;

/** A plan whose second task carries the FR-90 reconciliation id. */
export const PLAN_WITH_PLAN_ID = `### Task 1: First

- [ ] **Step 1: Do the thing**

### Task 2: Second

**Plan-id:** \`wp-2f7a\`

- [ ] **Step 1: Do the other thing**
`;

/** Every task-heading shape the parser must refuse to guess at. */
export const PLAN_WITH_UNPARSEABLE_HEADINGS = `### Task 1: The only well-formed heading

- [ ] **Step 1: Anchor the document as a plan**

### Task Twelve: A number the parser will not invent

### Task 3:

## Task 4: The wrong heading level

#### Task 5: Also the wrong heading level

### Task 6 — no colon at all
`;

/** Every step shape the parser must refuse to guess at. */
export const PLAN_WITH_UNPARSEABLE_STEPS = `### Task 1: One good step and five bad ones

- [ ] **Step 1: The well-formed one**
- [~] A mark nobody has defined
- [] An empty bracket
- [ ]
- [ ]NoSpaceAfterTheBracket
* [X] An asterisk bullet, checked
`;

/** Two ids in one task. Ambiguity on the reconciliation key is never resolved. */
export const PLAN_WITH_DUPLICATE_PLAN_ID = `### Task 1: Anchor

- [ ] **Step 1: Anchor the document as a plan**

### Task 2: Two ids

**Plan-id:** \`wp-aaa1\`
**Plan-id:** \`wp-bbb2\`

- [ ] **Step 1: Do the thing**
`;

/** An id line the parser cannot read. The key is never guessed at. */
export const PLAN_WITH_MALFORMED_PLAN_ID = `### Task 1: Anchor

- [ ] **Step 1: Anchor the document as a plan**

### Task 2: Unreadable id

**Plan-id:** see the tracking sheet

- [ ] **Step 1: Do the thing**
`;

/** Steps that belong to no task: before the first heading, and after the last. */
export const PLAN_WITH_ORPHAN_STEPS = `# Widget Pipeline

- [ ] **Step 0: A step before any task**

### Task 1: The only task

- [ ] **Step 1: A step that belongs to it**

## Done when

- [ ] **Step 9: A step under a trailing section**
`;

/**
 * NOT a plan document. A manifest — the artifact the fleet emits beside a plan,
 * and the likeliest thing to be handed to this parser by mistake.
 */
export const NOT_A_PLAN_MANIFEST = `# Build manifest zz01

## Work-units

| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |
|----|------|-------|-------------|---------------|-----------|--------|
| r1 | research | 1 | Library capability survey | researcher | — | **done** |
| u1 | ui | 1 | App shell | ui-designer | — | pending |
`;

/** NOT a plan document. Task headings, but nothing carries a step. */
export const NOT_A_PLAN_NO_STEPS = `# Widget Pipeline

### Task 1: A heading with prose under it

Write the module.

### Task 2: Another one

Write the tests.
`;

/** NOT a plan document. Checkbox steps, but no task heading carries them. */
export const NOT_A_PLAN_NO_HEADINGS = `# Widget checklist

- [ ] Write the module
- [x] Write the tests
- [ ] Ship it
`;

/** NOT a plan document. Ordinary prose. */
export const NOT_A_PLAN_PROSE = `# Meeting notes

We agreed to build the widget pipeline before the reader, and to leave the
export path alone until the reader lands.
`;
