import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/renderer/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    include: ["src/**/*.test.{ts,tsx}", "scripts/bench/**/*.test.mjs"],
    // One jsdom fork per core timed out at startup when free RAM was low;
    // two workers ran all files reliably. Override with --maxWorkers.
    maxWorkers: 2,
  },
});
