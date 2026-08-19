import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";

import { issueTokenSafe, revokeTokenSafe, rotateTokenSafe } from "./actions";
import { TokenManager } from "./_components/token-manager";
import { readTokens } from "./_lib/load";
import { defaultExpiryDay } from "./_lib/status";

const NAV = OPERATOR_ROUTES[3];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-4 and FR-7 -- agent tokens.
 *
 * FR-4: "Agents authenticate with bearer tokens, not with the operator's
 * session. A token names a capability set, carries an expiry, and is stored
 * hashed."
 * FR-7: "Tokens are revocable and rotatable **from the interface without a
 * deploy**." `i4` reported FR-7 PARTIAL -- mechanism yes, interface no. This
 * page closes it.
 *
 * ## The security posture of this screen, stated where it is implemented
 *
 * §7a classifies `agent_token` **sensitive**: "operator only; never returned by
 * any read endpoint", hashed with pgcrypto `crypt()`, "the plaintext token is
 * shown once at creation and never stored".
 *
 *   * The read goes through `listAgentTokens`, whose projection has no
 *     `token_hash` column, mirroring the column-level grant in the schema. The
 *     hash is withheld at the grant, not by this page's good manners.
 *   * The plaintext exists in exactly one place -- the return value of an issue
 *     or a rotate -- and reaches exactly one component, which holds it in state
 *     and clears it on dismissal. It is in no server-rendered HTML that a cache
 *     could hold, no URL, no log, and no `data-verify-*` attribute.
 *   * There is no "reveal" or "copy again" affordance anywhere, because there is
 *     nothing to reveal: the value is not in the database.
 *
 * ## The structure of this screen is deliberately conservative
 *
 * `/settings/tokens` is the one screen Erik has looked at, and it is where the
 * approved type stack, the violet accent and the state scale were signed off. Its
 * frame -- `Screen`, the same heading, the same empty state -- is unchanged; what
 * is added is the table and the three controls the requirements name. The
 * *layout* of that table is still unreviewed and is listed as such in the report.
 */
export default async function AgentTokensPage() {
  const now = new Date();
  const result = await loadForOperator(() => readTokens(now));

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={["FR-4", "FR-5", "FR-7"]}
    >
      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {!result.ok ? null : (
        <>
          {result.data.length === 0 ? (
            // COPY: empty-state headline and detail for the settings/tokens screen
            <EmptyState
              headline="No agent tokens issued."
              detail="Tokens an agent uses to read and write the ledger appear here with their capabilities and last use. A token's plaintext is shown once at creation and never again."
            />
          ) : null}
          <TokenManager
            tokens={result.data}
            defaultExpiryDay={defaultExpiryDay(now)}
            onIssue={issueTokenSafe}
            onRevoke={revokeTokenSafe}
            onRotate={rotateTokenSafe}
          />
        </>
      )}
    </Screen>
  );
}
