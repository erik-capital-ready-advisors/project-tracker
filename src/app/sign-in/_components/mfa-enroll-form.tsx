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
 * FR-2 -- enrol a second factor. **This is the first-run screen, and the one
 * that is easiest to make unreachable.**
 *
 * ## Why an operator can reach this screen at all
 *
 * `i1` left no MFA-enrolment carve-out in row-level security, deliberately, and
 * none is needed: enrolment runs entirely through GoTrue (`/auth/v1/factors`),
 * which touches no RLS-gated table. A signed-in operator at `aal1` can therefore
 * enrol even though `public.operator` -- their own row -- returns nothing.
 *
 * That zero-row read is the trap. Treated as "this account does not exist", it
 * produces a screen telling Erik to obtain the account he already has, with the
 * enrolment he needs sitting behind that conclusion. Nothing on this screen
 * reads a table; every decision comes from `getAuthenticatorAssuranceLevel()`
 * through `nextAuthStep`, which has no parameter for a table read.
 *
 * ## The TOTP secret is a credential and is treated like one
 *
 * The QR code and the secret beside it are the shared secret of the second
 * factor. They are shown once, during enrolment, and are handled with the same
 * discipline as an agent token's plaintext: never written to a `data-verify-*`
 * attribute, never put in a URL, never logged, and never reproduced in a report,
 * a fixture or a screenshot.
 */
export function MfaEnrollForm() {
  const router = useRouter();
  const supabase = useSupabase();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  /**
   * Enrolment runs **once per mount**, and this is not belt-and-braces.
   *
   * Without it the effect re-runs whenever its dependencies change identity, and
   * each run calls `mfa.enroll()` again -- creating a second unverified factor,
   * and putting a freshly-generated secret back on screen after the first one
   * was cleared. Caught by test: after confirming the factor, the old secret
   * reappeared in the DOM.
   */
  const started = useRef(false);

  useEffect(() => {
    if (!supabase.ok) {
      setLoading(false);
      return;
    }
    if (started.current) return;
    started.current = true;

    /**
     * No cancel-flag here, deliberately.
     *
     * `reactStrictMode` is on, so in development React mounts, unmounts and
     * remounts this component before the first async continuation resolves. A
     * flag set in cleanup is therefore already true by the time the response
     * lands, while `started` - a ref, which survives the simulated remount -
     * makes the second mount return early. Together they mean the request
     * fires, the response is discarded, and no state is ever set: the screen
     * renders its frame and nothing inside it. Measured on run b0952e, which
     * left an unverified TOTP factor in GoTrue and a blank enrol screen.
     * Setting state after a real unmount is a no-op in React 18+, so the flag
     * was protecting against nothing.
     */
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
      // Already at aal2, or holding a verified factor to present instead.
      if (step !== "enroll") {
        router.replace(STEP_PATH[step]);
        return;
      }

      // No `friendlyName`. GoTrue refuses a second factor carrying a name that
      // is already taken, so a fixed one turns a retried enrolment into an
      // error about naming rather than a working second attempt.
      const { data: enrolled, error: enrollError } =
        await supabase.client.auth.mfa.enroll({ factorType: "totp" });

      if (enrollError || !enrolled) {
        setError(
          enrollError?.message ??
            "A second factor could not be created. Try again.",
        );
        setLoading(false);
        return;
      }

      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setLoading(false);
    })();

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
      setError("A code from the authenticator app is six digits.");
      return;
    }

    setPending(true);
    setError(null);

    const { data: challenge, error: challengeError } =
      await supabase.client.auth.mfa.challenge({ factorId });

    if (challengeError || !challenge) {
      setError(
        challengeError?.message ??
          "The enrolment challenge could not be started. Try again.",
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

    // Verifying an enrolment upgrades the session to aal2 in one step, so there
    // is no second trip through the verify screen.
    setSecret(null);
    setQrCode(null);
    router.replace(STEP_PATH.ready);
    router.refresh();
  }

  return (
    <AuthShell
      title="Enrol a second factor"
      description={
        <>
          Multi-factor authentication is required and this account has none yet.
          Scan the code with an authenticator app, then type what it shows.
        </>
      }
      footer={
        <button
          type="button"
          onClick={signOut}
          data-verify-unit="auth-sign-out"
          className="hover:text-foreground underline underline-offset-2"
        >
          Sign out and start again
        </button>
      }
    >
      {supabase.ok ? null : <AuthError message={supabase.message} />}

      <div
        data-verify-unit="mfa-enroll"
        data-verify-loading={loading ? "true" : "false"}
        data-verify-has-factor={factorId === null ? "false" : "true"}
        className="flex flex-col gap-3"
      >
        {qrCode === null ? null : (
          <div className="border-border flex flex-col items-center gap-2 rounded-lg border p-3">
            {/* A `data:` SVG from GoTrue, which the CSP's `img-src` already
                allows. `next/image` is not used: it optimises remote and local
                files, and there is nothing to optimise in an inline SVG. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt=""
              width={160}
              height={160}
              className="size-40 bg-white p-2"
            />
            {secret === null ? null : (
              <div className="flex w-full flex-col gap-1">
                <p className="text-muted-foreground text-xs">
                  Or type this into the app by hand:
                </p>
                <code
                  data-verify-unit="mfa-secret"
                  className="border-border bg-muted/60 text-foreground block rounded-md border px-2 py-1.5 text-xs break-all select-all"
                >
                  {secret}
                </code>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field
            id="enroll-code"
            label="Six-digit code"
            hint="Confirms the app and this account agree before the factor is kept."
          >
            <Input
              id="enroll-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={!supabase.ok || loading || pending || factorId === null}
              aria-describedby="enroll-code-hint"
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
            disabled={!supabase.ok || loading || pending || factorId === null}
          >
            {pending ? "Confirming…" : "Confirm and finish"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
