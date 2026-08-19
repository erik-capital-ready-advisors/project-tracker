import { SignInForm } from "./_components/sign-in-form";

export const metadata = { title: "Sign in — Delivery Ledger" };

/**
 * FR-1 -- the operator's way in.
 *
 * There was no sign-in route in the tree at all before this. `i4` built the
 * whole session mechanism (`requireOperator`, `getOperatorContext`) and left
 * FR-7 PARTIAL for the matching reason on the token side: the mechanism existed
 * and the interface did not.
 *
 * The screen is a Client Component with no server read of its own. That is
 * deliberate rather than lazy: everything it needs comes from GoTrue, which is
 * not RLS-gated, so it works in exactly the state where nothing else does --
 * signed out, or signed in at `aal1` where every table refuses.
 */
export default function SignInPage() {
  return <SignInForm />;
}
