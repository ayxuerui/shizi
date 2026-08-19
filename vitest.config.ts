import { defineConfig } from "vitest/config";

// Each package/app defines its own vitest.config.ts (environment, plugins,
// setup files); this root config just aggregates them as projects so
// `npm test` runs the whole workspace in one pass.
export default defineConfig({
  test: {
    // infra/ has a top-level README.md alongside sync-service/ (unlike
    // packages/*, apps/*, where every entry is itself a project dir) —
    // "infra/*" would try to load that file as a vite config too, so
    // this targets vitest configs explicitly instead of directories.
    projects: ["packages/*", "apps/*", "infra/*/vitest.config.ts"],
  },
});
