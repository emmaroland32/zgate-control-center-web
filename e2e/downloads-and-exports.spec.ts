import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { requireCredentials, signIn, openPage, openMain, expectToast, selectWithOption, ensureE2EOrg } from "./helpers";

/**
 * Every file the console hands to the browser: client-side CSV (audit), server CSV exports
 * (reports, logs, billing), the generated .env, and a signed .lic bundle. Each download is
 * captured with page.waitForEvent("download") and its first line read back from disk.
 *
 * The licence bundle is issued for the throwaway org with a distinctive Max Users value and is
 * deactivated at the end of that test.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const MAX_USERS = "4343";
const today = () => new Date().toISOString().slice(0, 10);

async function capture(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), trigger.click()]);
  const path = await download.path();
  expect(path, "the download must be saved to disk").toBeTruthy();
  const text = readFileSync(path!, "utf8");
  return { name: download.suggestedFilename(), text, firstLine: text.split(/\r?\n/)[0] ?? "" };
}

test("audit: Export CSV is built client-side with a Timestamp,Actor header", async ({ page }) => {
  await openMain(page, "/audit", "Audit Trail");
  await expect(page.getByText(/\d+ events/).first()).toBeVisible();
  const file = await capture(page, page.getByRole("button", { name: "Export CSV" }));
  expect(file.name).toBe(`zgate-audit-${today()}.csv`);
  expect(file.firstLine.replace(/"/g, "")).toBe("Timestamp,Actor,Email,Action,Entity Type,Entity ID,Organization,IP Address,Status,Details");
});

test("reports: Export CSV downloads the summary report (Metric,Value)", async ({ page }) => {
  await openMain(page, "/reports", "Reports");
  const response = page.waitForResponse((r) => r.url().includes("/reports/export/csv"));
  const file = await capture(page, page.getByRole("button", { name: "Export CSV" }));
  expect((await response).status()).toBe(200);
  expect(file.name).toBe("zgate-report-30d.csv");
  expect(file.firstLine).toBe("Metric,Value");
  expect(file.text.split(/\r?\n/).length).toBeGreaterThan(1);
});

test("logs: Download Logs saves the telemetry export", async ({ page }) => {
  await openMain(page, "/logs", "Log Viewer");
  await expect(page.getByRole("button", { name: "Live Off" })).toBeVisible(); // no poller running
  const response = page.waitForResponse((r) => r.url().includes("/telemetry/export/csv"));
  const file = await capture(page, page.getByRole("button", { name: "Download Logs" }));
  expect((await response).status()).toBe(200);
  expect(file.name).toBe(`zgate-logs-${today()}.txt`);
  expect(file.firstLine).toBe("Timestamp,Organization,Level,Category,Message,Acknowledged");
});

test("billing: Export CSV downloads invoices.csv", async ({ page }) => {
  await openPage(page, "/billing", "Billing & Invoicing");
  await expect(page.getByText(/^\d+ invoices?$/)).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes("/billing/invoices/export/csv"));
  const file = await capture(page, page.getByRole("button", { name: "Export CSV" }));
  expect((await response).status()).toBe(200);
  expect(file.name).toBe("invoices.csv");
  expect(file.firstLine).toBe("Invoice Number,Organization,Status,Total (USD),Tax (USD),Period Start,Period End,Due Date,Created");
});

test("config: Download .env writes one KEY=value line per entry, secrets masked", async ({ page }) => {
  await openMain(page, "/config", "Configuration");
  await expect(page.getByText("controlcenter.app.support_email")).toBeVisible();
  await page.getByRole("button", { name: "Env File", exact: true }).click();
  await expect(page.getByText(/\d+ entries/)).toBeVisible();
  const file = await capture(page, page.getByRole("button", { name: "Download .env" }));
  // The page asks for ".env"; Chromium refuses a dot-file name for a download and saves "env.txt".
  expect([".env", "env.txt"]).toContain(file.name);
  expect(file.firstLine).toMatch(/^[A-Za-z0-9_.-]+=/);
  const lines = file.text.split("\n").filter((l) => l.length > 0);
  expect(lines.every((l) => /^[A-Za-z0-9_.-]+=/.test(l))).toBeTruthy();
  expect(file.text).toContain("controlcenter.app.support_email=");
  // Secrets are never written in clear: the masked form is 16 asterisks.
  for (const l of lines.filter((l) => /password|secret/i.test(l.split("=")[0]))) expect(l).toMatch(/=(\*{16})?$/);
});

test("licenses: generate a Treasury bundle for E2E Org, Download .lic, then deactivate it", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  await openPage(page, "/licenses", "License Management");
  await page.getByRole("button", { name: "Issue License", exact: true }).click();
  await expect(page.getByText("Organisation & Customer")).toBeVisible();

  await selectWithOption(page, org.id).selectOption(org.id);
  await expect(page.getByPlaceholder("Auto-filled from organisation")).toHaveValue(org.name);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.locator("label").filter({ hasText: /^Treasury/ }).locator('input[type="checkbox"]').check();
  await expect(page.getByText("1 / 11 selected")).toBeVisible();
  await page.locator('input[type="number"]').first().fill(MAX_USERS);

  await page.getByRole("button", { name: "Generate License Bundle" }).click();
  await expect(page.getByText("Generated License File")).toBeVisible();

  const file = await capture(page, page.getByRole("button", { name: "Download .lic" }));
  expect(file.name).toBe("e2e_org.lic");
  expect(file.text.trim().startsWith("{")).toBeTruthy();
  // A signed zgate-license-v2 bundle: the licence body is base64 inside `payload`, signed separately.
  const bundle = JSON.parse(file.text) as { format: string; payload: string; signature: string };
  expect(bundle.format).toBe("zgate-license-v2");
  expect(bundle.signature.length).toBeGreaterThan(0);
  const body = JSON.parse(Buffer.from(bundle.payload, "base64").toString("utf8")) as {
    customer: string; maxUsers: number; modules: { moduleId: string; maxUsers: number }[];
  };
  expect(body.customer).toBe(org.name);
  expect(body.maxUsers).toBe(Number(MAX_USERS));
  expect(body.modules.map((m) => m.moduleId)).toEqual(["TREASURY"]);
  expect(file.text).toBe(((await page.locator("pre").first().textContent()) ?? ""));

  // Fresh load: the only ACTIVE Treasury row with our Max Users marker is ours — deactivate it.
  await openPage(page, "/licenses", "License Management");
  const ours = page.locator("tbody tr")
    .filter({ hasText: "TREASURY" })
    .filter({ hasText: MAX_USERS })
    .filter({ has: page.getByRole("button", { name: "Deactivate" }) });
  await expect(ours.first()).toBeVisible();
  await ours.first().getByRole("button", { name: "Deactivate" }).click();
  await expectToast(page, "License deactivated");
  await expect(ours).toHaveCount(0);
});
