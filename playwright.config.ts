import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against a RUNNING Control Center stack (web + backend + Postgres).
 *
 *   E2E_BASE_URL   the console (default http://localhost:3002)
 *   E2E_EMAIL      a SUPER_ADMIN operator
 *   E2E_PASSWORD   that operator's password
 *
 * Nothing is mocked: every click goes through the real API and database. The suite creates its
 * own throwaway operator (e2e.operator@example.test) and leaves it disabled afterwards.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
