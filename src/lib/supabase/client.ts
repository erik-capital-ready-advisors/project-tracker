import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Browser Supabase client.
 *
 * Uses the publishable key only. Every query it makes is subject to row-level
 * security, which is the point -- a browser client that could bypass RLS would
 * make RLS decorative.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
