import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Absent, CoverageChip, ExecutorChip } from "@/components/answer-chips";
import { EntityRef, EntityRefList } from "@/components/entity-ref";
import type { RefEntry, RefLookup } from "@/lib/answer-screen-refs";
import { fallbackLabel } from "@/lib/server/detail/types";
import { cn } from "@/lib/utils";

import type { EngagementCoverage as Coverage } from "@/lib/server/answers/untested";

/**
 * FR-80 — every requirement this section renders as text, in one batch.
 *
 * The work items are deliberately not here, and that is the point of FR-55:
 * `implementedBy` already carries the row id of each implementing work item, so
 * the hyperlink CR-003 Q11 ruled FR-55 requires costs nothing beyond rendering
 * it. The join M1.8 built is what made that possible; this is the other half.
 */
export function engagementCoverageRefEntries(coverage: Coverage): RefEntry[] {
  const requirement = (ref: string): RefEntry => ({
    kind: "requirement",
    engagement: coverage.engagement,
    ref,
  });

  return [
    ...coverage.uncoveredDetail.map((one) => requirement(one.ref)),
    ...coverage.unproven.map(requirement),
    ...coverage.selfCertifiedDetail.flatMap((test) =>
      test.covers.map(requirement),
    ),
  ];
}

/**
 * FR-48 / FR-49 / FR-55 — one engagement's coverage, in three sections that are
 * never added together.
 *
 * ## Why there is no "tested" number anywhere on this screen
 *
 * `covered`, `unproven` and `uncovered` mean different things and call for
 * different actions, and FR-49 exists because collapsing them loses the middle
 * one entirely:
 *
 *   * **uncovered** — nothing passing names this requirement. *Write a test.*
 *   * **unproven** — something passing names it, with an independent certifier,
 *     and the evidence scope was `not-verified`. The test exists and nobody
 *     checked it against the deployment. *Go and look.*
 *   * **self-certified** — something passing names it and the certifier is the
 *     executor of the work that implemented it. FR-47 calls this a finding, not
 *     coverage.
 *
 * A single "62% covered" bar would put all three behind one number, and the two
 * that most need Erik's attention are the two it would hide. So the counts strip
 * states each separately and the sections below list them separately.
 *
 * ## FR-55's link is the point of the uncovered section
 *
 * > Untested reports coverage per FR-48 and **links each uncovered requirement
 * > to the work item that implements it**.
 *
 * An uncovered requirement with a `done` work item behind it is a testing gap.
 * An uncovered requirement with **nothing** behind it is a different and usually
 * worse finding — nobody has built it — so the empty case is rendered as its own
 * statement rather than as a blank cell.
 *
 * Every join here runs on `FR-nn`. §7a encrypts `requirement.text` and leaves
 * `ref` clear, so there is no requirement prose on this screen at all, by
 * design rather than by omission.
 */
export function EngagementCoverage({
  coverage,
  refs,
}: {
  coverage: Coverage;
  refs: RefLookup;
}) {
  const covered = coverage.requirements - coverage.uncovered.length;

  return (
    <section
      data-verify-unit="engagement-coverage"
      data-verify-engagement={coverage.engagement}
      data-verify-requirements={coverage.requirements}
      data-verify-tests={coverage.tests}
      data-verify-mapped={coverage.mapped}
      data-verify-uncovered={coverage.uncovered.length}
      data-verify-unproven={coverage.unproven.length}
      data-verify-self-certified={coverage.selfCertified.length}
      className="border-border overflow-hidden rounded-lg border"
    >
      <header className="border-border bg-muted/40 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 className="ident text-sm font-semibold">
          {/* FR-80's engagement slug. `/registry/[slug]` is the engagement's
              detail view; `engagement` is not one of FR-81's eight kinds, so
              this is an ordinary anchor rather than an `<EntityRef>`. */}
          <Link
            href={`/registry/${coverage.engagement}`}
            data-verify-unit="engagement-link"
            data-verify-slug={coverage.engagement}
            className="rounded-sm underline-offset-2 hover:underline"
          >
            {coverage.engagement}
          </Link>
        </h2>
        <span className="text-muted-foreground text-xs">
          {coverage.clientName}
        </span>
      </header>

      <div className="border-border flex flex-wrap gap-x-6 gap-y-2 border-b px-3 py-2.5">
        <Count label="requirements" value={coverage.requirements} />
        <Count label="tests" value={coverage.tests} />
        <Count
          label="mapped"
          value={coverage.mapped}
          title="Requirement-to-test mappings recorded, which is not the same as requirements covered — one requirement can be mapped by several tests and by none that pass."
        />
        <Count
          label="covered"
          value={covered}
          tone={covered === coverage.requirements ? "good" : undefined}
        />
        <Count
          label="unproven"
          value={coverage.unproven.length}
          tone={coverage.unproven.length > 0 ? "warn" : undefined}
          title="FR-49: a passing test names it and the only covering evidence carries scope `not-verified`. Distinct from uncovered."
        />
        <Count
          label="uncovered"
          value={coverage.uncovered.length}
          tone={coverage.uncovered.length > 0 ? "bad" : undefined}
        />
        <Count
          label="self-certified tests"
          value={coverage.selfCertified.length}
          tone={coverage.selfCertified.length > 0 ? "warn" : undefined}
          title="FR-47: the certifier is the executor of the work the test covers. Marking your own work verified is a finding, not coverage."
        />
      </div>

      {/* ---- FR-55: uncovered, with the work item that implements it ---- */}
      {coverage.uncoveredDetail.length > 0 ? (
        <Section
          title="Uncovered requirements"
          note="Nothing passing names these. The work items beside each one claim to implement it."
          unit="uncovered-section"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">requirement</TableHead>
                  <TableHead className="whitespace-nowrap">state</TableHead>
                  <TableHead className="whitespace-nowrap">
                    implemented by
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.uncoveredDetail.map((one) => (
                  <TableRow
                    key={one.ref}
                    data-verify-unit="uncovered-requirement"
                    data-verify-ref={one.ref}
                    data-verify-implementers={one.implementedBy.length}
                  >
                    <TableCell className="whitespace-nowrap">
                      <EntityRef
                        kind="requirement"
                        label={one.ref}
                        id={refs("requirement", coverage.engagement, one.ref)}
                      />
                    </TableCell>
                    <TableCell>
                      <CoverageChip value="uncovered" />
                    </TableCell>
                    <TableCell>
                      {one.implementedBy.length === 0 ? (
                        // A different and usually worse finding than "built but
                        // untested", so it is stated rather than left blank.
                        <span
                          data-verify-unit="unimplemented-requirement"
                          className="text-state-blocked text-xs"
                        >
                          no work item claims to implement this
                        </span>
                      ) : (
                        <span className="flex flex-col gap-1">
                          {one.implementedBy.map((item) => (
                            <span
                              key={item.id}
                              data-verify-unit="implementer"
                              data-verify-id={item.id}
                              data-verify-status={item.status}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              {/*
                                FR-55, the half CR-003 Q11 ruled was missing:
                                "links" means a hyperlink. `item.id` is the
                                work item's row id, so this needs no resolution
                                and cannot dangle for a row that is right here
                                in the payload.

                                `fallbackLabel` rather than `Absent` where the
                                unit is null: a `hand` or `external` work item
                                has no unit key and is still the thing that
                                implements this requirement, so it gets a link
                                carrying the fleet's one agreed fallback label
                                rather than an em-dash that goes nowhere.
                              */}
                              <span className="text-xs font-medium">
                                <EntityRef
                                  kind="work_item"
                                  label={
                                    item.unit ??
                                    fallbackLabel("work_item", item.id)
                                  }
                                  id={item.id}
                                />
                              </span>
                              <span className="ident text-muted-foreground text-xs">
                                {item.status}
                              </span>
                              <ExecutorChip
                                kind={item.executorKind}
                                executor={item.executor}
                              />
                            </span>
                          ))}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      ) : null}

      {/* ---- FR-49: unproven, which is NOT uncovered ---- */}
      {coverage.unproven.length > 0 ? (
        <Section
          title="Unproven requirements"
          note="A passing test names each of these and its certifier did not build the work. The evidence scope was `not-verified` — the test exists and nobody checked it against a deployment."
          unit="unproven-section"
        >
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <CoverageChip value="unproven" />
            <EntityRefList
              refs={coverage.unproven.map((ref) => ({
                kind: "requirement" as const,
                label: ref,
                id: refs("requirement", coverage.engagement, ref),
              }))}
              empty="none"
            />
          </div>
        </Section>
      ) : null}

      {/* ---- FR-47 / FR-48: self-certified tests ---- */}
      {coverage.selfCertifiedDetail.length > 0 ? (
        <Section
          title="Self-certified tests"
          note="The certifier of each of these executed the work it covers. FR-47 reports this as a finding: it is a claim about the work by the person who did it."
          unit="self-certified-section"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">test</TableHead>
                  <TableHead className="whitespace-nowrap">harness</TableHead>
                  <TableHead className="whitespace-nowrap">covers</TableHead>
                  <TableHead className="whitespace-nowrap">certified by</TableHead>
                  <TableHead className="whitespace-nowrap">authored by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.selfCertifiedDetail.map((test) => (
                  <TableRow
                    key={test.id}
                    data-verify-unit="self-certified-test"
                    data-verify-id={test.id}
                  >
                    <TableCell className="max-w-sm">
                      <span className="block text-sm">{test.title}</span>
                      <span className="ident text-muted-foreground block text-xs">
                        {test.file}
                      </span>
                    </TableCell>
                    <TableCell className="ident text-muted-foreground whitespace-nowrap">
                      {test.harness}
                    </TableCell>
                    <TableCell>
                      <EntityRefList
                        refs={test.covers.map((ref) => ({
                          kind: "requirement" as const,
                          label: ref,
                          id: refs("requirement", coverage.engagement, ref),
                        }))}
                        empty="This test names no requirement."
                      />
                    </TableCell>
                    <TableCell className="ident text-xs whitespace-nowrap">
                      {test.certifiedBy ?? (
                        <Absent title="No certifier was recorded on this result." />
                      )}
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      {test.authoredBy ?? (
                        <Absent title="No author was recorded." />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      ) : null}

      {coverage.uncovered.length === 0 &&
      coverage.unproven.length === 0 &&
      coverage.selfCertifiedDetail.length === 0 ? (
        <p
          data-verify-unit="coverage-clean"
          className="text-muted-foreground px-3 py-3 text-sm"
        >
          {coverage.requirements === 0
            ? "No requirements are recorded for this engagement, so there is nothing to cover. This is not a clean coverage report."
            : "Every requirement in this engagement is covered by a passing test that somebody other than its builder certified, and every covering test reported what it observed. Whether any of it is deployed is a separate question — see Committed."}
        </p>
      ) : null}
    </section>
  );
}

function Section({
  title,
  note,
  unit,
  children,
}: {
  title: string;
  note: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div data-verify-unit={unit} className="border-border border-b last:border-b-0">
      <div className="px-3 pt-2.5 pb-1.5">
        <h3 className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </h3>
        <p className="text-muted-foreground mt-0.5 max-w-3xl text-xs">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Count({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "bad";
  title?: string;
}) {
  return (
    <span
      data-verify-unit="coverage-count"
      data-verify-label={label}
      data-verify-count={value}
      title={title}
      className="flex flex-col"
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          "ident text-sm tabular-nums",
          tone === "good" && "text-state-verified font-medium",
          tone === "warn" && "text-state-unproven font-medium",
          tone === "bad" && "text-state-uncovered font-medium",
          tone === undefined && "text-foreground",
        )}
      >
        {value}
      </span>
    </span>
  );
}
