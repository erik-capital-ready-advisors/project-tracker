import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The unit harness. `i2`'s pure parsers under src/lib/ingest/ and this unit's
 * component tests both run here.
 *
 * `environment: "jsdom"` is the default because component tests need a DOM;
 * pure-function tests are unaffected by running in one. A parser suite that
 * wants the node environment can opt out per-file with
 * `// @vitest-environment node`.
 *
 * Globals are deliberately OFF. `describe` / `it` / `expect` are imported
 * explicitly so tsconfig's `types` array does not have to carry vitest/globals,
 * which would otherwise leak test globals into application type-checking.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component, which
      // is the whole point of it — but it also makes any module that imports it
      // untestable here, because vitest is neither a server nor a client bundle.
      // Aliased to a no-op for tests only (i4). The guarantee still holds: it is
      // enforced by Next's bundler at `pnpm build`, which sees the real package.
      "server-only": fileURLToPath(
        new URL("./src/lib/api/__fixtures__/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // `tests/m27-gate.test.ts` was excluded here until M2.7 was dispatched, and
    // the exclusion was deleted on the day the work began (run eb2490, u1). From
    // now on the gate is an ordinary member of the suite and `pnpm test` is what
    // says whether the detail views are navigable. `pnpm gate:m27` still runs it
    // alone, which is useful for a fast read, but it is no longer the only way
    // it runs.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});
