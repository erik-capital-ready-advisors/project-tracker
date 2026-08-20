import "server-only";

import type { AuditCapableClient } from "@/lib/api/audit";
import { writeAuditLog } from "@/lib/api/audit";
import { apiError } from "@/lib/api/errors";
import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";

import type { ExportReading } from "./document";
import { readExportDocument } from "./document";

/**
 * FR-60 — run the export.
 *
 * One RPC. The whole point of `app.export_document()` is that the row cap never
 * enters the path: PostgREST answers an unbounded table read with at most 1000
 * rows and `error === null`, so a truncated export would be indistinguishable
 * from a complete one right here, at the call site, with nothing to check it
 * against. Reading inside the database removes that failure rather than
 * defending against it.
 *
 * **Operator only, and there is no agent capability for it.** FR-5 defines
 * exactly two capabilities and neither is an export; §7a refuses agent tokens
 * `contract_milestone`, `operator`, `agent_token` and `audit_log`, and a full
 * export is all four. Adding an `export:read` capability would be a spec change,
 * so this reaches the operator's session and nothing else.
 *
 * The read is audited. An export is the single action in this product that
 * removes every record from the protections around it, and FR-59 records writes
 * — this one is recorded because of what it is, not because it writes.
 */

export interface ExportRun {
  /** The document exactly as the database returned it. This is what gets written to the file. */
  document: unknown;
  /** The strict reading of it. `unparsed` here means the file is damaged, not merely odd. */
  reading: ExportReading;
}

export async function runExport(): Promise<ExportRun> {
  const operator = await requireOperator();
  const db = createServiceClient();

  const { data, error } = await db.rpc("export_everything");

  if (error) {
    throw apiError(
      "internal_error",
      "The export could not be read. Nothing partial is being returned: a partial " +
        "export that presents itself as complete is worse than no export at all.",
    );
  }

  await writeAuditLog(db as unknown as AuditCapableClient, {
    actor: operator.profile?.id ?? operator.userId ?? "unknown_operator",
    actorType: "operator",
    action: "export.read",
    targetTable: null,
    targetId: null,
    outcome: "allowed",
  });

  return { document: data, reading: readExportDocument(data) };
}
