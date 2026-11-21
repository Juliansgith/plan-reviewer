import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

// Browser tests run against the production build (npm run build first),
// served by the same standalone server as Docker, on seeded data.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Seeded outside test-results/, which Playwright clears when a run starts.
    command: "npx tsx e2e/make-data.ts e2e/.data && node scripts/start.mjs",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), BIND_HOST: "127.0.0.1", DATA_DIR: "e2e/.data" },
  },
});
