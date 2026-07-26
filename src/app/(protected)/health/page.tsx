"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Globe,
  Database,
  Server,
  Wifi,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { organizationService } from "@/services/controlcenter.service";
import { timeAgo } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type ServiceStatus = "UP" | "DOWN" | "DEGRADED";
type OverallStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

interface DeploymentHealth {
  id: string;
  organizationId: string;
  organizationName: string;
  environment: string;
  backendStatus: ServiceStatus;
  databaseStatus: ServiceStatus;
  redisStatus: ServiceStatus;
  version: string;
  uptimeHours: number;
  responseTimeMs: number;
  activeUsers: number;
  lastChecked: string;
  uptime: number;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  affectedOrgs: string[];
  startedAt: string;
  status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
}

// ─── Generate deterministic timeline per org ──────────────────────────────────
type TimelinePoint = { hour: string; backend: number; database: number; redis: number };

// ─── Derive incidents from degraded/offline orgs ─────────────────────────────
function deriveIncidents(deployments: DeploymentHealth[]): Incident[] {
  return deployments
    .filter((d) => d.backendStatus === "DOWN" || d.backendStatus === "DEGRADED")
    .map((dep) => ({
      id: `inc-${dep.id}`,
      title: dep.backendStatus === "DOWN"
        ? `Instance Offline — ${dep.organizationName}`
        : `Degraded Performance — ${dep.organizationName}`,
      description: dep.backendStatus === "DOWN"
        ? `${dep.organizationName} is not reachable. All services offline. Last seen ${timeAgo(dep.lastChecked)}.`
        : `${dep.organizationName} backend is reporting degraded status. Monitoring in progress.`,
      affectedOrgs: [dep.organizationName],
      startedAt: dep.lastChecked,
      status: (dep.backendStatus === "DOWN" ? "INVESTIGATING" : "MONITORING") as Incident["status"],
    }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOverallStatus(dep: DeploymentHealth): OverallStatus {
  if (dep.backendStatus === "DOWN") return "OFFLINE";
  if (dep.backendStatus === "DEGRADED" || dep.databaseStatus === "DEGRADED" || dep.redisStatus === "DOWN")
    return "DEGRADED";
  return "HEALTHY";
}

function responseColor(ms: number): string {
  if (ms === 0) return "text-slate-400";
  if (ms < 200) return "text-emerald-600";
  if (ms <= 500) return "text-amber-600";
  return "text-red-600";
}

function uptimeBarColor(pct: number): string {
  if (pct >= 99.5) return "bg-emerald-500";
  if (pct >= 99) return "bg-amber-500";
  return "bg-red-500";
}

function ServicePill({ status, label, Icon }: { status: ServiceStatus; label: string; Icon: React.ElementType }) {
  const colors: Record<ServiceStatus, string> = {
    UP: "bg-emerald-100 text-emerald-700",
    DOWN: "bg-red-100 text-red-700",
    DEGRADED: "bg-amber-100 text-amber-700",
  };
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold ${colors[status]}`}>
      <Icon size={11} />
      <span>{label}</span>
    </div>
  );
}

function OverallDot({ status }: { status: OverallStatus }) {
  const config: Record<OverallStatus, { dot: string; text: string; label: string }> = {
    HEALTHY: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Healthy" },
    DEGRADED: { dot: "bg-amber-500 animate-pulse", text: "text-amber-700", label: "Degraded" },
    OFFLINE: { dot: "bg-red-500 animate-pulse", text: "text-red-700", label: "Offline" },
  };
  const c = config[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-full ${c.dot}`} />
      <span className={`text-sm font-semibold ${c.text}`}>{c.label}</span>
    </div>
  );
}

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: "badge badge-green",
  STAGING: "badge badge-yellow",
  DEVELOPMENT: "badge badge-gray",
  LOCAL: "badge badge-gray",
};

const INCIDENT_STATUS_CONFIG = {
  INVESTIGATING: { className: "badge badge-red", label: "Investigating" },
  IDENTIFIED: { className: "badge badge-yellow", label: "Identified" },
  MONITORING: { className: "badge badge-blue", label: "Monitoring" },
  RESOLVED: { className: "badge badge-green", label: "Resolved" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HealthPage() {
  const [deployments, setDeployments] = useState<DeploymentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedDepId, setSelectedDepId] = useState<string>("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await organizationService.getOrgHealth();
      if (Array.isArray(data) && data.length > 0) {
        setDeployments(data as DeploymentHealth[]);
        setSelectedDepId((prev) => (prev && data.find((d) => d.id === prev) ? prev : data[0].id));
      }
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchHealth(), 30000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchHealth]);

  const total = deployments.length;
  const healthy = deployments.filter((d) => getOverallStatus(d) === "HEALTHY").length;
  const degraded = deployments.filter((d) => getOverallStatus(d) === "DEGRADED").length;
  const offline = deployments.filter((d) => getOverallStatus(d) === "OFFLINE").length;
  const globalStatus: OverallStatus = offline > 0 ? "OFFLINE" : degraded > 0 ? "DEGRADED" : "HEALTHY";

  const selectedDep = deployments.find((d) => d.id === selectedDepId) ?? deployments[0];
  // Per-request latency time-series isn't collected from deployments; show an empty chart with a note
  // rather than a synthetic (Math.sin) series presented as measured data. Real per-node CPU/memory/
  // uptime is reported via telemetry and shown on each organization's detail page (Live Instances).
  const chartData: TimelinePoint[] = [];
  const incidents = deriveIncidents(deployments).filter((i) => i.status !== "RESOLVED");

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Activity size={18} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="page-title">System Health</h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <Clock size={11} />
              <span>Last updated {timeAgo(lastUpdated.toISOString())}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors
              ${autoRefresh ? "bg-controlcenter-50 border-controlcenter-300 text-controlcenter-700" : "btn-secondary"}`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-controlcenter-500 animate-pulse" : "bg-slate-300"}`} />
            {autoRefresh ? "Auto (30s)" : "Manual"}
          </button>
          <button onClick={fetchHealth} disabled={loading} className="btn-secondary">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh All
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && deployments.length === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 h-48 animate-pulse bg-slate-50" />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && deployments.length === 0 && (
        <div className="card p-12 flex flex-col items-center justify-center text-center gap-3">
          <Globe size={32} className="text-slate-300" />
          <div className="text-slate-500 font-medium">No organizations found</div>
          <div className="text-xs text-slate-400">Add organizations to start monitoring deployment health.</div>
        </div>
      )}

      {deployments.length > 0 && (
        <>
          {/* ── Global banner ── */}
          {globalStatus === "HEALTHY" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-emerald-800">All systems operational</span>
                <span className="text-xs text-emerald-600 ml-2">All {total} monitored deployments are running normally.</span>
              </div>
            </div>
          )}
          {globalStatus === "DEGRADED" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-amber-800">Partial degradation detected</span>
                <span className="text-xs text-amber-700 ml-2">
                  {degraded} deployment{degraded > 1 ? "s" : ""} reporting degraded performance.
                </span>
              </div>
            </div>
          )}
          {globalStatus === "OFFLINE" && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <XCircle size={18} className="text-red-600 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-red-800">Outage in progress</span>
                <span className="text-xs text-red-700 ml-2">
                  {offline} deployment{offline > 1 ? "s" : ""} offline.
                  {degraded > 0 && ` ${degraded} degraded.`}
                </span>
              </div>
            </div>
          )}

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 text-slate-500"><Globe size={14} /><span className="stat-label">Total Monitored</span></div>
              <span className="stat-value">{total}</span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-emerald-500"><CheckCircle2 size={14} /><span className="stat-label text-slate-500">Healthy</span></div>
              <span className="stat-value text-emerald-600">{healthy}</span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-amber-500"><AlertTriangle size={14} /><span className="stat-label text-slate-500">Degraded</span></div>
              <span className="stat-value text-amber-600">{degraded}</span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-red-500"><XCircle size={14} /><span className="stat-label text-slate-500">Offline</span></div>
              <span className="stat-value text-red-600">{offline}</span>
            </div>
          </div>

          {/* ── Health grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {deployments.map((dep) => {
              const status = getOverallStatus(dep);
              const isSelected = selectedDepId === dep.id;
              return (
                <div
                  key={dep.id}
                  className={`card p-5 space-y-4 cursor-pointer transition-all
                    ${isSelected ? "ring-2 ring-controlcenter-500 ring-offset-1" : "hover:shadow-md"}`}
                  onClick={() => setSelectedDepId(dep.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 truncate">{dep.organizationName}</h3>
                        <span className={ENV_BADGE[dep.environment] ?? "badge badge-gray"}>{dep.environment}</span>
                      </div>
                      <OverallDot status={status} />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">Version</div>
                      <div className="font-mono text-xs font-semibold text-slate-700">
                        {dep.version && dep.version !== "—" ? `v${dep.version}` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <ServicePill status={dep.backendStatus} label="Backend" Icon={Server} />
                    <ServicePill status={dep.databaseStatus} label="Database" Icon={Database} />
                    <ServicePill status={dep.redisStatus} label="Redis" Icon={Wifi} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Response</div>
                      <div className={`text-sm font-bold ${responseColor(dep.responseTimeMs)}`}>
                        {dep.responseTimeMs > 0 ? `${dep.responseTimeMs}ms` : <span className="text-slate-400">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Active Users</div>
                      <div className="text-sm font-bold text-slate-700">{dep.activeUsers}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Last Check</div>
                      <div className="text-xs text-slate-500">{timeAgo(dep.lastChecked)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wide">
                        <TrendingUp size={10} /> Uptime
                      </div>
                      <span className={`text-xs font-semibold ${dep.uptime >= 99.5 ? "text-emerald-600" : dep.uptime >= 99 ? "text-amber-600" : "text-red-600"}`}>
                        {dep.uptime.toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${uptimeBarColor(dep.uptime)}`} style={{ width: `${dep.uptime}%` }} />
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {status === "OFFLINE" ? "Currently offline" : "Monitoring active"}
                    </span>
                    <button
                      className="text-xs text-controlcenter-600 hover:text-controlcenter-700 font-medium flex items-center gap-1 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setSelectedDepId(dep.id); }}
                    >
                      <Zap size={11} />
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Timeline chart ── */}
          {selectedDep && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-controlcenter-600" />
                  <h2 className="text-base font-bold text-slate-900">Response Time — Last 24h</h2>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {deployments.map((dep) => (
                    <button
                      key={dep.id}
                      onClick={() => setSelectedDepId(dep.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                        ${selectedDepId === dep.id ? "bg-controlcenter-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {dep.organizationName.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <Globe size={13} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{selectedDep.organizationName}</span>
                <OverallDot status={getOverallStatus(selectedDep)} />
              </div>
              <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Per-request latency isn&apos;t collected from deployments yet. Real per-node CPU, memory and
                uptime are reported via telemetry — see each organization&apos;s detail page (Live Instances).
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradBackend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b6af8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b6af8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradDatabase" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRedis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(value: number) => [`${value}ms`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <Area type="monotone" dataKey="backend" name="Backend" stroke="#3b6af8" strokeWidth={2} fill="url(#gradBackend)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="database" name="Database" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradDatabase)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="redis" name="Redis" stroke="#10b981" strokeWidth={2} fill="url(#gradRedis)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Incidents ── */}
          {incidents.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">Active Incidents</h2>
                <span className="badge badge-red ml-1">{incidents.length} open</span>
              </div>
              <div className="divide-y divide-slate-100">
                {incidents.map((incident) => {
                  const cfg = INCIDENT_STATUS_CONFIG[incident.status];
                  return (
                    <div key={incident.id} className="px-5 py-4 flex gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cfg.className}>{cfg.label}</span>
                          <h3 className="text-sm font-semibold text-slate-800">{incident.title}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mb-2 leading-relaxed">{incident.description}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {incident.affectedOrgs.map((org) => (
                            <div key={org} className="flex items-center gap-1 text-xs text-slate-500">
                              <Globe size={10} className="text-slate-400" />
                              {org}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Started</div>
                        <div className="text-xs text-slate-600 font-medium">{timeAgo(incident.startedAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
