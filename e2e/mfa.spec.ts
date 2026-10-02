import { test, expect, type Page } from "@playwright/test";
import {
  requireCredentials, signIn, signInViaForm, signOut, modal, stepUpPrompt, confirmStepUp, expectToast, toastOfType, api,
  OPERATOR, prepareOperator,
} from "./helpers";
import { totp, totpAt } from "./totp";

/**
 * Two-factor authentication end to end, on the throwaway operator (e2e.operator@example.test):
 * the admin enables it and resets its password (step-up), the operator enrols with a TOTP code
 * computed here from the displayed secret, signs in with password + code, the admin removes the
 * authenticator break-glass (step-up), the operator signs in with the password alone again, and
 * the fixture is left disabled as admin-management.spec expects.
 *
 * TOTP seeds are encrypted at rest and the server FAILS CLOSED: with no
 * `controlcenter.provisioning.encryptionKey` configured, enrolment is refused (503,
 * MFA_ENCRYPTION_NOT_CONFIGURED) rather than a seed being stored in clear. The enrolment test
 * asserts whichever the stack does (GET /users/security-policy → mfaSecretsEncrypted); the two
 * code-dependent tests are skipped on a stack that cannot enrol.
 *
 * Sign-ins are kept to a minimum: POST /auth/login is rate-limited to 10/min per IP.
 */
test.beforeAll(() => requireCredentials());

const rowFor = (page: Page, email: string) => page.locator("tbody tr").filter({ hasText: email });
const drawer = (page: Page) => page.locator("div.max-w-xl.h-full");
const NOT_ENROLLABLE =
  "TOTP enrolment is refused on this stack (controlcenter.provisioning.encryptionKey is not set), so there is no authenticator to sign in with.";

async function openOperator(page: Page) {
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible();
  await page.getByPlaceholder("Search name or email…").fill(OPERATOR.email);
  await expect(rowFor(page, OPERATOR.email)).toHaveCount(1);
}

/** Submit the login form as it stands and hand back the /auth/login response. */
async function submitLogin(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST", { timeout: 20_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  return response;
}

test("TOTP helper reproduces the RFC 6238 SHA-1 test vector", () => {
  // Secret "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), T = 59 s → step 1 → 94287082.
  expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1, 8)).toBe("94287082");
  expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
  expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
});

test.describe.serial("Two-factor authentication", () => {
  let operatorPassword = "";
  /** The code spent on activation: the server refuses a code it has already accepted. */
  let spentCode = "";
  let secret = "";
  let mfaAvailable = false; // from the server's security policy, read by the enrolment test

  test.beforeEach(async ({ page }) => { await signIn(page); });

  test("admin: enable the operator and reset its password through the console (step-up)", async ({ page }) => {
    await prepareOperator(page, { enabled: true });
    await openOperator(page);
    await expect(rowFor(page, OPERATOR.email).getByText("Active", { exact: true })).toBeVisible();

    await rowFor(page, OPERATOR.email).getByTitle("Reset password").click();
    await expect(modal(page).getByRole("heading", { name: /Reset password/ })).toBeVisible();
    await modal(page).getByTitle("Generate").click();
    operatorPassword = await modal(page).getByLabel("New password", { exact: true }).inputValue();
    expect(operatorPassword.length).toBeGreaterThanOrEqual(16);

    // The first attempt is refused with a step-up prompt; confirm, then repeat the action.
    await modal(page).getByRole("button", { name: "Reset password" }).click();
    const asked = await stepUpPrompt(page).waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    if (asked) {
      await confirmStepUp(page);
      await modal(page).getByRole("button", { name: "Reset password" }).click();
    }
    await expectToast(page, /Password reset/);
    await expect(page.getByRole("heading", { name: /Reset password/ })).toHaveCount(0);
  });

  test("operator: Secure my sign-in → Start enrolment → computed code → Activate (or the fail-closed refusal)", async ({ page }) => {
    await signOut(page);
    await signInViaForm(page, "/login", OPERATOR.email, operatorPassword);
    const policy = (await api(page, "GET", "/users/security-policy")).data as { mfaSecretsEncrypted?: boolean };
    mfaAvailable = policy?.mfaSecretsEncrypted === true;

    await page.goto("/users");
    await page.getByRole("button", { name: "Secure my sign-in" }).click();
    const dlg = modal(page);
    await expect(dlg.getByRole("heading", { name: "Secure my sign-in (two-factor)" })).toBeVisible();
    await expect(dlg.getByText(/A new secret is issued now; it only takes effect once you confirm a code/)).toBeVisible();
    const [enroll] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/users/me/mfa/enroll")),
      dlg.getByRole("button", { name: "Start enrolment" }).click(),
    ]);

    if (!mfaAvailable) {
      // Fail-closed by design: without a secret-encryption key the server refuses to stage a TOTP
      // seed rather than write it in clear, and the console shows the server's reason verbatim.
      expect(enroll.status()).toBe(503);
      expect((await enroll.json()).code).toBe("MFA_ENCRYPTION_NOT_CONFIGURED");
      await expect(
        toastOfType(page, "error").filter({ hasText: "Two-factor authentication needs secret encryption configured" }),
      ).toBeVisible();
      await expect(dlg.getByRole("button", { name: "Start enrolment" })).toBeVisible(); // still on step one
      await expect(dlg.getByText("otpauth URI")).toHaveCount(0);
      await dlg.getByRole("button", { name: "Cancel" }).click();
      await expect(dlg).toHaveCount(0);
      test.info().annotations.push({ type: "skipped-step", description: NOT_ENROLLABLE });
      return;
    }

    expect(enroll.ok()).toBeTruthy();
    // The staged secret is shown once; the otpauth URI sits behind a collapsed <details>.
    const secretBox = dlg.locator("div.font-mono.break-all").first();
    await expect(secretBox).toBeVisible();
    secret = ((await secretBox.textContent()) ?? "").trim();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await expect(dlg.getByText("otpauth URI")).toBeVisible();

    spentCode = totp(secret);
    await dlg.getByLabel("Code from the app").fill(spentCode);
    await dlg.getByRole("button", { name: "Activate" }).click();
    // Activation revokes every session opened before two-factor, this one included: the console
    // signs the operator out deliberately and the next test proves the code is now demanded.
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("operator: password alone is answered with the authenticator-code field; password + code signs in", async ({ page }) => {
    test.skip(!mfaAvailable, NOT_ENROLLABLE);
    await signOut(page);
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(OPERATOR.email);
    await page.locator('input[type="password"]').fill(operatorPassword);

    const first = await submitLogin(page);
    expect((await first.json()).code).toBe("MFA_REQUIRED");
    await expect(page.getByText("Enter the code from your authenticator app")).toBeVisible();
    await expect(page.getByText("Authenticator code")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // A code the server has accepted once is refused again (replay guard), and activation may
    // have happened seconds ago in this same 30-second window: wait for the next one if so.
    while (totp(secret) === spentCode) await page.waitForTimeout(1000);
    spentCode = totp(secret);
    await page.getByPlaceholder("123456").fill(spentCode);
    const second = await submitLogin(page);
    expect(second.ok()).toBeTruthy();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await expect(page.getByText("Welcome to ZGATE Control Center")).toBeVisible();
    await expect(page.locator("aside").getByText(OPERATOR.email)).toBeVisible();
  });

  test("admin: break-glass Reset MFA on the operator (confirm dialog, step-up, repeat)", async ({ page }) => {
    test.skip(!mfaAvailable, NOT_ENROLLABLE);
    await openOperator(page);
    await expect(rowFor(page, OPERATOR.email).getByText("MFA", { exact: true })).toBeVisible();
    await rowFor(page, OPERATOR.email).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Enabled", { exact: true })).toBeVisible();

    await drawer(page).getByRole("button", { name: "Reset MFA" }).click();
    const dlg = modal(page);
    await expect(dlg.getByRole("heading", { name: "Reset two-factor (break-glass)" })).toBeVisible();
    await expect(dlg.getByText(/Removes the authenticator from/)).toBeVisible();

    await dlg.getByRole("button", { name: "Reset MFA" }).click();
    await confirmStepUp(page);
    await dlg.getByRole("button", { name: "Reset MFA" }).click();
    await expectToast(page, "Two-factor authentication disabled; sessions revoked");
    await expect(dlg).toHaveCount(0);
    await expect(rowFor(page, OPERATOR.email).getByText("No MFA")).toBeVisible();
    await expect(drawer(page).getByText("Off", { exact: true })).toBeVisible();
  });

  test("operator: password-only sign-in works; then the fixture is disabled again", async ({ page }) => {
    await signOut(page);
    await signInViaForm(page, "/login", OPERATOR.email, operatorPassword);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("aside").getByText(OPERATOR.email)).toBeVisible();

    await signOut(page);
    await signIn(page);
    await openOperator(page);
    await expect(rowFor(page, OPERATOR.email).getByText("No MFA")).toBeVisible();
    await rowFor(page, OPERATOR.email).getByTitle("Disable").click();
    await modal(page).getByRole("button", { name: "Disable" }).click();
    await expectToast(page, /Operator disabled/);
    await expect(rowFor(page, OPERATOR.email).getByText("Disabled")).toBeVisible();
  });
});
