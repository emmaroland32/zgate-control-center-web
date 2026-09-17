import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, requireCredentials, toastOfType, signInViaForm } from "./helpers";

/**
 * Sign-in surface: the login page, its failure path, the ?next= hand-off, the SSO callback's
 * refusal when no code comes back, and the middleware redirect for an unauthenticated visit.
 *
 * The wrong-password test counts one failed attempt against the operator (threshold 5); the
 * successful sign-in in the following test resets that counter server-side.
 */
test.beforeAll(() => requireCredentials());

test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "ZGATE Control Center", exact: true })).toBeVisible();
    await expect(page.getByText("Internal Management")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to Control Center" })).toBeVisible();
    await expect(page.getByText("ZGATE Control Center · Internal Use Only")).toBeVisible();
  });

  test("wrong password shows an error toast and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(`${PASSWORD}-wrong`);
    await page.locator('button[type="submit"]').click();
    await expect(toastOfType(page, "error")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in to Control Center" })).toBeEnabled();
  });

  test("?next= is honoured after login", async ({ page }) => {
    await signInViaForm(page, "/login?next=/releases");
    await page.waitForURL(/\/releases/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Software Releases" })).toBeVisible();
  });

  test("/sso/callback without a code is refused", async ({ page }) => {
    await page.goto("/sso/callback");
    await expect(page.getByRole("heading", { name: "Sign-in refused" })).toBeVisible();
    await expect(page.getByText("The identity provider did not return a sign-in code.")).toBeVisible();
    await expect(page.getByText("Back to sign in")).toBeVisible();
  });

  test("a protected route without a session redirects to /login?next=", async ({ page }) => {
    await page.goto("/deployments");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)deployments/);
    await expect(page.getByRole("button", { name: "Sign in to Control Center" })).toBeVisible();
  });
});
