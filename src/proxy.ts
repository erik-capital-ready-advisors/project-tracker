import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` and `middleware()` to `proxy()`,
 * with `config` becoming `proxyConfig`. Same slot, same runtime contract —
 * confirmed against `PROXY_FILENAME` in `node_modules/next/dist/lib/constants.js`
 * rather than assumed from the older docs.
 *
 * This file does two things and deliberately not a third.
 *
 * ## 1. The Content-Security-Policy, with a per-request nonce
 *
 * The other security headers are static and live in `next.config.ts`, where
 * `headers()` covers every response including static assets. The CSP cannot:
 * it carries a nonce that must be different on every request, and
 * `next.config.ts` is evaluated once at build time.
 *
 * The nonce contract is Next's, and it is not the obvious one. Next discovers
 * the nonce by reading the **request-side** `Content-Security-Policy` header
 * and regex-extracting `'nonce-…'` from `script-src` (falling back to
 * `default-src`) — see
 * `node_modules/next/dist/server/app-render/get-script-nonce-from-header.js`,
 * called from `parseRequestHeaders` in `app-render.js`. So the header has to be
 * set on the request *and* on the response. `x-nonce` is not a Next convention;
 * it is set here purely so the root layout can read it and hand it to
 * `next-themes`, whose pre-paint script is the one inline script Next does not
 * stamp itself.
 *
 * ### The trade this makes, stated plainly
 *
 * **A nonce-based CSP requires dynamic rendering.** Next applies nonces during
 * server-side rendering from the request header; a statically prerendered page
 * was built when no request existed, so its script tags carry no nonce and this
 * policy would block them. That is why the root layout awaits `headers()` — it
 * makes every route dynamic, which is the correct shape for this product
 * anyway: §7a states there is no public surface, every screen reads live
 * per-request data, and there is nothing here worth prerendering. Partial
 * Prerendering is incompatible with this approach and must not be enabled
 * without replacing it.
 *
 * ## 2. Supabase session refresh
 *
 * `@supabase/ssr` needs a request-scoped touch to rotate an access token before
 * it expires. Without it a signed-in operator is logged out whenever the token
 * ages past its TTL mid-session.
 *
 * ## What it deliberately does NOT do: authorization
 *
 * There are no redirects here, no "is this route protected" list, and no
 * role check. §7a requires MFA and role to be "enforced in row-level security
 * rather than only in the Next.js layer", and i1 built exactly that:
 * `app.is_operator()` demands `aal2` and a non-null role, and every one of the
 * 23 policies routes through it. A middleware gate would add a second, weaker
 * copy of that rule in a place where forgetting to list a route fails **open**.
 * Here, forgetting anything fails closed, because the database is the gate.
 *
 * Consequently a session-refresh failure is caught and the request continues.
 * That is safe precisely because this file authorizes nothing — a stale session
 * reads no rows.
 */

const NONCE_BYTES = 16;

function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Derive the Supabase origins the browser is allowed to talk to, from the env
 * var rather than from a literal.
 *
 * A hardcoded project ref in this file would be an identifier committed to the
 * repository, and FR-78 exists because this practice takes the difference
 * between an identifier and a credential seriously enough to enforce it in the
 * database. Reading it from the environment also means preview and production
 * get the right hosts without a code change.
 *
 * REST is `https://<ref>.supabase.co` and Realtime is
 * `wss://<ref>.supabase.co/realtime/v1` — the same host, two schemes, and CSP
 * does not imply one from the other, so both are listed.
 */
function supabaseConnectSources(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { host, protocol } = new URL(raw);
    if (protocol !== "https:") return [];
    return [`https://${host}`, `wss://${host}`];
  } catch {
    // A malformed URL widens nothing: the app will fail loudly elsewhere when
    // it tries to use it, and the policy stays as tight as it was.
    return [];
  }
}

function contentSecurityPolicy(nonce: string): string {
  const directives = [
    ["default-src", "'self'"],
    // 'strict-dynamic' is what lets Next's nonce-tagged bootstrap script load
    // its own hashed chunks without enumerating every chunk URL.
    ["script-src", `'self' 'nonce-${nonce}' 'strict-dynamic'`],
    // next/font's generated inline styles are stamped with the nonce by Next
    // itself; Tailwind v4's compiled sheet is an external file covered by 'self'.
    // No 'unsafe-inline' anywhere.
    ["style-src", `'self' 'nonce-${nonce}'`],
    ["img-src", "'self' blob: data:"],
    ["font-src", "'self'"],
    ["connect-src", ["'self'", ...supabaseConnectSources()].join(" ")],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    // The reason X-Frame-Options is also set in next.config.ts is browsers that
    // predate this directive; this is the one that actually governs.
    ["frame-ancestors", "'none'"],
    ["upgrade-insecure-requests", ""],
  ];

  return directives
    .map(([name, value]) => (value ? `${name} ${value}` : name))
    .join("; ");
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  // Read by Next itself to stamp its own script tags. Must be the request side.
  requestHeaders.set("Content-Security-Policy", csp);
  // Read by the root layout, for next-themes' pre-paint script.
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  await refreshSupabaseSession(request, response);

  return response;
}

/**
 * Rotate the Supabase access token if it is near expiry.
 *
 * The import is dynamic so that a missing `NEXT_PUBLIC_SUPABASE_*` variable
 * cannot take down every request in an environment that has not been configured
 * yet — which includes a fleet worktree with no `.env.local`. The catch is not
 * papering over an error: this function authorizes nothing, so its failure
 * costs a session refresh and never a permission check.
 */
async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return;
  }

  try {
    const { createServerClient } = await import("@supabase/ssr");

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              /**
               * The attributes are @supabase/ssr's, not this file's. That is a
               * correction, and the reasoning it replaces is worth keeping.
               *
               * This block used to force `httpOnly: true, secure: true,
               * sameSite: "lax"`, citing Baseline §1 — "a session cookie
               * readable by JavaScript is an XSS escalation path". The rule is
               * right in general and **incompatible with this application in
               * particular**, because authentication here is client-side:
               * `createBrowserClient` signs in, challenges the second factor,
               * and persists the session through `document.cookie`.
               *
               * `document.cookie` cannot overwrite an `HttpOnly` cookie, and
               * the write fails **silently**. So the first time this proxy
               * refreshed a near-expiry token it rewrote the session cookie
               * `HttpOnly`, and from that moment every sign-in in that browser
               * succeeded at GoTrue — password 200, TOTP challenge 200, verify
               * 200 — and persisted nothing. `mfa-verify-form.tsx` then read no
               * user and sent the operator back to `/sign-in`, never asking for
               * the code. A browser poisoned this way stayed broken until its
               * cookies were cleared by hand. Diagnosed 2026-08-20; it cost a
               * session, and it locked Erik out of his own product.
               *
               * The override bought no protection either way: supabase-js must
               * read this cookie to work at all, so it was never out of reach
               * of an XSS payload. It only broke the session.
               *
               * **Baseline §1 is not waived — it is unmet, and B37 records
               * that.** Honouring it needs the auth flow moved server-side,
               * which is a milestone, not a middleware edit.
               *
               * `secure` is the one attribute still decided here, and it is
               * derived rather than asserted. Hardcoding `true` marks the
               * cookie unusable over `http://localhost`, which is where this
               * product is developed and where the M2.7 gate runs.
               */
              response.cookies.set(name, value, {
                ...options,
                secure: request.nextUrl.protocol === "https:",
              });
            }
          },
        },
      },
    );

    // `getUser()` and not `getSession()`: only the former revalidates the JWT
    // against the auth server, and it is the call that triggers the refresh.
    await supabase.auth.getUser();
  } catch {
    // See the note above. Refresh is best-effort; row-level security is the gate.
  }
}

export const proxyConfig = {
  /**
   * Everything except Next's own build output and static files.
   *
   * `_next/static` and `_next/image` are excluded because they are immutable
   * assets that need no nonce and no session, and running this on every chunk
   * request is latency for nothing — `next.config.ts`'s `headers()` still covers
   * them with the static security headers.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
