import { ApiError, apiError } from "@/lib/api/errors";
import { exportFilename } from "@/lib/server/export/document";
import { runExport } from "@/lib/server/export/run";

/**
 * FR-60 — the download.
 *
 * ## This route is not like the others under /api
 *
 * Every other route in this tree authenticates a **bearer token** through
 * `guard()`. This one authenticates the **operator's session cookie**, and it
 * has to, because there is no capability that could authorise it: FR-5 defines
 * exactly two, and §7a refuses agent tokens `contract_milestone`, `operator`,
 * `agent_token` and `audit_log` — which a full export is all four of. Inventing
 * an `export:read` capability would be a spec change, not an implementation
 * detail, so it is not invented here.
 *
 * The practical consequence, stated so nobody looks for it: **an agent cannot
 * take an export.** That is the intended behaviour.
 *
 * ## Why a route and not a server action
 *
 * A server action returns a value to React; a download needs a response with a
 * `Content-Disposition`, so the browser writes a file rather than the page
 * holding a multi-megabyte string in memory and rebuilding it as a blob.
 *
 * `no-store` because the response body is the entire ledger, decrypted. Nothing
 * about it should sit in a shared cache, and Vercel's edge will honour the
 * header. **It is on the refusal path too**, not only the success path — a
 * header that appears only in the case nobody exercises is not a control, and
 * `e2e/export.spec.ts` asserts it against the response an unauthenticated caller
 * actually gets.
 */

/** On every response this route produces, including the refusals. */
const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { document, reading } = await runExport();

    if (reading.kind === "unparsed") {
      // The database answered and the answer did not survive being read. Serving
      // the file anyway would hand over something that looks like a backup.
      throw apiError(
        "internal_error",
        `The export could not be read back and is not being served: ${reading.reason}`,
      );
    }

    return new Response(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(
          reading.summary.exportedAt,
        )}"`,
        ...NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse(NO_STORE);
    return apiError(
      "internal_error",
      "The export could not be produced. Nothing partial was returned.",
    ).toResponse(NO_STORE);
  }
}
