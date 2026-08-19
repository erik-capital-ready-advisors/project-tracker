# i4 research note - Nonce-based CSP on Next.js 16.3.1 (proxy.ts, next-themes, next/font)

**Run:** b0952e
**Answered:** 2026-08-19T16:14:08Z

Installed versions checked directly: `next@16.3.1` (in `node_modules/next`), `next-themes@0.4.6`
(in `node_modules/next-themes`). No prior vault note covers this exact question — checked
`Erik-Brain/Knowledge/` for `csp|nonce|content-security-policy|proxy.ts|x-nonce`; hits were about
other topics (Reels/Hook&Scale audits, replay-nonce protocols, Vercel deployment-protection). This
is fresh research, not a correction of an existing note.

## 1. Does the nonce mechanism work from `proxy.ts`, and what's the exact contract?

**Yes, unchanged.** `proxy.ts`/`proxy()` is a rename of `middleware.ts`/`middleware()` — same
runtime contract, same `NextRequest`/`NextResponse` API. Confirmed in the installed package:
`node_modules/next/dist/lib/constants.js` defines
`PROXY_FILENAME = 'proxy'` / `PROXY_LOCATION_REGEXP = '(?:src/)?proxy'`, referenced from
`dist/build/index.js`, `dist/build/utils.js`, `dist/build/analysis/get-page-static-info.js`, and
the dev bundler — i.e. Next's build pipeline looks for a file literally named `proxy`, same slot
`middleware` used to occupy.

**The contract is (a)** — Next reads the **request** `Content-Security-Policy` (or
`Content-Security-Policy-Report-Only`) header that proxy set via
`NextResponse.next({ request: { headers } })`, and regex-extracts the first `'nonce-XXX'` token
out of the `script-src` directive (falling back to `default-src` if there's no `script-src`).

Exact implementation, `node_modules/next/dist/server/app-render/get-script-nonce-from-header.js`:

```js
const CSP_NONCE_SOURCE_REGEX = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;
function getScriptNonceFromHeader(cspHeaderValue) {
    const directives = cspHeaderValue.split(';').map((directive)=>directive.trim());
    const directive = directives.find((dir)=>dir.startsWith('script-src')) || directives.find((dir)=>dir.startsWith('default-src'));
    if (!directive) return;
    for (const source of directive.split(/\s+/).slice(1)){
        const match = source.trim().match(CSP_NONCE_SOURCE_REGEX);
        if (match) return match[1];
    }
}
```

Called from `node_modules/next/dist/server/app-render/app-render.js`, inside
`parseRequestHeaders(headers, options)`:

```js
const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
const nonce = typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
```

and that function is called as `parseRequestHeaders(req.headers, {...})` (line 1814 of the same
file) — confirming `headers` here is the **incoming request's** headers as seen by the render
path, i.e. exactly the headers object proxy.ts rewrote via `request: { headers: requestHeaders }`.
The resolved `nonce` is then threaded through `ctx.nonce` into `getRequiredScripts`,
`preloadStyle`, `preloadFont`, `preconnect`, the RSC inline-data stream, and `createServerInsertedMetadata` (grep hits across `app-render.js`, `render-css-resource.js`, `get-layer-assets.js`, `required-scripts.js`) — that's the "stamp nonce on Next's own injected scripts/styles" step.

This matches the current official doc exactly (fetched live, page metadata self-reports
`version: 16.3.1`, `lastUpdated: 2026-03-20`,
https://nextjs.org/docs/app/guides/content-security-policy): proxy sets **both** an `x-nonce`
request header (for you to read it yourself in Server Components / `<Script nonce>`) **and** the
`Content-Security-Policy` header on the rewritten request — Next only auto-discovers the nonce via
the CSP header regex, never via `x-nonce`. `x-nonce` is purely a convenience channel for your own
code to `headers().get('x-nonce')`; it plays no role in Next's own script/style stamping.

Doc's canonical `proxy.ts` example (quoted in full because the exact header-setting shape is
load-bearing):

```ts
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, ' ').trim()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)
  return response
}
```

Note it sets the CSP header **twice**: once on the rewritten request (so `app-render.js` can read
it back out) and once on the actual outgoing response (so the browser enforces it). Both are
required — missing the request-side set means Next never discovers the nonce; missing the
response-side set means the browser never enforces the policy.

## 2. Does this work with static prerendering?

**No — nonce-based CSP forces dynamic rendering, documented as a hard requirement, not a tuning
knob.** Direct quote from the same doc page: *"To use a nonce, your page must be **dynamically
rendered**. This is because Next.js applies nonces during **server-side rendering**, based on the
CSP header present in the request. Static pages are generated at build time, when no request or
response headers exist — so no nonce can be injected."*

Consequences the doc states explicitly:
- Static optimization and ISR are disabled on any route using the nonce.
- Partial Prerendering (PPR) is **incompatible** with nonce-based CSP — "static shell scripts
  won't have access to the nonce."
- Pages "will build successfully but may encounter runtime errors if not properly configured for
  dynamic rendering."
- To force it where a page wouldn't otherwise be dynamic, the doc's recommended pattern is
  `await connection()` from `next/server` inside the page.

The documented alternative that preserves static generation is **experimental Subresource
Integrity (SRI)** (`experimental.sri.algorithm` in `next.config.js`, build-time script hashes
instead of a per-request nonce) — but that's a different mechanism (hash-based, not nonce-based)
and is explicitly flagged experimental, App Router only, and it does not cover inline
scripts/styles generated at runtime.

**Implication for this app:** every route that needs to render under the nonce policy is
effectively dynamic. If any route in this app is meant to stay statically prerendered, it cannot
carry a nonce-based `script-src`/`style-src` — it would need either `'unsafe-inline'`+hash, the
experimental SRI path, or simply not be covered by the strict policy (e.g. served with a looser
CSP or none). This is a real trade-off to surface to the build report, not a detail to paper over.

## 3. next/font/google inline `<style>` and `style-src`

The doc's own list of what gets the nonce automatically (step 3 of "How nonces work in Next.js")
is explicit: *"Next.js attaches the nonce to: Framework scripts (React, Next.js runtime) · Page-
specific JavaScript bundles · **Inline styles and scripts generated by Next.js** · Any `<Script>`
component using the `nonce` prop."* — confirmed independently in the installed package: `ctx.nonce`
is threaded into `preloadStyle(...)` (`render-css-resource.js:41`) and `preloadFont(...)` /
`preconnect(...)` (`get-layer-assets.js:32,39,45`), which cover `next/font`'s generated
preload/style tags.

**Minimal working `style-src` for Tailwind v4 + next/font in this app is exactly what the doc's
canonical example uses:**

```
style-src 'self' 'nonce-<nonce>';
```

No `'unsafe-inline'` needed. Reasoning: Tailwind v4 compiles to an external `.css` file linked via
`<link rel="stylesheet">`, which is covered by `'self'` — it never needs the nonce because it's not
inline. `next/font/google` self-hosts font files at build time and injects its CSS as inline
`<style>`/preload tags that Next stamps with the request nonce automatically (per the mechanism
above), so `'nonce-<nonce>'` covers it. `'self'` alone would not cover the inline font styles;
dropping the nonce from `style-src` would break `next/font`.

## 4. Does `next-themes` 0.4.6 `ThemeProvider` accept a `nonce` prop?

**Yes.** Read directly from `node_modules/next-themes/dist/index.d.ts`:

```ts
interface ThemeProviderProps extends React.PropsWithChildren {
    ...
    /** Nonce string to pass to the inline script and style elements for CSP headers */
    nonce?: string;
    /** Props to pass the inline script */
    scriptProps?: ScriptProps;
}
```

Exact prop name: **`nonce`**, type **`string | undefined`**. Confirmed in the runtime source
(`dist/index.js`, de-minified excerpt) — the nonce is applied to two separate inline injections:

1. The theme-setting bootstrap `<script>` (component `Y`/memoized), rendered server-side only:
   `nonce: typeof window == "undefined" ? m : ""` — i.e. it's applied during SSR and omitted
   client-side (the script only ever runs once, inline, before hydration).
2. A transient inline `<style>` element created client-side when `disableTransitionOnChange` is
   true (function `K`), which does `s.setAttribute("nonce", e)` if a nonce was passed — this
   disables CSS transitions for one frame during a theme switch.

**If you omit the prop under a nonce-only `script-src`/`style-src`** (no `'unsafe-inline'`): the
theme-bootstrap inline script is blocked, so `next-themes` cannot set the theme class/attribute
before paint — you get a flash of the wrong theme (FOUC/FOIT-equivalent) and, on strict browsers,
a CSP violation logged in the console. If `disableTransitionOnChange` is also enabled, the inline
transition-suppression `<style>` gets blocked too, which is a lower-severity failure (visible CSS
transition flash on theme toggle) rather than a broken app. So: pass the same nonce read from
`headers().get('x-nonce')` (or from the request CSP header) into `<ThemeProvider nonce={nonce}>` in
the root layout — this is a manual wire-up, not something Next does automatically for third-party
component libraries, only for its own framework-generated scripts/styles.

## 5. Minimal working CSP for `next build && next start`, no third-party scripts, Supabase over https

Built from the doc's canonical strict-CSP template, adapted: drop `'strict-dynamic'`'s allowance
for GTM-style third-party domains (not needed, no third-party scripts here), and add `connect-src`
for Supabase. Supabase's browser SDK talks to the project's REST endpoint over `https://` and
Realtime over `wss://` — both are the **same host** (`<project-ref>.supabase.co`), so one entry
covers both schemes only if you list both explicitly (CSP does not implicitly allow `wss:` from an
`https:` origin entry):

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'nonce-<nonce>';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

Notes:
- `'strict-dynamic'` on `script-src` is what lets Next's nonce-tagged bootstrap script load its own
  child bundles without listing every hashed chunk URL — keep it even with no third-party scripts,
  it's part of how Next's own runtime loads itself under a nonce policy per the doc's example.
  `'strict-dynamic'` is script-src-only; it is not valid/meaningful on `style-src` (not included
  above, matches the doc's own `style-src 'self' 'nonce-${nonce}'` with no `'strict-dynamic'`).
- Dev needs `'unsafe-eval'` appended to `script-src` (React's eval-based error-stack
  reconstruction) — the doc is explicit this is dev-only and not needed in production; do not ship
  it in the production policy.
- This entire policy is only enforceable on **dynamically rendered** routes per finding #2. If any
  route in this app must stay statically prerendered, it needs a separate, non-nonce policy or no
  CSP coverage — flag that as a decision, don't silently apply this policy repo-wide via
  `next.config.js` `headers()` (that path is for the *no-nonce* variant only, per the doc's
  "Without Nonces" section, and doesn't get you a nonce at all).
- Replace `<project-ref>` with the actual Supabase project ref/URL from env — do not hardcode a
  real value in the policy source per this repo's credentials rule; read it from
  `NEXT_PUBLIC_SUPABASE_URL` at build/request time in proxy.ts and derive the `connect-src` host
  from it.
- The build report's header claim must be `NOT VERIFIED` until a real response from
  `next start` is inspected (`curl -sI` against the running prod build) and shows both the CSP
  header present and a page load with zero console CSP violations — per this project's
  "a control you did not observe is not a control" rule.

## Sources

- `node_modules/next/dist/lib/constants.js` (installed, v16.3.1) — `PROXY_FILENAME`/`PROXY_LOCATION_REGEXP` definitions, confirming `proxy.ts` is the file-convention rename of `middleware.ts`.
- `node_modules/next/dist/server/app-render/get-script-nonce-from-header.js` (installed, v16.3.1) — nonce-extraction regex, quoted in full above.
- `node_modules/next/dist/server/app-render/app-render.js` (installed, v16.3.1), lines ~195-234 and ~1814 — `parseRequestHeaders(req.headers, ...)` call site, confirming the nonce is read from request headers.
- `node_modules/next/dist/server/app-render/render-css-resource.js`, `get-layer-assets.js` (installed, v16.3.1) — `ctx.nonce` threaded into `preloadStyle`/`preloadFont`/`preconnect`.
- `node_modules/next-themes/dist/index.d.ts` and `dist/index.js` (installed, v0.4.6) — `nonce?: string` prop and its two runtime uses, quoted above.
- [Content Security Policy (CSP) — Next.js docs](https://nextjs.org/docs/app/guides/content-security-policy) — accessed 2026-08-19, page self-reports `version: 16.3.1`, `lastUpdated: 2026-03-20`; fetched live and quoted directly above (proxy.ts example, dynamic-rendering requirement, nonce-auto-apply list, SRI alternative, "Without Nonces" `next.config.js` path).
- WebSearch cross-check, accessed 2026-08-19: [Next.js CSP: Static Pages, Nonces, and Trade-offs](https://johnkavanagh.co.uk/articles/content-security-policy-in-nextjs/), [Setting a CSP in Next.js – Nonces, Proxy Headers, and Dynamic Rendering](https://shahin.page/article/nextjs-content-security-policy-csp-nonce-dynamic-rendering) — both independently confirm the dynamic-rendering requirement and PPR incompatibility; no conflicting claims found.

## Confidence

HIGH for items 1, 2, 3, 4 — each is backed by either a direct read of the installed package source
in this repo's own `node_modules`, or a live fetch of the official docs page that self-reports the
exact installed Next.js version (16.3.1) as current.

MEDIUM for item 5's `connect-src` Supabase specifics (host format, REST+Realtime same-origin
assumption) — this follows from how Supabase's client SDK is documented to construct URLs
(`https://<ref>.supabase.co` for REST, `wss://<ref>.supabase.co/realtime/v1` for Realtime), not
from a source fetched in this investigation; if this app uses a custom Supabase domain or a
self-hosted/proxied Supabase instance, the `connect-src` host(s) will differ and should be verified
against the actual `NEXT_PUBLIC_SUPABASE_URL` value in this project's env, and the full policy must
be verified against a real `next start` response before the build report claims it as observed.
