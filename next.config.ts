import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `typedRoutes` is deliberately off. It generates its route union into
  // `.next/types` during a build, so `pnpm typecheck` on a clean checkout --
  // which is how every fleet worktree starts -- would fail on hrefs that are
  // correct, before any build has run. Robustness for a cold worktree beats
  // the extra check here.
};

export default nextConfig;
