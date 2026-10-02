import { test, expect, type Page } from "@playwright/test";
import {
  requireCredentials, signIn, signInViaForm, signOut, openMain, modal, expectToast, toastOfType,
  BASE_URL, OPERATOR, generatePassword, prepareOperator,
} from "./helpers";

/**
 * Session revocation and role-gated UI, on the throwaway VIEWER operator. Every test puts the
 * operator into the state it needs through the API (step-up + reset-password), so the tests are
 * independent; the last one that touches the account leaves it disabled, as round one expects.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const rowFor = (page: Page, email: string) => page.locator("tbody tr").filter({ hasText: email });
const drawer = (page: Page) => page.locator("div.max-w-xl.h-full");

test("revoking the operator's sessions signs them out on their next request", async ({ page, browser }) => {
  const password = generatePassword();
  await prepareOperator(page, { enabled: true, password });

  // Context A: the operator, signed in and reading /organizations.
  const ctxA = await browser.newContext({ baseURL: BASE_URL });
  const pageA = await ctxA.newPage();
  try {
    await signInViaForm(pageA, "/login", OPERATOR.email, password);
    await openMain(pageA, "/organizations", "Organizations");
    await expect(pageA.locator("tbody tr").first()).toBeVisible();

    // Context B: the admin revokes every session of the operator from the drawer.
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible();
    await page.getByPlaceholder("Search name or email…").fill(OPERATOR.email);
    await rowFor(page, OPERATOR.email).click();
    await expect(drawer(page)).toBeVisible();
    await drawer(page).getByRole("button", { name: "Revoke sessions" }).click();
    const dlg = modal(page);
    await expect(dlg.getByRole("heading", { name: "Revoke sessions" })).toBeVisible();
    await expect(dlg.getByText(/Every active session of/)).toBeVisible();
    await dlg.getByRole("button", { name: "Revoke", exact: true }).click();
    await expectToast(page, "Sessions revoked");
    await expect(dlg).toHaveCount(0);

    // Back in A: the token's version no longer matches, the next API call is a 401, and the
    // client clears its session and lands on /login.
    await pageA.goto("/releases");
    await pageA.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(pageA.getByRole("button", { name: "Sign in to Control Center" })).toBeVisible();
    // The client cleared the session through /api/cc-session/logout; the httpOnly cookie is gone, so
    // there is nothing left in the context for the BFF to attach.
    expect((await ctxA.cookies()).find((c) => c.name === "controlcenter_token")?.value || "").toBe("");
  } finally {
    await ctxA.close();
  }
});

test("VIEWER role: admin links are hidden, /users is refused with a banner, /organizations still reads", async ({ page }) => {
  const password = generatePassword();
  await prepareOperator(page, { enabled: true, password });
  await signOut(page);
  await signInViaForm(page, "/login", OPERATOR.email, password);

  const aside = page.locator("aside");
  await expect(aside.getByText(OPERATOR.email)).toBeVisible();
  await expect(aside.getByRole("link", { name: "Organizations", exact: true })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Releases", exact: true })).toBeVisible();
  for (const label of ["Admin Management", "Integrations", "Settings", "Configuration", "Database", "Infrastructure"]) {
    await expect(aside.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }
  // Every Administration entry is admin-only, so the whole section caption goes with them.
  await expect(aside.getByText("Administration", { exact: true })).toHaveCount(0);

  // Direct navigation is not blocked client-side: the page renders, the server refuses the list.
  const [users] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "GET" && /\/api\/v1\/users$/.test(r.url())),
    page.goto("/users"),
  ]);
  expect(users.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible();
  await expect(page.getByText("You don't have permission to perform this action")).toBeVisible();
  await expect(page.getByText("No operators match.")).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: "@" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add operator" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Secure my sign-in" })).toBeVisible();

  await openMain(page, "/organizations", "Organizations");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByText(/\d+ organizations/)).toBeVisible();
});

test("a disabled operator cannot sign in", async ({ page }) => {
  const password = generatePassword();
  await prepareOperator(page, { enabled: false, password });
  await signOut(page);

  const attempt = async () => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(OPERATOR.email);
    await page.locator('input[type="password"]').fill(password);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST", { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    return response;
  };
  let response = await attempt();
  if (response.status() === 429) {
    // POST /auth/login is limited to 10/min per IP; wait the window out once, like signInViaForm.
    const retryAfter = Number(response.headers()["retry-after"] ?? "60");
    await page.waitForTimeout((Math.min(Math.max(retryAfter, 1), 60) + 1) * 1000);
    response = await attempt();
  }
  expect(response.status()).toBe(401);
  // Deliberately the same answer as a wrong password — the account state is not disclosed.
  await expect(toastOfType(page, "error")).toBeVisible();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in to Control Center" })).toBeEnabled();
});

test("the login page offers no SSO button while single sign-on is disabled", async ({ page }) => {
  await signOut(page);
  const [status] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/oidc/status")),
    page.goto("/login"),
  ]);
  expect((await status.json()).data?.enabled).toBe(false);
  await expect(page.getByRole("button", { name: "Sign in to Control Center" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with SSO" })).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});
