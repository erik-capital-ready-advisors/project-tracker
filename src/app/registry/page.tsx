import Link from "next/link";

import { EngagementScopeNotice } from "@/components/engagement-scope-notice";
import { EmptyState, Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { engagementFilterFrom } from "@/lib/engagement-filter";
import type {
  EngagementResolution,
  SearchParamRecord,
} from "@/lib/engagement-filter";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { listEngagements } from "@/lib/server/registry/engagements";
import type { EngagementRecord } from "@/lib/server/registry/types";

import { EngagementTable } from "./_components/engagement-table";
import { OperatorGatePanel } from "./_components/operator-gate";
import { readOperatorGate, type GateRefusal } from "./_lib/gate";

const NAV = OPERATOR_ROUTES[0];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * Per-operator and never cached across sessions.
 *
 * `cookies()` inside the Supabase session client already forces this at runtime;
 * stating it here means the reason is visible at the top of the file rather than
 * being an emergent property of a client three imports away.
 */
export const dynamic = "force-dynamic";

/**
 * FR-9 + FR-13 + FR-77 — the engagements Erik has registered.
 *
 * This is one of only two screens in the product where anything is typed;
 * everything else is captured or derived. So the primary action sits in the
 * header rather than at the bottom of an empty state, and the empty state says
 * what will appear rather than only that nothing has.
 *
 * ## FR-96 -- filtering a list of engagements by engagement
 *
 * It reads as a tautology and it is not. CR-005 §3.3 point 1 names `/registry`
 * among the eleven, and the reason holds: the shell picker is in the chrome on
 * every one of those routes, so a filter set on `/work-items` survives a click
 * to `/registry`. A screen that accepted the parameter and ignored it would show
 * every client under a picker reading one client's name -- the same
 * chrome-versus-screen disagreement FR-96c is written against.
 *
 * ## The filter is applied in memory, and that is not laziness
 *
 * This screen has already read every engagement. Narrowing that array is exact,
 * costs no second round trip, and -- the part that matters -- means an
 * unresolvable slug is decided by the **same read** that produced the rows. A
 * `getEngagement()` lookup beside it could succeed while the list read failed,
 * or the reverse, and the screen would then hold two answers to one question.
 * The archived case needs no code either: `listEngagements()` does not filter on
 * `archived_at`, so an archived-not-purged permalink still resolves, which is
 * CR-005 §3.3 point 2.
 *
 * This was one of the two screens of eleven reading NO `searchParams` before
 * this unit (`/runs` was the other), against the resolved spec's claim that all
 * eleven already did. r1 measured that; it was not assumed.
 */
export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const filter = engagementFilterFrom(await searchParams);
  const gate = await readOperatorGate();

  let engagements: readonly EngagementRecord[] = [];
  let failure: GateRefusal | null = null;

  if (gate.kind === "ok") {
    try {
      engagements = await listEngagements();
    } catch {
      // The gate said this session may read; the read itself still failed. That
      // is a different sentence from "sign in", and it deliberately carries no
      // mechanism.
      failure = { kind: "error" };
    }
  }

  const blocked = gate.kind !== "ok" ? gate : failure;

  /*
   * FR-96 / FR-96c. Resolved from the rows this screen already holds.
   *
   * `unfiltered` when the URL asked for nothing; `unresolved` covers both a slug
   * matching no row and the over-long value `engagementFilterFrom` rejects, which
   * cannot name a row that exists. There is deliberately no `unavailable` branch
   * here: a failed read is `blocked` above and this block does not run under it,
   * so the resolution can never be a claim about a list nobody read.
   */
  const scope: EngagementResolution =
    blocked !== null || filter.kind === "none"
      ? { kind: "unfiltered" }
      : (() => {
          const slug = filter.kind === "slug" ? filter.slug : filter.value;
          const match = engagements.find((one) => one.slug === slug);
          return match === undefined
            ? { kind: "unresolved", slug }
            : { kind: "resolved", slug, id: match.id };
        })();

  /*
   * The rows to render, for the two states that HAVE rows.
   *
   * There is deliberately no `unresolved` branch here. It would be dead — the
   * render below returns before it reads this — and a mutation test proved it
   * dead rather than an argument doing so. One place decides that FR-96c shows
   * no rows, and it is the branch that also decides what is said instead.
   */
  const listed =
    scope.kind === "resolved"
      ? engagements.filter((one) => one.slug === scope.slug)
      : engagements;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={["FR-9", "FR-10", "FR-13", "FR-77"]}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Engagements and their contract milestones are the only records typed by
          hand. Everything else in the ledger is captured or derived.
        </p>
        <Button asChild size="sm" className="ml-auto">
          <Link href="/registry/new" data-verify-unit="engagement-new-link">
            Register engagement
          </Link>
        </Button>
      </div>

      {/* FR-96c, above the gate branch's sibling rather than inside it: the
          notice renders only when there was a read to resolve against. */}
      <EngagementScopeNotice resolution={scope} />

      {blocked !== null ? (
        <OperatorGatePanel gate={blocked} />
      ) : /* FR-96c. Before the empty state, not merged into it: "No engagements
             recorded." is a claim about the ledger, and the read above plainly
             returned some. Mutation-checked — deleting this branch renders the
             whole table under the notice and turns `tests/engagement-filter-
             screens.test.tsx` red. */
      scope.kind === "unresolved" ? null : listed.length === 0 ? (
        <EmptyState
          headline="No engagements recorded."
          detail="Register one to give ingested runs, requirements and contract milestones something to belong to."
        />
      ) : (
        <EngagementTable engagements={listed} />
      )}
    </Screen>
  );
}
