import type { ReactNode } from "react";
import Link from "next/link";

import {
  Absent,
  CoverageChip,
  DefectSeverityChip,
  DefectStatusChip,
  ExecutorChip,
  ShippedChip,
} from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
} from "@/components/entity-detail";
import { EntityRef, EntityRefList } from "@/components/entity-ref";
import { ProseValue } from "@/components/prose-value";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RequirementDetail } from "@/lib/detail-load";
import { formatDate, NOT_RECORDED } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * **FR-82 — the de-siloing view.** One requirement, and the four relationships
 * that were already parsed and stored, shown together.
 *
 * > A requirement's detail view lists every work item implementing it (FR-19),
 * > every test naming it (FR-45), every defect violating it (FR-65), and every
 * > release shipping it (FR-74). **Nothing new is derived** — these four
 * > relationships are already parsed and stored; this requirement is that they
 * > be *shown together*, which is the de-siloing the product is for.
 *
 * ## Nothing is derived here, and that is checkable
 *
 * This file computes no coverage, no shipped state, no self-certification and
 * no billability. `coverage`, `shippedEnvironments`, `selfCertified` and every
 * one of the four lists arrive from `loadRequirementDetail`, which obtained them
 * by **calling** `indexCoverage`, `latestResults` and `shippedIndex` — the same
 * functions `/untested` and `/committed` answer from. A second implementation in
 * a view is the drift FR-49 exists to prevent, and the first distinction it
 * would collapse is `unproven` versus `uncovered`.
 *
 * The only arithmetic below is `list.length`, and it is used to say how many
 * rows a section holds — never to combine two of them into a score.
 *
 * ## All four sections render even when a relationship is empty
 *
 * An absent section and an empty one are different claims. On `/untested`'s own
 * reasoning an empty relationship is usually the **worse** finding: a
 * requirement nothing implements is a worse state than one implemented and
 * untested, and a requirement no test names is exactly what FR-48 is for. So
 * each empty section states what its emptiness means rather than disappearing.
 *
 * ## Tests are text, not links, and that is FR-83 rather than an omission
 *
 * `test_case` is not one of FR-81's eight kinds, so `entityHref` can build no
 * destination for it. A link this product cannot honestly build is the broken
 * link FR-83 forbids, so tests render as file, title, harness, certifier and
 * latest result — read, not followed.
 *
 * ## §7a — this is the one surface that renders requirement prose
 *
 * §7a encrypts `requirement.text` and leaves `ref` and `section` clear, and
 * states the consequence itself: "requirements are matched, joined and reported
 * by `FR-nn` and never by text". Every existing screen therefore shows `FR-nn`
 * and no prose. FR-81 permits the operator the decrypted text, and this view is
 * where that permission is spent — the **only** place in the product where a
 * requirement's paragraph is rendered. Every join reaching this page still ran
 * on `ref`.
 *
 * The milestone section carries names only. §7a refuses `contract_milestone` to
 * agent tokens entirely and `loadRequirementDetail` projects `id` and `name` and
 * no amount; nothing here reaches for one.
 *
 * ## §5a
 *
 * Nothing new. `DetailSection` is `EntityDetail`'s bordered section with a
 * header strip — the same idiom `engagement-coverage.tsx` uses for the closest
 * precedent to four stacked relationship blocks. Every chip, badge and mono
 * utility is an existing one. No colour, token or spacing idiom is introduced;
 * §5a is NOT YET APPROVED and this is not the place to spend an unapproved
 * palette.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="requirement-work-items"    FR-82 relationship 1 (FR-19)
 *   data-verify-unit="requirement-tests"         FR-82 relationship 2 (FR-45)
 *   data-verify-unit="requirement-defects"       FR-82 relationship 3 (FR-65)
 *   data-verify-unit="requirement-releases"      FR-82 relationship 4 (FR-74)
 *   data-verify-unit="requirement-acceptance"    FR-81 inbound — NOT one of the four
 *   data-verify-unit="relation-count"            data-verify-relation, data-verify-count
 *   data-verify-unit="requirement-state"         data-verify-coverage, data-verify-shipped-count
 *   data-verify-unit="requirement-test-row"      data-verify-ran, data-verify-self-certified
 *
 * Counts and statuses only. No decrypted text, no defect description and no
 * milestone amount is published into a `data-verify-*` attribute.
 */
export function RequirementView({ detail }: { detail: RequirementDetail }) {
  const engagement = detail.engagement;

  return (
    <EntityDetail
      kind="requirement"
      title={detail.ref}
      question="Everything recorded against one requirement: what implements it, what tests it, what violates it, and where it shipped."
      requirements={["FR-81", "FR-82", "FR-83", "FR-85"]}
      identifier={detail.ref}
      actions={
        engagement === null ? undefined : (
          // Ruling 3: the engagement is NOT a ninth entity kind. `ENTITY_KINDS`
          // is exactly FR-81's eight and gate test 1 asserts it, so this is a
          // plain link to a route that already exists rather than an
          // `<EntityRef>` whose href `entityHref` would refuse to build.
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/registry/${engagement.slug}`}
              data-verify-unit="requirement-engagement-link"
            >
              ← {engagement.clientName}
            </Link>
          </Button>
        )
      }
    >
      {/* ---- The requirement itself. The one surface that shows its text. ---- */}
      <DetailSection
        heading="The requirement"
        requirements={["FR-81"]}
        verifyUnit="requirement-identity"
      >
        <div className="border-border border-b px-4 py-3">
          <ProseValue
            prose={detail.text}
            field="requirement-text"
            absent="No text is stored for this requirement. It was ingested as a reference and a section and nothing more — which is normal for a requirement named by an artifact this product has not been given the spec for."
          />
        </div>

        <div
          className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-2.5"
          data-verify-unit="requirement-state"
          data-verify-coverage={detail.coverage}
          data-verify-shipped-count={detail.shippedEnvironments.length}
        >
          {/* FR-49 and FR-75 are two different questions and they sit side by
              side rather than merging: covered says a passing test names it,
              shipped says a release carries it, and neither implies the other. */}
          <CoverageChip value={detail.coverage} />
          <ShippedChip environments={detail.shippedEnvironments} />
        </div>

        <DetailFields>
          <DetailField
            label="Reference"
            mono
            absent="This requirement carries no reference, which should not be possible — `ref` is the key every join in this product runs on."
          >
            {detail.ref}
          </DetailField>
          <DetailField
            label="Spec section"
            mono
            absent="No spec section was recorded. Clear under §7a — its absence is a gap in the artifact, not an encryption failure."
          >
            {detail.section}
          </DetailField>
          <DetailField
            label="Engagement"
            absent="This requirement has no engagement, which should not be possible — every one of these tables cascades from it."
          >
            {engagement === null ? null : (
              <Link
                href={`/registry/${engagement.slug}`}
                className="underline-offset-2 hover:underline"
              >
                {engagement.clientName}{" "}
                <span className="ident text-muted-foreground">
                  {engagement.slug}
                </span>
              </Link>
            )}
          </DetailField>
        </DetailFields>
      </DetailSection>

      {/* ---- FR-82, relationship 1 of 4 — FR-19 ---- */}
      <DetailSection
        heading="Implemented by"
        requirements={["FR-19", "FR-82"]}
        verifyUnit="requirement-work-items"
      >
        <RelationBody
          relation="work-items"
          count={detail.workItems.length}
          empty="No work item claims to implement this requirement. That is usually a worse finding than an untested one — nobody has built it."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">work item</TableHead>
                  <TableHead className="whitespace-nowrap">unit</TableHead>
                  <TableHead className="whitespace-nowrap">status</TableHead>
                  <TableHead className="whitespace-nowrap">executor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.workItems.map((item) => (
                  <TableRow
                    key={item.ref.id ?? item.ref.label}
                    data-verify-unit="requirement-work-item-row"
                    data-verify-status={item.status}
                  >
                    <TableCell className="whitespace-nowrap">
                      <EntityRef
                        kind={item.ref.kind}
                        label={item.ref.label}
                        id={item.ref.id}
                        title={item.ref.title}
                      />
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      {item.unit ?? (
                        <Absent title="No unit key was recorded. A `hand` or `external` work item carries none." />
                      )}
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      {item.status}
                    </TableCell>
                    <TableCell>
                      <ExecutorChip
                        kind={item.executorKind}
                        executor={item.executor}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </RelationBody>
      </DetailSection>

      {/* ---- FR-82, relationship 2 of 4 — FR-45, and FR-47 beside it ---- */}
      <DetailSection
        heading="Tested by"
        requirements={["FR-45", "FR-47", "FR-82"]}
        verifyUnit="requirement-tests"
      >
        <RelationBody
          relation="tests"
          count={detail.tests.length}
          empty="No test names this requirement. Nothing has been claimed about it either way — this is FR-48's finding, not a failure."
          note="A test has no detail view of its own: `test_case` is not one of FR-81's eight kinds, so these are shown rather than linked. FR-83 refuses a link this product cannot honestly build."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">test</TableHead>
                  <TableHead className="whitespace-nowrap">harness</TableHead>
                  <TableHead className="whitespace-nowrap">latest result</TableHead>
                  <TableHead className="whitespace-nowrap">evidence</TableHead>
                  <TableHead className="whitespace-nowrap">certified by</TableHead>
                  <TableHead className="whitespace-nowrap">authored by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.tests.map((test) => (
                  <TableRow
                    key={test.id}
                    data-verify-unit="requirement-test-row"
                    data-verify-ran={test.latest === null ? "false" : "true"}
                    data-verify-self-certified={
                      test.selfCertified ? "true" : "false"
                    }
                  >
                    <TableCell className="max-w-sm">
                      <span className="block text-sm">{test.title}</span>
                      <span className="ident text-muted-foreground block text-xs break-all">
                        {test.file}
                      </span>
                      {test.selfCertified ? (
                        // FR-47 is a FINDING, not coverage, and `/untested`
                        // draws that distinction. The warn treatment here is
                        // the one `engagement-coverage.tsx` already gives its
                        // self-certified count — followed rather than replaced,
                        // because inventing a token is the thing §5a forbids
                        // while the design is unapproved.
                        <span
                          className="text-state-unproven mt-0.5 block text-xs"
                          title="FR-47: the certifier of this test executed the work that implements this requirement. Marking your own work verified is a finding, not coverage."
                        >
                          self-certified
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      {test.harness}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {test.latest === null ? (
                        // `null` is NOT a failure. A test that has never run
                        // and a test that ran and failed are different claims,
                        // and rendering the first as the second would be the
                        // plausible-wrong-answer this product exists to stop.
                        <span
                          className="text-muted-foreground/70 text-xs italic"
                          title="No result is recorded for this test. It has never run, which is not the same as having failed."
                        >
                          never ran
                        </span>
                      ) : (
                        <span className="ident text-xs">
                          {test.latest.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {test.latest === null ? (
                        <Absent title="No result, so no evidence scope. FR-43's four scopes describe a run that happened." />
                      ) : (
                        <StateBadge state={test.latest.evidenceScope} />
                      )}
                    </TableCell>
                    <TableCell className="ident text-xs whitespace-nowrap">
                      {test.latest?.certifiedBy ??
                        test.certifiedBy ?? (
                          <Absent title="No certifier was recorded, on the result or on the test." />
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
        </RelationBody>
      </DetailSection>

      {/* ---- FR-82, relationship 3 of 4 — FR-65 ---- */}
      <DetailSection
        heading="Violated by"
        requirements={["FR-65", "FR-82"]}
        verifyUnit="requirement-defects"
      >
        <RelationBody
          relation="defects"
          count={detail.defects.length}
          empty="No defect is recorded against this requirement. That is the absence of a report, which is not the same as the absence of a defect."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">defect</TableHead>
                  <TableHead className="whitespace-nowrap">title</TableHead>
                  <TableHead className="whitespace-nowrap">severity</TableHead>
                  <TableHead className="whitespace-nowrap">status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.defects.map((defect) => (
                  <TableRow
                    key={defect.ref.id ?? defect.ref.label}
                    data-verify-unit="requirement-defect-row"
                    data-verify-severity={defect.severity}
                    data-verify-status={defect.status}
                  >
                    <TableCell className="whitespace-nowrap">
                      <EntityRef
                        kind={defect.ref.kind}
                        label={defect.ref.label}
                        id={defect.ref.id}
                        title={defect.ref.title}
                      />
                    </TableCell>
                    {/* The defect's title is clear under §7a; its description is
                        encrypted and is not projected onto this page at all. */}
                    <TableCell className="max-w-sm text-sm">
                      {defect.title}
                    </TableCell>
                    <TableCell>
                      <DefectSeverityChip severity={defect.severity} />
                    </TableCell>
                    <TableCell>
                      <DefectStatusChip status={defect.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </RelationBody>
      </DetailSection>

      {/* ---- FR-82, relationship 4 of 4 — FR-74 ---- */}
      <DetailSection
        heading="Shipped in"
        requirements={["FR-74", "FR-75", "FR-82"]}
        verifyUnit="requirement-releases"
      >
        <RelationBody
          relation="releases"
          count={detail.releases.length}
          empty="No release names this requirement. Being covered by a passing test is a different claim and is shown separately above — FR-75: built and deployed are never collapsed."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">release</TableHead>
                  <TableHead className="whitespace-nowrap">identifier</TableHead>
                  <TableHead className="whitespace-nowrap">environment</TableHead>
                  <TableHead className="whitespace-nowrap">deployed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.releases.map((release) => (
                  <TableRow
                    key={release.ref.id ?? release.ref.label}
                    data-verify-unit="requirement-release-row"
                    data-verify-environment={release.environment}
                  >
                    <TableCell className="whitespace-nowrap">
                      <EntityRef
                        kind={release.ref.kind}
                        label={release.ref.label}
                        id={release.ref.id}
                        title={release.ref.title}
                      />
                    </TableCell>
                    <TableCell className="ident text-xs break-all">
                      {release.identifier}
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      {release.environment}
                    </TableCell>
                    <TableCell className="ident text-muted-foreground text-xs whitespace-nowrap">
                      <DeployedAt value={release.deployedAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </RelationBody>
      </DetailSection>

      {/* ---- FR-81's inbound side. Deliberately NOT a fifth FR-82 relationship ---- */}
      <DetailSection
        heading="Contract acceptance"
        requirements={["FR-81", "FR-10"]}
        verifyUnit="requirement-acceptance"
      >
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-muted-foreground max-w-3xl text-xs">
            Contract milestones whose acceptance criteria name this requirement.
            This is FR-81&apos;s inbound side and{" "}
            <strong className="font-semibold">
              not one of FR-82&apos;s four relationships
            </strong>
            {" "}— it says what was promised to a client, not what implements,
            tests, violates or ships the requirement. Names only: §7a refuses{" "}
            <span className="ident">contract_milestone</span> to agent tokens
            entirely and no amount is read on this page.
          </p>
          <div
            data-verify-unit="relation-count"
            data-verify-relation="acceptance"
            data-verify-count={detail.milestones.length}
          >
            <EntityRefList
              refs={detail.milestones}
              empty="No contract milestone names this requirement in its acceptance criteria. Nothing was promised to a client on it."
            />
          </div>
        </div>
      </DetailSection>
    </EntityDetail>
  );
}

/**
 * One FR-82 relationship's body: the count contract, the rows, or the stated
 * emptiness.
 *
 * The section element itself carries the name the e2e gate asserts, and
 * `DetailSection` forwards only `verifyUnit` — so the count lives on a child
 * with its own uniform contract rather than by widening a shell four units
 * share. All four counts answer one query: `[data-verify-unit='relation-count']`.
 *
 * **An empty relationship still renders its section.** `empty` is a sentence
 * about what the emptiness means, never a blank — the same discipline
 * `DetailField`'s required `absent` enforces one row at a time.
 */
function RelationBody({
  relation,
  count,
  empty,
  note,
  children,
}: {
  relation: string;
  count: number;
  empty: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-verify-unit="relation-count"
      data-verify-relation={relation}
      data-verify-count={count}
    >
      {note === undefined ? null : (
        <p
          className={cn(
            "text-muted-foreground max-w-3xl px-4 pt-2.5 text-xs",
            count === 0 && "pb-0",
          )}
        >
          {note}
        </p>
      )}
      {count === 0 ? (
        <p className="text-muted-foreground px-4 py-3 text-sm">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

/** A deploy timestamp, or the honest absence of one. Never blank. */
function DeployedAt({ value }: { value: string | null }) {
  const text = formatDate(value);
  if (text === NOT_RECORDED) {
    return (
      <Absent title="No deploy timestamp is recorded on this release. The release exists; when it went out was not captured." />
    );
  }
  return <>{text}</>;
}
