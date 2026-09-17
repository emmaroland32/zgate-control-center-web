import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openPage, openMain, statLabel, modal, rowWith, expectToast, toastOfType, ensureE2EOrg, E2E_ORG } from "./helpers";

/**
 * Commercial routes: API marketplace + quotas, billing, cloud backups, partners. The suite owns
 * the E2E Service (E2E_SERVICE), its subscription for E2E Org, E2E Org's backup plan and the
 * E2E Partner. Invoices are never generated, sent, paid or cancelled.
 */
test.beforeAll(() => requireCredentials());

const SERVICE = { name: "E2E Service", code: "E2E_SERVICE" };
const main = (page: Page) => page.locator("main");
/** The Add Service side panel (not a rounded-2xl modal). */
const sidePanel = (page: Page) => page.locator("div.h-full").filter({ hasText: "Add Shared Service" }).last();

async function openMarketplace(page: Page) {
  await page.goto("/shared-services");
  await expect(page.getByRole("heading", { name: "API Marketplace" })).toBeVisible();
  await expect(page.getByText("Loading API Marketplace...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Services \(\d+\)/ })).toBeVisible();
}

/** Our subscription row: matched by org name OR id and service name OR code, so it survives either rendering. */
const subscriptionRow = (page: Page, orgId?: string) =>
  page.locator("tbody tr")
    .filter({ hasText: orgId ? new RegExp(`${E2E_ORG.name}|${orgId}`) : E2E_ORG.name })
    .filter({ hasText: new RegExp(`${SERVICE.name}|${SERVICE.code}`) });

test.describe.serial("Commercial", () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test("marketplace renders after its loader, with stats and three tabs", async ({ page }) => {
    const loader = page.getByText("Loading API Marketplace...");
    await page.goto("/shared-services");
    // The blocking loader is brief on a warm stack; it is observed opportunistically, not required.
    await loader.waitFor({ state: "visible", timeout: 1500 }).catch(() => undefined);
    await expect(page.getByRole("heading", { name: "API Marketplace" })).toBeVisible();
    await expect(loader).toHaveCount(0);
    await expect(page.getByText("Manage centralized shared services available to ZGATE enterprise deployments")).toBeVisible();
    for (const l of ["Total Services", "Active Services", "Active Subscriptions", "API Calls This Month"]) {
      await expect(main(page).getByText(l, { exact: true })).toBeVisible();
    }
    await expect(page.getByPlaceholder("Search services...")).toBeVisible();
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await expect(page.getByText("Top Services by Call Volume This Month")).toBeVisible();
    await page.getByRole("button", { name: /^Subscriptions \(\d+\)/ }).click();
    await expect(page.getByText(/Organization Subscriptions \(\d+\)/)).toBeVisible();
    await page.getByRole("button", { name: /^Services \(\d+\)/ }).click();
    await expect(page.getByPlaceholder("Search services...")).toBeVisible();
  });

  test("add the E2E service (only if absent)", async ({ page }) => {
    await openMarketplace(page);
    if ((await page.getByText(SERVICE.code, { exact: true }).count()) === 0) {
      await page.getByRole("button", { name: "Add Service" }).click();
      const panel = sidePanel(page);
      await expect(panel.getByRole("heading", { name: "Add Shared Service" })).toBeVisible();
      await panel.getByPlaceholder("e.g. NIN Lookup").fill(SERVICE.name);
      await panel.getByPlaceholder("e.g. NIN_LOOKUP").fill("e2e_service");
      await panel.locator("select").nth(0).selectOption("IDENTITY_VERIFICATION");
      await panel.getByPlaceholder("Brief description of what this service does...").fill("Throwaway service created by the e2e suite.");
      await panel.getByPlaceholder("e.g. NIMC / Smile Identity").fill("e2e");
      await panel.getByPlaceholder("0.015").fill("0.01");
      await panel.getByText("GLOBAL", { exact: true }).click();
      // The submit button sits outside the <form>, so it is clicked rather than submitted.
      await panel.getByRole("button", { name: "Add Service" }).click();
      await expectToast(page, "Service created");
      await expect(panel).toHaveCount(0);
    }
    await expect(page.getByText(SERVICE.code, { exact: true })).toBeVisible();
  });

  test("enable the E2E service for E2E Org (limit 100)", async ({ page }) => {
    const org = await ensureE2EOrg(page);
    await openMarketplace(page);
    await page.getByRole("button", { name: /^Subscriptions \(\d+\)/ }).click();
    await expect(page.getByText(/Organization Subscriptions \(\d+\)/)).toBeVisible();
    const row = subscriptionRow(page, org.id);
    if ((await row.count()) === 0) {
      await page.getByRole("button", { name: "Enable for Org" }).click();
      const dlg = modal(page);
      await expect(dlg.getByRole("heading", { name: "Enable Service for Organization" })).toBeVisible();
      await dlg.locator("select").nth(0).selectOption(org.id);
      await dlg.locator("select").nth(1).selectOption({ label: `${SERVICE.name} (${SERVICE.code})` });
      await dlg.getByPlaceholder("10000").fill("100");
      await dlg.getByRole("button", { name: "Enable Service" }).click();
      await expectToast(page, "Service enabled for organization");
      await expect(dlg).toHaveCount(0);
    } else if ((await row.getByTitle("Enable").count()) > 0) {
      // Left disabled by a previous run: re-enable our own subscription.
      await row.getByTitle("Enable").click();
    }
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Enabled", { exact: true })).toBeVisible();
  });

  test("service quotas lists the E2E Org / E2E Service subscription", async ({ page }) => {
    await openMain(page, "/shared-services/quotas", "Service Quotas");
    await expect(page.getByText("Enabled subscriptions")).toBeVisible();
    await expect(page.getByText("Over limit", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Filter by organization or service…")).toBeVisible();
    const row = rowWith(page, E2E_ORG.name).filter({ hasText: SERVICE.name });
    await expect(row).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Service Catalog" }).first()).toBeVisible();
  });

  test("disable the E2E subscription (own subscription only)", async ({ page }) => {
    const org = await ensureE2EOrg(page);
    await openMarketplace(page);
    await page.getByRole("button", { name: /^Subscriptions \(\d+\)/ }).click();
    const row = subscriptionRow(page, org.id);
    await expect(row).toHaveCount(1);
    await row.getByTitle("Disable").click();
    await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
    await expect(row.getByTitle("Enable")).toBeVisible();
  });

  test("billing: tabs and the Generate Invoice modal (cancelled, never generated)", async ({ page }) => {
    await openPage(page, "/billing", "Billing & Invoicing");
    await expect(page.getByText("Manage invoices, billing accounts and revenue")).toBeVisible();
    for (const l of ["Total Outstanding", "Paid This Month", "Overdue Invoices", "Draft Invoices"]) {
      await expect(main(page).getByText(l, { exact: true })).toBeVisible();
    }
    await expect(page.getByPlaceholder("Search org or invoice #…")).toBeVisible();
    await expect(
      page.getByText("No invoices match the current filters.").or(page.getByRole("columnheader", { name: "Invoice #" })).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Revenue", exact: true }).click();
    await expect(page.getByText("Total Revenue (All Time)")).toBeVisible();
    await expect(page.getByText("Revenue by Service")).toBeVisible();
    await expect(page.getByText("Top Paying Organizations")).toBeVisible();
    await page.getByRole("button", { name: "Accounts", exact: true }).click();
    await page.getByRole("button", { name: "Invoices", exact: true }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).click();
    const dlg = modal(page);
    await expect(dlg.getByRole("heading", { name: "Generate Invoice" })).toBeVisible();
    await expect(dlg.getByText("Period Start")).toBeVisible();
    await expect(dlg.getByText("Period End")).toBeVisible();
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("cloud backups: stats, provision/update E2E Org's plan, Enabled off then on", async ({ page }) => {
    const org = await ensureE2EOrg(page);
    await openMain(page, "/backups", "Cloud Backups");
    for (const l of ["Subscriptions", "Backups", "Completed", "Failed", "Stored"]) {
      await expect(main(page).getByText(l, { exact: true }).first()).toBeVisible();
    }
    await main(page).locator("select").first().selectOption(org.id);
    await expect(page.getByRole("heading", { name: /^Backup subscription/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();

    const planSaved = () => page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes(`/admin/backups/org/${org.id}/plan`));
    await page.getByLabel("Storage quota (GB)").fill("10");
    await page.getByLabel("Retention (days)").fill("30");
    const [first] = await Promise.all([planSaved(), page.getByRole("button", { name: /Provision plan|Update plan/ }).click()]);
    expect(first.status()).toBeLessThan(300);
    await expectToast(page, "Backup plan updated");
    await expect(page.getByRole("button", { name: "Update plan" })).toBeVisible();

    const enabled = page.getByLabel("Enabled");
    await enabled.uncheck();
    const [second] = await Promise.all([planSaved(), page.getByRole("button", { name: "Update plan" }).click()]);
    expect(second.status()).toBeLessThan(300);
    await enabled.check();
    const [third] = await Promise.all([planSaved(), page.getByRole("button", { name: "Update plan" }).click()]);
    expect(third.status()).toBeLessThan(300);
    await expect(toastOfType(page, "success").first()).toBeVisible();

    // Reload proves the final state was persisted: enabled, quota 10, retention 30.
    await openMain(page, "/backups", "Cloud Backups");
    await main(page).locator("select").first().selectOption(org.id);
    await expect(page.getByRole("button", { name: "Update plan" })).toBeVisible();
    await expect(page.getByLabel("Enabled")).toBeChecked();
    await expect(page.getByLabel("Storage quota (GB)")).toHaveValue("10");
    await expect(page.getByLabel("Retention (days)")).toHaveValue("30");
  });

  test("partners: renders; add E2E Partner if missing; Edit → Save; View panel tabs", async ({ page }) => {
    await openMain(page, "/partners", "Partners");
    await expect(page.getByText("Resellers and system integrators deploying ZGATE for end customers")).toBeVisible();
    for (const l of ["Total Partners", "Active Deployments", "Avg. Revenue Share"]) await expect(statLabel(page, l)).toBeVisible();
    await expect(page.getByRole("button", { name: "Grid", exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ partners?$/)).toBeVisible();

    if ((await page.getByText("E2E Partner", { exact: true }).count()) === 0) {
      await page.getByRole("button", { name: "Add Partner" }).first().click();
      const dlg = modal(page);
      await expect(dlg.getByRole("heading", { name: "Add Partner" })).toBeVisible();
      await dlg.getByPlaceholder("Acme Systems Ltd").fill("E2E Partner");
      await dlg.locator("select").first().selectOption("GOLD");
      await dlg.getByPlaceholder("10", { exact: true }).fill("10");
      await dlg.getByPlaceholder("Jane Smith").fill("E2E Contact");
      await dlg.getByPlaceholder("jane@acme.com").fill("e2e.partner@example.test");
      await dlg.getByPlaceholder("+1 555 000 1234").fill("+27 10 000 0000");
      await dlg.getByPlaceholder("South Africa", { exact: true }).fill("South Africa");
      await dlg.getByPlaceholder("Africa", { exact: true }).fill("Africa");
      await dlg.getByRole("button", { name: "Create Partner" }).click();
      await expectToast(page, "Partner created");
      await expect(dlg).toHaveCount(0);
    }
    // Scope to the grid cards (the detail panel's tiles are also .card and also say "E2E Partner").
    const card = page.locator("div.card")
      .filter({ hasText: "E2E Partner" })
      .filter({ has: page.getByRole("button", { name: "View", exact: true }) })
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByText("GOLD")).toBeVisible();

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = modal(page);
    await expect(edit.getByRole("heading", { name: "Edit Partner" })).toBeVisible();
    await expect(edit.locator("input").first()).toHaveValue("E2E Partner");
    await edit.getByRole("button", { name: "Save Changes" }).click();
    await expectToast(page, "Partner updated");
    await expect(edit).toHaveCount(0);

    // Edit already selected the partner, so the panel may be open; only click View when it is not.
    const panel = page.locator("div.fixed.right-0.z-50").last();
    if (!(await panel.isVisible())) await card.getByRole("button", { name: "View", exact: true }).click();
    await expect(panel.getByText("Partner Detail", { exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "E2E Partner" })).toBeVisible();
    for (const tab of ["Deployments", "Licenses", "Contacts", "Overview"]) {
      await panel.getByRole("button", { name: tab, exact: true }).click();
    }
    await expect(panel.getByText("Country / Region")).toBeVisible();
  });
});
