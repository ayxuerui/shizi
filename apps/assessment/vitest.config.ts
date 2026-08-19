import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Was "src/**/*.test.tsx" — silently never ran plain .test.ts files
    // (no JSX), which is most of this app's non-component logic
    // (pointer-gate, audio-unlock, offline queue, bout-machine).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
