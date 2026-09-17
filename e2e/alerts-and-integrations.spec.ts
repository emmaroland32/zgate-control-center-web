import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openMain, statLabel, modal, rowWith, expectToast, uniqueName } from "./helpers";

/**
 * Alerts and Integrations. Every mutation is on an object this run created (uniqueName) and is
 * undone before the test ends: one alert rule, one webhook, one API key. Test-event sends and
 * integration credentials are never touched.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const main = (page: Page) => page.locator("main");

test("alerts: stats and the three tabs", async ({ page }) => {
  await openMain(page, "/alerts", "Alerts");
  await expect(page.getByText("Configure alert rules and manage active incidents")).toBeVisible();
  for (const l of ["Active Alerts", "Critical / High", "Acknowledged", "Resolved Today"]) {
    await expect(statLabel(page, l)).toBeVisible();
  }
  await expect(
    page.getByText("All clear — no active alerts").or(page.getByRole("button", { name: "Acknowledge" })).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Alert Rules/ }).click();
  await expect(page.getByRole("columnheader", { name: "Condition" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Any deployment offline" })).toBeVisible();

  await page.getByRole("button", { name: /^History/ }).click();
  await expect(
    page.getByRole("columnheader", { name: "Root Cause" }).or(page.getByText("No historical alerts match the current filters.")).first(),
  ).toBeVisible();
});

test("alert rule: create, toggle Enabled off/on, delete (own rule only)", async ({ page }) => {
  await openMain(page, "/alerts", "Alerts");
  const name = uniqueName("e2e-rule");
  await page.getByRole("button", { name: "New Rule" }).click();
  const dlg = modal(page);
  await expect(dlg.getByRole("heading", { name: "New Alert Rule" })).toBeVisible();
  await dlg.getByPlaceholder("e.g. High Response Time").fill(name);
  await dlg.locator("select").nth(0).selectOption("HIGH");
  await dlg.locator('input[type="number"]').first().fill("5");
  await expect(dlg.getByText("Rule enabled")).toBeVisible();
  await dlg.getByRole("button", { name: "Create Rule" }).click();
  await expectToast(page, "Alert rule created");
  await expect(dlg).toHaveCount(0);

  await openMain(page, "/alerts", "Alerts");
  await page.getByRole("button", { name: /^Alert Rules/ }).click();
  const row = rowWith(page, name);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/High/i);

  const toggle = row.locator("td").first().locator("button");
  await expect(toggle).toHaveClass(/bg-controlcenter-600/);
  await toggle.click();
  await expect(toggle).toHaveClass(/bg-slate-200/);
  await toggle.click();
  await expect(toggle).toHaveClass(/bg-controlcenter-600/);

  await row.getByTitle("Delete").click();
  await expect(row).toHaveCount(0);
  await expectToast(page, "Alert rule deleted");
});

test("integrations: cards with Enabled/Disabled badges, Webhooks and API Keys tabs", async ({ page }) => {
  await openMain(page, "/integrations", "Integrations");
  await expect(page.getByRole("button", { name: "Configure" }).first()).toBeVisible();
  const badges = page.locator("span.badge").filter({ hasText: /^(Enabled|Disabled)$/ });
  await expect(badges.first()).toBeVisible();
  expect(await badges.count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByText("Send email notifications via SMTP")).toBeVisible();
  await expect(page.getByText("Post alerts to Slack channels")).toBeVisible();

  await page.getByRole("button", { name: "Webhooks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registered Webhooks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Deliveries" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Webhook" })).toBeVisible();

  await page.getByRole("button", { name: "API Keys", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate API Key" })).toBeVisible();
});

test("webhook: create, toggle Enabled, delete (own webhook only)", async ({ page }) => {
  await openMain(page, "/integrations", "Integrations");
  await page.getByRole("button", { name: "Webhooks", exact: true }).click();
  const name = uniqueName("e2e-hook");
  await page.getByRole("button", { name: "Add Webhook" }).click();
  const dlg = modal(page);
  await expect(dlg.getByRole("heading", { name: "Add Webhook" })).toBeVisible();
  await dlg.getByPlaceholder("e.g. Deployment Notifier").fill(name);
  await dlg.getByPlaceholder("https://…").fill("https://example.com/e2e-hook");
  await dlg.locator('input[type="checkbox"]').first().check();
  await dlg.getByRole("button", { name: "Create Webhook" }).click();
  await expectToast(page, "Webhook created");
  await expect(dlg).toHaveCount(0);

  const row = rowWith(page, name);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("example.com/e2e-hook"); // the scheme is not rendered
  const toggle = row.locator("button").first();
  const before = await toggle.evaluate((el) => (el as HTMLElement).style.backgroundColor);
  await toggle.click();
  await expectToast(page, "Webhook toggled");
  await expect.poll(() => toggle.evaluate((el) => (el as HTMLElement).style.backgroundColor)).not.toBe(before);
  await toggle.click();
  await expect.poll(() => toggle.evaluate((el) => (el as HTMLElement).style.backgroundColor)).toBe(before);

  await row.getByTitle("Delete webhook").click();
  await expectToast(page, "Webhook deleted");
  await expect(row).toHaveCount(0);
});

test("API key: generate, Done, revoke (own key only)", async ({ page }) => {
  await openMain(page, "/integrations", "Integrations");
  await page.getByRole("button", { name: "API Keys", exact: true }).click();
  const name = uniqueName("e2e-key");
  await page.getByRole("button", { name: "Generate API Key" }).click();
  const dlg = modal(page);
  await expect(dlg.getByRole("heading", { name: "Generate API Key" })).toBeVisible();
  await dlg.getByPlaceholder("e.g. CI/CD Pipeline").fill(name);
  await dlg.locator('input[type="checkbox"]').first().check();
  await dlg.getByRole("button", { name: "Generate Key" }).click();
  await expect(dlg.getByRole("heading", { name: "API Key Created" })).toBeVisible();
  await expect(dlg.getByText("Copy this key now. It will not be shown again once you close this dialog.")).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Copy Key" })).toBeVisible();
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(dlg).toHaveCount(0);

  const row = rowWith(page, name);
  await expect(row).toHaveCount(1);
  await row.getByTitle("Revoke key").click();
  await expectToast(page, "API key revoked");
  await expect(row.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(row.getByTitle("Revoke key")).toHaveCount(0);
});
