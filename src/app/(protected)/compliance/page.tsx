"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, ShieldAlert, Building2, Check } from "lucide-react";
import { toast } from "sonner";
import { telemetryService, organizationService } from "@/services/controlcenter.service";
import { timeAgo } from "@/lib/utils";

// Friendly labels + colours for each licensing anomaly the backend raises.
const CODE_META: Record<string, { label: string; badge: string }> = {
  VERSION_BEYOND_ENTITLEMENT: { label: "Over-version", badge: "badge-red" },
  RUNNING_WHILE_UNENTITLED: { label: "Running unpaid", badge: "badge-red" },
  FINGERPRINT_MISMATCH: { label: "Copied license", badge: "badge-purple" },
  MULTIPLE_INSTANCES: { label: "Over-deployed", badge: "badge-purple" },
  HA_NOT_ENTITLED: { label: "HA not entitled", badge: "badge-yellow" },
  FAILOVER_NOT_ENTITLED: { label: "Failover not entitled", badge: "badge-yellow" },
};
const meta = (code?: string) =>
  (code && CODE_META[code]) || { label: code ?? "Anomaly", badge: "badge-gray" };

interface TelemetryEvent {
  id: string;
  organizationId: string;
  errorCode?: string;
  message?: string;
  appVersion?: string;
  occurredAt: string;
}
interface Summary {
  total: number;
  affectedOrgs: number;
  byCode: Record<string, number>;
  recent: TelemetryEvent[];
}

export default function CompliancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      telemetryService.licenseSummary(),
      organizationService.getAll().catch(() => [] as { id: string; name: string }[]),
    ])
      .then(([s, orgs]: [Summary, { id: string; name: string }[]]) => {
        setSummary(s);
        setOrgNames(Object.fromEntries((orgs ?? []).map((o) => [o.id, o.name])));
        setError(null);
      })
      .catch(() => setError("Could not load compliance data. Backend may be unavailable."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  async function acknowledge(id: string) {
    setAcking(id);
    try {
      await telemetryService.acknowledge(id);
      setSummary((s) => (s ? { ...s, recent: s.recent.filter((e) => e.id !== id) } : s));
      toast.success("Anomaly acknowledged");
    } catch {
      toast.error("Could not acknowledge. Check your permissions.");
    } finally {
      setAcking(null);
    }
  }

  const cards = useMemo(() => {
    const by = summary?.byCode ?? {};
    return Object.keys(CODE_META)
      .map((code) => ({ code, count: by[code] ?? 0 }))
      .filter((c) => c.count > 0);
  }, [summary]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-controlcenter-100 rounded-lg flex items-center justify-center">
            <ShieldAlert size={20} className="text-controlcenter-600" />
          </div>
          <div>
            <h1 className="page-title">License Compliance</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Open licensing anomalies across the fleet — evidence to true-up or enforce.
            </p>
          </div>
        </div>
        <button className="btn-secondary text-xs" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="card p-6 text-sm text-rose-700 bg-rose-50 border border-rose-200">{error}</div>
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-value">{summary?.total ?? "—"}</div>
          <div className="stat-label">Open anomalies</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summary?.affectedOrgs ?? "—"}</div>
          <div className="stat-label">Affected organizations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {(summary?.byCode?.MULTIPLE_INSTANCES ?? 0) + (summary?.byCode?.FINGERPRINT_MISMATCH ?? 0)}
          </div>
          <div className="stat-label">Copied / over-deployed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {(summary?.byCode?.HA_NOT_ENTITLED ?? 0) + (summary?.byCode?.FAILOVER_NOT_ENTITLED ?? 0)}
          </div>
          <div className="stat-label">Topology over-tier</div>
        </div>
      </div>

      {/* Per-type breakdown */}
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cards.map(({ code, count }) => (
            <span key={code} className={`badge ${meta(code).badge} gap-1.5`}>
              {meta(code).label}
              <span className="font-bold">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Feed */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Recent anomalies</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-slate-100 rounded-md" />
            ))}
          </div>
        ) : !summary?.recent?.length ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No open licensing anomalies. Fleet is compliant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 text-left">
              <tr>
                <th className="px-5 py-2">Organization</th>
                <th className="px-5 py-2">Anomaly</th>
                <th className="px-5 py-2">Detail</th>
                <th className="px-5 py-2">When</th>
                <th className="px-5 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="px-5 py-3">
                    <Link
                      href={`/organizations/${e.organizationId}`}
                      className="inline-flex items-center gap-1.5 text-controlcenter-700 hover:underline"
                    >
                      <Building2 size={12} />
                      {orgNames[e.organizationId] ?? `${e.organizationId.slice(0, 8)}…`}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${meta(e.errorCode).badge}`}>{meta(e.errorCode).label}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 max-w-md">{e.message}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">{timeAgo(e.occurredAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => acknowledge(e.id)}
                      disabled={acking === e.id}
                    >
                      <Check size={12} /> {acking === e.id ? "…" : "Ack"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
