"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Field } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { STEP_PATH, nextAuthStep } from "../_lib/steps";
import { useSupabase } from "../_lib/use-supabase";
import { AuthError, AuthShell } from "./auth-shell";

/**
 * FR-1 / FR-2 -- the operator signs in with a password, and then with a second
 * factor.
 *
 * ## There is no signup affordance, and its absence is the requirement
 *
 * FR-1: the application has no public signup, and `disable_signup` is set on the
 * Supabase project -- a dashboard action no migration can close, verified by
 * observation at provisioning. A "create an account" link here would be a
 * control that cannot work, implying a door that is bolted shut. The screen says
 * so in words instead.
 *
 * There is no password-reset link either. GoTrue can send one, but nothing in
 * this unit's brief asked for that flow and a link to an unbuilt route is the
 * same dead control by another name. Noted in the report.
 *
 * ## Where this screen sends people, and what it refuses to conclude
 *
 * Routing is `nextAuthStep`, whose only inputs are GoTrue's session and
 * assurance levels. It never reads `public.operator`, because that row is
 * **unreadable at `aal1`** -- `app.is_operator()` demands `aal2` -- and reading
 * zero rows as "no account" is what would lock Erik out of his own product on
 * first run, with the enrolment screen he needs sitting behind the conclusion
 * that he has no account.
 */
export function SignInForm() {
  const router = useRouter();
  const supabase = useSupabase();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  /** Once per mount. See the same guard in `mfa-enroll-form.tsx` for why. */
  const started = useRef(false);

  // A session may already exist -- a half-finished sign-in, or a return visit
  // with a live cookie. Sending the operator to the step they are actually on
  // beats asking for a password they already gave.
  useEffect(() => {
    if (!supabase.ok) {
      setChecking(false);
      return;
    }
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.client.auth.getUser();
      if (data.user === null) {
        if (!cancelled) setChecking(false);
        return;
      }
      const { data: assurance } =
        await supabase.client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;

      const step = nextAuthStep({
        signedIn: true,
        currentLevel: assurance?.currentLevel,
        nextLevel: assurance?.nextLevel,
      });
      if (step === "password") {
        setChecking(false);
        return;
      }
      router.replace(STEP_PATH[step]);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase.ok) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setPending(true);
    setError(null);

    const { error: signInError } =
      await supabase.client.auth.signInWithPassword({ email, password });

    if (signInError) {
      // GoTrue's messages are written for an end user and name no mechanism --
      // "Invalid login credentials" for both a wrong password and an unknown
      // address, which is the non-enumeration property this product wants.
      setError(signInError.message);
      setPending(false);
      return;
    }

    const { data: assurance } =
      await supabase.client.auth.mfa.getAuthenticatorAssuranceLevel();

    const step = nextAuthStep({
      signedIn: true,
      currentLevel: assurance?.currentLevel,
      nextLevel: assurance?.nextLevel,
    });

    // `refresh()` so the Server Components re-render against the new cookie;
    // `replace()` so the password screen is not in the back history.
    router.replace(STEP_PATH[step]);
    router.refresh();
  }

  return (
    <AuthShell
      title="Sign in"
      description={
        <>
          This ledger has no public surface. The operator account is provisioned
          by hand, and a second factor is required.
        </>
      }
      footer={
        <>
          There is no account creation here and no self-service reset. Recovery
          is done in the Supabase project, not on this screen.
        </>
      }
    >
      {supabase.ok ? null : <AuthError message={supabase.message} />}

      <form
        onSubmit={submit}
        data-verify-unit="sign-in-form"
        data-verify-pending={pending ? "true" : "false"}
        data-verify-checking={checking ? "true" : "false"}
        className="flex flex-col gap-3"
      >
        <Field id="sign-in-email" label="Email">
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            required
            // `username` and `current-password` are the values a password
            // manager needs to offer a stored credential. Omitting them on a
            // sign-in form pushes the operator towards a password weak enough
            // to type, which costs more than the autofill risk they avoid. This
            // is the one form in the product where they are set, and it is
            // queued for Erik because the standing rule says otherwise.
            autoComplete="username"
            disabled={!supabase.ok || pending}
          />
        </Field>

        <Field id="sign-in-password" label="Password">
          <Input
            id="sign-in-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={!supabase.ok || pending}
          />
        </Field>

        {error === null ? null : <AuthError message={error} />}

        <Button type="submit" size="sm" disabled={!supabase.ok || pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
