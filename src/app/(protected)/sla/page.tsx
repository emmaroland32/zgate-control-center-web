"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gauge, ChevronDown, ChevronRight } from "lucide-react";
import { fleetService, apiError, OrgSla } from "@/services/controlcenter.service";

const WINDOWS = [7, 30, 90] as const;

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtDuration = (seconds: number) => {
  if (seconds >= 86400) return `${(seconds / 86400).toFixed(1)} d`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

const uptimeTone = (pct: number | null) =>
  pct == null ? "text-slate-400"
  : pct >= 99.9 ? "text-emerald-600"
  : pct >= 99.0 ? "text-amber-600"
  : "text-red-600";

export default function SlaPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [rows, setRows] = useState<OrgSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fleetService.sla(windowDays)
      .then(setRows)
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [windowDays]);

  const tracked = rows.filter((r) => r.tracked);
  const fleetUptime = tracked.length
    ? tracked.reduce((sum, r) => sum + (r.uptimePct ?? 0), 0) / tracked.length
    : null;
  const totalIncidents = tracked.reduce((sum, r) => sum + r.incidentCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gauge className="h-6 w-6 text-controlcenter-600" /> SLA Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Evidence-based uptime per customer, computed from recorded outages (telemetry silence past the
            offline threshold). Air-gapped installs that never phone home are shown as untracked, not as 100%.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              className={w === windowDays ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"}
              onClick={() => setWindowDays(w)}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tracked orgs" value={tracked.length} />
        <Stat label="Untracked (no telemetry)" value={rows.length - tracked.length} />
        <Stat label={`Fleet uptime (${windowDays}d avg)`}
              value={fleetUptime == null ? "—" : `${fleetUptime.toFixed(3)}%`}
              tone={uptimeTone(fleetUptime)} />
        <Stat label="Incidents" value={totalIncidents} tone={totalIncidents ? "text-amber-600" : undefined} />
      </div>

      <div className="card p-5">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-slate-500">No organizations yet.</p>
        )}
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.organizationId} className="border border-slate-200 rounded-lg">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpanded(expanded === r.organizationId ? null : r.organizationId)}
              >
                {expanded === r.organizationId
                  ? <ChevronDown className="h-4 w-4 text-slate-400" />
                  : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-medium text-slate-900">{r.orgName}</span>
                {!r.tracked && <span className="badge badge-gray">NO TELEMETRY</span>}
                <span className="ml-auto text-xs text-slate-500">
                  {r.incidentCount} incident{r.incidentCount === 1 ? "" : "s"}
                </span>
                <span className={`font-mono font-semibold ${uptimeTone(r.uptimePct)}`}>
                  {r.uptimePct == null ? "—" : `${r.uptimePct.toFixed(3)}%`}
                </span>
              </div>
              {expanded === r.organizationId && (
                <div className="border-t border-slate-100 px-4 py-3 text-sm">
                  {!r.tracked && (
                    <p className="text-slate-500">
                      This org has never sent telemetry, so there is no liveness evidence either way.
                    </p>
                  )}
                  {r.tracked && r.incidents.length === 0 && (
                    <p className="text-emerald-700">No recorded outages in the last {windowDays} days.</p>
                  )}
                  {r.incidents.map((i, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-0.5">
                      <span className="badge badge-red">OUTAGE</span>
                      <span>{fmtDate(i.startedAt)} → {fmtDate(i.endedAt)}</span>
                      <span className="text-xs text-slate-500">({fmtDuration(i.durationSeconds)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Resolution: an org counts as down only after the offline threshold (default 15 min of silence), so
        brief blips don&apos;t register. History reaches back to when fleet liveness tracking was enabled.
      </p>
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
