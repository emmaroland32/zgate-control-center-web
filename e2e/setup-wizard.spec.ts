import { test, expect } from "@playwright/test";
import { requireCredentials, signIn } from "./helpers";

/**
 * The manual-install wizard. It persists every keystroke to localStorage["zgate_wizard_state"], so
 * the key is cleared before the walk-through. The wizard never POSTs an organization; Discard
 * clears the saved state and lands on /organizations.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

test("wizard: step 1 → step 2 validation → step 3, then Cancel → Discard", async ({ page }) => {
  await page.goto("/setup");
  await page.evaluate(() => localStorage.removeItem("zgate_wizard_state"));
  await page.reload();

  await expect(page.getByRole("heading", { name: "New Deployment Wizard" })).toBeVisible();
  await expect(page.getByText("Step 1 of 8 — Type")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How will ZGATE be deployed?" })).toBeVisible();
  await expect(page.getByText(/manual install kit/)).toBeVisible();

  // Step 1 has no required choice: Next proceeds.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 2 of 8 — Organization")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organization Details" })).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Organization name is required.")).toBeVisible();

  await page.getByPlaceholder("Apex Capital Management").fill("E2E Wizard Org");
  await expect(page.getByPlaceholder("apex-capital", { exact: true })).toHaveValue("e2e-wizard-org");
  await page.getByPlaceholder("ops@example.com").fill("e2e@example.test");
  await page.locator("main select").first().selectOption("South Africa");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 3 of 8 — Infrastructure")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Infrastructure Configuration" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discard this setup?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep editing" })).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.waitForURL(/\/organizations/);
  await expect(page.locator("main").getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("zgate_wizard_state"))).toBeNull();
});
