import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The acceptance gates for milestones that have not been built yet.
 *
 * They are red by construction, so they cannot live in `pnpm test` without
 * making every other piece of work look broken. They are also the only thing
 * that makes the milestone's specialist reports falsifiable, so they must not
 * live in a comment either. `pnpm gate:m27` is the difference.
 *
 * Standalone rather than merged from `vitest.config.ts`: `mergeConfig`
 * CONCATENATES `include`, so a merged config ran the entire 1061-test suite and
 * reported green — the gate excluded, the run indistinguishable from a pass.
 * That is the failure this whole file exists to prevent, met on the first try.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/*-gate.test.ts"],
  },
});
