import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openMain, api } from "./helpers";

/**
 * Notifications and alert history — READ-ONLY.
 *
 * There is no safe way to create an Alert on this stack: the API has no POST /alerts (rules are
 * created, but they only fire through the evaluator, which is off locally), and the only
 * mutations on these screens (acknowledge / resolve / dismiss) change real alert state. So this
 * suite pins what dashboard-and-overview.spec does not: the filter counts against the alert feed,
 * every filter's rendered state, the missing bulk action when nothing is unread, the settings
 * link, and the History tab's severity / date filters.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const main = (page: Page) => page.locator("main");
interface FeedAlert { id: string; title: string; severity: string; status: string; firedAt: string }

async function feed(page: Page): Promise<FeedAlert[]> {
  const r = await api(page, "GET", "/alerts");
  return Array.isArray(r.data) ? (r.data as FeedAlert[]) : [];
}

test("notifications: counts match the alert feed and every filter renders a valid state", async ({ page }) => {
  const alerts = await feed(page);
  const unread = alerts.filter((a) => a.status !== "ACKNOWLEDGED" && a.status !== "RESOLVED").length;
  test.info().annotations.push({
    type: "note",
    description: `No safe path creates an Alert here (no POST /alerts; the evaluator is off), so this run saw ${alerts.length} alert(s), ${unread} unread.`,
  });

  await openMain(page, "/notifications", "Notifications");
  const m = main(page);
  const cards = m.locator("div.card.border-l-4");
  await expect(cards).toHaveCount(alerts.length);

  if (alerts.length === 0) {
    await expect(m.getByText("No notifications")).toBeVisible();
    await expect(m.getByText("Nothing to show for this filter.")).toBeVisible();
    await expect(m.getByText(/\d+ total/)).toHaveCount(0);
    await expect(m.getByText("Notification Settings")).toHaveCount(0);
  } else {
    await expect(m.getByText(`${alerts.length} total • ${unread} unread`)).toBeVisible();
    await expect(m.getByRole("button", { name: new RegExp(`^All\\s*${alerts.length}$`) })).toBeVisible();
    await expect(m.getByText("Today", { exact: true }).or(m.getByText("Yesterday", { exact: true })).or(m.getByText("Earlier", { exact: true })).first()).toBeVisible();
  }
  // The bulk action exists only while something is unread; the h1 badge follows the same count.
  await expect(m.getByRole("button", { name: "Mark All Read" })).toHaveCount(unread > 0 ? 1 : 0);
  await expect(m.getByTitle("Unread")).toHaveCount(unread);

  for (const f of ["Unread", "Alerts", "License", "Deployments", "Health", "All"]) {
    await m.getByRole("button", { name: new RegExp(`^${f}\\b`) }).click();
    const empty = m.getByText(f === "Unread" ? "All caught up!" : "Nothing to show for this filter.");
    await expect(cards.first().or(empty).first()).toBeVisible();
    if (f === "Unread") await expect(cards).toHaveCount(unread);
    if (f === "All") await expect(cards).toHaveCount(alerts.length);
  }
});

test("notifications: the Notification Settings link lands on Settings › General (the ?tab query is ignored)", async ({ page }) => {
  const alerts = await feed(page);
  test.skip(alerts.length === 0, "The footer link only renders when at least one alert exists, and none can be created safely.");
  await openMain(page, "/notifications", "Notifications");
  await main(page).getByRole("link", { name: "Notification Settings" }).click();
  await page.waitForURL(/\/settings\?tab=notifications/);
  await expect(page.getByRole("heading", { name: "General Settings" })).toBeVisible();
});

test("alerts: Active tab reflects the live feed (empty state or acknowledge/resolve controls)", async ({ page }) => {
  await openMain(page, "/alerts", "Alerts");
  // Read the feed once the page has loaded its own copy: the evaluator ticks every minute.
  const active = (await api(page, "GET", "/alerts/active")).data as FeedAlert[];
  const list = Array.isArray(active) ? active : [];
  const critical = list.filter((a) => a.severity === "CRITICAL" && a.status === "FIRING").length;

  // The tab shows its count badge only when the count is non-zero.
  const tab = page.getByRole("button", { name: /^Active Alerts/ });
  await expect(tab).toHaveText(list.length > 0 ? new RegExp(`Active Alerts\\s*${list.length}$`) : /^\s*Active Alerts\s*$/);
  if (list.length === 0) {
    await expect(page.getByText("All clear — no active alerts")).toBeVisible();
    await expect(page.getByText("All monitored deployments are operating within threshold.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  } else {
    await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(list.length);
  }
  await expect(page.getByText(/Critical alerts? require attention/)).toHaveCount(critical > 0 ? 1 : 0);
  await expect(page.getByRole("button", { name: "View Active Alerts" })).toHaveCount(critical > 0 ? 1 : 0);
});

test("alerts: History — severity chips and the From date filter the table; the tab carries the count", async ({ page }) => {
  await openMain(page, "/alerts", "Alerts");
  await page.getByRole("button", { name: /^History/ }).click();
  await expect(page.getByRole("columnheader", { name: "Root Cause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All Severities" })).toBeVisible();

  const rows = page.locator("tbody tr");
  const empty = page.getByText("No historical alerts match the current filters.");
  await expect(rows.first().or(empty).first()).toBeVisible();
  const total = await rows.count();
  const tab = page.getByRole("button", { name: /^History/ });
  await expect(tab).toHaveText(total > 0 ? new RegExp(`History\\s*${total}$`) : /^\s*History\s*$/);
  if (total === 0) await expect(empty).toBeVisible();

  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
    await page.getByRole("button", { name: severity, exact: true }).click();
    await expect(rows.first().or(empty).first()).toBeVisible();
    for (const row of await rows.all()) {
      await expect(row.locator("td").nth(1)).toHaveText(new RegExp(`^${severity}$`, "i"));
    }
  }
  await page.getByRole("button", { name: "All Severities" }).click();
  await expect(rows).toHaveCount(total);

  // Nothing fired after tomorrow.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(tomorrow);
  await expect(empty).toBeVisible();
  await expect(rows).toHaveCount(0);
  await page.locator('input[type="date"]').fill("");
  await expect(rows).toHaveCount(total);
});
