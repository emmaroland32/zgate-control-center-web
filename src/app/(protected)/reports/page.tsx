/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  Calendar,
  RefreshCw,
  Filter,
  ChevronDown,
  Database,
  Shield,
  Globe,
  Users,
  Activity,
  Check,
  X,
  Trash2,
  Play,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { reportService } from "@/services/controlcenter.service";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { UsageReport, LicenseReport, DeploymentReport } from "@/types";

// ─── Colour palette ────────────────────────────────────────────────────────────
const CONTROLCENTER_BLUE = "#3b6af8";
const CONTROLCENTER_600  = "#2d54d4";
const COLORS = ["#3b6af8", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
const PIE_COLORS = { PRODUCTION: "#10b981", STAGING: "#f59e0b", DEVELOPMENT: "#94a3b8" };

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function DeployStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    SUCCESS: "badge badge-green",
    FAILED: "badge badge-red",
    IN_PROGRESS: "badge badge-blue",
    PENDING: "badge badge-yellow",
    ROLLED_BACK: "badge badge-gray",
  };
  return <span className={cfg[status] ?? "badge badge-gray"}>{status.replace("_", " ")}</span>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ""}`} />;
}

// ─── Custom report builder types ───────────────────────────────────────────────
interface SavedReport {
  id: string;
  name: string;
  category: string;
  dimensions: string[];
  chartType: string;
  lastRun: string;
}

const SAVED_REPORTS_INIT: SavedReport[] = [];

// ─── EMPTY fallbacks ─────────────────────────────────────────────────────────
const EMPTY_USAGE: UsageReport = {
  period: "30d",
  totalOrganizations: 0,
  activeOrganizations: 0,
  totalUsers: 0,
  activeUsers: 0,
  totalApiCalls: 0,
  moduleUsage: [],
  deploymentsByEnv: { PRODUCTION: 0, STAGING: 0, DEVELOPMENT: 0 },
  newOrganizations: 0,
  churnedOrganizations: 0,
};

const EMPTY_LICENSE_REPORT: LicenseReport = {
  totalLicenses: 0,
  activeLicenses: 0,
  expiredLicenses: 0,
  expiringIn30Days: 0,
  expiringIn90Days: 0,
  byModule: [],
};

const EMPTY_DEP_REPORT: DeploymentReport = {
  totalDeployments: 0,
  successfulDeployments: 0,
  failedDeployments: 0,
  averageDurationMinutes: 0,
  rollbackCount: 0,
  deploymentsPerVersion: {},
  timeline: [],
};

// ─── Chart tooltip style ───────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

// ─── Main page ─────────────────────────────────────────────────────────────────
type Tab = "usage" | "licenses" | "deployments" | "custom";
type Period = "7d" | "30d" | "90d" | "1y";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("usage");
  const [period, setPeriod] = useState<Period>("30d");

  async function exportReport(fmt: "pdf" | "csv") {
    try {
      const blob = fmt === "pdf" ? await reportService.exportPdf("summary") : await reportService.exportCsv("summary");
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zgate-report-${period}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed — the backend may be unavailable.");
    }
  }
  const [loading, setLoading] = useState(true);

  const [usageReport, setUsageReport] = useState<UsageReport | null>(null);
  const [licenseReport, setLicenseReport] = useState<LicenseReport | null>(null);
  const [deploymentReport, setDeploymentReport] = useState<DeploymentReport | null>(null);

  // Custom report builder
  const [customCategory, setCustomCategory] = useState("Usage");
  const [customDimensions, setCustomDimensions] = useState<string[]>(["Organization"]);
  const [customChartType, setCustomChartType] = useState("Bar");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [customReportGenerated, setCustomReportGenerated] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [customReportName, setCustomReportName] = useState("");
  const [savedReports, setSavedReports] = useState<SavedReport[]>(SAVED_REPORTS_INIT);

  const DIMENSIONS_OPTIONS = ["Organization", "Module", "Version", "Environment", "Country"];

  const toggleDimension = (dim: string) => {
    setCustomDimensions((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [u, l, d] = await Promise.all([
        reportService.getUsage(period),
        reportService.getLicense(),
        reportService.getDeployments(),
      ]);
      setUsageReport(u);
      setLicenseReport(l);
      setDeploymentReport(d);
    } catch {
      setUsageReport(null);
      setLicenseReport(null);
      setDeploymentReport(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      // Use the existing report endpoints based on selected category
      if (customCategory === "Usage") {
        const data = await reportService.getUsage(period);
        setUsageReport(data);
      } else if (customCategory === "Licenses") {
        const data = await reportService.getLicense();
        setLicenseReport(data);
      } else if (customCategory === "Deployments") {
        const data = await reportService.getDeployments();
        setDeploymentReport(data);
      }
      setCustomReportGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleSaveReport = () => {
    if (!customReportName.trim()) return;
    const newReport: SavedReport = {
      id: `sr-${Date.now()}`,
      name: customReportName,
      category: customCategory,
      dimensions: customDimensions,
      chartType: customChartType,
      lastRun: new Date().toISOString(),
    };
    setSavedReports((prev) => [newReport, ...prev]);
    setCustomReportName("");
  };

  const handleDeleteSaved = (id: string) => {
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  };

  const u = usageReport ?? EMPTY_USAGE;
  const l = licenseReport ?? EMPTY_LICENSE_REPORT;
  const d = deploymentReport ?? EMPTY_DEP_REPORT;

  // ─── Derived chart data from API responses ──────────────────────────────────

  const moduleUsageData = useMemo(() =>
    u.moduleUsage.map((m) => ({ module: m.moduleName, licensed: m.licensedCount, active: m.activeCount })),
  [u]);

  const envDistData = useMemo(() =>
    Object.entries(u.deploymentsByEnv).map(([name, value]) => ({ name, value })),
  [u]);

  const licenseStatusData = useMemo(() => [
    { name: "Active", value: l.activeLicenses, color: "#10b981" },
    { name: "Expired", value: l.expiredLicenses, color: "#ef4444" },
    { name: "Not Licensed", value: Math.max(0, l.totalLicenses - l.activeLicenses - l.expiredLicenses), color: "#94a3b8" },
  ], [l]);

  const licenseUtilData = useMemo(() =>
    l.byModule.map((m) => ({
      module: m.moduleName,
      licensed: m.licensedCount,
      active: m.activeCount,
      utilization: m.utilizationPercent,
    })),
  [l]);

  const depTimelineData = useMemo(() =>
    d.timeline.map((t) => ({ date: t.date, success: t.successes, failed: t.failures })),
  [d]);

  const versionDistData = useMemo(() =>
    Object.entries(d.deploymentsPerVersion).map(([version, orgs]) => ({ version, orgs })),
  [d]);

  const successRateData = useMemo(() =>
    d.timeline.map((t) => ({
      date: t.date,
      rate: t.deployments > 0 ? Math.round((t.successes / t.deployments) * 100 * 10) / 10 : 0,
    })),
  [d]);

  const TabBtn = ({ tab, label }: { tab: Tab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        activeTab === tab ? "bg-controlcenter-600 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  const PERIOD_LABELS: Record<Period, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "1y": "Last Year",
  };

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-controlcenter-100 flex items-center justify-center">
            <BarChart3 size={18} className="text-controlcenter-600" />
          </div>
          <div>
            <h1 className="page-title">Reports</h1>
            <p className="text-xs text-slate-500 mt-0.5">Usage analytics, license utilization, deployment reports</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="select text-sm py-2 pr-8 pl-3 min-w-[160px]"
            >
              {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <button className="btn-secondary" onClick={() => exportReport("pdf")}>
            <FileText size={14} />
            Export PDF
          </button>
          <button className="btn-secondary" onClick={() => exportReport("csv")}>
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-3">
        <TabBtn tab="usage" label="Usage" />
        <TabBtn tab="licenses" label="Licenses" />
        <TabBtn tab="deployments" label="Deployments" />
        <TabBtn tab="custom" label="Custom" />
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: USAGE
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          {/* KPI row */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stat-card">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20 mt-2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Globe, label: "Total Organisations", value: u.totalOrganizations.toString(), color: "text-controlcenter-600", bg: "bg-controlcenter-100" },
                { icon: Activity, label: "Active This Period", value: u.activeOrganizations.toString(), color: "text-emerald-600", bg: "bg-emerald-100" },
                { icon: Users, label: "Total Users", value: formatK(u.totalUsers), color: "text-purple-600", bg: "bg-purple-100" },
                { icon: BarChart3, label: "API Calls", value: formatK(u.totalApiCalls), color: "text-amber-600", bg: "bg-amber-100" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="stat-card">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                      <Icon size={13} className={color} />
                    </div>
                    <span className="stat-label">{label}</span>
                  </div>
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Row 1: two charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active orgs over time */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Active Organisations Over Time</h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={[]} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradOrgs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CONTROLCENTER_BLUE} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CONTROLCENTER_BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="orgs"
                    name="Active Orgs"
                    stroke={CONTROLCENTER_BLUE}
                    strokeWidth={2}
                    fill="url(#gradOrgs)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Daily active users */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Daily Active Users</h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[]} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={formatK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatK(v), "Users"]} />
                  <Bar dataKey="users" name="DAU" fill={CONTROLCENTER_600} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: module usage + env dist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Module usage horizontal bar */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Database size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Module Usage</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={moduleUsageData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 60, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="module" type="category" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={58} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="licensed" name="Licensed" fill="#c7d7fd" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="active" name="Active" fill={CONTROLCENTER_BLUE} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Deployment distribution pie */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Deployment Distribution</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={envDistData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {envDistData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* New vs Churned table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp size={14} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">New vs Churned Organisations (Monthly)</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>New</th>
                  <th>Churned</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {null}
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-6">Not available — Control Center does not retain the history this table needs.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: LICENSES
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "licenses" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Active", value: l.activeLicenses.toString(), color: "text-emerald-600", bg: "bg-emerald-100", icon: Check },
              { label: "Expiring Soon", value: l.expiringIn30Days.toString(), color: "text-amber-600", bg: "bg-amber-100", icon: Calendar },
              { label: "Expired", value: l.expiredLicenses.toString(), color: "text-red-600", bg: "bg-red-100", icon: X },
              {
                label: "Utilization",
                value: `${Math.round((l.activeLicenses / l.totalLicenses) * 100)}%`,
                color: "text-controlcenter-600",
                bg: "bg-controlcenter-100",
                icon: Activity,
              },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className="stat-card">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={13} className={color} />
                  </div>
                  <span className="stat-label">{label}</span>
                </div>
                <span className={`stat-value ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Licenses by module bar */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Licenses by Module</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={licenseUtilData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 60, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="module" type="category" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={58} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="licensed" name="Licensed" fill="#c7d7fd" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="active" name="Active Users" fill={CONTROLCENTER_BLUE} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* License status donut */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">License Status Distribution</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={licenseStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {licenseStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* License expiry timeline */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={14} className="text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">License Expiry Timeline (Next 12 Months)</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={[]} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="expiring"
                  name="Expiring"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#f59e0b" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Utilization table */}
          <div className="table-container">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <Activity size={14} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">License Utilisation by Module</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Licensed</th>
                  <th>Active</th>
                  <th>Utilisation</th>
                  <th>Bar</th>
                </tr>
              </thead>
              <tbody>
                {[...licenseUtilData].sort((a, b) => b.utilization - a.utilization).map((row) => (
                  <tr key={row.module}>
                    <td className="font-medium text-xs">{row.module}</td>
                    <td className="text-xs text-slate-500">{row.licensed}</td>
                    <td className="text-xs text-slate-500">{row.active}</td>
                    <td>
                      <span className={`text-xs font-bold ${row.utilization >= 90 ? "text-emerald-600" : row.utilization >= 70 ? "text-controlcenter-600" : "text-amber-600"}`}>
                        {row.utilization}%
                      </span>
                    </td>
                    <td className="w-32">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.utilization >= 90 ? "bg-emerald-500" : row.utilization >= 70 ? "bg-controlcenter-500" : "bg-amber-400"}`}
                          style={{ width: `${row.utilization}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: DEPLOYMENTS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "deployments" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total", value: d.totalDeployments.toString(), color: "text-slate-900" },
              { label: "Successful", value: d.successfulDeployments.toString(), color: "text-emerald-600" },
              { label: "Failed", value: d.failedDeployments.toString(), color: "text-red-600" },
              { label: "Avg Duration", value: `${d.averageDurationMinutes.toFixed(1)}m`, color: "text-controlcenter-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="stat-card">
                <span className="stat-label">{label}</span>
                <span className={`stat-value ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Deployments per day stacked */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Deployments per Day</h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={depTimelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Version distribution */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Database size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">Version Distribution</h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={versionDistData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 48, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="version" type="category" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={46} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="orgs" name="Organisations" radius={[0, 4, 4, 0]}>
                    {versionDistData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Success rate over time */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Deployment Success Rate Over Time</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={successRateData} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={6} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={[60, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "Success Rate"]} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Success Rate"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recent deployments table */}
          <div className="table-container">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <RefreshCw size={14} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Recent Deployments</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Deployed By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {null}
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-6">Not available — Control Center does not retain the history this table needs.</td></tr>
              </tbody>
            </table>
          </div>

          {/* Top performing orgs */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Top Performing Organisations</h3>
            </div>
            <div className="space-y-3">
              {null}
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-6">Not available — Control Center does not retain the history this table needs.</td></tr>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: CUSTOM
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "custom" && (
        <div className="space-y-6">
          {/* Builder card */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Filter size={15} className="text-controlcenter-600" />
              <h2 className="text-sm font-bold text-slate-900">Custom Report Builder</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              {/* Category */}
              <div>
                <label className="label">Metric Category</label>
                <div className="relative">
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="select"
                  >
                    {["Usage", "Licenses", "Deployments", "Health"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Chart type */}
              <div>
                <label className="label">Chart Type</label>
                <div className="flex gap-2 flex-wrap">
                  {["Bar", "Line", "Pie", "Table"].map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setCustomChartType(ct)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        customChartType === ct
                          ? "bg-controlcenter-600 text-white border-controlcenter-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date from */}
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                />
              </div>

              {/* Date to */}
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="mb-5">
              <label className="label">Dimensions (multi-select)</label>
              <div className="flex items-center gap-2 flex-wrap">
                {DIMENSIONS_OPTIONS.map((dim) => (
                  <button
                    key={dim}
                    onClick={() => toggleDimension(dim)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      customDimensions.includes(dim)
                        ? "bg-controlcenter-600 text-white border-controlcenter-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {customDimensions.includes(dim) && <Check size={11} />}
                    {dim}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                className="btn-primary"
                onClick={handleGenerateReport}
                disabled={generatingReport}
              >
                <RefreshCw size={14} className={generatingReport ? "animate-spin" : ""} />
                {generatingReport ? "Generating…" : "Generate Report"}
              </button>

              {customReportGenerated && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="text"
                    className="input text-sm w-56"
                    placeholder="Report name…"
                    value={customReportName}
                    onChange={(e) => setCustomReportName(e.target.value)}
                  />
                  <button
                    className="btn-secondary text-xs px-3"
                    onClick={handleSaveReport}
                    disabled={!customReportName.trim()}
                  >
                    <FileText size={13} />
                    Save Report
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Generated report result */}
          {customReportGenerated && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-controlcenter-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {customCategory} — {customDimensions.join(", ")} ({customDateFrom} to {customDateTo})
                </h3>
              </div>

              {/* Conditionally render chart type */}
              {customChartType !== "Table" ? (
                <ResponsiveContainer width="100%" height={280}>
                  {customChartType === "Bar" ? (
                    <BarChart data={moduleUsageData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="module" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="licensed" name="Licensed" fill="#c7d7fd" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="active" name="Active" fill={CONTROLCENTER_BLUE} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  ) : customChartType === "Line" ? (
                    <LineChart data={successRateData.slice(0, 20)} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={[60, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Line type="monotone" dataKey="rate" name={customCategory} stroke={CONTROLCENTER_BLUE} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    </LineChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={envDistData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {envDistData.map((entry) => (
                          <Cell key={entry.name} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              ) : (
                /* Table mode */
                <table>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Licensed</th>
                      <th>Active</th>
                      <th>Utilisation %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleUsageData.map((row) => (
                      <tr key={row.module}>
                        <td className="text-xs font-medium">{row.module}</td>
                        <td className="text-xs text-slate-500">{row.licensed}</td>
                        <td className="text-xs text-slate-500">{row.active}</td>
                        <td className="text-xs font-bold text-controlcenter-600">
                          {Math.round((row.active / row.licensed) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Saved reports */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Saved Reports</h3>
              <span className="badge badge-gray">{savedReports.length}</span>
            </div>

            {savedReports.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <FileText size={32} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No saved reports yet. Generate and save a custom report above.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Dimensions</th>
                    <th>Chart</th>
                    <th>Last Run</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedReports.map((sr) => (
                    <tr key={sr.id}>
                      <td className="font-medium text-xs">{sr.name}</td>
                      <td><span className="badge badge-blue text-[10px]">{sr.category}</span></td>
                      <td className="text-xs text-slate-500">{sr.dimensions.join(", ")}</td>
                      <td><span className="badge badge-gray text-[10px]">{sr.chartType}</span></td>
                      <td className="text-xs text-slate-500">{timeAgo(sr.lastRun)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-slate-400 hover:text-controlcenter-600 transition-colors"
                            title="Run"
                            onClick={handleGenerateReport}
                          >
                            <Play size={13} />
                          </button>
                          <button
                            className="text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete"
                            onClick={() => handleDeleteSaved(sr.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
