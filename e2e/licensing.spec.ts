import { test, expect } from "@playwright/test";
import { requireCredentials, signIn, openPage, statLabel, expectToast, selectWithOption, ensureE2EOrg } from "./helpers";

/**
 * License Management. Issues a real signed CRM bundle for the throwaway org (E2E Org, created via
 * the API when the organizations suite has not run) and deactivates only that licence. Seeded data
 * carries no CRM licence, and the bundle is issued with a distinctive Max Users value, so the row
 * is unambiguous.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const MAX_USERS = "4242";

test("license management renders and Verify Integrity reports", async ({ page }) => {
  await openPage(page, "/licenses", "License Management");
  await expect(page.getByText("Issue, manage, and revoke module licenses for customer deployments")).toBeVisible();
  for (const l of ["Total Active", "Expiring Soon", "Expired", "Modules Licensed"]) await expect(statLabel(page, l)).toBeVisible();
  await expect(page.getByRole("button", { name: "All Licenses" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "License Hash" })).toBeVisible();
  await expect(page.getByText("License Integrity Check")).toBeVisible();
  await expect(page.getByText("Not yet checked this session")).toBeVisible();
  await page.getByRole("button", { name: "Verify Integrity" }).click();
  await expectToast(page, /licence\(s\) verified — signatures intact|licence\(s\) FAILED integrity verification/);
});

test("issue a CRM bundle for the throwaway org, then deactivate that licence", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  await openPage(page, "/licenses", "License Management");
  await page.getByRole("button", { name: "Issue License", exact: true }).click();
  await expect(page.getByText("Organisation & Customer")).toBeVisible();

  await selectWithOption(page, org.id).selectOption(org.id);
  await expect(page.getByPlaceholder("Auto-filled from organisation")).toHaveValue(org.name);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.locator("label").filter({ hasText: /^CRM/ }).locator('input[type="checkbox"]').check();
  await expect(page.getByText("1 / 11 selected")).toBeVisible();
  await page.locator('input[type="number"]').first().fill(MAX_USERS);

  await page.getByRole("button", { name: "Generate License Bundle" }).click();
  await expect(page.getByText("Generated License File")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download .lic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy to Clipboard" })).toBeVisible();

  // Fresh load of All Licenses: the only ACTIVE CRM row carrying our Max Users marker is ours.
  await openPage(page, "/licenses", "License Management");
  const ours = page.locator("tbody tr")
    .filter({ hasText: "CRM" })
    .filter({ hasText: MAX_USERS })
    .filter({ has: page.getByRole("button", { name: "Deactivate" }) });
  await expect(ours.first()).toBeVisible();
  await ours.first().getByRole("button", { name: "Deactivate" }).click();
  await expectToast(page, "License deactivated");
  await expect(ours).toHaveCount(0);
});

test("Fetch Fingerprint on the Issue tab", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  await openPage(page, "/licenses", "License Management");
  await page.getByRole("button", { name: "Issue License", exact: true }).click();
  await selectWithOption(page, org.id).selectOption(org.id);
  const card = page.locator("div.card").filter({ hasText: "Machine Fingerprint Binding" }).last();
  await card.locator("button").first().click();
  await card.getByRole("button", { name: "Fetch Fingerprint" }).click();
  await expectToast(page, "Machine fingerprint fetched");
  await expect(card.getByPlaceholder("Fingerprint will appear here after fetching…")).not.toHaveValue("");
});
