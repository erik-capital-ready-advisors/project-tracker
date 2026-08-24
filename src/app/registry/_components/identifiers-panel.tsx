import { ShieldCheck } from "lucide-react";

import { formatIdentifier } from "@/lib/registry-display";
import type { EngagementRecord } from "@/lib/server/registry/types";
import { cn } from "@/lib/utils";

/**
 * FR-77 — where this engagement was actually provisioned.
 *
 * The requirement states its own reason: these identifiers exist so the
 * wrong-account failure mode is visible in one lookup instead of discovered
 * during an incident. A prior run in this practice provisioned into the wrong
 * organisation and found six other clients' databases sitting next to it. This
 * panel is what makes that a glance.
 *
 * So it renders all five rows unconditionally, including the ones with nothing
 * in them. A panel that hides its empty fields tells you the same thing whether
 * an identifier was never recorded or the panel simply was not looking.
 *
 * FR-78's refusal is named here rather than only in the form, because the reason
 * these columns are classified `personal` instead of `sensitive` is precisely
 * that the system refuses the input which would break the classification.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="identifiers-panel"
 *   data-verify-recorded="<how many of the five are set>"
 *   data-verify-unit="identifier-row", data-verify-field, data-verify-recorded
 */

const ROWS = [
  { field: "dbOrg", label: "Database organisation" },
  { field: "dbProjectRef", label: "Database project ref" },
  { field: "hostingTeam", label: "Hosting team" },
  { field: "hostingProject", label: "Hosting project" },
  { field: "productionUrl", label: "Production URL" },
] as const;

export function IdentifiersPanel({
  engagement,
}: {
  engagement: EngagementRecord;
}) {
  const values = ROWS.map((row) => ({
    ...row,
    ...formatIdentifier(engagement[row.field]),
  }));
  const recorded = values.filter((value) => value.recorded).length;

  return (
    <section
      className="border-border rounded-lg border"
      data-verify-unit="identifiers-panel"
      data-verify-recorded={recorded}
      aria-labelledby="provisioning-heading"
    >
      <header className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 id="provisioning-heading" className="text-sm font-semibold">
          Provisioning
        </h2>
        <span className="ident text-muted-foreground text-xs">FR-77 · FR-78</span>
        <span className="ident text-muted-foreground ml-auto text-xs">
          {recorded}/{ROWS.length} recorded
        </span>
      </header>

      <dl className="divide-border divide-y">
        {values.map((value) => (
          <div
            key={value.field}
            /* Label above value, not beside it. Measured: side by side in the
               detail page's 22rem sidebar, a 20-character project ref wrapped
               mid-token as `onpvolboecjpdkvurj / af`. These identifiers exist to
               be COMPARED against an account page in another tab, and a token
               broken across two lines at an arbitrary point is the one shape
               that makes that comparison harder rather than easier. */
            className="flex flex-col gap-0.5 px-4 py-2"
            data-verify-unit="identifier-row"
            data-verify-field={value.field}
            data-verify-recorded={value.recorded}
          >
            <dt className="text-muted-foreground text-xs">{value.label}</dt>
            <dd
              className={cn(
                "ident min-w-0 text-xs break-all",
                value.recorded
                  ? "text-foreground"
                  : "text-muted-foreground/85 italic",
              )}
            >
              {value.text}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground border-border flex items-start gap-2 border-t px-4 py-2.5 text-xs">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
        <span className="max-w-prose">
          Identifiers, never secrets. The database refuses a value shaped like a
          key or a token, which is what keeps these columns classified as
          identifiers rather than credentials (FR-78).
        </span>
      </p>
    </section>
  );
}
