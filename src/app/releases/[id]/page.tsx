import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
} from "@/components/entity-detail";
import { EntityRefList } from "@/components/entity-ref";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { readReleaseDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";
import { formatDate, NOT_RECORDED } from "@/lib/registry-display";

const SCREEN = "Release";
const QUESTION =
  "One deployment: where it went, when, how it was recorded, and which requirements it names.";
const REQUIREMENTS = ["FR-81", "FR-73", "FR-74"] as const;

export const metadata = { title: "Release — Delivery Ledger" };

export const dynamic = "force-dynamic";

/**
 * FR-81 for `release` (CR-001 FR-73, FR-74).
 *
 * ## §7a — `internal`, nothing encrypted
 *
 * §7a classes `release` and `release_requirement` `internal` at provider
 * default. `readReleaseDetail` therefore takes no `withProse` option, there is
 * no `Prose` on this view, and none is looked for.
 *
 * ## What this view deliberately does NOT claim
 *
 * **That any of these requirements is "shipped".** FR-74's derivation lives
 * once, in `shippedIndex`, and `ShippedChip` renders it where it belongs. What a
 * release *names* and what a requirement *is* are different statements, and
 * collapsing them here would put a second derivation of FR-74 in the tree —
 * the same reason `release.ts` refuses to compute it in the loader. So this
 * section says "names", and it says it in those words.
 *
 * ## A stored URL is not automatically an anchor
 *
 * `release.url` is ingested text. It is rendered as an anchor only when it
 * parses as `http:` or `https:`; anything else is shown verbatim in mono and
 * left inert. A `javascript:` or `data:` href is a scheme this view has no
 * reason to honour, and an operator session at `aal2` is exactly the session
 * worth not spending on one.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="release-detail"
 *   data-verify-environment   the environment as stored
 *   data-verify-source        FR-73's `declared` / `ingested`
 *   data-verify-requirements  how many requirements this release names
 *   data-verify-dangling      how many of them resolve to nothing (FR-83)
 *
 * Counts, identifiers and statuses only. No prose reaches a `data-verify-*`
 * attribute here, and this table holds none.
 */
export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The gate lives inside `readReleaseDetail`, beside its query.
  // `loadForOperator` turns a refusal into a stated notice rather than a blank
  // screen: "I could not look" is a different claim from "there is nothing here".
  const result = await loadForOperator(() => readReleaseDetail(id));

  if (!result.ok) {
    return (
      <Screen title={SCREEN} question={QUESTION} requirements={REQUIREMENTS}>
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={SCREEN}
        />
      </Screen>
    );
  }

  const release = result.data;

  // An id naming no row is a 404, and a 404 is not the failure above. Outside
  // the read on purpose: `notFound()` signals by throwing, and `loadForOperator`
  // would catch it and report a database failure instead.
  if (release === null) notFound();

  const dangling = release.requirements.filter((ref) => ref.id === null).length;
  const link = webLink(release.url);

  return (
    <EntityDetail
      kind="release"
      title={release.identifier}
      question={QUESTION}
      requirements={REQUIREMENTS}
      identifier={release.identifier}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/untested" data-verify-unit="back-to-untested">
            ← Untested
          </Link>
        </Button>
      }
    >
      <div
        className="flex flex-col gap-4"
        data-verify-unit="release-detail"
        data-verify-environment={release.environment}
        data-verify-source={release.source}
        data-verify-requirements={release.requirements.length}
        data-verify-dangling={dangling}
      >
        <DetailSection heading="The release" requirements={["FR-73"]}>
          <DetailFields>
            <DetailField
              label="Engagement"
              absent="This release is not attached to an engagement, or its engagement row could not be read."
            >
              {release.engagement === null ? undefined : (
                // Ruling 3: the engagement is not a ninth entity kind. A plain
                // link to the registry, never an `<EntityRef>`.
                <Link
                  href={`/registry/${release.engagement.slug}`}
                  data-verify-unit="engagement-link"
                  className="rounded-sm underline-offset-2 hover:underline"
                >
                  {release.engagement.clientName}{" "}
                  <span className="ident text-muted-foreground">
                    {release.engagement.slug}
                  </span>
                </Link>
              )}
            </DetailField>

            <DetailField
              label="Environment"
              absent="No environment was recorded, which should not be possible — the column is not nullable."
              mono
            >
              {release.environment}
            </DetailField>

            <DetailField
              label="Deployed"
              absent="No deployment date was recorded, so this release cannot be placed in time."
              mono
            >
              {dateText(release.deployedAt)}
            </DetailField>

            <DetailField
              label="Source"
              absent="How this release reached the ledger was not recorded."
              mono
            >
              {/* FR-73: `declared` was typed by a person, `ingested` was parsed
                  from an artifact. Shown rather than normalised away, because
                  they are different levels of evidence. */}
              {release.source}
            </DetailField>

            <DetailField
              label="Recorded by"
              absent="Nobody is recorded as having entered this release."
            >
              {release.recordedBy}
            </DetailField>

            <DetailField
              label="URL"
              absent="No URL was recorded for this deployment."
              mono
            >
              {release.url === null || release.url.trim() === "" ? undefined : link === null ? (
                // Not http(s), so shown and not offered as a link. See the
                // header note; this is a scheme decision, not a formatting one.
                <span
                  data-verify-unit="release-url"
                  data-verify-navigable="false"
                  title="This URL is stored with a scheme this view does not open. It is shown exactly as recorded."
                >
                  {release.url}
                </span>
              ) : (
                <a
                  href={link}
                  data-verify-unit="release-url"
                  data-verify-navigable="true"
                  rel="noreferrer noopener"
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  {release.url}
                </a>
              )}
            </DetailField>
          </DetailFields>
        </DetailSection>

        <DetailSection
          heading="Requirements this release names"
          requirements={["FR-74", "FR-83"]}
          verifyUnit="release-requirements"
        >
          <div className="flex flex-col gap-2 px-4 py-3">
            <EntityRefList
              refs={release.requirements}
              empty="This release names no requirements, so it makes no claim about what it delivered."
            />
            <p className="text-muted-foreground text-xs">
              What a release <em>names</em> and what a requirement <em>is</em> are
              different claims, and this view makes only the first. Whether a
              requirement counts as shipped is derived once, on{" "}
              <Link
                href="/untested"
                className="text-foreground underline underline-offset-2"
              >
                Untested
              </Link>
              , and is not recomputed here.
              {dangling > 0
                ? " A reference drawn as dangling names a requirement this engagement has never ingested. It is reported rather than hidden, and it is not a link."
                : ""}
            </p>
          </div>
        </DetailSection>
      </div>
    </EntityDetail>
  );
}

/**
 * A date for a `DetailField`, or `undefined` so the field states its own absence.
 *
 * `formatDate` rather than `isoDay`: `isoDay` reduces through
 * `new Date(Date.parse(v)).toISOString()`, which reads a zone-less timestamp as
 * LOCAL time and renders the day before east of UTC. Measured at
 * `TZ=Pacific/Kiritimati`: `2026-09-01T00:00:00` answers `2026-08-31` there and
 * `2026-09-01` through `formatDate`.
 */
function dateText(value: string | null): string | undefined {
  const text = formatDate(value);
  return text === NOT_RECORDED ? undefined : text;
}

/** The stored URL if it is safe to offer as a link, or `null` if it is not. */
function webLink(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? trimmed
      : null;
  } catch {
    // Not an absolute URL at all. Shown verbatim rather than guessed at: a
    // relative href here would resolve against this product's own origin.
    return null;
  }
}
