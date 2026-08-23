import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Server Supabase client, session-scoped.
 *
 * `import "server-only"` makes an accidental import from a Client Component a
 * BUILD error rather than a runtime leak. That matters more than it looks: the
 * usual way a server-side key reaches a browser bundle is not a deliberate
 * decision, it is one `import` added by someone wiring up a component.
 *
 * This client uses the PUBLISHABLE key and the request's cookies, so it reads
 * as the signed-in operator and row-level security still applies to it.
 *
 * There is deliberately NO service-role client in this file. A service-role key
 * bypasses row-level security entirely, so the client that uses it belongs in
 * the narrow server-only paths that genuinely need it -- the ingest API and
 * admin actions -- created there, next to the code that justifies it, and never
 * in a shared module that any component can import by reflex. Wiring that is
 * `api-integrator`'s work, not the scaffold's.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Harmless when middleware refreshes the session; see @supabase/ssr.
        }
      },
    },
  });
}
