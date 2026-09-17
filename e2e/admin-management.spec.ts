import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Admin Management, driven through the real console against the real API.
 *
 * Requires a running stack and a SUPER_ADMIN account (E2E_EMAIL / E2E_PASSWORD). The suite owns
 * one throwaway operator, e2e.operator@example.test: it is created if missing, exercised, and
 * left disabled at the end so repeated runs stay idempotent.
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const THROWAWAY = "e2e.operator@example.test";

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) throw new Error("Set E2E_EMAIL and E2E_PASSWORD to a SUPER_ADMIN operator");
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("controlcenter_token");
    document.cookie = "controlcenter_token=; path=/; max-age=0";
  });
}

async function openAdminManagement(page: Page) {
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
}

const rowFor = (page: Page, email: string): Locator => page.locator("tbody tr").filter({ hasText: email });
const statLabel = (page: Page, text: string): Locator => page.locator(".stat-label", { hasText: text });
/** The topmost modal panel (dialogs use rounded-2xl; the step-up prompt uses rounded-xl). */
const modal = (page: Page): Locator => page.locator("div.rounded-2xl").last();
const drawer = (page: Page): Locator => page.locator("div.max-w-xl.h-full");
const stepUp = (page: Page): Locator => page.locator("div.rounded-xl").filter({ hasText: /Confirm it/ });

async function search(page: Page, text: string) {
  await page.getByPlaceholder("Search name or email…").fill(text);
}

/** The <select> that offers a given option value — stable against column reordering. */
const selectWithOption = (page: Page, value: string): Locator =>
  page.locator("select", { has: page.locator(`option[value="${value}"]`) }).first();

async function confirmStepUp(page: Page, password: string) {
  await expect(stepUp(page)).toBeVisible();
  await stepUp(page).locator('input[type="password"]').fill(password);
  await stepUp(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/^Confirmed/)).toBeVisible();
  await expect(stepUp(page)).toHaveCount(0);
}

async function disableViaRow(page: Page, email: string) {
  await rowFor(page, email).getByTitle("Disable").click();
  await modal(page).getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText(/Operator disabled/)).toBeVisible();
  await expect(rowFor(page, email).getByText("Disabled")).toBeVisible();
}

test.describe.serial("Admin Management", () => {
  let throwawayPassword = "";

  test.beforeEach(async ({ page }) => {
    await signIn(page, EMAIL, PASSWORD);
  });

  test("operators tab: list, security column, search and status filter", async ({ page }) => {
    await openAdminManagement(page);
    await expect(statLabel(page, "Two-factor on")).toBeVisible();
    await expect(statLabel(page, "Locked out")).toBeVisible();
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);

    // The signed-in operator is listed, tagged, with the super-admin badge.
    const me = rowFor(page, EMAIL);
    await expect(me).toHaveCount(1);
    await expect(me.getByText("you", { exact: true })).toBeVisible();
    await expect(me.getByText("Super Admin", { exact: true })).toBeVisible();

    await search(page, EMAIL);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await search(page, "zzz-no-such-operator");
    await expect(page.getByText("No operators match.")).toBeVisible();
    await search(page, "");
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(1);

    await selectWithOption(page, "locked").selectOption("locked");
    if ((await page.getByText("No operators match.").count()) === 0) {
      for (const row of await page.locator("tbody tr").all()) await expect(row.getByText(/Locked/)).toBeVisible();
    }
    await selectWithOption(page, "locked").selectOption("");
  });

  test("operator drawer: security state, actions and the per-operator activity feed", async ({ page }) => {
    await openAdminManagement(page);
    await rowFor(page, EMAIL).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Account id")).toBeVisible();
    await expect(drawer(page).getByText("Sign-in method")).toBeVisible();
    await expect(drawer(page).getByText(/\d+ events?/)).toBeVisible();
    await expect(drawer(page).locator("tbody tr").first()).toBeVisible();
    // Your own drawer offers Edit but never Disable — you cannot disable yourself.
    await expect(drawer(page).getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Disable" })).toHaveCount(0);
    await drawer(page).getByRole("button", { name: "Close" }).click();
    await expect(drawer(page)).toHaveCount(0);
  });

  test("activity monitor: counters, filters, paging and live mode", async ({ page }) => {
    await openAdminManagement(page);
    await page.getByRole("button", { name: "Activity monitor" }).click();
    await expect(statLabel(page, "Failed sign-ins")).toBeVisible();
    await expect(statLabel(page, "Admin actions")).toBeVisible();
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible();
    await expect(page.getByText(/^\d+ events?$/)).toBeVisible();

    // Identity scope: this session's own sign-in is among the newest events.
    await expect(page.locator("tbody tr", { hasText: /Login success/i }).first()).toBeVisible();

    await selectWithOption(page, "FAILURE").selectOption("FAILURE");
    await expect(page.getByText(/^\d+ events?$/)).toBeVisible();
    if ((await page.getByText("No events match these filters.").count()) === 0) {
      await expect(page.locator("tbody tr").first().getByText("FAILURE")).toBeVisible();
    }
    await selectWithOption(page, "FAILURE").selectOption("");

    await page.getByRole("button", { name: /^Live$/ }).click();
    await expect(page.getByRole("button", { name: /Live · 5s/ })).toBeVisible();
    await page.getByRole("button", { name: /Live · 5s/ }).click();
    await expect(page.getByRole("button", { name: /^Live$/ })).toBeVisible();
  });

  test("permissions tab mirrors the server rules", async ({ page }) => {
    await openAdminManagement(page);
    await page.getByRole("button", { name: "Permissions" }).click();
    await expect(page.getByText("Reset another operator's password")).toBeVisible();
    await expect(page.getByText("Clear a sign-in lockout")).toBeVisible();
    await expect(page.getByText(/Your role:/)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(8);
  });

  test("create, edit, disable and enable a throwaway operator", async ({ page }) => {
    await openAdminManagement(page);
    await search(page, THROWAWAY);

    if ((await rowFor(page, THROWAWAY).count()) === 0) {
      await page.getByRole("button", { name: "Add operator" }).click();
      await modal(page).getByLabel("Full name").fill("E2E Operator");
      await modal(page).getByLabel("Email", { exact: true }).fill(THROWAWAY);
      await modal(page).getByTitle("Generate").click();
      throwawayPassword = await modal(page).getByLabel("Initial password").inputValue();
      expect(throwawayPassword.length).toBeGreaterThanOrEqual(16);
      await modal(page).getByLabel("Role").selectOption("VIEWER");
      await modal(page).getByRole("button", { name: "Create operator" }).click();
      await expect(page.getByText(/Operator account created/)).toBeVisible();
    }
    await expect(rowFor(page, THROWAWAY)).toHaveCount(1);

    // Edit: rename, keep the role.
    await rowFor(page, THROWAWAY).getByTitle("Edit").click();
    await modal(page).getByLabel("Full name").fill("E2E Operator Renamed");
    await modal(page).getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Operator account updated/)).toBeVisible();
    await expect(rowFor(page, THROWAWAY)).toContainText("E2E Operator Renamed");

    // Disable through the confirm dialog, then enable again.
    if ((await rowFor(page, THROWAWAY).getByTitle("Disable").count()) > 0) await disableViaRow(page, THROWAWAY);
    await rowFor(page, THROWAWAY).getByTitle("Enable").click();
    await modal(page).getByRole("button", { name: "Enable" }).click();
    await expect(page.getByText(/Operator enabled/)).toBeVisible();
    await expect(rowFor(page, THROWAWAY).getByText("Active")).toBeVisible();
  });

  test("reset password needs step-up; the operator then signs in and changes it themselves", async ({ page }) => {
    await openAdminManagement(page);
    await search(page, THROWAWAY);
    await expect(rowFor(page, THROWAWAY)).toHaveCount(1);

    await rowFor(page, THROWAWAY).getByTitle("Reset password").click();
    await expect(modal(page).getByRole("heading", { name: /Reset password/ })).toBeVisible();
    await modal(page).getByTitle("Generate").click();
    const resetPassword = await modal(page).getByLabel("New password", { exact: true }).inputValue();
    expect(resetPassword.length).toBeGreaterThanOrEqual(16);

    // The first attempt is refused with a step-up prompt; confirm, then repeat the action.
    await modal(page).getByRole("button", { name: "Reset password" }).click();
    await confirmStepUp(page, PASSWORD);
    await modal(page).getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText(/Password reset/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Reset password/ })).toHaveCount(0);

    // The operator signs in with it and rotates it from the console; every session then ends.
    await signOut(page);
    await signIn(page, THROWAWAY, resetPassword);
    await page.goto("/users");
    await page.getByRole("button", { name: "Change my password" }).click();
    await modal(page).getByLabel("Current password").fill(resetPassword);
    await modal(page).getByTitle("Generate").click();
    const selfChosen = await modal(page).getByLabel("New password", { exact: true }).inputValue();
    expect(selfChosen).not.toEqual(resetPassword);
    await modal(page).getByRole("button", { name: "Change password" }).click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });

    await signIn(page, THROWAWAY, selfChosen);
    await expect(page).not.toHaveURL(/\/login/);
    throwawayPassword = selfChosen;
  });

  test("cleanup: the throwaway operator is left disabled", async ({ page }) => {
    await openAdminManagement(page);
    await search(page, THROWAWAY);
    await expect(rowFor(page, THROWAWAY)).toHaveCount(1);
    if ((await rowFor(page, THROWAWAY).getByTitle("Disable").count()) > 0) await disableViaRow(page, THROWAWAY);
    await expect(rowFor(page, THROWAWAY).getByText("Disabled")).toBeVisible();
    expect(throwawayPassword === "" || throwawayPassword.length >= 16).toBeTruthy();
  });
});
