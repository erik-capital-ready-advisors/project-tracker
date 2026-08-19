"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * The browser Supabase client, constructed once and never thrown from render.
 *
 * `createClient()` throws when `NEXT_PUBLIC_SUPABASE_URL` or the publishable key
 * is absent -- correct behaviour, since a fallback is how a placeholder ends up
 * talking to a real project. But thrown from a Client Component's render it
 * takes the whole route down with an error boundary, and the sign-in screen is
 * the one route where a blank page has no recovery: there is nothing else to
 * click.
 *
 * So the failure becomes a value. The message names an environment variable and
 * never its value, which is the same line `@/lib/operator-load` draws on the
 * server side.
 *
 * The publishable key is what it uses, so every query it makes is still subject
 * to row-level security. Authentication calls (`signInWithPassword`, the `mfa.*`
 * family) go to GoTrue, which is not RLS-gated -- that is what lets a
 * never-enrolled operator enrol while reading no table.
 */
export type SupabaseState =
  | { ok: true; client: SupabaseClient }
  | { ok: false; message: string };

export function useSupabase(): SupabaseState {
  const [state] = useState<SupabaseState>(() => {
    try {
      return { ok: true, client: createClient() };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : // COPY: fallback when the Supabase client could not be built
              "The connection to the ledger is not configured, so signing in is not possible from this deployment.",
      };
    }
  });

  return state;
}
