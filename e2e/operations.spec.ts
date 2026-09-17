import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openMain, statLabel, rowWith, expectToast, uniqueName, ensureE2EOrg, clickWithStepUp } from "./helpers";

/**
 * Operations routes: provisioning, infrastructure, database, configuration, settings.
 * Nothing here plans, applies, destroys, migrates, restores, stops or removes anything. The suite
 * creates and deletes exactly one cloud credential and one config snapshot, both its own.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const main = (page: Page) => page.locator("main");
const exactStat = (page: Page, text: string) => page.locator(".stat-label", { hasText: new RegExp(`^${text}$`) });
/** Provisioning's own Modal: rounded-xl with an h3 title. */
const provModal = (page: Page, title: string) =>
  page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: title }) }).last();

test("provisioning: readiness banner, disabled Provision, add then delete an assume-role credential", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  await openMain(page, "/provisioning", "Cloud Provisioning");
  await expect(page.getByText("Provisioning is not available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Provision", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Provisioned deployments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cloud credentials" })).toBeVisible();
  await expect(page.getByText(/Nothing provisioned yet/)).toBeVisible();

  const name = uniqueName("e2e-cred");
  await page.getByRole("button", { name: "Add credential" }).click();
  const dlg = provModal(page, "Add cloud credential");
  await expect(dlg).toBeVisible();
  await dlg.locator("select").nth(0).selectOption(org.id);
  await dlg.locator("select").nth(1).selectOption({ label: "AWS — assume role" });
  await dlg.getByPlaceholder("Apex Capital — production account").fill(name);
  await dlg.getByPlaceholder("arn:aws:iam::210987654321:role/ZgateControlCenterProvisioner").fill("arn:aws:iam::123456789012:role/e2e");
  // POST /provisioning/credentials is step-up gated.
  await clickWithStepUp(page, dlg.getByRole("button", { name: "Save credential" }));

  const saved = provModal(page, "Credential saved — give the customer this");
  await expect(saved).toBeVisible();
  await expect(saved.getByText("External ID", { exact: true })).toBeVisible();
  await expect(saved.getByText("Role ARN", { exact: true })).toBeVisible();
  await saved.getByRole("button", { name: "Done" }).click();
  await expect(saved).toHaveCount(0);

  const cred = page.locator("div.rounded-lg").filter({ hasText: name }).last();
  await expect(cred).toBeVisible();
  await expect(cred.getByText("assume role")).toBeVisible();
  await cred.locator("button").last().click();
  await expect(cred).toHaveCount(0);
});

test("infrastructure: containers, resources for E2E Org, volumes and compose", async ({ page }) => {
  await ensureE2EOrg(page);
  await openMain(page, "/infrastructure", "Infrastructure");
  for (const l of ["Total Containers", "Running", "Stopped / Exited", "Total Memory", "Avg CPU %"]) {
    await expect(statLabel(page, l)).toBeVisible();
  }
  await expect(page.locator("select", { has: page.locator('option:has-text("All Deployments")') })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Compose" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Container", exact: true }).or(page.getByText(/No containers/i)).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resources", exact: true }).click();
  await page.getByRole("button", { name: "E2E", exact: true }).click();
  await expect(page.getByText("Live node resources")).toBeVisible();
  await expect(
    page.getByText("No nodes have reported resource metrics for this organization yet.")
      .or(page.getByRole("columnheader", { name: "Node", exact: true })).first(),
  ).toBeVisible();
  await expect(page.getByText("Disk Usage")).toBeVisible();
  await expect(page.getByText("Network I/O")).toBeVisible();

  await page.getByRole("button", { name: "Volumes", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Mountpoint" }).or(page.getByText(/No volumes/i)).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await expect(page.getByText("Showing compose for:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("database: stats, Health + Test Connection, Migrations V1…V34, Backups, Schemas", async ({ page }) => {
  await openMain(page, "/database", "Database");
  await expect(page.getByText("Health, migrations, and backups across deployments")).toBeVisible();
  for (const l of ["DB Status", "Size", "Connections", "Pending Migrations", "Last Migration"]) {
    await expect(exactStat(page, l)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Health Metrics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schema Validation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connection", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test Connection" }).click();
  await expect(page.getByText(/Connected — \d+ms latency/)).toBeVisible();

  await page.getByRole("button", { name: "Migrations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Flyway Migration History" })).toBeVisible();
  await expect(page.getByText(/^\d+ total$/)).toBeVisible();
  await expect(page.locator("tbody tr").nth(33)).toBeVisible();
  const versions = await page.locator("tbody tr td:first-child").allTextContents();
  expect(versions.map((v) => v.trim())).toEqual(expect.arrayContaining(["1", "2", "33", "34"]));
  await expect(page.getByRole("button", { name: "View SQL" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await expect(page.getByText("Backups are not configured")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backup History" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retention Policy" })).toBeVisible();

  await page.getByRole("button", { name: "Schemas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ZGATE Schemas" })).toBeVisible();
});

test("config: values + search, templates, take then delete a snapshot", async ({ page }) => {
  await ensureE2EOrg(page);
  await openMain(page, "/config", "Configuration");
  await expect(page.getByRole("button", { name: "Config Values" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Key", exact: true })).toBeVisible();
  await expect(page.getByText("controlcenter.app.support_email")).toBeVisible();
  const before = await page.locator("tbody tr").count();
  expect(before).toBeGreaterThan(1);

  const search = page.getByPlaceholder("Search keys or descriptions...");
  await search.fill("billing");
  await expect(page.getByText("controlcenter.billing.tax_rate")).toBeVisible();
  await expect(page.getByText("controlcenter.app.support_email")).toHaveCount(0);
  expect(await page.locator("tbody tr").count()).toBeLessThan(before);
  await search.fill("zzz-no-such-key");
  await expect(page.getByText("No config entries found.")).toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fleet operations", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  await expect(page.getByText("STARTER", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply Template" })).toHaveCount(2);

  await page.getByRole("button", { name: "Snapshots", exact: true }).click();
  await main(page).locator("select").first().selectOption({ label: "E2E Org" });
  await page.getByRole("button", { name: "Take Snapshot" }).last().click();
  await expectToast(page, "Snapshot created");
  const row = rowWith(page, "E2E Org").filter({ hasText: "Manual snapshot" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();

  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.locator("div.rounded-xl").filter({ hasText: "Delete Snapshot" }).last();
  await expect(confirm.getByText(/Permanently delete snapshot/)).toBeVisible();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expectToast(page, "Snapshot deleted");
  await expect(confirm).toHaveCount(0);
});

test("settings: five tabs, the read-only security policy, Save Changes without edits", async ({ page }) => {
  await openMain(page, "/settings", "Settings");
  await expect(page.getByRole("heading", { name: "General Settings" })).toBeVisible();
  await expect(page.getByText(/These values are stored in Control Center configuration/)).toBeVisible();

  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(page.getByText("Password policy")).toBeVisible();
  await expect(page.getByText("Sign-in lockout")).toBeVisible();
  await expect(page.getByText("Two-factor authentication")).toBeVisible();
  await expect(page.getByText(/Minimum length: \d+/)).toBeVisible();

  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notification Settings" })).toBeVisible();
  await expect(page.getByText("License expiry warnings")).toBeVisible();

  await page.getByRole("button", { name: "Licensing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Licensing Settings" })).toBeVisible();
  await expect(page.getByText("Not available (not exposed by the backend)")).toBeVisible();

  await page.getByRole("button", { name: "Docker Registry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Docker Registry Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test Connection" })).toBeVisible();

  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Save Changes" }).first().click();
  await expect(page.getByRole("button", { name: "Saved!" }).first()).toBeVisible();
});
