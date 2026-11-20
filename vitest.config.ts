import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Two projects: pure logic runs in Node, React components run in jsdom.
// Test files sit next to the code they test.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": src } },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Pages, route files and CLI entry points are a few lines of wiring,
      // covered by the browser tests and scripts/smoke-review.mjs instead.
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/app/**", "src/cli/**"],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
