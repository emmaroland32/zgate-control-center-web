import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Shared helpers for the Control Center browser suites. Every suite runs against a REAL stack:
 * E2E_BASE_URL (default http://localhost:3002), E2E_EMAIL / E2E_PASSWORD for a SUPER_ADMIN.
 */
export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";

export function requireCredentials() {
  if (!EMAIL || !PASSWORD) throw new Error("Set E2E_EMAIL and E2E_PASSWORD to a SUPER_ADMIN operator");
}

/**
 * Sign the operator in and land on a protected page.
 *
 * POST /auth/login is rate-limited to 10 requests per minute per IP, and a suite of ~50 tests each
 * signing in through the form would be throttled after the first minute. So the FIRST call in a
 * worker signs in through the real login form and remembers the issued token; later calls verify
 * that token against the API and inject it into the fresh browser context exactly the way the
 * login page does (localStorage + cookie), falling back to the form whenever the token is missing,
 * rejected, or for a different operator. Set E2E_LOGIN_EVERY_TEST=1 to force the form every time.
 * A 429 from the form is waited out (Retry-After) and retried once.
 */
let cachedSession: { email: string; token: string } | null = null;

export async function signIn(page: Page, email = EMAIL, password = PASSWORD) {
  if (process.env.E2E_LOGIN_EVERY_TEST !== "1" && cachedSession?.email === email) {
    const probe = await page.request.get(`${API}/users/security-policy`, {
      headers: { Authorization: `Bearer ${cachedSession.token}` },
    });
    if (probe.ok()) {
      const token = cachedSession.token;
      await page.context().addCookies([{ name: "controlcenter_token", value: token, url: page.url().startsWith("http") ? page.url() : (process.env.E2E_BASE_URL || "http://localhost:3002"), sameSite: "Strict" }]);
      await page.addInitScript((t) => localStorage.setItem("controlcenter_token", t), token);
      await page.goto("/");
      if (!page.url().includes("/login")) return;
    }
    cachedSession = null;
  }
  await signInViaForm(page, "/login", email, password);
  const token = await page.evaluate(() => localStorage.getItem("controlcenter_token"));
  if (token) cachedSession = { email, token };
}

/** Drive the real login form at `path` (e.g. "/login?next=/releases"), waiting out a 429 once. */
export async function signInViaForm(page: Page, path: string, email = EMAIL, password = PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(path);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST", { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    if (response.status() === 429 && attempt === 0) {
      const retryAfter = Number(response.headers()["retry-after"] ?? "60");
      await page.waitForTimeout((Math.min(Math.max(retryAfter, 1), 60) + 1) * 1000);
      continue;
    }
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    return;
  }
}

export async function signOut(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("controlcenter_token");
    document.cookie = "controlcenter_token=; path=/; max-age=0";
  });
}

/** Navigate and assert the page heading; fails fast on the generic error banner. */
export async function openPage(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
}

/** The topmost dialog panel (dialogs use rounded-2xl; the step-up prompt uses rounded-xl). */
export const modal = (page: Page): Locator => page.locator("div.rounded-2xl").last();
export const stepUpPrompt = (page: Page): Locator => page.locator("div.rounded-xl").filter({ hasText: /Confirm it/ });
export const statLabel = (page: Page, text: string): Locator => page.locator(".stat-label", { hasText: text });
export const rowWith = (page: Page, text: string | RegExp): Locator => page.locator("tbody tr").filter({ hasText: text });

/** The <select> that offers a given option value — stable against column reordering. */
export const selectWithOption = (page: Page, value: string): Locator =>
  page.locator("select", { has: page.locator(`option[value="${value}"]`) }).first();

/** Complete the step-up prompt after an action was refused with STEP_UP_REQUIRED. */
export async function confirmStepUp(page: Page, password = PASSWORD) {
  await expect(stepUpPrompt(page)).toBeVisible();
  await stepUpPrompt(page).locator('input[type="password"]').fill(password);
  await stepUpPrompt(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/^Confirmed/)).toBeVisible();
  await expect(stepUpPrompt(page)).toHaveCount(0);
}

/** Wait for a success toast (the API envelope message) matching the text. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** A bearer token for direct API calls from a test (fixtures, cleanup). */
export async function apiToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem("controlcenter_token"))) ?? "";
}

export const API = process.env.E2E_API_URL ?? "http://localhost:8090/api/v1";

/** Direct API call with the signed-in operator's token; returns the unwrapped `data`. */
export async function api(page: Page, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, headers?: Record<string, string>) {
  const token = await apiToken(page);
  const res = await page.request.fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(headers ?? {}) },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), data: json?.data ?? json, code: json?.code, message: json?.message };
}

export const uniqueName = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ── Shared by the per-route suites ────────────────────────────────────────────────────────────────

/** Navigate and assert the page's own h1 inside <main>, so a same-named sidebar link cannot collide. */
export async function openMain(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.locator("main").getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

/** A sonner toast of one kind (success / error / info / warning). */
export const toastOfType = (page: Page, type: "success" | "error" | "info" | "warning"): Locator =>
  page.locator(`[data-sonner-toast][data-type="${type}"]`);

/** The throwaway organization the commercial suites hang off. */
export const E2E_ORG = { name: "E2E Org", slug: "e2e-org", contactEmail: "e2e@example.test" } as const;

export interface E2EOrg { id: string; name: string; slug: string; status?: string }

/** Find the throwaway org, creating it through the API when the organizations suite has not run yet. */
export async function ensureE2EOrg(page: Page): Promise<E2EOrg> {
  const list = await api(page, "GET", "/organizations");
  const orgs: E2EOrg[] = Array.isArray(list.data) ? list.data : [];
  const found = orgs.find((o) => o.slug === E2E_ORG.slug);
  if (found) return found;
  const created = await api(page, "POST", "/organizations", {
    ...E2E_ORG, country: "South Africa", deploymentEnv: "PRODUCTION", tier: "STANDARD",
  });
  if (created.status >= 300 || !created.data?.id) {
    throw new Error(`Could not create ${E2E_ORG.slug}: HTTP ${created.status} ${created.message ?? ""}`);
  }
  return created.data as E2EOrg;
}

/** Click; if the server answers STEP_UP_REQUIRED, confirm the password and repeat the click. */
export async function clickWithStepUp(page: Page, target: Locator, password = PASSWORD) {
  await target.click();
  const asked = await stepUpPrompt(page).waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
  if (!asked) return;
  await confirmStepUp(page, password);
  await target.click();
}
