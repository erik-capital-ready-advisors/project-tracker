import { MfaEnrollForm } from "../_components/mfa-enroll-form";

export const metadata = { title: "Enrol a second factor — Delivery Ledger" };

/**
 * FR-2 -- the first-run screen.
 *
 * Reachable at `aal1`, which is the whole point: enrolment goes through GoTrue
 * and touches no RLS-gated table, so an operator whose own row is unreadable can
 * still get a factor. See `mfa-enroll-form.tsx` for why that matters.
 */
export default function MfaEnrollPage() {
  return <MfaEnrollForm />;
}
