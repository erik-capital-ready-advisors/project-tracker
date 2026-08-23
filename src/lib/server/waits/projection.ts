/**
 * FR-37 — a milestone's projected date accounts for the external waits between
 * now and its acceptance criteria.
 *
 * *"A seven-day store review moves a date that no amount of build speed can
 * recover."* The arithmetic is `projectMilestone` in `@/lib/ingest/waits`,
 * already built and tested; this module supplies it with rows.
 *
 * ## Read this before calling it from a route
 *
 * It reads `contract_milestone`, and **§7a refuses that table to agent tokens
 * entirely** (FR-5). `agentScopedDb` throws `forbidden_table` on any attempt,
 * which is the control working. So this function must be called with an
 * **operator-authenticated** service client — from a server component or a
 * server action behind `requireOperator()` — and never from inside
 * `withAgentRoute`. It is exported for `i5`/`i7`'s Committed screen, which is
 * operator-side.
 *
 * Only `id`, `name` and `due` are read. `amount` is encrypted and is not needed
 * to project a date; not selecting it means no decryption round-trip and no
 * commercial figure in memory for a screen that is about calendars.
 */

import { apiError } from "@/lib/api";
import { projectMilestone } from "@/lib/ingest/waits";
import type { ExternalWait } from "@/lib/ingest/types";
import type { ServiceClient } from "@/lib/supabase/service";

import { toIsoDay } from "./input";

export interface MilestoneProjection {
  milestoneId: string;
  name: string;
  due: string | null;
  /** The date the waits push it to, or `due` when nothing pushes it. */
  projected: string | null;
  slippedDays: number;
  /** The id of the wait driving the slip, or null when nothing is. */
  drivenBy: string | null;
}

/** Bounded for the same reason every other read in this unit is. */
export const MILESTONE_LIMIT = 200;

export async function projectMilestoneDates(
  db: ServiceClient,
  engagementSlug: string,
  today: string,
): Promise<MilestoneProjection[]> {
  const { data: engagement, error: engagementError } = await db
    .from("engagement")
    .select("id")
    .eq("slug", engagementSlug)
    .maybeSingle();

  if (engagementError) throw apiError("internal_error", "Could not read the engagement.");
  if (!engagement) throw apiError("invalid_request", "No engagement has that slug.");

  const [milestones, waits] = await Promise.all([
    db
      .from("contract_milestone")
      .select("id, name, due_date")
      .eq("engagement_id", engagement.id)
      .limit(MILESTONE_LIMIT),
    db
      .from("external_wait")
      .select("id, label, owner, started_at, expected_by, resolved_at")
      .eq("engagement_id", engagement.id)
      .is("resolved_at", null)
      .limit(MILESTONE_LIMIT),
  ]);

  if (milestones.error) {
    throw apiError("internal_error", "Could not read the milestones.");
  }
  if (waits.error) {
    throw apiError("internal_error", "Could not read the external waits.");
  }

  const open: ExternalWait[] = (waits.data ?? []).flatMap((row) => {
    const startedOn = row.started_at === null ? null : toIsoDay(row.started_at);
    if (startedOn === null) return [];
    return [
      {
        id: row.id,
        engagement: engagement.id,
        label: row.label,
        owner: row.owner ?? "",
        startedAt: startedOn,
        expectedBy: row.expected_by === null ? null : toIsoDay(row.expected_by),
        resolvedAt: null,
        blocks: [],
      },
    ];
  });

  return (milestones.data ?? []).map((milestone) => {
    const due =
      milestone.due_date === null ? null : toIsoDay(milestone.due_date);
    const projection = projectMilestone(due, open, today);
    return {
      milestoneId: milestone.id,
      name: milestone.name,
      due,
      projected: projection.projected,
      slippedDays: projection.slippedDays,
      drivenBy: projection.drivenBy,
    };
  });
}
