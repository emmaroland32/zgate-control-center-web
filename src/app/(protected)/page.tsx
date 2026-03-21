"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, ShieldCheck, Rocket, AlertTriangle, CheckCircle2,
  XCircle, Clock, Users, Globe, TrendingUp, RefreshCw, Plus,
  Eye, ArrowRight, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { dashboardService, healthService, deploymentService, organizationService } from "@/services/nexus.service";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";
import type {
  NexusDashboardStats, ServiceHealth, License, AuditEntry, Deployment,
} from "@/types";

// ─── Mock / fallback data ────────────────────────────────────────────────────

const EMPTY_STATS: NexusDashboardStats = {
  totalDeployments: 0,
  healthyDeployments: 0,
  degradedDeployments: 0,
  offlineDeployments: 0,
  totalOrganizations: 0,
  activePartners: 0,
  pendingLicenseRenewals: 0,
  expiringLicenses: 0,
  latestReleaseVersion: "—",
  deploymentsPendingUpdate: 0,
  totalActiveLicenses: 0,
  recentDeployments: [],
  licenseAlerts: [],
  healthSummary: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deploymentHealthStatus(h: ServiceHealth): "HEALTHY" | "DEGRADED" | "OFFLINE" {
  if (h.backendStatus === "DOWN") return "OFFLINE";
  if (h.backendStatus === "DEGRADED" || h.databaseStatus === "DEGRADED" || h.redisStatus === "DEGRADED") return "DEGRADED";
  return "HEALTHY";
}

function daysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function deploymentStatusBadge(status: Deployment["status"]) {
  const map: Record<Deployment["status"], string> = {
    SUCCESS: "badge badge-green",
    PENDING: "badge badge-gray",
    IN_PROGRESS: "badge badge-blue",
    FAILED: "badge badge-red",
    ROLLED_BACK: "badge badge-yellow",
  };
  return map[status] ?? "badge badge-gray";
}

function auditStatusBadge(status: AuditEntry["status"]) {
  const map: Record<AuditEntry["status"], string> = {
    SUCCESS: "badge badge-green",
    FAILURE: "badge badge-red",
    WARNING: "badge badge-yellow",
  };
  return map[status] ?? "badge badge-gray";
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="stat-card animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-2/3 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-1/3 mb-2" />
      <div className="h-3 bg-slate-200 rounded w-1/2" />
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-slate-200 rounded animate-pulse w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────────────────

const DONUT_COLORS = ["#10b981", "#f59e0b", "#ef4444"];

function DeploymentDonut({ healthy, degraded, offline }: { healthy: number; degraded: number; offline: number }) {
  const data = [
    { name: "Healthy", value: healthy },
    { name: "Degraded", value: degraded },
    { name: "Offline", value: offline },
  ];
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={46}
          outerRadius={68}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / .1)" }}
          formatter={(val: number, name: string) => [`${val}`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<NexusDashboardStats | null>(null);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, healthData, auditData, deploymentsData, orgsData] = await Promise.allSettled([
        dashboardService.getStats(),
        healthService.getServices(),
        dashboardService.getActivity(),
        deploymentService.getAll(),
        organizationService.getAll(),
      ]);

      // Build org name lookup to enrich licenses
      const rawOrgs = orgsData.status === "fulfilled" && Array.isArray(orgsData.value) ? orgsData.value : [];
      const orgMap = new Map<string, string>(rawOrgs.map((o: { id: string; name: string }) => [o.id, o.name]));

      // Recent deployments — enrich org name, sort newest first, take 5
      const rawDeps = deploymentsData.status === "fulfilled" && Array.isArray(deploymentsData.value)
        ? deploymentsData.value
        : [];
      const recentDeployments = rawDeps
        .map((d: Deployment) => ({
          ...d,
          organizationName: d.organizationName && d.organizationName !== d.organizationId
            ? d.organizationName
            : (orgMap.get(d.organizationId) ?? d.organizationId),
        }))
        .sort((a: Deployment, b: Deployment) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 5);

      const baseStats = statsData.status === "fulfilled" ? statsData.value : EMPTY_STATS;

      // Enrich licenseAlerts with org names
      const licAlerts = Array.isArray(baseStats.licenseAlerts)
        ? baseStats.licenseAlerts.map((lic: License) => ({
          ...lic,
          organizationName: lic.organizationName && lic.organizationName !== lic.organizationId
            ? lic.organizationName
            : (orgMap.get(lic.organizationId) ?? lic.organizationName ?? lic.organizationId),
        }))
        : [];

      setStats({
        ...baseStats,
        recentDeployments: recentDeployments.length > 0 ? recentDeployments : baseStats.recentDeployments,
        licenseAlerts: licAlerts.length > 0 ? licAlerts : baseStats.licenseAlerts,
      });
      setHealth(healthData.status === "fulfilled" ? healthData.value : []);
      setAudit(auditData.status === "fulfilled" ? auditData.value?.slice(0, 8) : []);
      setLastRefreshed(new Date());
    } catch {
      setStats(EMPTY_STATS);
      setHealth([]);
      setAudit([]);
      setError("API unavailable. Please ensure the backend is running.");
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = stats ?? EMPTY_STATS;
  const licenseAlerts: License[] = s.licenseAlerts ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
            <span className="badge badge-red text-[10px] px-2 py-0.5 font-semibold tracking-wide uppercase">
              Production
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">
              {formatDate(new Date())}
              {!loading && (
                <span className="ml-2 text-slate-300">
                  &bull; refreshed {timeAgo(lastRefreshed)}
                </span>
              )}
            </span>
            {error && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> {error}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">

        {/* ── KPI grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">

          {/* Total Deployments */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Total Deployments</span>
                <Globe size={15} className="text-nexus-400" />
              </div>
              <div className="stat-value">{s.totalDeployments}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <CheckCircle2 size={11} /> {s.healthyDeployments} healthy
                </span>
                {s.degradedDeployments > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                    <AlertTriangle size={11} /> {s.degradedDeployments} degraded
                  </span>
                )}
                {s.offlineDeployments > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                    <XCircle size={11} /> {s.offlineDeployments} offline
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Active Organizations */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Organizations</span>
                <Building2 size={15} className="text-nexus-400" />
              </div>
              <div className="stat-value">{s.totalOrganizations}</div>
              <div className="text-xs text-slate-400 mt-2">Active tenants</div>
            </div>
          )}

          {/* Licensed Modules */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Licensed Modules</span>
                <ShieldCheck size={15} className="text-nexus-400" />
              </div>
              <div className="stat-value">{s.totalActiveLicenses}</div>
              <div className="text-xs text-slate-400 mt-2">
                Active licenses across all orgs
              </div>
            </div>
          )}

          {/* Expiring Licenses */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Expiring Soon</span>
                <Clock size={15} className="text-amber-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="stat-value">{s.expiringLicenses}</div>
                {s.expiringLicenses > 0 && (
                  <span className="badge badge-yellow">within 30 days</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                {s.pendingLicenseRenewals} renewal{s.pendingLicenseRenewals !== 1 ? "s" : ""} pending
              </div>
            </div>
          )}

          {/* Deployments Pending Update */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Pending Update</span>
                <TrendingUp size={15} className="text-blue-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="stat-value">{s.deploymentsPendingUpdate}</div>
                {s.deploymentsPendingUpdate > 0 && (
                  <span className="badge badge-blue">update available</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Latest: v{s.latestReleaseVersion}
              </div>
            </div>
          )}

          {/* Active Partners */}
          {loading ? <SkeletonCard /> : (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Active Partners</span>
                <Users size={15} className="text-nexus-400" />
              </div>
              <div className="stat-value">{s.activePartners}</div>
              <div className="text-xs text-slate-400 mt-2">Channel partners</div>
            </div>
          )}
        </div>

        {/* ── Two-column body ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

          {/* LEFT column — 60% */}
          <div className="xl:col-span-3 space-y-5">

            {/* Deployment Health */}
            <div className="card">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Activity size={14} className="text-nexus-500" />
                  Deployment Health
                </h2>
                <a href="/deployments" className="text-xs text-nexus-600 hover:text-nexus-700 flex items-center gap-1">
                  View all <ArrowRight size={11} />
                </a>
              </div>
              <div className="divide-y divide-slate-50">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-5 py-3 flex items-center gap-3 animate-pulse">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-200 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-slate-200 rounded w-1/3" />
                        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                      </div>
                      <div className="h-3 bg-slate-200 rounded w-16" />
                    </div>
                  ))
                  : (health.length > 0 ? health : []).map((h) => {
                    const status = deploymentHealthStatus(h);
                    const dotColor = status === "HEALTHY" ? "bg-emerald-500" : status === "DEGRADED" ? "bg-amber-500" : "bg-red-500";
                    const uptimePct = h.uptimeHours > 0
                      ? Math.min(100, ((h.uptimeHours) / (h.uptimeHours + 0.1) * 100)).toFixed(1)
                      : "0.0";
                    return (
                      <div key={h.organizationId} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/70 transition-colors">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor} ${status === "OFFLINE" ? "" : "ring-2 ring-offset-1 " + (status === "HEALTHY" ? "ring-emerald-200" : "ring-amber-200")}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{h.organizationName}</div>
                          <div className="text-xs text-slate-400">
                            v{h.version} &bull; {h.activeUsers} users &bull; {h.responseTimeMs > 0 ? `${h.responseTimeMs}ms` : "unreachable"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium text-slate-700">{uptimePct}%</div>
                          <div className="text-[10px] text-slate-400">
                            {timeAgo(h.lastChecked)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Recent Deployments */}
            <div className="table-container">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Rocket size={14} className="text-nexus-500" />
                  Recent Deployments
                </h2>
                <a href="/deployments" className="text-xs text-nexus-600 hover:text-nexus-700 flex items-center gap-1">
                  View all <ArrowRight size={11} />
                </a>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Version</th>
                    <th>Deployed By</th>
                    <th>Status</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                    : (s.recentDeployments.length > 0 ? s.recentDeployments : EMPTY_STATS.recentDeployments).map((d) => (
                      <tr key={d.id}>
                        <td className="font-medium text-slate-800">{d.organizationName}</td>
                        <td>
                          <span className="font-mono text-xs text-nexus-700 bg-nexus-50 px-1.5 py-0.5 rounded">
                            v{d.releaseVersion}
                          </span>
                        </td>
                        <td className="text-slate-500 text-xs">{(d.deployedBy ?? "—").split("@")[0]}</td>
                        <td>
                          <span className={deploymentStatusBadge(d.status)}>
                            {d.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="text-slate-400 text-xs">{timeAgo(d.startedAt)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT column — 40% */}
          <div className="xl:col-span-2 space-y-5">

            {/* Deployments by Status donut */}
            <div className="card px-5 pt-4 pb-3">
              <h2 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
                <Activity size={14} className="text-nexus-500" />
                Deployments by Status
              </h2>
              {loading ? (
                <div className="h-40 bg-slate-100 animate-pulse rounded-lg mt-2" />
              ) : (
                <>
                  <DeploymentDonut
                    healthy={s.healthyDeployments}
                    degraded={s.degradedDeployments}
                    offline={s.offlineDeployments}
                  />
                  <div className="flex items-center justify-center gap-4 mt-1 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      Healthy ({s.healthyDeployments})
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Degraded ({s.degradedDeployments})
                    </span>
                    <span className="flex items-center gap-1.5 text-red-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                      Offline ({s.offlineDeployments})
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* License Alerts */}
            <div className="card">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-amber-500" />
                  License Alerts
                </h2>
                <a href="/licenses" className="text-xs text-nexus-600 hover:text-nexus-700 flex items-center gap-1">
                  All licenses <ArrowRight size={11} />
                </a>
              </div>
              <div className="divide-y divide-slate-50">
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-5 py-3 flex items-center gap-3 animate-pulse">
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-slate-200 rounded w-2/3" />
                        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                      </div>
                      <div className="h-7 w-14 bg-slate-200 rounded-lg" />
                    </div>
                  ))
                  : (licenseAlerts.length > 0 ? licenseAlerts : EMPTY_STATS.licenseAlerts).map((lic) => {
                    const days = daysUntilExpiry(lic.expiryDate);
                    const isExpired = days !== null && days < 0;
                    const badgeClass = isExpired ? "badge badge-red" : "badge badge-yellow";
                    return (
                      <div key={lic.id} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{lic.moduleName}</div>
                          <div className="text-xs text-slate-400 truncate">{lic.organizationName}</div>
                          <div className="mt-0.5">
                            <span className={badgeClass}>
                              {isExpired
                                ? `Expired ${Math.abs(days!)}d ago`
                                : days !== null
                                  ? `${days}d remaining`
                                  : "Expiry unknown"}
                            </span>
                          </div>
                        </div>
                        <a
                          href={`/licenses?org=${lic.organizationId}`}
                          className="btn-secondary text-xs py-1 px-2.5 shrink-0"
                        >
                          Renew
                        </a>
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card px-5 pt-4 pb-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-nexus-500" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="/licenses/issue"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200
                             hover:border-nexus-300 hover:bg-nexus-50 transition-all group text-center"
                >
                  <span className="w-8 h-8 rounded-lg bg-nexus-100 group-hover:bg-nexus-200 flex items-center justify-center transition-colors">
                    <ShieldCheck size={15} className="text-nexus-600" />
                  </span>
                  <span className="text-xs font-medium text-slate-700">Issue License</span>
                </a>
                <a
                  href="/releases/new"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200
                             hover:border-emerald-300 hover:bg-emerald-50 transition-all group text-center"
                >
                  <span className="w-8 h-8 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                    <Rocket size={15} className="text-emerald-600" />
                  </span>
                  <span className="text-xs font-medium text-slate-700">Push Release</span>
                </a>
                <a
                  href="/organizations/new"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200
                             hover:border-blue-300 hover:bg-blue-50 transition-all group text-center"
                >
                  <span className="w-8 h-8 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                    <Plus size={15} className="text-blue-600" />
                  </span>
                  <span className="text-xs font-medium text-slate-700">Add Organization</span>
                </a>
                <a
                  href="/audit"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200
                             hover:border-purple-300 hover:bg-purple-50 transition-all group text-center"
                >
                  <span className="w-8 h-8 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
                    <Eye size={15} className="text-purple-600" />
                  </span>
                  <span className="text-xs font-medium text-slate-700">View Audit Log</span>
                </a>
              </div>
            </div>

            {/* Release Status */}
            <div className="card px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Rocket size={14} className="text-nexus-500" />
                Latest Release
              </h2>
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-7 bg-slate-200 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-slate-900 font-mono">
                      v{s.latestReleaseVersion}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge badge-green">STABLE</span>
                      <span className="text-xs text-slate-400">{formatDate(new Date())}</span>
                    </div>
                  </div>
                  <a
                    href="/releases"
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <ArrowRight size={12} />
                    Releases
                  </a>
                </div>
              )}
              {!loading && s.deploymentsPendingUpdate > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-amber-600">
                  <AlertTriangle size={12} />
                  {s.deploymentsPendingUpdate} deployment{s.deploymentsPendingUpdate !== 1 ? "s" : ""} not on latest
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Recent Audit Activity ──────────────────────────────────────── */}
        <div className="table-container">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Eye size={14} className="text-nexus-500" />
              Recent Audit Activity
            </h2>
            <a href="/audit" className="text-xs text-nexus-600 hover:text-nexus-700 flex items-center gap-1">
              Full audit trail <ArrowRight size={11} />
            </a>
          </div>
          <table>
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Organization</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                : (audit.length > 0 ? audit : []).slice(0, 8).map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-nexus-100 text-nexus-700 text-[10px] font-bold
                                         flex items-center justify-center uppercase shrink-0">
                          {entry.actor.slice(0, 2)}
                        </span>
                        <span className="text-xs font-medium text-slate-700">{entry.actor}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {entry.action}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs">{entry.entityType}</td>
                    <td className="text-slate-500 text-xs">{entry.organizationName ?? <span className="text-slate-300">—</span>}</td>
                    <td>
                      <span className={auditStatusBadge(entry.status)}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="text-slate-400 text-xs">{timeAgo(entry.timestamp)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
