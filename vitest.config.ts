import { defineConfig } from "vitest/config";

// Each package/app defines its own vitest.config.ts (environment, plugins,
// setup files); this root config just aggregates them as projects so
// `npm test` runs the whole workspace in one pass.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
