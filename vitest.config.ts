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
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});
