import { expect, type Page, type Locator } from "@playwright/test";
import { randomInt } from "node:crypto";

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
 * signing in would be throttled after the first minute. So the FIRST call in a worker signs in once
 * against the API and remembers the token; later calls verify it and inject it into the fresh browser
 * context, falling back to a fresh sign-in whenever the token is missing, rejected, or for a different
 * operator. Set E2E_LOGIN_EVERY_TEST=1 to sign in every time.
 *
 * The cookies injected here are what the app itself sets (src/app/api/cc-session): the httpOnly token
 * the BFF reads, and the operator claims the pages draw with. Nothing is put in localStorage — the
 * token is no longer readable by the page, which is the point of the BFF, so a test cannot get it from
 * there either and the worker-level cache is where it lives for the suite.
 */
let cachedSession: { email: string; token: string; role: string } | null = null;

/** Sign in against the API directly, the way the session route does, to get a token for injection. */
async function apiSignIn(page: Page, email: string, password: string): Promise<{ token: string; role: string } | null> {
  const res = await page.request.post(`${API}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ email, password }),
  });
  if (!res.ok()) return null;
  const json = await res.json().catch(() => null);
  const issued = json?.data ?? json;
  return issued?.token ? { token: issued.token, role: issued.role ?? "" } : null;
}

async function injectSession(page: Page, session: { token: string; role: string }, email: string) {
  const url = page.url().startsWith("http") ? page.url() : (process.env.E2E_BASE_URL || "http://localhost:3002");
  await page.context().addCookies([
    { name: "controlcenter_token", value: session.token, url, sameSite: "Strict" },
    { name: "controlcenter_user", value: encodeURIComponent(JSON.stringify({ email, role: session.role })), url, sameSite: "Strict" },
  ]);
}

export async function signIn(page: Page, email = EMAIL, password = PASSWORD) {
  if (process.env.E2E_LOGIN_EVERY_TEST !== "1" && cachedSession?.email === email) {
    const probe = await page.request.get(`${API}/users/security-policy`, {
      headers: { Authorization: `Bearer ${cachedSession.token}` },
    });
    if (probe.ok()) {
      await injectSession(page, cachedSession, email);
      await page.goto("/");
      if (!page.url().includes("/login")) return;
    }
    cachedSession = null;
  }
  const issued = await apiSignIn(page, email, password);
  if (issued) {
    cachedSession = { email, ...issued };
    await injectSession(page, issued, email);
    await page.goto("/");
    if (!page.url().includes("/login")) return;
  }
  // Last resort: drive the real form, which is also what the suites testing the form itself use.
  await signInViaForm(page, "/login", email, password);
}

/** Drive the real login form at `path` (e.g. "/login?next=/releases"), waiting out a 429 once. */
export async function signInViaForm(page: Page, path: string, email = EMAIL, password = PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(path);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    const [response] = await Promise.all([
      // The form posts to the session route now, which signs in server-side; the backend's own path
      // is still matched so this helper works against either.
      page.waitForResponse((r) => /\/(auth\/login|cc-session\/login)$/.test(new URL(r.url()).pathname)
        && r.request().method() === "POST", { timeout: 20_000 }),
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

/** Clear the session. Through the context, because the token cookie is httpOnly and a page cannot. */
export async function signOut(page: Page) {
  await page.context().clearCookies();
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

/**
 * A bearer token for direct API calls from a test (fixtures, cleanup).
 *
 * From the worker's cache, not from the browser: the page cannot read the token any more. Signs in if
 * the cache is cold, so a spec that reaches for the API before signIn() still works.
 */
export async function apiToken(page: Page): Promise<string> {
  if (cachedSession) return cachedSession.token;
  const issued = await apiSignIn(page, EMAIL, PASSWORD);
  if (issued) cachedSession = { email: EMAIL, ...issued };
  return issued?.token ?? "";
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

// ── Shared by the identity suites (mfa, sessions-and-roles) ───────────────────────────────────────

export const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3002";

/** The throwaway VIEWER operator owned by admin-management.spec; left disabled between runs. */
export const OPERATOR = { email: "e2e.operator@example.test", name: "E2E Operator" } as const;

export interface Operator {
  id: string; name: string; email: string; role: string; active: boolean; mfaEnabled: boolean;
  locked: boolean; failedLoginAttempts: number;
}

/** A password that satisfies the server policy (length, mixed case, digit, symbol); never logged. */
export function generatePassword(length = 20): string {
  const lower = "abcdefghjkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789", symbols = "!@#$%^&*-_=+?";
  const pool = lower + upper + digits + symbols;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export async function findOperator(page: Page): Promise<Operator | null> {
  const list = await api(page, "GET", "/users");
  const users: Operator[] = Array.isArray(list.data) ? list.data : [];
  return users.find((u) => u.email.toLowerCase() === OPERATOR.email) ?? null;
}

/** The throwaway operator, created (VIEWER, active) through the API when admin-management.spec has not run. */
export async function ensureOperator(page: Page): Promise<Operator> {
  const found = await findOperator(page);
  if (found) return found;
  const created = await api(page, "POST", "/users", { name: OPERATOR.name, email: OPERATOR.email, password: generatePassword(), role: "VIEWER" });
  if (created.status >= 300 || !created.data?.id) {
    throw new Error(`Could not create ${OPERATOR.email}: HTTP ${created.status} ${created.message ?? ""}`);
  }
  return created.data as Operator;
}

/** A single-use step-up ticket bound to one action ("POST /api/v1/…"), for API-driven fixtures. */
export async function stepUpTicket(page: Page, action: string, password = PASSWORD): Promise<string> {
  const r = await api(page, "POST", "/auth/step-up", { password, action });
  if (r.status >= 300 || !r.data?.ticket) throw new Error(`Step-up refused: HTTP ${r.status} ${r.message ?? ""}`);
  return r.data.ticket as string;
}

function expectOk(r: { status: number; message?: string }, what: string) {
  if (r.status >= 300) throw new Error(`${what} failed: HTTP ${r.status} ${r.message ?? ""}`);
}

/**
 * Put the throwaway operator into a known state through the API as the signed-in SUPER_ADMIN:
 * clear any lockout, optionally set a fresh password (step-up ticket + reset, which also revokes
 * the operator's sessions), then leave the account enabled or disabled as asked.
 */
export async function prepareOperator(page: Page, opts: { enabled: boolean; password?: string }): Promise<Operator> {
  const op = await ensureOperator(page);
  if (op.locked || op.failedLoginAttempts > 0) expectOk(await api(page, "POST", `/users/${op.id}/unlock`), "unlock");
  if (op.mfaEnabled) {
    // Break-glass reset (step-up bound to the action) so a password-only sign-in works again.
    const action = `POST /api/v1/users/${op.id}/mfa/disable`;
    const ticket = await stepUpTicket(page, action);
    expectOk(await api(page, "POST", `/users/${op.id}/mfa/disable`, undefined, { "X-StepUp-Ticket": ticket }), "mfa-disable");
    op.mfaEnabled = false;
  }
  if (opts.password) {
    if (!op.active) expectOk(await api(page, "POST", `/users/${op.id}/enable`), "enable");
    const action = `POST /api/v1/users/${op.id}/reset-password`;
    const ticket = await stepUpTicket(page, action);
    expectOk(await api(page, "POST", `/users/${op.id}/reset-password`, { password: opts.password }, { "X-StepUp-Ticket": ticket }), "reset-password");
    op.active = true;
  }
  if (opts.enabled && !op.active) expectOk(await api(page, "POST", `/users/${op.id}/enable`), "enable");
  if (!opts.enabled && op.active) expectOk(await api(page, "POST", `/users/${op.id}/disable`), "disable");
  return { ...op, active: opts.enabled, locked: false, failedLoginAttempts: 0, mfaEnabled: false };
}

/**
 * The control under a plain, non-associated `<label class="label">` (the FormField pattern used
 * everywhere outside Admin Management): the label's parent's first input/select/textarea. A
 * required-field asterisk rendered inside the label is tolerated.
 */
export const fieldByLabel = (scope: Page | Locator, label: string): Locator =>
  scope
    .locator("label.label", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`) })
    .locator("xpath=..")
    .locator("input, select, textarea")
    .first();
