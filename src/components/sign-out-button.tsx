"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "pending" | "error";

/**
 * B40 -- there was no way to end a session anywhere in the signed-in app. The
 * only existing `auth.signOut()` calls live in the MFA enrol/verify forms
 * (`src/app/sign-in/_components/mfa-*-form.tsx`), and their purpose is to
 * abandon a half-finished sign-in and restart the flow from the password step
 * -- not to end a completed one. This is a deliberately distinct call for a
 * distinct intent: it reaches the same GoTrue endpoint through the same
 * browser client factory (`@/lib/supabase/client`), but it is not the
 * `/sign-in`-route-scoped `useSupabase()` hook those forms share, because that
 * hook is colocated under `sign-in/_lib` for that route's own error-shape and
 * this control is mounted app-wide.
 *
 * Mounted in the app shell's header (`AppShell`), which renders on every
 * route and at every breakpoint -- the sidebar rail is desktop-only
 * (`hidden md:block`), the header is not -- so this is reachable on mobile
 * without a second copy of the control in `MobileNav`.
 *
 * B37: the session cookie is deliberately NOT `HttpOnly`, because
 * `createBrowserClient` must be able to write it, and this component must not
 * "fix" that. It calls `signOut()` on the same browser client every other
 * auth surface uses and lets it clear whatever it can clear. If a token
 * refresh already rewrote the cookie `HttpOnly` (B37's documented failure
 * mode), GoTrue may report a clean sign-out while the browser is left unable
 * to clear its own cookie -- that is a finding to surface, not something this
 * component works around by moving sign-out server-side or touching the
 * cookie policy.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="sign-out"
 *   data-verify-status="idle" | "pending" | "error"
 * No session or token value is ever written to a `data-verify-*` attribute.
 */
export function SignOutButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  const signOut = useCallback(async () => {
    setStatus("pending");

    let client;
    try {
      client = createClient();
    } catch {
      // Not configured for Supabase at all -- there is no session to end.
      setStatus("idle");
      return;
    }

    const { error } = await client.auth.signOut();
    if (error) {
      setStatus("error");
      return;
    }

    setStatus("idle");
    router.replace("/sign-in");
    router.refresh();
  }, [router]);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Sign out"
      title={status === "error" ? "Sign out failed. Try again." : "Sign out"}
      data-verify-unit="sign-out"
      data-verify-status={status}
      disabled={status === "pending"}
      onClick={signOut}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
