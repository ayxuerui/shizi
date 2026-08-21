import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Was "src/**/*.test.ts" — add-dev-deployment's pull-events.test.ts
    // is this package's first test under scripts/, and the old pattern
    // silently never collected it (same class of gap
    // apps/assessment/vitest.config.ts's own header comment already
    // flags and fixed for that package's .test.ts files).
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
