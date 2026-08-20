/**
 * FR-32 to FR-36 — declaring and resolving an external wait, validated at the
 * boundary.
 *
 * Pure. No database, no clock.
 *
 * ## `owner_type` is free text, deliberately
 *
 * Erik settled this: `engagement.status`, `engagement.contract_type`,
 * `engagement.source` and `external_wait.owner_type` stay free text. No enum is
 * invented here. FR-29's reason classes and FR-30's dispositions *are* stated
 * closed sets in the spec, and those are enums — the difference is whether the
 * spec wrote the set down, not whether one could be guessed.
 */

import { unknownKeyProblems } from "@/lib/api/unknown-keys";

import { RESOLUTION_METHOD } from "@/lib/server/workitems/rules";
import type { StoredResolutionMethod } from "@/lib/server/workitems/rules";

import type { ParseResult } from "@/lib/server/sessions/input";

export const WAIT_LIMITS = {
  label: 200,
  owner: 200,
  ownerType: 96,
  reason: 2000,
  probeTarget: 500,
  engagementSlug: 128,
  resolvedBy: 200,
  unitKey: 64,
  blocks: 200,
} as const;

export interface WaitDeclaration {
  engagementSlug: string;
  label: string;
  owner: string;
  ownerType: string | null;
  reason: string | null;
  /** `YYYY-MM-DD`. Whole days is the resolution FR-34's elapsed count works in. */
  startedOn: string;
  expectedBy: string | null;
  resolutionMethod: StoredResolutionMethod;
  probeTarget: string | null;
  /** Unit keys of the work items this wait blocks. */
  blocks: string[];
}

export interface WaitResolution {
  waitId: string;
  resolvedBy: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PREFIX = /^(\d{4}-\d{2}-\d{2})T/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reduce a date or an instant to a calendar day.
 *
 * This exists because of a trap worth naming: `@/lib/ingest/waits` does its
 * arithmetic by appending `T00:00:00Z` to whatever string it is handed. Hand it
 * a full timestamp and it builds `2026-08-19T12:00:00ZT00:00:00Z`, which parses
 * as `NaN` — and `NaN` day counts do not throw, they render as `NaN` days
 * waiting on the Blocked screen. Every value crossing into that module goes
 * through here first.
 */
export function toIsoDay(value: string): string | null {
  if (ISO_DAY.test(value)) return value;
  const match = ISO_INSTANT_PREFIX.exec(value);
  if (match && !Number.isNaN(Date.parse(value))) return match[1];
  return null;
}

function readString(
  source: Record<string, unknown>,
  field: string,
  max: number,
  errors: string[],
  required: boolean,
): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (typeof raw !== "string") {
    errors.push(`${field}: must be a string`);
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (trimmed.length > max) {
    errors.push(`${field}: longer than the ${max}-character limit`);
    return null;
  }
  return trimmed;
}

function readDay(
  source: Record<string, unknown>,
  field: string,
  errors: string[],
  required: boolean,
): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (typeof raw !== "string") {
    errors.push(`${field}: must be a date string`);
    return null;
  }
  const day = toIsoDay(raw);
  if (day === null) {
    errors.push(`${field}: must be a calendar date, e.g. 2026-08-19`);
    return null;
  }
  return day;
}

/**
 * Every field a wait declaration reads, in wire spelling.
 *
 * ## Why an unrecognised key here is worse than on the other ingest endpoints
 *
 * `expectedBy` is optional, and FR-34 computes the overdue flag from precisely
 * that field. So a caller sending `expected_by` — the snake_case spelling, which
 * is exactly the slip `/api/ingest/release`'s `deployed_at` case exists to catch
 * — used to get a `201` and a wait with **no expected-by date**: a wait that can
 * never go overdue, showing as fine forever on the Blocked screen. That is a
 * wrong `done` in the blocked dimension, which is the single failure this
 * project's central rule exists to prevent.
 *
 * There is **no server-owned field here** to exempt, unlike `source` on the
 * release endpoint. Every name below is read and used. `resolvedAt` might look
 * like a candidate — FR-36's "when" is the server's clock — but it has never
 * been accepted on this endpoint, so there is no caller to keep working and it
 * is refused like any other unrecognised key.
 */
const WAIT_DECLARATION_FIELDS = [
  "engagement",
  "label",
  "owner",
  "ownerType",
  "reason",
  "startedAt",
  "expectedBy",
  "probeTarget",
  "resolutionMethod",
  "blocks",
] as const;

/** FR-36. Both fields are required, so nothing here can go silently missing. */
const WAIT_RESOLUTION_FIELDS = ["id", "resolvedBy"] as const;

/** FR-32, FR-33, FR-35. */
export function parseWaitDeclaration(body: unknown): ParseResult<WaitDeclaration> {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ["body: expected a JSON object"] };
  }

  const engagementSlug = readString(
    body,
    "engagement",
    WAIT_LIMITS.engagementSlug,
    errors,
    true,
  );
  const label = readString(body, "label", WAIT_LIMITS.label, errors, true);
  // FR-32: "an owner outside the studio". A wait with no owner is a blocker,
  // and FR-38 groups the Blocked screen by owner precisely so the studio's
  // dependencies on other people are visible as such.
  const owner = readString(body, "owner", WAIT_LIMITS.owner, errors, true);
  const ownerType = readString(body, "ownerType", WAIT_LIMITS.ownerType, errors, false);
  const reason = readString(body, "reason", WAIT_LIMITS.reason, errors, false);
  const startedOn = readDay(body, "startedAt", errors, true);
  const expectedBy = readDay(body, "expectedBy", errors, false);
  const probeTarget = readString(
    body,
    "probeTarget",
    WAIT_LIMITS.probeTarget,
    errors,
    false,
  );

  let resolutionMethod: StoredResolutionMethod | null = "manual";
  const rawMethod = body.resolutionMethod;
  if (rawMethod !== undefined && rawMethod !== null && rawMethod !== "") {
    resolutionMethod = RESOLUTION_METHOD.parse(rawMethod);
    if (resolutionMethod === null) {
      errors.push(
        `resolutionMethod: must be one of ${RESOLUTION_METHOD.wireValues.join(", ")}`,
      );
    }
  }

  /**
   * FR-35 — a `probe` resolution method with no probe named is a Phase 2
   * automation promise with nothing behind it, and it would read on every
   * screen as "this one checks itself" when nothing does. `manual` is the
   * honest value where nobody can check it programmatically, and it is
   * always available.
   */
  if (resolutionMethod === "probe" && probeTarget === null) {
    errors.push(
      "probeTarget: required when resolutionMethod is `probe` — name the probe, " +
        "or use `manual`",
    );
  }

  if (startedOn !== null && expectedBy !== null && expectedBy < startedOn) {
    errors.push("expectedBy: is before startedAt");
  }

  const blocks: string[] = [];
  const rawBlocks = body.blocks;
  if (rawBlocks !== undefined && rawBlocks !== null) {
    if (!Array.isArray(rawBlocks)) {
      errors.push("blocks: must be an array of work-item unit keys");
    } else if (rawBlocks.length > WAIT_LIMITS.blocks) {
      errors.push(`blocks: more than the ${WAIT_LIMITS.blocks}-entry limit`);
    } else {
      for (const entry of rawBlocks) {
        if (typeof entry !== "string" || entry.trim() === "") {
          errors.push("blocks: every entry must be a non-empty unit key");
          continue;
        }
        if (entry.length > WAIT_LIMITS.unitKey) {
          errors.push("blocks: an entry exceeds the unit-key length limit");
          continue;
        }
        blocks.push(entry.trim());
      }
    }
  }

  errors.push(...unknownKeyProblems(body, WAIT_DECLARATION_FIELDS));

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      engagementSlug: engagementSlug as string,
      label: label as string,
      owner: owner as string,
      ownerType,
      reason,
      startedOn: startedOn as string,
      expectedBy,
      resolutionMethod: resolutionMethod as StoredResolutionMethod,
      probeTarget,
      blocks,
    },
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FR-36. */
export function parseWaitResolution(body: unknown): ParseResult<WaitResolution> {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ["body: expected a JSON object"] };
  }

  const waitId = readString(body, "id", 64, errors, true);
  if (waitId !== null && !UUID.test(waitId)) {
    errors.push("id: must be the wait's uuid");
  }
  // FR-36: "records who resolved it and when". The `when` is the server's
  // clock; the `who` cannot be, so it is required rather than defaulted to
  // something like "system" that would record nothing.
  const resolvedBy = readString(body, "resolvedBy", WAIT_LIMITS.resolvedBy, errors, true);

  errors.push(...unknownKeyProblems(body, WAIT_RESOLUTION_FIELDS));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { waitId: waitId as string, resolvedBy: resolvedBy as string } };
}
