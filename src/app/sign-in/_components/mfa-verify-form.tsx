"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Field } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { STEP_PATH, isWellFormedTotp, nextAuthStep } from "../_lib/steps";
import { useSupabase } from "../_lib/use-supabase";
import { AuthError, AuthShell } from "./auth-shell";

/**
 * FR-2 -- present the second factor.
 *
 * §7a: MFA is "**required**, and enforced in row-level security rather than only
 * in the Next.js layer. A prior build in this practice shipped MFA enforced only
 * in the application layer and a review classified it critical." So this screen
 * is not the enforcement. `app.is_operator()` in the database is, and it refuses
 * every table until GoTrue reports `aal2`. What this screen does is give the
 * operator a way to reach `aal2` at all -- without it the enforcement is a wall
 * with no door.
 *
 * The consequence worth stating: skipping this screen does not bypass anything.
 * An operator who navigates straight to `/work-items` at `aal1` reads no rows,
 * and the screen there says why.
 */
export function MfaVerifyForm() {
  const router = useRouter();
  const supabase = useSupabase();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  /** Once per mount. See the same guard in `mfa-enroll-form.tsx` for why. */
  const started = useRef(false);

  useEffect(() => {
    if (!supabase.ok) {
      setLoading(false);
      return;
    }
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    void (async () => {
      const { data: user } = await supabase.client.auth.getUser();
      if (user.user === null) {
        router.replace(STEP_PATH.password);
        return;
      }

      const { data: assurance } =
        await supabase.client.auth.mfa.getAuthenticatorAssuranceLevel();
      const step = nextAuthStep({
        signedIn: true,
        currentLevel: assurance?.currentLevel,
        nextLevel: assurance?.nextLevel,
      });
      if (step !== "verify") {
        router.replace(STEP_PATH[step]);
        return;
      }

      const { data: factors, error: factorError } =
        await supabase.client.auth.mfa.listFactors();
      if (cancelled) return;

      if (factorError) {
        setError(factorError.message);
        setLoading(false);
        return;
      }

      // `listFactors().totp` carries the **verified** factors only. An
      // unverified one is not something that can be presented, so an empty list
      // here means enrolment, not an error.
      const verified = factors?.totp?.[0];
      if (verified === undefined) {
        router.replace(STEP_PATH.enroll);
        return;
      }

      setFactorId(verified.id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase.ok) return;
    await supabase.client.auth.signOut();
    router.replace(STEP_PATH.password);
    router.refresh();
  }, [router, supabase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase.ok || factorId === null) return;

    if (!isWellFormedTotp(code)) {
      // COPY: refusal for a code that is not six digits
      setError("A code from your authenticator app is six digits.");
      return;
    }

    setPending(true);
    setError(null);

    const { data: challenge, error: challengeError } =
      await supabase.client.auth.mfa.challenge({ factorId });

    if (challengeError || !challenge) {
      setError(
        challengeError?.message ??
          // COPY: fallback when a challenge could not be started
          "The second-factor challenge could not be started. Try again.",
      );
      setPending(false);
      return;
    }

    const { error: verifyError } = await supabase.client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.message);
      setPending(false);
      return;
    }

    router.replace(STEP_PATH.ready);
    router.refresh();
  }

  return (
    <AuthShell
      // COPY: MFA verify screen title
      title="Second factor"
      description={
        // COPY: MFA verify screen description
        <>
          Multi-factor authentication is enforced in the database, not just here.
          Until you present a code, every table refuses to return a row.
        </>
      }
      footer={
        <button
          type="button"
          onClick={signOut}
          data-verify-unit="auth-sign-out"
          className="hover:text-foreground underline underline-offset-2"
        >
          {/* COPY: the escape hatch out of a half-authenticated session */}
          Sign out and start again
        </button>
      }
    >
      {supabase.ok ? null : <AuthError message={supabase.message} />}

      <form
        onSubmit={submit}
        data-verify-unit="mfa-verify-form"
        data-verify-loading={loading ? "true" : "false"}
        data-verify-pending={pending ? "true" : "false"}
        className="flex flex-col gap-3"
      >
        <Field
          id="mfa-code"
          label="Six-digit code"
          // COPY: hint for the TOTP code field
          hint="From the authenticator app you enrolled."
        >
          <Input
            id="mfa-code"
            name="code"
            inputMode="numeric"
            // A one-time code is the one credential where autofill is safe and
            // useful: the platform reads it from the notification and it is
            // worthless a minute later.
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={!supabase.ok || loading || pending}
            aria-describedby="mfa-code-hint"
            className="ident tracking-[0.3em]"
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
            }}
          />
        </Field>

        {error === null ? null : <AuthError message={error} />}

        <Button
          type="submit"
          size="sm"
          disabled={!supabase.ok || loading || pending}
        >
          {/* COPY: verify button, and its pending label */}
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </AuthShell>
  );
}
