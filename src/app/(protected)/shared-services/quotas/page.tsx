"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Cpu,
  Search,
  AlertTriangle,
  TrendingUp,
  Building2,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";

interface ServiceQuota {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  organizationId: string;
  organizationName: string;
  monthlyQuota: number;
  used: number;
  remaining: number;
  utilisationPct: number;
  resetsOn: string;
  hardCap: boolean;
}

const QUOTAS: ServiceQuota[] = [
  { serviceId: "svc-nin", serviceName: "NIN Lookup", serviceCode: "NIN_LOOKUP", organizationId: "o1", organizationName: "Centrus Bank", monthlyQuota: 50_000, used: 41_209, remaining: 8_791, utilisationPct: 82.4, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-bvn", serviceName: "BVN Verification", serviceCode: "BVN_VERIFY", organizationId: "o1", organizationName: "Centrus Bank", monthlyQuota: 100_000, used: 67_800, remaining: 32_200, utilisationPct: 67.8, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-ofac", serviceName: "OFAC Screening", serviceCode: "OFAC_SCREEN", organizationId: "o1", organizationName: "Centrus Bank", monthlyQuota: 25_000, used: 24_870, remaining: 130, utilisationPct: 99.5, resetsOn: "2024-05-01", hardCap: false },
  { serviceId: "svc-nin", serviceName: "NIN Lookup", serviceCode: "NIN_LOOKUP", organizationId: "o2", organizationName: "Equity Holdings", monthlyQuota: 30_000, used: 11_452, remaining: 18_548, utilisationPct: 38.2, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-credit", serviceName: "Credit Bureau", serviceCode: "CRED_BUREAU", organizationId: "o2", organizationName: "Equity Holdings", monthlyQuota: 5_000, used: 5_000, remaining: 0, utilisationPct: 100, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-ofac", serviceName: "OFAC Screening", serviceCode: "OFAC_SCREEN", organizationId: "o3", organizationName: "NBK Capital", monthlyQuota: 10_000, used: 9_120, remaining: 880, utilisationPct: 91.2, resetsOn: "2024-05-01", hardCap: false },
  { serviceId: "svc-sms", serviceName: "SMS Notifications", serviceCode: "SMS_OUT", organizationId: "o4", organizationName: "Stanbic Tanzania", monthlyQuota: 200_000, used: 178_400, remaining: 21_600, utilisationPct: 89.2, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-sms", serviceName: "SMS Notifications", serviceCode: "SMS_OUT", organizationId: "o5", organizationName: "Co-op MutualFund", monthlyQuota: 50_000, used: 12_400, remaining: 37_600, utilisationPct: 24.8, resetsOn: "2024-05-01", hardCap: true },
  { serviceId: "svc-fraud", serviceName: "Fraud Risk Score", serviceCode: "FRAUD_SCORE", organizationId: "o5", organizationName: "Co-op MutualFund", monthlyQuota: 80_000, used: 81_120, remaining: 0, utilisationPct: 101.4, resetsOn: "2024-05-01", hardCap: false },
];

const formatNum = (n: number) => n.toLocaleString();

export default function QuotasPage() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("ALL");
  const [warnOnly, setWarnOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 200);
    return () => clearTimeout(t);
  }, []);

  const orgOptions = useMemo(
    () => Array.from(new Map(QUOTAS.map((q) => [q.organizationId, q.organizationName])).entries()),
    [],
  );

  const filtered = useMemo(() => {
    return QUOTAS.filter((q) => {
      const matchSearch =
        !search ||
        q.serviceName.toLowerCase().includes(search.toLowerCase()) ||
        q.serviceCode.toLowerCase().includes(search.toLowerCase()) ||
        q.organizationName.toLowerCase().includes(search.toLowerCase());
      const matchOrg = orgFilter === "ALL" || q.organizationId === orgFilter;
      const matchWarn = !warnOnly || q.utilisationPct >= 80;
      return matchSearch && matchOrg && matchWarn;
    });
  }, [search, orgFilter, warnOnly]);

  const breached = QUOTAS.filter((q) => q.utilisationPct >= 100).length;
  const warning = QUOTAS.filter((q) => q.utilisationPct >= 80 && q.utilisationPct < 100).length;
  const totalCalls = QUOTAS.reduce((s, q) => s + q.used, 0);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-12 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/shared-services"
        className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
      >
        <ChevronLeft size={12} /> Back to Service Catalog
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Shared-Service Quotas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Per-tenant monthly call limits, current usage, and overage status.
          </p>
        </div>
        <button className="btn-secondary" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 mb-2">
            <Cpu size={18} className="text-blue-600" />
          </div>
          <div className="stat-value">{QUOTAS.length}</div>
          <div className="stat-label">Active subscriptions</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 mb-2">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="stat-value">{warning}</div>
          <div className="stat-label">Warning (≥80%)</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-50 mb-2">
            <AlertTriangle size={18} className="text-rose-600" />
          </div>
          <div className="stat-value">{breached}</div>
          <div className="stat-label">Over quota</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 mb-2">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="stat-value font-mono text-base">{formatNum(totalCalls)}</div>
          <div className="stat-label">Calls this month</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Subscriptions</h2>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                className="input pl-8"
                placeholder="Search service or tenant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search quotas"
              />
            </div>
            <select
              className="select"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Filter by tenant"
            >
              <option value="ALL">All tenants</option>
              {orgOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <label className="text-xs text-slate-600 flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={warnOnly}
                onChange={(e) => setWarnOnly(e.target.checked)}
              />
              Warning &amp; over-quota only
            </label>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left">
            <tr>
              <th className="px-5 py-2">Service</th>
              <th className="px-5 py-2">Tenant</th>
              <th className="px-5 py-2 text-right">Quota</th>
              <th className="px-5 py-2 text-right">Used</th>
              <th className="px-5 py-2 text-right">Remaining</th>
              <th className="px-5 py-2 w-40">Utilisation</th>
              <th className="px-5 py-2">Resets</th>
              <th className="px-5 py-2">Behaviour</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                  No quotas match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((q, i) => {
                const breach = q.utilisationPct >= 100;
                const warn = q.utilisationPct >= 80 && q.utilisationPct < 100;
                return (
                  <tr key={`${q.serviceId}-${q.organizationId}-${i}`} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{q.serviceName}</div>
                      <div className="text-xs text-slate-500 font-mono">{q.serviceCode}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/organizations/${q.organizationId}`}
                        className="text-slate-700 hover:text-controlcenter-700 inline-flex items-center gap-1"
                      >
                        <Building2 size={11} />
                        {q.organizationName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{formatNum(q.monthlyQuota)}</td>
                    <td className="px-5 py-3 text-right font-mono">{formatNum(q.used)}</td>
                    <td className={`px-5 py-3 text-right font-mono ${breach ? "text-rose-600" : warn ? "text-amber-600" : ""}`}>
                      {formatNum(q.remaining)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded bg-slate-200">
                          <div
                            className={`h-1.5 rounded ${
                              breach ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(q.utilisationPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-12 text-right">{q.utilisationPct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{q.resetsOn}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                          q.hardCap
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {q.hardCap ? "Hard cap" : "Soft (overage billed)"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
