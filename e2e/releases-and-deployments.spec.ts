import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openPage, openMain, rowWith, expectToast } from "./helpers";

/**
 * Releases and deployments. The suite owns one throwaway release (0.0.0-e2e on BETA); Approve /
 * Reject are only ever clicked on that row. Push Update is opened and cancelled, never submitted;
 * Rollback is never clicked.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const VERSION = "0.0.0-e2e";
const main = (page: Page) => page.locator("main");
const publishDialog = (page: Page) => page.locator("div.rounded-xl").filter({ hasText: "Publish New Release" }).last();
const pushDialog = (page: Page) => page.locator("div.rounded-xl").filter({ hasText: "Release Version" }).last();

test("releases: list, channel filters and the Channels tab", async ({ page }) => {
  await openPage(page, "/releases", "Software Releases");
  await expect(page.getByText("Publish and manage ZGATE versions across all customer deployments.")).toBeVisible();
  await expect(page.getByText("Current Stable")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Docker Tag" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  for (const ch of ["STABLE", "LTS", "BETA", "HOTFIX"]) {
    await page.getByRole("button", { name: new RegExp(`^${ch}\\b`) }).click();
    const rows = page.locator("tbody tr");
    const empty = page.getByText("No releases in this channel.");
    await expect(rows.first().or(empty).first()).toBeVisible();
  }
  await page.getByRole("button", { name: /^All\b/ }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Channels", exact: true }).click();
  await expect(page.getByText("Current Version").first()).toBeVisible();
  await expect(page.getByText("Releases on Channel").first()).toBeVisible();
  await expect(page.getByText("Production-ready releases. Recommended for all deployments.")).toBeVisible();
  await expect(page.getByText("Feature-complete preview. Not recommended for production.")).toBeVisible();
  await page.getByRole("button", { name: "Releases", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("publish the throwaway release if missing; Reject, Approve and View Notes on it", async ({ page }) => {
  await openPage(page, "/releases", "Software Releases");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  if ((await rowWith(page, VERSION).count()) === 0) {
    await page.getByRole("button", { name: "Publish Release" }).click();
    const dlg = publishDialog(page);
    await expect(dlg).toBeVisible();
    await dlg.getByPlaceholder("e.g. 2.4.1", { exact: true }).fill(VERSION);
    await dlg.locator("select").first().selectOption("BETA");
    await dlg.getByPlaceholder("e.g. zgate/backend:2.4.1").fill("e2e/backend:0.0.0");
    await dlg.getByPlaceholder("Describe what changed in this release...").fill("Throwaway release created by the e2e suite.");
    await dlg.getByRole("button", { name: "Publish Release" }).click();
    await expectToast(page, "Release published");
    await expect(dlg).toHaveCount(0);
  }
  const row = rowWith(page, VERSION);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("e2e/backend:0.0.0");

  await row.getByTitle("Reject").click();
  await expectToast(page, "Release rejected");
  await row.getByTitle("Approve").click();
  await expectToast(page, "Release approved");

  await row.getByTitle("View Notes").click();
  const drawer = page.locator("div.h-full").filter({ hasText: "Release Notes" }).last();
  await expect(drawer.getByText(`v${VERSION}`)).toBeVisible();
  await drawer.locator("button").first().click();
  await expect(drawer).toHaveCount(0);
});

test("deployments: stats, table, Push Update dialog (cancelled) and the Logs drawer", async ({ page }) => {
  await openMain(page, "/deployments", "Deployments");
  await expect(page.getByText("Track and manage software rollouts across all customer organizations.")).toBeVisible();
  for (const l of ["Total Deployments", "In Progress", "Failed", "Successful Today"]) {
    await expect(page.locator(".stat-label", { hasText: new RegExp(`^${l}$`) })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "All Deployments" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Deployed By" })).toBeVisible();

  await page.getByRole("button", { name: "Push Update" }).click();
  const dlg = pushDialog(page);
  await expect(dlg.getByText("Release Version")).toBeVisible();
  await expect(dlg.getByText("Notify organization contacts")).toBeVisible();
  await expect(dlg.getByText("Select all")).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);

  const logs = page.getByTitle("View Logs");
  if ((await logs.count()) > 0) {
    await logs.first().click();
    const drawer = page.locator("div.h-full").filter({ hasText: "Deployment Logs" }).last();
    await expect(drawer.getByText("Deployment Logs")).toBeVisible();
    await drawer.locator("button").first().click();
    await expect(drawer).toHaveCount(0);
  }
});
