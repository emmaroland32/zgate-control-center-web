import { test, expect, type Page } from "@playwright/test";
import { requireCredentials, signIn, openMain, statLabel } from "./helpers";

/**
 * Read-only overview routes: dashboard, fleet, health, SLA, compliance, reports, notifications,
 * audit and logs. Pollers (health auto-refresh, audit/log live mode) are switched off before
 * asserting and never left running.
 */
test.beforeAll(() => requireCredentials());
test.beforeEach(async ({ page }) => { await signIn(page); });

const main = (page: Page) => page.locator("main");

test("dashboard: stats, sections and Refresh", async ({ page }) => {
  await openMain(page, "/", "Dashboard");
  for (const label of ["Total Deployments", "Organizations", "Licensed Modules", "Expiring Soon", "Pending Update", "Active Partners"]) {
    await expect(statLabel(page, label)).toBeVisible();
  }
  for (const h of ["Deployment Health", "Recent Deployments", "Deployments by Status", "License Alerts", "Quick Actions", "Latest Release", "Recent Audit Activity"]) {
    await expect(main(page).getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(main(page).getByRole("link", { name: "View all" }).first()).toBeVisible();
  await main(page).getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(main(page).getByRole("heading", { name: "Deployment Health" })).toBeVisible();
});

test("fleet: stats, rollouts, stacks, M2M banner and the New Rollout dialog", async ({ page }) => {
  await openMain(page, "/fleet", "Fleet Operations");
  await expect(main(page).getByText("Stacks behind", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Latest release", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Rollouts", exact: true })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Stacks", exact: true })).toBeVisible();
  await expect(page.getByText("Machine-to-machine auth is not enforced")).toBeVisible();
  await expect(page.getByText("No stacks provisioned yet.")).toBeVisible();

  await page.getByRole("button", { name: "New Rollout" }).click();
  const dialog = page.locator("div.rounded-xl").filter({ hasText: "New fleet rollout" }).last();
  await expect(dialog.getByRole("heading", { name: "New fleet rollout" })).toBeVisible();
  await expect(dialog.getByText("Auto-apply", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Create rollout \(0 stacks\)/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("health: stop auto-refresh first, then cards and the status banner", async ({ page }) => {
  await openMain(page, "/health", "System Health");
  await page.getByRole("button", { name: "Auto (30s)" }).click();
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
  for (const l of ["Total Monitored", "Healthy", "Degraded", "Offline"]) await expect(statLabel(page, l)).toBeVisible();
  await expect(page.getByText(/All systems operational|Partial degradation detected|Outage in progress/)).toBeVisible();
  await expect(page.getByText("View Details").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Response Time — Last 24h" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh All" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
});

test("sla: 7d / 30d / 90d windows", async ({ page }) => {
  await openMain(page, "/sla", "SLA Dashboard");
  await expect(main(page).getByText("Tracked orgs")).toBeVisible();
  await expect(main(page).getByText("Untracked (no telemetry)")).toBeVisible();
  await expect(main(page).getByText("Incidents", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Fleet uptime (30d avg)")).toBeVisible();
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(main(page).getByText("Fleet uptime (7d avg)")).toBeVisible();
  await page.getByRole("button", { name: "90d", exact: true }).click();
  await expect(main(page).getByText("Fleet uptime (90d avg)")).toBeVisible();
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await expect(main(page).getByText("Fleet uptime (30d avg)")).toBeVisible();
  await expect(main(page).getByText(/Resolution: an org counts as down/)).toBeVisible();
});

test("compliance: stats and the anomalies table", async ({ page }) => {
  await openMain(page, "/compliance", "License Compliance");
  await expect(page.getByText("Open licensing anomalies across the fleet — evidence to true-up or enforce.")).toBeVisible();
  for (const l of ["Open anomalies", "Affected organizations", "Copied / over-deployed", "Topology over-tier"]) {
    await expect(statLabel(page, l)).toBeVisible();
  }
  await expect(main(page).getByRole("heading", { name: "Recent anomalies" })).toBeVisible();
  const rows = page.locator("tbody tr");
  const empty = page.getByText("No open licensing anomalies. Fleet is compliant.");
  await expect(rows.first().or(empty).first()).toBeVisible();
});

test("reports: four tabs and the period select", async ({ page }) => {
  // Used to crash client-side: the service mapping now fills every field the page dereferences.
  await openMain(page, "/reports", "Reports");
  await expect(page.getByText("Usage analytics, license utilization, deployment reports")).toBeVisible();
  for (const l of ["Total Organisations", "Active This Period", "Total Users", "API Calls"]) {
    await expect(main(page).getByText(l, { exact: true })).toBeVisible();
  }
  await expect(main(page).getByText("Active Organisations Over Time")).toBeVisible();
  await expect(main(page).getByText("Module Usage")).toBeVisible();
  await expect(page.getByText("Not available — Control Center does not retain the history this table needs.")).toBeVisible();

  const period = page.locator("select", { has: page.locator('option[value="90d"]') });
  await period.selectOption("90d");
  await expect(period).toHaveValue("90d");
  await expect(main(page).getByText("Daily Active Users")).toBeVisible();
  await period.selectOption("30d");

  await main(page).getByRole("button", { name: "Licenses", exact: true }).click();
  await expect(main(page).getByText("Licenses by Module")).toBeVisible();
  await expect(main(page).getByText("License Utilisation by Module")).toBeVisible();

  await main(page).getByRole("button", { name: "Deployments", exact: true }).click();
  await expect(main(page).getByText("Deployments per Day")).toBeVisible();
  await expect(main(page).getByText("Version Distribution")).toBeVisible();

  await main(page).getByRole("button", { name: "Custom", exact: true }).click();
  await expect(main(page).getByText("Custom Report Builder")).toBeVisible();
  await expect(page.getByText("No saved reports yet. Generate and save a custom report above.")).toBeVisible();

  await main(page).getByRole("button", { name: "Usage", exact: true }).click();
  await expect(main(page).getByText("Active Organisations Over Time")).toBeVisible();
});

test("notifications: filters, footer and the unread view", async ({ page }) => {
  await openMain(page, "/notifications", "Notifications");
  await expect(main(page).getByText("Filter:")).toBeVisible();
  for (const f of ["All", "Unread", "Alerts", "License", "Deployments", "Health"]) {
    await expect(main(page).getByRole("button", { name: new RegExp(`^${f}\\b`) })).toBeVisible();
  }
  // With alerts the footer shows "{n} total • {n} unread"; with none, the empty state renders instead.
  const footer = main(page).getByText(/\d+ total/);
  const empty = main(page).getByText("No notifications");
  await expect(footer.or(empty).first()).toBeVisible();
  if ((await footer.count()) > 0) await expect(main(page).getByText("Notification Settings")).toBeVisible();
  else await expect(main(page).getByText("Nothing to show for this filter.")).toBeVisible();

  await main(page).getByRole("button", { name: /^Unread\b/ }).click();
  await expect(
    main(page).getByText(/All caught up!|LICENSE EXPIRY|DEPLOYMENT SUCCESS|DEPLOYMENT FAILED|HEALTH ALERT|NEW ORGANIZATION|SECURITY ALERT|RELEASE PUBLISHED/).first(),
  ).toBeVisible();
  await main(page).getByRole("button", { name: /^All\b/ }).click();
});

test("audit: stats, filters, rows or the empty state, Live on then off", async ({ page }) => {
  await openMain(page, "/audit", "Audit Trail");
  await expect(page.getByText("All system actions, logins, and configuration changes")).toBeVisible();
  for (const l of ["Total Events Today", "Failed Actions", "License Changes", "User Logins Today"]) {
    await expect(statLabel(page, l)).toBeVisible();
  }
  await expect(page.getByPlaceholder("Search actor, action…")).toBeVisible();
  await expect(page.locator("select", { has: page.locator('option:has-text("LICENSE Events")') })).toBeVisible();
  await expect(page.locator("select", { has: page.locator('option:has-text("All Organizations")') })).toBeVisible();
  // The page fetches page=1 of the log, so an empty table is a legitimate state.
  const rows = page.locator("tbody tr");
  const empty = page.getByText("No audit events match the current filters.");
  await expect(rows.first().or(empty).first()).toBeVisible();
  await expect(page.getByText(/\d+ events/).first()).toBeVisible();
  await expect(page.getByText("Manual refresh")).toBeVisible();

  const live = main(page).getByRole("button", { name: "Live", exact: true });
  await live.click();
  await expect(page.getByText("Refreshing every 5s")).toBeVisible();
  await live.click();
  await expect(page.getByText("Manual refresh")).toBeVisible();
});

test("logs: filters render, Live on then off", async ({ page }) => {
  await openMain(page, "/logs", "Log Viewer");
  await expect(page.getByText("Centralized log viewer for all ZGATE deployments")).toBeVisible();
  await expect(page.getByPlaceholder("Search messages, loggers, traceId...")).toBeVisible();
  await expect(page.locator("select", { has: page.locator('option:has-text("All Deployments")') })).toBeVisible();
  await expect(page.getByText("Service:", { exact: true })).toBeVisible();
  await expect(page.getByText("Level:", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Total:/)).toBeVisible();
  await expect(page.getByText(/No filter active|Filtered/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download Logs" })).toBeVisible();

  await page.getByRole("button", { name: "Live Off" }).click();
  await expect(page.getByRole("button", { name: "Live", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("button", { name: "Live Off" })).toBeVisible();
});
