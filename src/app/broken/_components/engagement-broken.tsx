import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Absent,
  DefectSeverityChip,
  DefectStatusChip,
} from "@/components/answer-chips";
import { EntityRef, EntityRefList } from "@/components/entity-ref";
import type { RefEntry, RefLookup } from "@/lib/answer-screen-refs";
import { isoDay } from "@/lib/display-format";
import { fallbackLabel } from "@/lib/server/detail/types";

import type {
  BrokenEngagement as Broken,
  BrokenDefect,
} from "@/lib/server/answers/broken";

/**
 * FR-80 — the text references on this screen, which are the requirement refs
 * and nothing else.
 *
 * A defect is navigable by `defect.id`, the work item that fixes it by
 * `workItem.id`, and the work items behind a requirement regression by their
 * own ids. `requirementRef`, `covers` and a regression's `ref` are all `FR-nn`
 * strings — `defect.requirement_ref` is a text column that names a requirement
 * rather than a foreign key to one, which is precisely why FR-12 and FR-65
 * require a ref naming nothing to be reported rather than dropped.
 */
export function engagementBrokenRefEntries(broken: Broken): RefEntry[] {
  const requirement = (ref: string): RefEntry => ({
    kind: "requirement",
    engagement: broken.engagement,
    ref,
  });

  return [
    ...broken.bySeverity.flatMap((group) =>
      group.defects.flatMap((defect) =>
        defect.requirementRef === null ? [] : [requirement(defect.requirementRef)],
      ),
    ),
    ...broken.testRegressions.flatMap((regression) =>
      regression.covers.map(requirement),
    ),
    ...broken.requirementRegressions.map((regression) =>
      requirement(regression.ref),
    ),
  ];
}

/**
 * FR-71 / FR-69 — one engagement's open defects and both kinds of regression.
 *
 * ## "Open" here means derived-open, and the row says so when that differs
 *
 * FR-66: `verified` is computed and no field sets it. A defect somebody marked
 * `fixed` stays on this screen until a passing test names its `D-nn` **and**
 * that test's certifier is not the executor of the fixing work item. So each row
 * carries the **derived** status, and where the recorded status disagrees it
 * carries both.
 *
 * That is not a display nicety, it is this project's rule about disagreement:
 * *"emit what an artifact says, and where two artifacts disagree, record both."*
 * A row that showed only `open` would hide that somebody believes it is fixed; a
 * row that showed only `fixed` would be the wrong-`done` this product exists to
 * prevent. `blockedBy` then says which of the three things is missing.
 *
 * ## The two regression kinds stay two
 *
 * FR-69 defines them independently and neither is derived from the other:
 *
 *   * a **test** whose latest result failed and which has an earlier pass;
 *   * a **requirement** that was covered under FR-47 and is not covered now.
 *
 * A test can go red with no requirement losing coverage, because a second test
 * still covers it. A requirement can lose coverage with **no test going red at
 * all**, because the only passing evidence turned out to be self-certified.
 * Merging them into one "regressions" number hides the second case completely,
 * and the second case is the one nobody is watching for. Two sections, always.
 *
 * ## Every severity group renders, including the empty ones
 *
 * An absent `critical` group and an empty `critical` group look identical to
 * someone scanning for the worst bucket, and only one of them means "none".
 *
 * ## Nothing on this screen is decrypted
 *
 * `defect.title` is clear by CR-001 §4's stated exception and is the display
 * key; `defect.description` is ciphertext and is never read. Every link runs on
 * `D-nn`, `FR-nn` and a work-item id. i3's finding, preserved.
 */
export function EngagementBroken({
  broken,
  refs,
}: {
  broken: Broken;
  refs: RefLookup;
}) {
  const regressions =
    broken.testRegressions.length + broken.requirementRegressions.length;

  return (
    <section
      data-verify-unit="engagement-broken"
      data-verify-engagement={broken.engagement}
      data-verify-open-defects={broken.openDefectCount}
      data-verify-test-regressions={broken.testRegressions.length}
      data-verify-requirement-regressions={broken.requirementRegressions.length}
      className="border-border overflow-hidden rounded-lg border"
    >
      <header className="border-border bg-muted/40 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 className="ident text-sm font-semibold">
          {/* FR-80's engagement slug. Not one of FR-81's eight kinds, so an
              ordinary anchor to the detail view that already exists. */}
          <Link
            href={`/registry/${broken.engagement}`}
            data-verify-unit="engagement-link"
            data-verify-slug={broken.engagement}
            className="rounded-sm underline-offset-2 hover:underline"
          >
            {broken.engagement}
          </Link>
        </h2>
        <span className="text-muted-foreground text-xs">
          {broken.clientName}
        </span>
        <span className="text-muted-foreground ident ml-auto text-xs">
          {broken.openDefectCount} open · {regressions} regressed
        </span>
      </header>

      {broken.bySeverity.map((group) => (
        <div
          key={group.severity}
          data-verify-unit="severity-group"
          data-verify-severity={group.severity}
          data-verify-count={group.defects.length}
          className="border-border border-b last:border-b-0"
        >
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <DefectSeverityChip severity={group.severity} />
            <span className="text-muted-foreground ident text-xs">
              {group.defects.length} open
            </span>
          </div>

          {group.defects.length === 0 ? (
            <p className="text-muted-foreground/70 px-3 pb-3 text-xs">
              None open at this severity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">defect</TableHead>
                    <TableHead className="whitespace-nowrap">status</TableHead>
                    <TableHead className="whitespace-nowrap">
                      why still open
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      requirement
                    </TableHead>
                    <TableHead className="whitespace-nowrap">work item</TableHead>
                    <TableHead className="whitespace-nowrap">tests</TableHead>
                    <TableHead className="whitespace-nowrap">reported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.defects.map((defect) => (
                    <DefectRow
                      key={defect.id}
                      defect={defect}
                      engagement={broken.engagement}
                      refs={refs}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ))}

      {/* ---- FR-69, kind one: a test that used to pass ---- */}
      <RegressionSection
        unit="test-regressions"
        title="Test regressions"
        note="Each of these has a passing result in its history and a failing latest result."
        empty="No test that used to pass is failing now."
        count={broken.testRegressions.length}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">test</TableHead>
                <TableHead className="whitespace-nowrap">harness</TableHead>
                <TableHead className="whitespace-nowrap">covers</TableHead>
                <TableHead className="whitespace-nowrap">last passed</TableHead>
                <TableHead className="whitespace-nowrap">failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broken.testRegressions.map((regression) => (
                <TableRow
                  key={regression.testId}
                  data-verify-unit="test-regression"
                  data-verify-id={regression.testId}
                >
                  <TableCell className="max-w-sm">
                    <span className="block text-sm">{regression.title}</span>
                    <span className="ident text-muted-foreground block text-xs">
                      {regression.file}
                    </span>
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {regression.harness}
                  </TableCell>
                  <TableCell>
                    <EntityRefList
                      refs={regression.covers.map((ref) => ({
                        kind: "requirement" as const,
                        label: ref,
                        id: refs("requirement", broken.engagement, ref),
                      }))}
                      empty="This test names no requirement."
                    />
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoDay(regression.lastPassedAt) ?? (
                      <Absent title="No passing run has a recorded date." />
                    )}
                  </TableCell>
                  <TableCell className="ident text-state-blocked whitespace-nowrap">
                    {isoDay(regression.failedAt) ?? (
                      <Absent title="The failing run has no recorded date." />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </RegressionSection>

      {/* ---- FR-69, kind two: a requirement that lost its coverage ---- */}
      <RegressionSection
        unit="requirement-regressions"
        title="Requirement regressions"
        note="Each of these was covered under FR-47 and is not covered now. This can happen with no test going red at all — if the only passing evidence turns out to be self-certified, the coverage goes and nothing fails."
        empty="No requirement has lost coverage it previously had."
        count={broken.requirementRegressions.length}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">requirement</TableHead>
                <TableHead className="whitespace-nowrap">failing tests</TableHead>
                <TableHead className="whitespace-nowrap">
                  implemented by
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broken.requirementRegressions.map((regression) => (
                <TableRow
                  key={regression.ref}
                  data-verify-unit="requirement-regression"
                  data-verify-ref={regression.ref}
                  data-verify-failing={regression.failingTests.length}
                >
                  <TableCell className="whitespace-nowrap">
                    <EntityRef
                      kind="requirement"
                      label={regression.ref}
                      id={refs(
                        "requirement",
                        broken.engagement,
                        regression.ref,
                      )}
                    />
                  </TableCell>
                  <TableCell className="max-w-sm">
                    {regression.failingTests.length === 0 ? (
                      // The case the merged number would have hidden.
                      <span
                        data-verify-unit="regression-without-failure"
                        className="text-state-carried text-xs"
                      >
                        no test is failing — the coverage was lost without one
                        going red
                      </span>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        {regression.failingTests.map((test) => (
                          <span key={test.id} className="text-xs">
                            {test.title}
                            <span className="ident text-muted-foreground ml-1.5">
                              {test.file}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {regression.implementedBy.length === 0 ? (
                      <Absent title="No work item claims to implement this requirement." />
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        {regression.implementedBy.map((item) => (
                          <span
                            key={item.id}
                            className="text-xs whitespace-nowrap"
                          >
                            <EntityRef
                              kind="work_item"
                              label={
                                item.unit ?? fallbackLabel("work_item", item.id)
                              }
                              id={item.id}
                            />
                            {item.executor === null ? null : (
                              <span className="ident text-muted-foreground ml-1.5">
                                {item.executor}
                              </span>
                            )}
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
      </RegressionSection>
    </section>
  );
}

/* ---------------------------------------------------------------------- */

/** Why `verified` was withheld, in the operator's language rather than the enum's. */
const BLOCKED_BY: Record<string, string> = {
  "no-passing-test": "no passing test names this defect",
  "no-fixing-executor": "no work item is recorded as fixing it",
  "self-certified": "the only passing test was certified by whoever fixed it",
};

function DefectRow({
  defect,
  engagement,
  refs,
}: {
  defect: BrokenDefect;
  engagement: string;
  refs: RefLookup;
}) {
  const disagrees = defect.status !== defect.recordedStatus;

  return (
    <TableRow
      data-verify-unit="defect-row"
      data-verify-id={defect.id}
      data-verify-ref={defect.ref ?? "unallocated"}
      data-verify-severity={defect.severity}
      data-verify-status={defect.status}
      data-verify-recorded-status={defect.recordedStatus}
      data-verify-disagrees={disagrees ? "true" : "false"}
      data-verify-blocked-by={defect.blockedBy ?? "none"}
    >
      <TableCell className="max-w-sm">
        <span className="flex flex-wrap items-baseline gap-1.5">
          {defect.ref === null ? (
            <span
              className="ident text-muted-foreground/60 text-xs"
              title="No `D-nn` has been allocated to this defect yet, so no test can name it."
            >
              unallocated
            </span>
          ) : (
            /* FR-80. `defect.id` IS the defect's row id, so a `D-nn` on this
               screen is navigable with no resolution at all. */
            <EntityRef kind="defect" label={defect.ref} id={defect.id} />
          )}
          {/* CR-001 §4: `title` is clear by stated exception because it is the
              display key here. Reproduction detail, data samples and client
              specifics belong in the encrypted description and are never read
              on this path. */}
          <span className="text-sm">{defect.title}</span>
        </span>
        <span className="ident text-muted-foreground/70 mt-0.5 block text-xs">
          {defect.source}
          {defect.reportedBy === null ? null : ` · ${defect.reportedBy}`}
        </span>
      </TableCell>

      <TableCell>
        <span className="flex flex-col items-start gap-1">
          <DefectStatusChip status={defect.status} />
          {disagrees ? (
            // Two artifacts disagree. Both are recorded rather than one picked.
            <span
              data-verify-unit="status-disagreement"
              className="text-muted-foreground text-xs"
              title="FR-66: the derived status is computed from the evidence and the recorded status is what somebody wrote down. They disagree here, so both are shown."
            >
              recorded as{" "}
              <span className="ident text-foreground">
                {defect.recordedStatus}
              </span>
            </span>
          ) : null}
        </span>
      </TableCell>

      <TableCell className="max-w-xs">
        {defect.blockedBy === null ? (
          <Absent title="Nothing is withholding a verification for this defect." />
        ) : (
          <span className="text-muted-foreground text-xs">
            {BLOCKED_BY[defect.blockedBy] ?? defect.blockedBy}
            {defect.selfCertifiedTests.length > 0 ? (
              <span
                data-verify-unit="self-certified-count"
                data-verify-count={defect.selfCertifiedTests.length}
                className="ident text-state-carried ml-1"
              >
                ({defect.selfCertifiedTests.length})
              </span>
            ) : null}
          </span>
        )}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        {defect.requirementRef === null ? (
          <Absent title="This defect names no requirement." />
        ) : (
          <EntityRef
            kind="requirement"
            label={defect.requirementRef}
            id={refs("requirement", engagement, defect.requirementRef)}
          />
        )}
      </TableCell>

      <TableCell className="ident text-xs whitespace-nowrap">
        {defect.workItem === null ? (
          <Absent title="No work item is recorded as fixing this defect." />
        ) : (
          <>
            {/* Until now this cell rendered a raw uuid whenever the fixing item
                had no unit key. `fallbackLabel` is the fleet's one agreed label
                for a row that carries no human reference, and the link is the
                same either way. */}
            <EntityRef
              kind="work_item"
              label={
                defect.workItem.unit ??
                fallbackLabel("work_item", defect.workItem.id)
              }
              id={defect.workItem.id}
            />
            {defect.workItem.executor === null ? null : (
              <span className="text-muted-foreground ml-1.5">
                {defect.workItem.executor}
              </span>
            )}
          </>
        )}
      </TableCell>

      <TableCell className="max-w-xs">
        {defect.tests.length === 0 ? (
          <Absent title="No test in this engagement names this defect's reference." />
        ) : (
          <span className="flex flex-col gap-0.5">
            {defect.tests.map((test) => (
              <span key={test.id} className="ident text-xs">
                {test.file}
              </span>
            ))}
          </span>
        )}
      </TableCell>

      <TableCell className="ident text-muted-foreground whitespace-nowrap">
        {isoDay(defect.reportedAt) ?? (
          <Absent title="No report date was recorded." />
        )}
      </TableCell>
    </TableRow>
  );
}

function RegressionSection({
  unit,
  title,
  note,
  empty,
  count,
  children,
}: {
  unit: string;
  title: string;
  note: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-verify-unit={unit}
      data-verify-count={count}
      className="border-border border-b last:border-b-0"
    >
      <div className="px-3 pt-2.5 pb-1.5">
        <h3 className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
          <span className="ident text-muted-foreground ml-1.5 font-normal">
            {count}
          </span>
        </h3>
        <p className="text-muted-foreground mt-0.5 max-w-3xl text-xs">{note}</p>
      </div>
      {count === 0 ? (
        <p className="text-muted-foreground/70 px-3 pb-3 text-xs">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}
