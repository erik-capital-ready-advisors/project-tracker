# r1 research note - useSearchParams/usePathname in a root-layout Client Component (Next 16.3.1)

**Run:** d4000f
**Asked by:** u1 (ui-designer)
**Answered:** 2026-08-24

## Vault check

`grep -rli` over `Knowledge/` for searchparams/usePathname/layout/suspense turned up only two
unrelated notes (`A Next.js layout-level auth redirect still ships the guarded page's RSC payload
in the 307 body.md`, and an ADR about static site deploys). Neither addresses this question. No
prior fleet learning to confirm or contradict — this is fresh research, all claims below are
against current docs plus this repo's actual source.

## Repo facts confirmed

- `package.json` pins `"next": "16.3.1"`.
- `node_modules` is not installed in this worktree, so I could not run `pnpm dev`/`pnpm build` to
  observe directly. Everything below is doc-sourced plus static reading of this repo's
  `src/app/layout.tsx`, `src/proxy.ts`, `next.config.ts`, `src/components/answer-filter-bar.tsx`.
- `next.config.ts` sets no `cacheComponents` / `experimental.ppr` flag, and the root layout already
  `await headers()`s. So this app runs in plain **dynamic rendering**, not Cache Components mode —
  that matters because `usePathname`'s Suspense caveat below is a Cache-Components-only concern
  and does not apply to this repo.

## 1. `useSearchParams()` in a client component mounted in the root layout — stale after soft nav?

**No, it is not stale.** The docs' "layouts get stale searchParams" caveat is about **Server
Component layouts**, which is a different mechanism from what you're building. Quote, from the
`useSearchParams` reference:

> "Unlike Pages, Layouts (Server Components) **do not** receive the `searchParams` prop. This is
> because a shared layout is not re-rendered during navigation which could lead to stale
> `searchParams` between navigations. Instead, use the Page `searchParams` prop or the
> `useSearchParams` hook in a **Client Component**, which is re-rendered on the client with the
> latest `searchParams`."
> — https://nextjs.org/docs/app/api-reference/functions/use-search-params

The mechanism: `useSearchParams()` is a Client Component hook backed by client-side router
context. On a soft navigation, Next's client router updates that context for the whole mounted
React tree — it does not matter that the *Server Component* layout wrapping your client component
didn't re-execute on the server; your Client Component (`AppShell`) stays mounted across the
navigation (same position in the tree) and re-renders from the updated context like any other
client component would. "Layouts don't re-render on soft nav" is a statement about the **Server**
half of the layout, not about a Client Component you mount inside it. This is exactly the pattern
the `johnkavanagh.co.uk` article and the official docs converge on: put the client hook in a
Client Component, mount it wherever you like (including inside the root layout), it stays live.

## 2. `usePathname()` — same question

**Also not stale, same reasoning.** From the `usePathname` reference:

> "a Client Component with `usePathname` will be rendered into HTML on the initial page load. When
> navigating to a new route, this component does not need to be re-fetched. Instead, the component
> is downloaded once ... and re-renders based on the current state."
> — https://nextjs.org/docs/app/api-reference/functions/use-pathname

No caveat specific to "mounted inside a layout" exists for plain dynamic rendering. The only
`usePathname` Suspense caveat in the docs is scoped to `cacheComponents` mode with an
unresolved fallback param — not applicable here (see Repo facts above). The only *other*
`usePathname` caveat (hydration mismatch under rewrites/proxy-driven path rewriting) doesn't apply
either: this repo's `proxy.ts` does not rewrite paths, only headers/cookies.

## 3. Suspense boundary requirement for `useSearchParams()` — does it fire here?

**It will not fire in this repo, because the root layout already forces every route dynamic.**
The Suspense requirement is strictly a **prerendering/static-generation** concern:

> "If a route is prerendered, calling `useSearchParams` will cause the Client Component tree up to
> the closest Suspense boundary to be client-side rendered ... During production builds, a static
> page that calls `useSearchParams` from a Client Component must be wrapped in a Suspense boundary,
> otherwise the build fails with the Missing Suspense boundary error."
> — https://nextjs.org/docs/app/api-reference/functions/use-search-params
>
> "To make the route dynamically rendered, use the `connection` function in a Server Component
> (e.g. the Page or a wrapping Layout) ... Before `connection` was available, `export const
> dynamic = 'force-dynamic'` ... opted the route into on-demand rendering."
> — https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout

Your root layout's `await headers()` is exactly this: it's one of the APIs (like `connection()`)
that forces dynamic rendering for every route under it, same effect as `force-dynamic`. Since
nothing here is ever prerendered/static, there is no prerender pass for the build to bail out of,
and the "wrap in Suspense" build failure — which only fires for a route the build is trying to
statically generate — does not apply. You do **not** need to wrap `AppShell`'s picker in
`<Suspense>` for the build to succeed. (You may still choose to, for other reasons — e.g. to avoid
one client component's error boundary taking down the whole shell — but it is not required by this
error class.)

Caveat worth stating plainly: this conclusion follows deductively from the docs' own framing (no
prerendering happening → nothing to bail out of), but I did not get to run `pnpm build` in this
worktree to watch it pass with my own eyes (`node_modules` isn't installed here). Treat this as
HIGH confidence from the spec, not an observed build.

## 4. Are search params populated during SSR (so `<a href>` is correct with JS off), or empty until hydration?

**Populated during SSR**, precisely because the route is dynamically rendered (see #3):

> "If a route is dynamically rendered, `useSearchParams` will be available on the server during
> the initial server render of the Client Component ... This will be logged on the server during
> the initial render and on the client on subsequent navigations."
> — https://nextjs.org/docs/app/api-reference/functions/use-search-params

So on a dynamic route (which every route in this app is, via the layout's `headers()` read),
`useSearchParams()` returns the real values during the server render that produces the initial
HTML — the emitted `<a href>`s in your picker will already reflect the current query string, and
the control works before hydration / with JS disabled. This is the opposite of the static/
prerendered case, where the server logs nothing and the client component is empty until hydration.

## 5. Can `proxy.ts` add a request header a Server Component reads via `headers()` — is it mechanical?

Yes — mechanical, and the repo already does this exact thing for a different value. Read from
`src/proxy.ts`: it builds a mutated `Headers` from `request.headers`, sets two request-side
headers (`Content-Security-Policy`, `x-nonce`) via `requestHeaders.set(...)`, and passes them
through with `NextResponse.next({ request: { headers: requestHeaders } })`. The root layout then
reads one of them back with `(await headers()).get("x-nonce")`. Adding e.g. `x-pathname` /
`x-url` is the same three-line shape:

```ts
requestHeaders.set("x-pathname", request.nextUrl.pathname);
requestHeaders.set("x-url", request.nextUrl.pathname + request.nextUrl.search);
```
(`request.nextUrl` is a `NextURL`, already parsed — no extra parsing needed.) This is a supported,
idiomatic pattern; it's the standard "expose middleware/proxy request data to a Server Component"
workaround cited by both the Next docs' own layout page and the `johnkavanagh.co.uk` article for
exactly this "server component needs the current URL" case — see:
https://nextjs.org/docs/app/api-reference/file-conventions/layout#query-params (layout doc's own
pointer to reading via a Client Component instead) and
https://johnkavanagh.co.uk/articles/access-search-parameters-in-next-js-ssrd-layout/ (the
middleware-header technique, used there for a non-root, server-rendered layout).

**However — given #1 and #4 above, you likely don't need this for your stated goal.** The
mechanical header technique exists for the case where a *Server Component* needs the current URL
(no Client Component in the mix). Your requirement — a Client Component picker with `<Link>`
options — is squarely the `useSearchParams()`/`usePathname()` case, which already gets correct,
non-stale, SSR-populated values without touching `proxy.ts` at all. Only reach for the header
trick if some part of your design needs the query string in a Server Component specifically (e.g.
to conditionally render server-side without any client JS involved).

## 6. Plain `<form method="get">` with no `action` — does it replace the whole query string?

**Yes — confirmed, and this matters for your picker's degrade path.** A GET form with no `action`
submits to the current document URL, and the browser-side "mutate action URL" step (WHATWG HTML
Standard, form submission algorithm — https://html.spec.whatwg.org/multipage/forms.html, the step
named "mutate action URL", also discussed at the W3C issue tracker
https://www.w3.org/html/wg/tracker/issues/138) **sets the action URL's query component from the
form's own field set — it does not merge with whatever query string was already on the page.**
Practical effect: submitting a bare GET form on `/blocked?engagement=acme&limit=50` **drops**
`engagement` and `limit` unless the form itself carries hidden inputs (or visible controls) for
every param you want preserved.

This is exactly why `answer-filter-bar.tsx`'s `AnswerFilterBar` works the way it does — it isn't
a bare form with no `action`, it sets `action={action}` explicitly to the screen's own path
(`<form method="get" action={action}>`) and every filter the screen cares about is rendered as a
named `<input>`/`<select>` **inside** that same form, so the full desired query string is
reconstructed from the form's fields on every submit, not inherited from the URL. If your
engagement picker needs a no-JS degrade path and is a separate `<form>` from the existing filter
bar, it needs the same treatment: either (a) it's not a form at all but a list of plain `<Link>`s
(as your brief already says — a `<Link href="/blocked?engagement=acme">` per option costs nothing
here, since #4 established the href values are already correct at SSR time), or (b) if you do use
a form, every param the current screen carries must be re-emitted as a hidden field, not assumed
carried over.

## Bottom line for the design

Given 1/2/4: mount `useSearchParams()` + `usePathname()` directly in a Client Component inside
`AppShell` (no Suspense needed, no proxy header needed, no staleness). Render the picker's options
as plain `<Link href="/blocked?engagement=acme">`-style links (not a form) — that sidesteps the
"bare GET form drops other params" trap in #6 entirely, and per #4 those hrefs are correct in the
initial server-rendered HTML, so it degrades gracefully with JS off exactly like
`answer-filter-bar.tsx` already does for its own controls.

## Sources
- [useSearchParams — Next.js docs](https://nextjs.org/docs/app/api-reference/functions/use-search-params) — accessed 2026-08-24
- [usePathname — Next.js docs](https://nextjs.org/docs/app/api-reference/functions/use-pathname) — accessed 2026-08-24
- [Missing Suspense boundary with useSearchParams — Next.js docs](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout) — accessed 2026-08-24
- [layout.js file convention, Query params section — Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/layout#query-params) — accessed 2026-08-24
- [Access Search Parameters in Next.js SSR'd Layout — johnkavanagh.co.uk](https://johnkavanagh.co.uk/articles/access-search-parameters-in-next-js-ssrd-layout/) — accessed 2026-08-24 (middleware-header technique; confirms "no way to directly access search params in a Server root layout")
- [WHATWG HTML Standard, forms / form submission algorithm ("mutate action URL")](https://html.spec.whatwg.org/multipage/forms.html) — accessed 2026-08-24
- [W3C HTML WG issue tracker #138, "mutate action" for GET](https://www.w3.org/html/wg/tracker/issues/138) — accessed 2026-08-24, secondary confirmation of the "mutate action" step's existence/naming
- `src/app/layout.tsx`, `src/proxy.ts`, `next.config.ts`, `src/components/answer-filter-bar.tsx` (this worktree) — read directly, 2026-08-24
- No relevant vault note found under `Knowledge/` (searched, see "Vault check" above)

## Confidence
HIGH for 1, 2, 4, 5, 6 — each is a direct docs quote or matches this repo's own already-working
pattern (`answer-filter-bar.tsx`, `x-nonce`). MEDIUM-HIGH for 3 — the "no Suspense needed" answer
follows deductively from the docs' own framing (Suspense is a prerendering concern; this app never
prerenders) and from the repo's `next.config.ts` carrying no `cacheComponents`/PPR flag, but I did
not get to run `pnpm build` in this worktree (`node_modules` not installed here) to watch it pass
with my own eyes — flag this to u1 as the one item to spot-check with an actual `pnpm build` once
the component is written, rather than a fact I observed.
