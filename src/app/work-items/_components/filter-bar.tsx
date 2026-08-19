import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/native-select";

import {
  DISPOSITIONS,
  DISPOSITION_LABELS,
  EVIDENCE_SCOPES,
  EVIDENCE_SCOPE_LABELS,
  EXECUTION_MODES,
  EXECUTION_MODE_LABELS,
  EXECUTOR_KINDS,
  EXECUTOR_KIND_LABELS,
  UNAUTOMATED_REASONS,
  UNAUTOMATED_REASON_LABELS,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
} from "../_lib/labels";
import { PARAM } from "../_lib/query";
import type { WorkItemQuery } from "../_lib/query";

/**
 * FR-44's filter bar.
 *
 * ## It is a plain GET form, and that is a design decision worth naming
 *
 * No client component, no router push, no local state. The controls submit to
 * `/work-items` and the Server Component re-renders from the URL. What that buys:
 * a filtered view is a link Erik can bookmark or paste into a note, the back
 * button steps through filter changes correctly, and the screen works with
 * JavaScript still loading -- which matters on a dashboard whose whole promise
 * is an answer in under thirty seconds.
 *
 * ## Every control filters a clear column
 *
 * §7a: `work_item.description` and `raw_status` are pgcrypto columns and "there
 * is no cross-engagement full-text search over work items in v1". So there is no
 * search box here. Its absence is the requirement being met, not a gap -- adding
 * one is a change request with a design decision attached.
 *
 * ## One list, not three
 *
 * Execution mode is a filter sitting in the same row as every other filter, not
 * a tab strip above the table. `CLAUDE.md`: "Splitting them yields three lists
 * Erik has to merge in his head, which is the state this product exists to end."
 */
export function WorkItemFilterBar({ query }: { query: WorkItemQuery }) {
  return (
    <form
      method="get"
      action="/work-items"
      data-verify-unit="work-item-filters"
      data-verify-filtered={query.filtered ? "true" : "false"}
      className="border-border bg-muted/30 flex flex-wrap items-end gap-x-3 gap-y-3 rounded-lg border px-3 py-3"
    >
      {/* Sorting is not a filter, but it must survive one. Carried as hidden
          fields so submitting the form keeps the column Erik chose. */}
      <input type="hidden" name={PARAM.sort} value={query.sort} />
      <input type="hidden" name={PARAM.dir} value={query.direction} />

      {/* COPY: filter labels for the work-item list */}
      <Field id="filter-engagement" label="Engagement" className="w-40">
        <Input
          id="filter-engagement"
          name={PARAM.engagement}
          defaultValue={query.engagementSlug ?? ""}
          placeholder="any"
          autoComplete="off"
          spellCheck={false}
          className="ident"
        />
      </Field>

      <Field id="filter-mode" label="Mode" className="w-32">
        <NativeSelect
          id="filter-mode"
          name={PARAM.mode}
          defaultValue={query.executionMode ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {EXECUTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {EXECUTION_MODE_LABELS[mode]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field id="filter-executor" label="Executor" className="w-36">
        <NativeSelect
          id="filter-executor"
          name={PARAM.executor}
          defaultValue={query.executorKind ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {EXECUTOR_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {EXECUTOR_KIND_LABELS[kind]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field id="filter-status" label="Status" className="w-36">
        <NativeSelect
          id="filter-status"
          name={PARAM.status}
          defaultValue={query.status ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {WORK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {WORK_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {/* FR-30: both dispositions are filterable, so both are options and
          neither is the default. */}
      <Field id="filter-disposition" label="Disposition" className="w-32">
        <NativeSelect
          id="filter-disposition"
          name={PARAM.disposition}
          defaultValue={query.disposition ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {DISPOSITIONS.map((disposition) => (
            <option key={disposition} value={disposition}>
              {DISPOSITION_LABELS[disposition]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {/* FR-43: all four scopes are separately selectable. A single
          "verified / not verified" toggle here would be the collapse the
          requirement forbids, expressed as a control. */}
      <Field id="filter-evidence" label="Evidence" className="w-44">
        <NativeSelect
          id="filter-evidence"
          name={PARAM.evidence}
          defaultValue={query.evidenceScope ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {EVIDENCE_SCOPES.map((scope) => (
            <option key={scope} value={scope}>
              {EVIDENCE_SCOPE_LABELS[scope]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field id="filter-reason" label="Unautomated" className="w-44">
        <NativeSelect
          id="filter-reason"
          name={PARAM.reason}
          defaultValue={query.unautomatedReason ?? ""}
          className="ident"
        >
          <option value="">any</option>
          {UNAUTOMATED_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {UNAUTOMATED_REASON_LABELS[reason]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <label
        htmlFor="filter-blocked"
        className="text-muted-foreground flex h-8 items-center gap-2 text-xs font-medium"
      >
        <input
          type="checkbox"
          id="filter-blocked"
          name={PARAM.blocked}
          value="1"
          defaultChecked={query.blockedOnly}
          className="accent-primary size-3.5"
        />
        {/* COPY: label for the "waiting on an external wait" filter */}
        Waiting on a wait
      </label>

      <div className="ml-auto flex items-center gap-2">
        <Button type="submit" size="sm">
          {/* COPY: apply-filters button */}
          Apply
        </Button>
        {query.filtered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/work-items" data-verify-unit="clear-filters">
              {/* COPY: clear-filters link */}
              Clear
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
