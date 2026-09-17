import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openMain, statLabel, modal, rowWith, expectToast, api, E2E_ORG, type E2EOrg } from "./helpers";

/**
 * Organizations list + detail. The suite owns one throwaway organization (slug e2e-org): it is
 * created through the dialog if missing, edited, disabled/enabled, and its entitlements and
 * service key are exercised on the detail page. Issue License and Push Update are never clicked.
 */
test.beforeAll(() => requireCredentials());

const main = (page: Page) => page.locator("main");
/** The right-hand slide-over opened by clicking a row. */
const panel = (page: Page) => page.locator("div.fixed.right-0.z-50").last();

test.describe.serial("Organizations", () => {
  // At the default 1280px viewport the Edit dialog (z-50, centred) is partly covered by the still-open
  // 480px detail panel (also z-50, later in the DOM), so its Save Changes button cannot be clicked.
  // 1600px is a normal desktop width where the two do not overlap; the overlap itself is reported.
  test.use({ viewport: { width: 1600, height: 900 } });
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test("list renders with stats, table and count", async ({ page }) => {
    await openMain(page, "/organizations", "Organizations");
    await expect(page.getByText("Manage all ZGATE deployed instances")).toBeVisible();
    await expect(main(page).getByText("Total Organizations")).toBeVisible();
    await expect(main(page).getByText("Pending Update")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Licensed Modules" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText(/\d+ organizations/)).toBeVisible();
  });

  test("create the throwaway org through the dialog (only if missing)", async ({ page }) => {
    await openMain(page, "/organizations", "Organizations");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    if ((await rowWith(page, E2E_ORG.slug).count()) === 0) {
      await page.getByRole("button", { name: "Add Organization" }).click();
      const dlg = modal(page);
      await expect(dlg.getByRole("heading", { name: "Add Organization" })).toBeVisible();
      await dlg.getByPlaceholder("Apex Capital", { exact: true }).fill(E2E_ORG.name);
      await expect(dlg.getByPlaceholder("apex-capital", { exact: true })).toHaveValue(E2E_ORG.slug);
      await dlg.getByPlaceholder("ops@example.com").fill(E2E_ORG.contactEmail);
      await dlg.locator("select").nth(0).selectOption({ label: "South Africa" });
      await dlg.locator("select").nth(1).selectOption("PRODUCTION");
      await dlg.locator("select").nth(2).selectOption("STANDARD");
      await dlg.getByRole("button", { name: "Create Organization" }).click();
      await expectToast(page, "Organization created successfully");
      await expect(dlg).toHaveCount(0);
    }
    await expect(rowWith(page, E2E_ORG.slug)).toHaveCount(1);
    await expect(rowWith(page, E2E_ORG.slug)).toContainText(E2E_ORG.name);
  });

  test("detail panel: tabs, then Edit → Save Changes", async ({ page }) => {
    await openMain(page, "/organizations", "Organizations");
    await rowWith(page, E2E_ORG.slug).click();
    const p = panel(page);
    await expect(p.getByRole("heading", { name: E2E_ORG.name })).toBeVisible();
    await expect(p.getByText("Active Users")).toBeVisible();
    for (const tab of ["Licenses", "Deployments", "Health", "Overview"]) {
      await p.getByRole("button", { name: tab, exact: true }).click();
    }
    await expect(p.getByRole("button", { name: "Issue License" })).toBeVisible();
    await expect(p.getByRole("button", { name: "Push Update" })).toBeVisible();

    await p.getByRole("button", { name: "Edit", exact: true }).click();
    const dlg = modal(page);
    await expect(dlg.getByRole("heading", { name: "Edit Organization" })).toBeVisible();
    await expect(dlg.getByPlaceholder("Apex Capital", { exact: true })).toHaveValue(E2E_ORG.name);
    await dlg.getByRole("button", { name: "Save Changes" }).click();
    await expectToast(page, "Organization updated successfully");
    await expect(dlg).toHaveCount(0);
  });

  test("Disable then Enable from the panel footer (throwaway org only)", async ({ page }) => {
    await openMain(page, "/organizations", "Organizations");
    const row = rowWith(page, E2E_ORG.slug);
    await expect(row).toHaveCount(1);
    const p = panel(page);

    // A previous interrupted run may have left it OFFLINE — normalise so the sequence ends HEALTHY.
    await row.click();
    await expect(p.getByRole("heading", { name: E2E_ORG.name })).toBeVisible();
    if ((await p.getByRole("button", { name: "Enable", exact: true }).count()) > 0) {
      await p.getByRole("button", { name: "Enable", exact: true }).click();
      await expectToast(page, "Organization status updated");
      await expect(p).toHaveCount(0);
      await expect(row).toContainText("HEALTHY");
      await row.click();
      await expect(p.getByRole("heading", { name: E2E_ORG.name })).toBeVisible();
    }

    await p.getByRole("button", { name: "Disable", exact: true }).click();
    await expectToast(page, "Organization status updated");
    await expect(p).toHaveCount(0);
    await expect(row).toContainText("OFFLINE");

    await row.click();
    await expect(p.getByRole("heading", { name: E2E_ORG.name })).toBeVisible();
    await p.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(p).toHaveCount(0);
    await expect(row).toContainText("HEALTHY");
  });

  test("detail page: sections, entitlements save and service-key rotation", async ({ page }) => {
    const list = await api(page, "GET", "/organizations");
    const org = (Array.isArray(list.data) ? (list.data as E2EOrg[]) : []).find((o) => o.slug === E2E_ORG.slug);
    expect(org, "the throwaway org must exist by now").toBeTruthy();

    await page.goto(`/organizations/${org!.id}`);
    await expect(main(page).getByRole("heading", { name: E2E_ORG.name, level: 1 })).toBeVisible();
    await expect(page.getByText(new RegExp(`^${E2E_ORG.slug} · `))).toBeVisible();
    for (const l of ["Deployed Version", "Active Licences", "Modules Enabled", "Active Users"]) {
      await expect(statLabel(page, l)).toBeVisible();
    }
    for (const h of ["Commercial Entitlements", "Live Instances", "Connection", "Licensed Modules", "Recent Deployments"]) {
      await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Back to Organizations")).toBeVisible();
    await expect(page.getByText("Manage Licences")).toBeVisible();

    await page.getByPlaceholder("unlimited").fill("3");
    await page.getByRole("button", { name: "Save entitlements" }).click();
    await expectToast(page, "Entitlements updated");

    // Native confirm() guards the rotation; this is the throwaway org, so accept it.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Reveal \/ rotate|Rotate again/ }).click();
    await expectToast(page, /Service key rotated/);
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
    await expect(page.getByText(/Copy it now — it isn.t stored/)).toBeVisible();
  });
});
