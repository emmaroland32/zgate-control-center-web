"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  RefreshCw,
} from "lucide-react";

// ─── Mock data shapes ────────────────────────────────────────────────────────
interface SlaTier {
  tier: "Standard" | "Premium" | "Enterprise";
  uptimeTarget: number;
  responseMs: number;
  resolveHours: number;
  credit: string;
}

interface OrgSla {
  organizationId: string;
  organizationName: string;
  tier: SlaTier["tier"];
  uptime30d: number;
  uptime90d: number;
  avgResponseMs: number;
  incidentsOpen: number;
  incidentsLastQuarter: number;
  lastBreach: string | null;
  status: "Compliant" | "At Risk" | "Breach";
}

const TIERS: SlaTier[] = [
  { tier: "Standard", uptimeTarget: 99.5, responseMs: 1500, resolveHours: 24, credit: "5% / month" },
  { tier: "Premium", uptimeTarget: 99.9, responseMs: 800, resolveHours: 8, credit: "15% / month" },
  { tier: "Enterprise", uptimeTarget: 99.99, responseMs: 400, resolveHours: 4, credit: "25% / month" },
];

const ORG_SLA: OrgSla[] = [
  { organizationId: "o1", organizationName: "Centrus Bank", tier: "Enterprise", uptime30d: 99.997, uptime90d: 99.991, avgResponseMs: 312, incidentsOpen: 0, incidentsLastQuarter: 1, lastBreach: null, status: "Compliant" },
  { organizationId: "o2", organizationName: "Equity Holdings", tier: "Premium", uptime30d: 99.94, uptime90d: 99.88, avgResponseMs: 720, incidentsOpen: 0, incidentsLastQuarter: 2, lastBreach: "2024-02-12", status: "At Risk" },
  { organizationId: "o3", organizationName: "NBK Capital", tier: "Premium", uptime30d: 99.81, uptime90d: 99.65, avgResponseMs: 1240, incidentsOpen: 1, incidentsLastQuarter: 4, lastBreach: "2024-04-09", status: "Breach" },
  { organizationId: "o4", organizationName: "Stanbic Tanzania", tier: "Standard", uptime30d: 99.78, uptime90d: 99.71, avgResponseMs: 1080, incidentsOpen: 0, incidentsLastQuarter: 1, lastBreach: null, status: "Compliant" },
  { organizationId: "o5", organizationName: "Co-op MutualFund", tier: "Standard", uptime30d: 99.4, uptime90d: 99.32, avgResponseMs: 2100, incidentsOpen: 1, incidentsLastQuarter: 5, lastBreach: "2024-04-20", status: "Breach" },
];

const INCIDENT_TIMELINE = [
  { id: "INC-001", organizationName: "NBK Capital", title: "Database read replica lag", status: "Investigating", startedAt: "2024-04-26 09:42 UTC", severity: "High" as const },
  { id: "INC-002", organizationName: "Co-op MutualFund", title: "API 5xx errors on fund-pricing endpoint", status: "Identified", startedAt: "2024-04-25 23:11 UTC", severity: "Medium" as const },
  { id: "INC-003", organizationName: "Equity Holdings", title: "Elevated latency on auth service", status: "Monitoring", startedAt: "2024-04-25 14:01 UTC", severity: "Low" as const },
];

const tierColor: Record<SlaTier["tier"], string> = {
  Standard: "bg-slate-100 text-slate-800",
  Premium: "bg-blue-100 text-blue-800",
  Enterprise: "bg-purple-100 text-purple-800",
};

const statusColor: Record<OrgSla["status"], string> = {
  Compliant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "At Risk": "bg-amber-100 text-amber-700 border-amber-200",
  Breach: "bg-rose-100 text-rose-700 border-rose-200",
};

const severityColor: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-rose-100 text-rose-700 border-rose-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-blue-100 text-blue-700 border-blue-200",
};

const targetForTier = (tier: SlaTier["tier"]) =>
  TIERS.find((t) => t.tier === tier)?.uptimeTarget ?? 99.5;

export default function SlaPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-12 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  const totalCompliant = ORG_SLA.filter((o) => o.status === "Compliant").length;
  const atRisk = ORG_SLA.filter((o) => o.status === "At Risk").length;
  const inBreach = ORG_SLA.filter((o) => o.status === "Breach").length;
  const avgUptime = (ORG_SLA.reduce((s, o) => s + o.uptime30d, 0) / ORG_SLA.length).toFixed(3);

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">SLA Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Per-tenant uptime, response, and incident posture against contractual targets.
          </p>
        </div>
        <button className="btn-secondary" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 mb-2">
            <ShieldCheck size={18} className="text-emerald-600" />
          </div>
          <div className="stat-value">{totalCompliant}</div>
          <div className="stat-label">Compliant tenants</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 mb-2">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="stat-value">{atRisk}</div>
          <div className="stat-label">At risk</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-50 mb-2">
            <TrendingDown size={18} className="text-rose-600" />
          </div>
          <div className="stat-value">{inBreach}</div>
          <div className="stat-label">In breach</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 mb-2">
            <Activity size={18} className="text-blue-600" />
          </div>
          <div className="stat-value">{avgUptime}%</div>
          <div className="stat-label">Avg uptime (30d)</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">SLA Tiers</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-5 py-2">Tier</th>
              <th className="px-5 py-2">Uptime target</th>
              <th className="px-5 py-2">P95 response</th>
              <th className="px-5 py-2">Resolution</th>
              <th className="px-5 py-2">Credit on breach</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {TIERS.map((t) => (
              <tr key={t.tier} className="border-t border-slate-100">
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tierColor[t.tier]}`}>
                    {t.tier}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono">{t.uptimeTarget}%</td>
                <td className="px-5 py-3 font-mono">≤ {t.responseMs} ms</td>
                <td className="px-5 py-3 font-mono">≤ {t.resolveHours} h</td>
                <td className="px-5 py-3 text-slate-600">{t.credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Tenant SLA Status</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-5 py-2">Tenant</th>
              <th className="px-5 py-2">Tier</th>
              <th className="px-5 py-2 text-right">Uptime 30d</th>
              <th className="px-5 py-2 text-right">Uptime 90d</th>
              <th className="px-5 py-2 text-right">Avg P95</th>
              <th className="px-5 py-2 text-right">Open</th>
              <th className="px-5 py-2 text-right">Quarter</th>
              <th className="px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {ORG_SLA.map((o) => {
              const target = targetForTier(o.tier);
              const meetTarget = o.uptime30d >= target;
              return (
                <tr key={o.organizationId} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-slate-800">{o.organizationName}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tierColor[o.tier]}`}>
                      {o.tier}
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-right font-mono ${meetTarget ? "" : "text-rose-600 font-semibold"}`}>
                    {o.uptime30d.toFixed(3)}%
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{o.uptime90d.toFixed(2)}%</td>
                  <td className="px-5 py-3 text-right font-mono">{o.avgResponseMs} ms</td>
                  <td className={`px-5 py-3 text-right font-mono ${o.incidentsOpen > 0 ? "text-rose-600 font-semibold" : ""}`}>
                    {o.incidentsOpen}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{o.incidentsLastQuarter}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Active Incidents</h2>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={12} /> Live
          </span>
        </div>
        {INCIDENT_TIMELINE.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            All systems operational.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {INCIDENT_TIMELINE.map((i) => (
              <li key={i.id} className="px-5 py-4 flex items-start gap-4">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border h-fit ${severityColor[i.severity]}`}>
                  {i.severity}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{i.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {i.organizationName} · started {i.startedAt}
                  </div>
                </div>
                <span className="text-xs text-slate-500">{i.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
