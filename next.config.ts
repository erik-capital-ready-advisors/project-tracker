import type { NextConfig } from "next";

/**
 * Security headers that do not need a per-request value.
 *
 * These live here rather than in `proxy.ts` because `headers()` covers **every**
 * response Next serves, including static assets and the `/_next/*` chunks that
 * the proxy matcher deliberately skips. The Content-Security-Policy is the one
 * header that cannot live here — it carries a per-request nonce — and it is set
 * in `proxy.ts`. See the note there for why the split exists.
 *
 * Every entry below is the security baseline's §6 list. §7a is silent on
 * headers, so the source for all of them is **the baseline, not the spec**.
 */
const SECURITY_HEADERS = [
  {
    // Baseline §1. Two years, subdomains included. `preload` is deliberately
    // absent: it is a submission to a browser-vendor list that is slow and
    // awkward to reverse, and the baseline says to add it only when the client
    // owns the apex domain and understands that. Erik has not been asked.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Redundant with the CSP's `frame-ancestors 'none'` and kept anyway: the
    // baseline says to keep both while support lasts, and this one is what an
    // older browser that ignores frame-ancestors will honour.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Deny what this product does not use. It is a single-operator delivery
    // tracker: it has no camera, no microphone, no location, no payment flow,
    // and no reason to be able to acquire one silently.
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    // Cross-origin isolation posture. `same-origin` on the opener policy stops a
    // window this app opens (or that opens it) from reaching back through
    // `window.opener`.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Drop `X-Powered-By: Next.js`. It is not a vulnerability, but it names the
   * framework and therefore the CVE list worth trying, for no benefit to anyone
   * legitimate. Baseline §6 does not require this; it is free.
   */
  poweredByHeader: false,

  /**
   * Next 16.3 writes a `<!-- BEGIN:nextjs-agent-rules -->` block into
   * `CLAUDE.md` on every `next dev` and `next build`, and re-adds it when it is
   * removed. On this repository `CLAUDE.md` is the fleet's operating contract —
   * the file every specialist reads before it does anything — so a build step
   * that edits it is a build step that edits the instructions. Worse, it turns
   * up as an unstaged change in a worktree and gets swept into a commit by
   * `git add -A`.
   *
   * Off. Verified by observation: `git status --porcelain` is clean for
   * `CLAUDE.md` after `pnpm build`, and the observed output is in the unit
   * report rather than asserted here.
   */
  agentRules: false,

  // `typedRoutes` is deliberately off. It generates its route union into
  // `.next/types` during a build, so `pnpm typecheck` on a clean checkout --
  // which is how every fleet worktree starts -- would fail on hrefs that are
  // correct, before any build has run. Robustness for a cold worktree beats
  // the extra check here.

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
