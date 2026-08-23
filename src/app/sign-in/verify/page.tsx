import { MfaVerifyForm } from "../_components/mfa-verify-form";

export const metadata = { title: "Second factor — Delivery Ledger" };

/** FR-2 -- present an enrolled second factor and reach `aal2`. */
export default function MfaVerifyPage() {
  return <MfaVerifyForm />;
}
