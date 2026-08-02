"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Gauge, Search, RefreshCw, ChevronLeft, AlertTriangle } from "lucide-react";
import { sharedServicesCatalog, apiError } from "@/services/controlcenter.service";

type QuotaRow = {
  organizationId: string; orgName: string; serviceId: string; serviceName: string;
  callLimit: number | null; usedThisMonth: number; usedPct: number | null;
};

const pctTone = (pct: number | null) =>
  pct == null ? "text-slate-400"
  : pct >= 100 ? "text-red-600"
  : pct >= 80 ? "text-amber-600"
  : "text-emerald-600";

const barTone = (pct: number | null) =>
  pct == null ? "bg-slate-200"
  : pct >= 100 ? "bg-red-500"
  : pct >= 80 ? "bg-amber-500"
  : "bg-emerald-500";

export default function ServiceQuotasPage() {
  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = () => {
    setLoading(true);
    sharedServicesCatalog.quotas()
      .then(setRows)
      .catch((e: unknown) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.orgName.toLowerCase().includes(q) || r.serviceName.toLowerCase().includes(q));
  }, [rows, query]);

  const overLimit = rows.filter((r) => (r.usedPct ?? 0) >= 100).length;
  const nearLimit = rows.filter((r) => (r.usedPct ?? 0) >= 80 && (r.usedPct ?? 0) < 100).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/shared-services" className="text-xs text-controlcenter-600 hover:underline flex items-center gap-1 mb-1">
            <ChevronLeft className="h-3 w-3" /> Service Catalog
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gauge className="h-6 w-6 text-controlcenter-600" /> Service Quotas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Current-month API usage against each enabled subscription&apos;s call limit. Unmetered
            subscriptions (no limit) are listed but never flagged.
          </p>
        </div>
        <button className="btn-secondary flex items-center gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Enabled subscriptions" value={loading ? "—" : rows.length} />
        <Stat label="Metered" value={loading ? "—" : rows.filter((r) => r.callLimit != null).length} />
        <Stat label="Near limit (≥80%)" value={loading ? "—" : nearLimit} tone={nearLimit ? "text-amber-600" : undefined} />
        <Stat label="Over limit" value={loading ? "—" : overLimit} tone={overLimit ? "text-red-600" : undefined} />
      </div>

      {overLimit > 0 && (
        <div className="card p-4 border-red-200 bg-red-50/60 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {overLimit} subscription{overLimit === 1 ? " is" : "s are"} over the monthly call limit —
          overage is billed at the service&apos;s per-call rate on the next invoice.
        </div>
      )}

      <div className="card p-5">
        <div className="relative mb-3 w-full md:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input pl-9 w-full"
            placeholder="Filter by organization or service…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Organization</th><th>Service</th><th>Used (this month)</th><th>Limit</th><th className="w-56">Utilisation</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.organizationId}-${r.serviceId}`}>
                  <td className="font-medium">
                    <Link className="text-controlcenter-600 hover:underline" href={`/organizations/${r.organizationId}`}>
                      {r.orgName}
                    </Link>
                  </td>
                  <td>{r.serviceName}</td>
                  <td className="font-mono">{r.usedThisMonth.toLocaleString()}</td>
                  <td className="font-mono">{r.callLimit == null ? <span className="badge badge-gray">unmetered</span> : r.callLimit.toLocaleString()}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barTone(r.usedPct)}`}
                             style={{ width: `${Math.min(100, r.usedPct ?? 0)}%` }} />
                      </div>
                      <span className={`text-xs font-semibold w-14 text-right ${pctTone(r.usedPct)}`}>
                        {r.usedPct == null ? "—" : `${r.usedPct.toFixed(1)}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-6">
                  {rows.length === 0 ? "No enabled service subscriptions yet." : "Nothing matches the filter."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}
