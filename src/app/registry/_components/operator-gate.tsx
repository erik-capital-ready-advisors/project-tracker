import { KeyRound, Lock, ServerCrash, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { GateRefusal } from "../_lib/gate";

/**
 * What a registry screen draws when it is not going to draw data.
 *
 * The point of having five refusals rather than one is that each names a
 * different next action. "Sign in", "enrol a second factor", "present the one
 * you have", "ask for a role" and "this deployment has no database configured"
 * are five different mornings, and collapsing them into "access denied" turns a
 * two-second fix into an investigation.
 *
 * None of these distinctions helps an attacker: every one of them requires a
 * valid session to reach except `signin` and `unconfigured`, neither of which
 * says anything a visitor could not learn by loading the page.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="operator-gate"
 *   data-verify-gate="signin" | "enrol-mfa" | "verify-mfa" | "no-role"
 *                    | "unconfigured" | "error"
 */

const PANEL: Record<
  GateRefusal["kind"],
  { title: string; detail: string; Icon: typeof Lock }
> = {
  signin: {
    title: "Sign in to read the registry",
    detail:
      "This product has no public surface and no public signup — the operator account is provisioned by hand. Nothing was read.",
    Icon: Lock,
  },
  "enrol-mfa": {
    title: "A second factor is required",
    detail:
      "Multi-factor authentication is required (FR-2) and no second factor is enrolled on this account. Enrol one to continue; enrolment does not need a role.",
    Icon: KeyRound,
  },
  "verify-mfa": {
    title: "Present your second factor",
    detail:
      "You are signed in but this session is not yet verified. Nothing in the ledger is readable until it is — that check lives in row-level security, not in this screen.",
    Icon: ShieldAlert,
  },
  "no-role": {
    title: "This account holds no role in the ledger",
    detail:
      "Role elevation is a deliberate administrative act (FR-3), so a new account reads nothing until one is granted. This is not a missing account.",
    Icon: ShieldQuestion,
  },
  unconfigured: {
    title: "This deployment is not configured to reach its database",
    detail:
      "No Supabase configuration is present in this environment, so no read was attempted. See .env.example for the variables the app expects; real values belong in the environment and nowhere else.",
    Icon: ServerCrash,
  },
  error: {
    title: "The registry could not be read",
    detail:
      "Something failed before any data was loaded. This message deliberately carries no detail about the mechanism; check the audit log for this request.",
    Icon: ServerCrash,
  },
};

export function OperatorGatePanel({ gate }: { gate: GateRefusal }) {
  const { title, detail, Icon } = PANEL[gate.kind];

  return (
    <Alert
      variant={gate.kind === "unconfigured" || gate.kind === "error" ? "destructive" : "default"}
      className="border-border px-4 py-3"
      data-verify-unit="operator-gate"
      data-verify-gate={gate.kind}
    >
      <Icon aria-hidden />
      <AlertTitle className="text-sm">{title}</AlertTitle>
      <AlertDescription className="text-muted-foreground max-w-prose text-sm">
        {detail}
      </AlertDescription>
    </Alert>
  );
}
