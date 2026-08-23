/**
 * Supabase configuration, read from the environment and nowhere else.
 *
 * Per CLAUDE.md: secrets come from the environment only. Nothing in this
 * directory carries a default value, a fallback, or an example key -- a
 * fallback is how a placeholder ends up talking to a real project, and a
 * committed default is a committed credential regardless of what it contains.
 *
 * Only the two PUBLIC values live here. The service-role key is deliberately
 * absent from this module because this module is imported by browser code; see
 * the note in ./server.ts.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for the ` +
        `variables this app expects; set real values in Vercel and, for local ` +
        `work, in .env.local.`,
    );
  }
  return value;
}

/** The project URL. Public: it is shipped to the browser by design. */
export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

/**
 * The publishable key. Public and safe to expose -- it carries no privileges of
 * its own and every read it performs is still subject to row-level security.
 */
export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
