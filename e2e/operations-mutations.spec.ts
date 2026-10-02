import { test, expect, type Page } from "@playwright/test";
import {
  requireCredentials, signIn, openPage, openMain, modal, rowWith, expectToast, toastOfType, uniqueName, api,
  ensureE2EOrg, fieldByLabel, E2E_ORG,
} from "./helpers";

/**
 * The remaining SAFE mutations on the local stack, each undone before its test ends:
 * config value edit / template staging / snapshot restore (a no-op overwrite of its own values),
 * settings support email, the Slack integration toggle + channel, schema validation, a backup
 * request the server refuses (503, not configured), the container logs modal (read-only), a Push
 * Update to E2E Org ONLY with contact notification OFF (no stack → a PENDING record, no rollout),
 * and a CORE licence issued from the org panel then deactivated. Never Start/Stop/Restart/Delete,
 * never Rollback, never any org but E2E Org.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const main = (page: Page) => page.locator("main");
const RELEASE = "0.0.0-e2e";
const SUPPORT_KEY = "controlcenter.app.support_email";
const FLEET_TEMPLATE_KEYS = [
  "controlcenter.fleet.health.offlineAfterMinutes",
  "controlcenter.fleet.backupStaleHours",
  "controlcenter.fleet.subscriptionLapseWarnDays",
];

const batchSaved = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/config/batch"));

/** Config's confirm dialogs are rounded-xl panels headed by an h3. */
const confirmPanel = (page: Page, title: string) =>
  page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: title }) }).last();

async function openConfig(page: Page) {
  await openMain(page, "/config", "Configuration");
  await expect(page.getByText(SUPPORT_KEY)).toBeVisible();
}

test("config: edit controlcenter.app.support_email → Save Changes → reload shows it → set it back", async ({ page }) => {
  await openConfig(page);
  const input = () => rowWith(page, SUPPORT_KEY).locator("input");
  await expect(rowWith(page, SUPPORT_KEY)).toHaveCount(1);
  const original = await input().inputValue();
  const changed = `${uniqueName("e2e-support")}@example.test`;

  await input().fill(changed);
  await expect(page.getByText("1 unsaved change")).toBeVisible();
  await expect(rowWith(page, SUPPORT_KEY)).toHaveClass(/bg-amber-50/);
  const [first] = await Promise.all([batchSaved(page), page.getByRole("button", { name: /^Save Changes/ }).click()]);
  expect(first.status()).toBeLessThan(300);
  // Only the dirty key is sent, as a [{key, value}] batch.
  expect(first.request().postDataJSON()).toEqual([{ key: SUPPORT_KEY, value: changed }]);
  await expect(page.getByText("Configuration saved successfully")).toBeVisible();
  await expect(page.getByText(/unsaved change/)).toHaveCount(0);

  await openConfig(page);
  await expect(input()).toHaveValue(changed);

  await input().fill(original);
  const [second] = await Promise.all([batchSaved(page), page.getByRole("button", { name: /^Save Changes/ }).click()]);
  expect(second.status()).toBeLessThan(300);
  await expect(page.getByText("Configuration saved successfully")).toBeVisible();
  await openConfig(page);
  await expect(input()).toHaveValue(original);
});

test("config: Load Template → Apply Template (Fleet operations) stages dirty rows → Discard all", async ({ page }) => {
  const existing = ((await api(page, "GET", "/config")).data as { key: string }[]).map((c) => c.key);
  const staged = FLEET_TEMPLATE_KEYS.filter((k) => existing.includes(k));

  await openConfig(page);
  await page.getByRole("button", { name: "Load Template" }).click();
  const card = page.locator("div.card").filter({ has: page.getByRole("heading", { name: "Fleet operations", exact: true }) });
  await expect(card.getByText("STARTER", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Apply Template" }).click();

  const confirm = confirmPanel(page, "Apply Template");
  await expect(confirm.getByText('"Fleet operations" template')).toBeVisible();
  await expect(confirm.getByText("3 config values")).toBeVisible();
  await confirm.getByRole("button", { name: "Apply Template" }).click();
  await expect(page.getByText(/Template "Fleet operations" applied — 3 values updated/)).toBeVisible();
  await expect(confirm).toHaveCount(0);

  // Staged locally only: nothing was written, the Save button now carries the count.
  await expect(page.getByText("3 unsaved changes")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save Changes/ })).toBeEnabled();
  await page.getByRole("button", { name: "Config Values" }).click();
  await expect(page.locator("tbody tr.bg-amber-50")).toHaveCount(staged.length);
  for (const key of staged) await expect(rowWith(page, key).locator("input")).toHaveValue(/^\d+$/);

  await page.getByRole("button", { name: "Discard all" }).click();
  await expect(page.getByText("Changes discarded")).toBeVisible();
  await expect(page.getByText(/unsaved change/)).toHaveCount(0);
  await expect(page.locator("tbody tr.bg-amber-50")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save Changes/ })).toBeDisabled();
});

test("config: take a snapshot for E2E Org, Restore it (its own values — a no-op overwrite), delete it", async ({ page }) => {
  await ensureE2EOrg(page);
  await openConfig(page);
  await main(page).locator("select").first().selectOption({ label: E2E_ORG.name });
  await page.getByRole("button", { name: "Snapshots", exact: true }).click();

  const [created] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/config/snapshots")),
    page.getByRole("button", { name: "Take Snapshot" }).last().click(),
  ]);
  expect(created.status()).toBeLessThan(300);
  const snapshotId: string = (await created.json()).data.id;
  await expectToast(page, "Snapshot created");
  const row = rowWith(page, snapshotId.slice(0, 12));
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(E2E_ORG.name);
  await expect(row).toContainText("Manual snapshot");

  await row.getByRole("button", { name: "Restore" }).click();
  const confirm = confirmPanel(page, "Restore Snapshot");
  await expect(confirm.getByText(snapshotId, { exact: true })).toBeVisible();
  await expect(confirm.getByText(/overwrite your current configuration with the snapshot taken on/)).toBeVisible();
  const [restored] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/config/snapshots/${snapshotId}/restore`)),
    confirm.getByRole("button", { name: "Restore Snapshot" }).click(),
  ]);
  expect(restored.status()).toBeLessThan(300);
  await expectToast(page, "Snapshot restored");
  await expect(confirm).toHaveCount(0);

  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const del = page.locator("div.rounded-xl").filter({ hasText: "Delete Snapshot" }).last();
  await expect(del.getByText(/Permanently delete snapshot/)).toBeVisible();
  await del.getByRole("button", { name: "Delete", exact: true }).click();
  await expectToast(page, "Snapshot deleted");
  await expect(del).toHaveCount(0);
  await expect(row).toHaveCount(0);
});

test("settings: change Support Email → Save → Saved! → reload keeps it → set it back", async ({ page }) => {
  const open = async () => {
    await openMain(page, "/settings", "Settings");
    await expect(page.getByRole("heading", { name: "General Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" }).first()).toBeVisible(); // config map loaded
  };
  await open();
  const original = await fieldByLabel(page, "Support Email").inputValue();
  const changed = `${uniqueName("e2e-settings")}@example.test`;

  await fieldByLabel(page, "Support Email").fill(changed);
  const [first] = await Promise.all([batchSaved(page), page.getByRole("button", { name: "Save Changes" }).first().click()]);
  expect(first.status()).toBeLessThan(300);
  const batch = first.request().postDataJSON() as { key: string; value: string }[];
  expect(batch.find((e) => e.key === "supportEmail")?.value).toBe(changed);
  await expect(page.getByRole("button", { name: "Saved!" }).first()).toBeVisible();

  await open();
  await expect(fieldByLabel(page, "Support Email")).toHaveValue(changed);
  await fieldByLabel(page, "Support Email").fill(original);
  const [second] = await Promise.all([batchSaved(page), page.getByRole("button", { name: "Save Changes" }).first().click()]);
  expect(second.status()).toBeLessThan(300);
  await expect(page.getByRole("button", { name: "Saved!" }).first()).toBeVisible();
  await open();
  await expect(fieldByLabel(page, "Support Email")).toHaveValue(original);
});

test("integrations: toggle Slack twice (net zero) and round-trip its Channel through Configure", async ({ page }) => {
  const card = () => page.locator("div.card").filter({ hasText: "Post alerts to Slack channels" });
  const badge = () => card().locator("span.badge");
  const toggled = () => page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/toggle"));
  const configSaved = () => page.waitForResponse((r) => r.request().method() === "PUT" && r.url().endsWith("/config"));

  await openMain(page, "/integrations", "Integrations");
  await expect(card()).toHaveCount(1);
  const before = ((await badge().textContent()) ?? "").trim();
  expect(["Enabled", "Disabled"]).toContain(before);
  const flipped = before === "Enabled" ? "Disabled" : "Enabled";

  const [t1] = await Promise.all([toggled(), card().getByTitle(before === "Enabled" ? "Disable" : "Enable").click()]);
  expect(t1.status()).toBeLessThan(300);
  await expectToast(page, "Integration toggled");
  await expect(badge()).toHaveText(flipped);
  const [t2] = await Promise.all([toggled(), card().getByTitle(flipped === "Enabled" ? "Disable" : "Enable").click()]);
  expect(t2.status()).toBeLessThan(300);
  await expect(badge()).toHaveText(before);
  await openMain(page, "/integrations", "Integrations");
  await expect(badge()).toHaveText(before);

  await card().getByRole("button", { name: "Configure" }).click();
  await expect(modal(page).getByRole("heading", { name: "Configure Slack" })).toBeVisible();
  const originalChannel = await fieldByLabel(modal(page), "Channel").inputValue();
  await fieldByLabel(modal(page), "Channel").fill("#e2e");
  const [c1] = await Promise.all([configSaved(), modal(page).getByRole("button", { name: "Save Configuration" }).click()]);
  expect(c1.status()).toBeLessThan(300);
  await expectToast(page, "Integration configuration updated");
  await expect(modal(page)).toHaveCount(0);

  await openMain(page, "/integrations", "Integrations");
  await card().getByRole("button", { name: "Configure" }).click();
  await expect(fieldByLabel(modal(page), "Channel")).toHaveValue("#e2e");
  await fieldByLabel(modal(page), "Channel").fill(originalChannel);
  const [c2] = await Promise.all([configSaved(), modal(page).getByRole("button", { name: "Save Configuration" }).click()]);
  expect(c2.status()).toBeLessThan(300);
  await expect(modal(page)).toHaveCount(0);
  await openMain(page, "/integrations", "Integrations");
  await card().getByRole("button", { name: "Configure" }).click();
  await expect(fieldByLabel(modal(page), "Channel")).toHaveValue(originalChannel);
  await modal(page).getByRole("button", { name: "Cancel" }).click();
});

test("database: Validate Schema renders a result; Create Backup is refused with 503 (not configured)", async ({ page }) => {
  await openMain(page, "/database", "Database");
  await expect(page.getByRole("heading", { name: "Schema Validation" })).toBeVisible();
  await expect(page.getByText('Click "Validate Schema" to run checks across all schemas.')).toBeVisible();
  const [validated] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/database/schema/validate")),
    page.getByRole("button", { name: "Validate Schema" }).click(),
  ]);
  expect(validated.status()).toBeLessThan(300);
  await expect(page.getByText(/Last validated/)).toBeVisible();
  await expect(page.getByText('Click "Validate Schema" to run checks across all schemas.')).toHaveCount(0);

  await page.getByRole("button", { name: "Create Backup" }).first().click();
  await expect(page.getByRole("heading", { name: "Create Backup" })).toBeVisible();
  await expect(page.getByText("Backups are not configured")).toBeVisible();
  await fieldByLabel(page, "Note (optional)").fill("e2e-refused-backup");
  const [refused] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/database/backups")),
    page.getByRole("button", { name: "Create Backup" }).last().click(),
  ]);
  expect(refused.status()).toBe(503);
  expect((await refused.json()).code).toBe("BACKUP_NOT_CONFIGURED");
  await expect(toastOfType(page, "error").filter({ hasText: /backup\.directory is not set|not configured/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Backup" })).toHaveCount(0);
});

test("infrastructure: View Logs opens and closes the logs modal when a container is listed", async ({ page }) => {
  await openMain(page, "/infrastructure", "Infrastructure");
  await expect(page.getByRole("columnheader", { name: "Container", exact: true }).or(page.getByText(/No containers/i)).first()).toBeVisible();
  const logs = page.getByTitle("View Logs");
  if ((await logs.count()) === 0) {
    test.info().annotations.push({
      type: "skipped-step",
      description: "The local stack reports no containers (no Docker socket), so View Logs could not be exercised.",
    });
    await expect(page.getByTitle("Stop")).toHaveCount(0);
    return;
  }
  await logs.first().click();
  await expect(page.getByRole("heading", { name: /^Logs — / })).toBeVisible();
  await expect(page.getByText("Loading logs...").or(page.locator("pre")).first()).toBeVisible();
  await page.getByRole("button", { name: "✕" }).click();
  await expect(page.getByRole("heading", { name: /^Logs — / })).toHaveCount(0);
});

/** The throwaway release, published through the API when releases-and-deployments.spec has not run; approved via the console if needed. */
async function ensureApprovedRelease(page: Page): Promise<{ id: string; version: string }> {
  const find = async () => {
    const list = await api(page, "GET", "/releases");
    const releases = (Array.isArray(list.data) ? list.data : []) as { id: string; version: string; approvalStatus?: string }[];
    return releases.find((r) => r.version === RELEASE);
  };
  let release = await find();
  if (!release) {
    const created = await api(page, "POST", "/releases", {
      version: RELEASE, channel: "BETA", dockerTag: "e2e/backend:0.0.0", releaseNotes: "Throwaway release created by the e2e suite.",
    });
    if (created.status >= 300) throw new Error(`Could not publish ${RELEASE}: HTTP ${created.status} ${created.message ?? ""}`);
    release = await find();
  }
  if (!release) throw new Error(`${RELEASE} is not listed`);
  if (release.approvalStatus && release.approvalStatus !== "APPROVED") {
    await openPage(page, "/releases", "Software Releases");
    await rowWith(page, RELEASE).getByTitle("Approve").click();
    await expectToast(page, "Release approved");
  }
  return release;
}

test("deployments: Push Update of 0.0.0-e2e to E2E Org only, contact notification OFF → PENDING record", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  const release = await ensureApprovedRelease(page);
  await openMain(page, "/deployments", "Deployments");
  await page.getByRole("button", { name: "Push Update" }).click();
  const dlg = page.locator("div.rounded-xl").filter({ hasText: "Release Version" }).last();
  await expect(dlg.getByText("Notify organization contacts")).toBeVisible();

  await dlg.locator("label").filter({ hasText: E2E_ORG.name }).locator('input[type="checkbox"]').check();
  await expect(dlg.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await expect(dlg.getByText("1 organization selected")).toBeVisible();
  await dlg.locator("select").selectOption(release.id);
  await expect(dlg.locator("select")).toHaveValue(release.id);

  const notify = dlg.locator("div.justify-between").filter({ hasText: "Notify organization contacts" }).locator("button");
  await expect(notify).toHaveClass(/bg-controlcenter-600/); // default ON
  await notify.click();
  await expect(notify).toHaveClass(/bg-slate-200/);         // OFF — no customer email

  const [pushed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/deployments/push-update")),
    dlg.getByRole("button", { name: "Push Update" }).click(),
  ]);
  expect(pushed.status()).toBeLessThan(300);
  const sent = pushed.request().postDataJSON();
  expect(sent.organizationIds).toEqual([org.id]);
  expect(sent.releaseId).toBe(release.id);
  expect(sent.notifyContacts).toBe(false);
  await expectToast(page, /Update queued for 1 organization/);
  await expect(dlg).toHaveCount(0);

  // No Control-Center-provisioned stack → a PENDING record, no rollout, nothing to roll back.
  const row = rowWith(page, E2E_ORG.name).filter({ hasText: "Pending" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(RELEASE);
  await expect(row.getByRole("button", { name: "Rollback" })).toHaveCount(0);
});

test("organizations: Issue License on E2E Org → a CORE licence on /licenses → Deactivate it", async ({ page }) => {
  const org = await ensureE2EOrg(page);
  await openMain(page, "/organizations", "Organizations");
  await rowWith(page, E2E_ORG.slug).click();
  const panel = page.locator("div.fixed.right-0.z-50").last();
  await expect(panel.getByRole("heading", { name: E2E_ORG.name })).toBeVisible();

  const [issue] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/licenses/issue")),
    panel.getByRole("button", { name: "Issue License" }).click(),
  ]);
  await expectToast(page, "Issuing CORE license...");
  expect(issue.status()).toBeLessThan(300);
  expect(issue.request().postDataJSON()).toEqual({ organizationId: org.id, moduleName: "CORE" });
  const issued = (await issue.json()).data as { id: string; moduleName: string; organizationId: string; licenseFileHash?: string | null };
  expect(issued.moduleName).toBe("CORE");
  expect(issued.organizationId).toBe(org.id);
  await expectToast(page, "License issued");

  // The licences table has no organisation column: locate our row by its hash prefix when the
  // bundle was pre-signed, else by its position in the same list the page renders. A route guard
  // makes sure nothing but the licence issued above can ever be deactivated by this test.
  const all = (await api(page, "GET", "/licenses")).data as { id: string; licenseFileHash?: string | null }[];
  const index = all.findIndex((l) => l.id === issued.id);
  expect(index).toBeGreaterThanOrEqual(0);
  await page.route(/\/licenses\/[^/]+\/deactivate$/, (route) =>
    route.request().url().includes(issued.id) ? route.continue() : route.abort("blockedbyclient"));

  await openPage(page, "/licenses", "License Management");
  await expect(page.getByText("Loading licenses…")).toHaveCount(0);
  const hash = all[index].licenseFileHash;
  const row = hash ? rowWith(page, hash.slice(0, 20)) : page.locator("tbody tr").nth(index);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("CORE");
  const [deactivated] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/licenses/${issued.id}/deactivate`)),
    row.getByRole("button", { name: "Deactivate" }).click(),
  ]);
  expect(deactivated.status()).toBeLessThan(300);
  await expectToast(page, "License deactivated");
  const after = (await api(page, "GET", `/licenses/org/${org.id}`)).data as { id: string; status: string }[];
  expect(after.find((l) => l.id === issued.id)?.status).not.toBe("ACTIVE");
});
