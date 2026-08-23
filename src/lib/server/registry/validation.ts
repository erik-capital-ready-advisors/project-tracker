import { apiError } from "@/lib/api";

import type { EngagementInput, MilestoneInput } from "./types";

/**
 * Input validation for the registry, as pure functions.
 *
 * Everything here is testable without a database, which matters because this is
 * the one place in the product where Erik types data (FR-13) and therefore the
 * one place where a validation rule is felt rather than inferred.
 *
 * **What this file deliberately does NOT do is pre-empt FR-78.** It does not
 * carry its own copy of `app.looks_like_secret()`. The refusal belongs in the
 * database, where it also covers a write that never came through this path, and
 * a second implementation here would drift from the first and produce two
 * different answers to the same question. `errors.ts` surfaces the database's
 * refusal instead.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `FR-12`, `D-4`. The reference vocabulary the schema stores as text. */
const REQUIREMENT_REF = /^(FR|D)-\d+$/;

const MAX = {
  slug: 128,
  clientName: 256,
  freeText: 512,
  path: 1024,
  notes: 4000,
  stacks: 50,
  acceptance: 200,
} as const;

function bad(message: string): never {
  throw apiError("invalid_request", message);
}

function trimmedOrNull(value: string | null, field: string, max: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) bad(`\`${field}\` exceeds ${max} characters.`);
  return trimmed;
}

/**
 * FR-9 + FR-77. Returns the normalised input or throws `invalid_request`.
 *
 * `status`, `contractType` and `source` are free text on Erik's explicit
 * instruction: a closed set here would be a guess at his business enforced by
 * the database, and a wrong guess is expensive to undo. They are length-bounded
 * and nothing more.
 */
export function validateEngagement(input: EngagementInput): EngagementInput {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG.test(slug) || slug.length > MAX.slug) {
    bad(
      "`slug` must be lowercase letters, digits and single hyphens — it is the " +
        "URL key for this engagement on every screen.",
    );
  }

  const clientName = input.clientName.trim();
  if (clientName === "") bad("`clientName` is required.");
  if (clientName.length > MAX.clientName) {
    bad(`\`clientName\` exceeds ${MAX.clientName} characters.`);
  }

  if (input.stacks.length > MAX.stacks) {
    bad(`\`stacks\` carries more than ${MAX.stacks} entries.`);
  }
  const stacks = [
    ...new Set(
      input.stacks
        .map((stack) => stack.trim())
        .filter((stack) => stack !== "" && stack.length <= MAX.freeText),
    ),
  ];

  const productionUrl = trimmedOrNull(input.productionUrl, "productionUrl", MAX.path);
  if (productionUrl !== null && !productionUrl.startsWith("https://")) {
    // Asserted here as well as by `engagement_production_url_https`, so the
    // operator gets a sentence rather than a constraint name. Never disable or
    // relax the scheme check: this URL is where client data is served from.
    bad("`productionUrl` must begin with https://.");
  }

  return {
    slug,
    clientName,
    source: trimmedOrNull(input.source, "source", MAX.freeText),
    contractType: trimmedOrNull(input.contractType, "contractType", MAX.freeText),
    status: trimmedOrNull(input.status, "status", MAX.freeText) ?? "active",
    repoPath: trimmedOrNull(input.repoPath, "repoPath", MAX.path),
    specPath: trimmedOrNull(input.specPath, "specPath", MAX.path),
    fleetDir: trimmedOrNull(input.fleetDir, "fleetDir", MAX.path),
    stacks,
    dbOrg: trimmedOrNull(input.dbOrg, "dbOrg", MAX.freeText),
    dbProjectRef: trimmedOrNull(input.dbProjectRef, "dbProjectRef", MAX.freeText),
    hostingTeam: trimmedOrNull(input.hostingTeam, "hostingTeam", MAX.freeText),
    hostingProject: trimmedOrNull(input.hostingProject, "hostingProject", MAX.freeText),
    productionUrl,
  };
}

/** FR-10 + FR-11. */
export function validateMilestone(input: MilestoneInput): MilestoneInput {
  const name = input.name.trim();
  if (name === "") bad("`name` is required.");
  if (name.length > MAX.freeText) bad(`\`name\` exceeds ${MAX.freeText} characters.`);

  if (input.amount !== null) {
    if (!Number.isFinite(input.amount)) bad("`amount` must be a finite number.");
    if (input.amount < 0) bad("`amount` must not be negative.");
  }

  const dueDate = trimmedOrNull(input.dueDate, "dueDate", 32);
  if (dueDate !== null && !DATE.test(dueDate)) {
    bad("`dueDate` must be an ISO date, YYYY-MM-DD.");
  }

  if (input.acceptance.length > MAX.acceptance) {
    bad(`\`acceptance\` carries more than ${MAX.acceptance} references.`);
  }
  const acceptance = [
    ...new Set(input.acceptance.map((ref) => ref.trim().toUpperCase()).filter(Boolean)),
  ];
  for (const ref of acceptance) {
    if (!REQUIREMENT_REF.test(ref)) {
      bad(
        `\`${ref}\` is not a requirement reference. Acceptance is stated as ` +
          `\`FR-nn\` or \`D-nn\` — requirements are matched by reference and ` +
          `never by their text, because the text is encrypted (§7a).`,
      );
    }
  }

  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) bad("`currency` must be a three-letter code.");

  return {
    name,
    amount: input.amount,
    currency,
    dueDate,
    notes: trimmedOrNull(input.notes, "notes", MAX.notes),
    acceptance,
  };
}

/**
 * FR-11. A submitted or paid date, entered in one action.
 *
 * `null` clears the date, which is how a mis-click is undone.
 */
export function validateMilestoneDate(value: string | null, field: string): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!DATE.test(trimmed)) bad(`\`${field}\` must be an ISO date, YYYY-MM-DD.`);
  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

/**
 * FR-12. Which acceptance references name a requirement that does not exist.
 *
 * Pure, so the rule is testable without a database: the caller supplies the refs
 * the engagement actually has.
 */
export function unknownRequirementRefs(
  acceptance: string[],
  knownRefs: string[],
): string[] {
  const known = new Set(knownRefs);
  return acceptance.filter((ref) => !known.has(ref));
}
