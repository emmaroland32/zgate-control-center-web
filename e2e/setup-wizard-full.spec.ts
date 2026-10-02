import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, expectToast, fieldByLabel } from "./helpers";

/**
 * The complete New Deployment wizard, all eight steps. It creates nothing server-side (the wizard
 * never POSTs an organization; step 8 cannot act without an org id), so the only state it touches
 * is localStorage["zgate_wizard_state"], cleared before and after.
 *
 * The step-7 "Verify Connection" fetch is pointed at a closed port so its result is deterministic
 * whatever else happens to be listening on this machine.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const step = (page: Page, n: number, label: string) => page.getByText(`Step ${n} of 8 — ${label}`);

test("wizard: Docker Compose → organization → infrastructure → configuration → Banking Suite → review → artifacts → license → Finish", async ({ page }) => {
  await page.goto("/setup");
  await page.evaluate(() => localStorage.removeItem("zgate_wizard_state"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "New Deployment Wizard" })).toBeVisible();

  // ── Step 1: type ──
  await expect(step(page, 1, "Type")).toBeVisible();
  await page.getByText("Local / Docker Compose", { exact: true }).click();
  await next(page).click();

  // ── Step 2: organization (validation messages in order) ──
  await expect(step(page, 2, "Organization")).toBeVisible();
  await next(page).click();
  await expect(page.getByText("Organization name is required.")).toBeVisible();
  await page.getByPlaceholder("Apex Capital Management").fill("E2E Wizard Org");
  await expect(page.getByPlaceholder("apex-capital", { exact: true })).toHaveValue("e2e-wizard-org");
  await next(page).click();
  await expect(page.getByText("Contact email is required.")).toBeVisible();
  await page.getByPlaceholder("ops@example.com").fill("e2e@example.test");
  await next(page).click();
  await expect(page.getByText("Country is required.")).toBeVisible();
  await fieldByLabel(page, "Country").selectOption("South Africa");
  await next(page).click();

  // ── Step 3: infrastructure ──
  await expect(step(page, 3, "Infrastructure")).toBeVisible();
  await fieldByLabel(page, "Host / Server URL").fill("http://127.0.0.1");
  await fieldByLabel(page, "Database Host").fill("db.e2e.test");
  await fieldByLabel(page, "Database Name").fill("zgate_e2e");
  await fieldByLabel(page, "Database User").fill("e2e_user");
  await fieldByLabel(page, "Database Password").fill("e2e-db-secret");
  await fieldByLabel(page, "Redis Host").fill("redis.e2e.test");
  await fieldByLabel(page, "Backend Port").fill("65530");

  // Tests Control Center's OWN database, not the values typed — either outcome is a rendered result.
  const [dbTest] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/database/test-connection")),
    page.getByRole("button", { name: "Test Database Connection" }).click(),
  ]);
  expect(dbTest.status()).toBeLessThan(500);
  await expect(
    page.getByText("Connected", { exact: true }).or(page.getByText("Failed — check host, port, and credentials")).first(),
  ).toBeVisible();

  await fieldByLabel(page, "Database Host").fill("");
  await next(page).click();
  await expect(page.getByText("Database host is required.")).toBeVisible();
  await fieldByLabel(page, "Database Host").fill("db.e2e.test");
  await next(page).click();

  // ── Step 4: configuration ──
  await expect(step(page, 4, "Configuration")).toBeVisible();
  await expect(page.getByPlaceholder("Enter or generate a secret key…")).toHaveValue("");
  await next(page).click();
  await expect(page.getByText("JWT secret must be at least 32 characters.")).toBeVisible();
  await page.getByRole("button", { name: "Use Defaults" }).click();
  await expectToast(page, "Defaults applied");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const jwt = await page.getByPlaceholder("Enter or generate a secret key…").inputValue();
  expect(jwt.length).toBeGreaterThanOrEqual(32);
  await fieldByLabel(page, "Admin Email").fill("admin@e2e.test");
  await fieldByLabel(page, "Admin Password").fill("E2e-Passw0rd!");
  await next(page).click();

  // ── Step 5: modules ──
  await expect(step(page, 5, "Modules")).toBeVisible();
  await page.getByRole("button", { name: "Banking Suite" }).click();
  await expect(page.getByText(/\b5 of \d+ modules selected/)).toBeVisible();
  await next(page).click();

  // ── Step 6: review shows what was entered ──
  await expect(step(page, 6, "Review")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything looks correct?" })).toBeVisible();
  for (const value of [
    "Local / Docker Compose", "E2E Wizard Org", "e2e-wizard-org", "e2e@example.test", "South Africa", "PRODUCTION",
    "db.e2e.test:5433/zgate_e2e", "e2e_user", "redis.e2e.test:6380", "65530", "registry.zgate.io",
    "24h", "admin", "admin@e2e.test", "●●●●●●●●●●●●", "●●●●●●●●", "ZGATE", "USD", "UTC",
  ]) {
    await expect(page.getByText(value, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(5);
  await expect(page.getByText("Ready to deploy.")).toBeVisible();
  await next(page).click();

  // ── Step 7: artifacts ──
  await expect(step(page, 7, "Deploy")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deploying ZGATE" })).toBeVisible();
  const code = page.locator("pre").first();
  await expect(page.getByRole("button", { name: "docker-compose.yml" })).toBeVisible();
  await expect(page.getByRole("button", { name: "k8s-manifest.yml" })).toHaveCount(0);
  await expect(code).toContainText("services:");
  await expect(code).toContainText("registry.zgate.io/zgate-backend:");
  await page.getByRole("button", { name: ".env", exact: true }).click();
  await expect(code).toContainText("DEPLOYMENT_TYPE=DOCKER_COMPOSE");
  await expect(code).toContainText("db.e2e.test");
  await expect(page.getByText("Deployment Instructions")).toBeVisible();
  await page.getByRole("button", { name: "Verify Connection" }).click();
  await expect(page.getByText("Backend is DOWN — check your setup")).toBeVisible({ timeout: 15_000 });
  await next(page).click();

  // ── Step 8: license — both actions need an org id the wizard never sets ──
  await expect(step(page, 8, "License")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activate your Deployment" })).toBeVisible();
  await expect(page.getByText("Not yet fetched")).toBeVisible();
  await page.getByRole("button", { name: "Fetch Fingerprint" }).click();
  await expectToast(page, "Organisation not set — cannot fetch fingerprint");
  await expect(page.getByRole("button", { name: "Activate License" })).toBeDisabled();
  await page.getByPlaceholder('{ "licenseId": "...", "modules": [...], ... }').fill('{"licenseId":"e2e"}');
  await page.getByRole("button", { name: "Activate License" }).click();
  await expectToast(page, "Organisation not set — cannot activate license");

  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/organizations/);
  await expect(page.locator("main").getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("zgate_wizard_state"));
});
