/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HardDriveDownload, ShieldCheck, Database, CheckCircle2, XCircle, Save } from "lucide-react";
import { backupService, organizationService, apiError } from "@/services/controlcenter.service";

type Org = { id: string; name: string };
type Plan = {
  enabled: boolean; storageQuotaGb: number; retentionDays: number;
  maxRetainedBackups: number | null; pricePerMonth: number; pricePerGbMonth: number;
  currency: string; subscriptionValidUntil: string | null;
};
type Usage = { usedBytes: number; quotaBytes: number; completedCount: number; active: boolean; estimatedMonthlyCharge: number; currency: string };
type Stats = { plans: number; activePlans: number; backups: number; completed: number; failed: number; totalStoredBytes: number };
type BackupRec = { id: string; label?: string; status: string; sizeBytes?: number; createdAt?: string; expiresAt?: string; nodeId?: string; clientEncrypted?: boolean; verified?: boolean };

const GIB = 1024 ** 3;
const gib = (b?: number | null) => ((b ?? 0) / GIB).toFixed(2);
const fmtBytes = (b?: number | null) => {
  const n = b ?? 0;
  if (n >= GIB) return `${(n / GIB).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
};
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString() : "—");
const statusBadge = (s: string) =>
  s === "COMPLETED" ? "badge badge-green" : s === "FAILED" ? "badge badge-red"
  : s === "INITIATED" ? "badge badge-blue" : s === "EXPIRED" ? "badge badge-gray" : "badge badge-yellow";

const EMPTY_PLAN: Plan = {
  enabled: true, storageQuotaGb: 50, retentionDays: 30, maxRetainedBackups: null,
  pricePerMonth: 25, pricePerGbMonth: 0.05, currency: "USD", subscriptionValidUntil: null,
};

export default function BackupsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [hasPlan, setHasPlan] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [backups, setBackups] = useState<BackupRec[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    backupService.stats().then((s) => setStats(s as Stats)).catch((e) => toast.error(apiError(e)));
    organizationService.getAll()
      .then((list: any) => setOrgs((Array.isArray(list) ? list : []).map((o: any) => ({ id: o.id, name: o.name }))))
      .catch((e) => toast.error(apiError(e)));
  }, []);

  useEffect(() => {
    if (!orgId) { setUsage(null); setBackups([]); setPlan(EMPTY_PLAN); setHasPlan(false); return; }
    backupService.getPlan(orgId).then((p: any) => {
      if (p) { setPlan({ ...EMPTY_PLAN, ...p }); setHasPlan(true); }
      else { setPlan(EMPTY_PLAN); setHasPlan(false); }
    }).catch(() => { setPlan(EMPTY_PLAN); setHasPlan(false); });
    backupService.usage(orgId).then((u) => setUsage(u as Usage)).catch(() => setUsage(null));
    backupService.forOrg(orgId).then((b: any) => setBackups(Array.isArray(b) ? b : [])).catch(() => setBackups([]));
  }, [orgId]);

  async function savePlan() {
    if (!orgId) return;
    setSaving(true);
    try {
      const saved = await backupService.updatePlan(orgId, plan);
      setPlan({ ...EMPTY_PLAN, ...(saved as any) });
      setHasPlan(true);
      backupService.usage(orgId).then((u) => setUsage(u as Usage)).catch(() => {});
      backupService.stats().then((s) => setStats(s as Stats)).catch(() => {});
    } catch (e) {
      toast.error(apiError(e, "Failed to save backup plan"));
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }));
  const usedPct = useMemo(() => {
    if (!usage || !usage.quotaBytes) return 0;
    return Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100));
  }, [usage]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <HardDriveDownload className="h-6 w-6 text-controlcenter-600" /> Cloud Backups
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Managed, zero-knowledge database backups for ZGATE deployments. Instances encrypt their dump before
          upload — you gate, meter, and bill it without ever being able to read the data.
        </p>
      </div>

      {/* Fleet stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Subscriptions" value={stats?.plans ?? "—"} />
        <Stat label="Active" value={stats?.activePlans ?? "—"} />
        <Stat label="Backups" value={stats?.backups ?? "—"} />
        <Stat label="Completed" value={stats?.completed ?? "—"} />
        <Stat label="Failed" value={stats?.failed ?? "—"} />
        <Stat label="Stored" value={stats ? `${gib(stats.totalStoredBytes)} GB` : "—"} />
      </div>

      {/* Org picker */}
      <div className="card p-5">
        <label className="text-xs font-medium text-slate-500">Organization</label>
        <select
          className="mt-1 w-full md:w-96 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="">Select an organization…</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {orgId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plan editor */}
          <div className="card p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Backup subscription {hasPlan ? "" : "(not provisioned)"}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={plan.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                Enabled
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Storage quota (GB)">
                <input type="number" className="inp" value={plan.storageQuotaGb}
                  onChange={(e) => set({ storageQuotaGb: Number(e.target.value) })} />
              </Field>
              <Field label="Retention (days)">
                <input type="number" className="inp" value={plan.retentionDays}
                  onChange={(e) => set({ retentionDays: Number(e.target.value) })} />
              </Field>
              <Field label="Max retained (blank = ∞)">
                <input type="number" className="inp" value={plan.maxRetainedBackups ?? ""}
                  onChange={(e) => set({ maxRetainedBackups: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Price / month">
                <input type="number" step="0.01" className="inp" value={plan.pricePerMonth}
                  onChange={(e) => set({ pricePerMonth: Number(e.target.value) })} />
              </Field>
              <Field label="Price / GB-month">
                <input type="number" step="0.0001" className="inp" value={plan.pricePerGbMonth}
                  onChange={(e) => set({ pricePerGbMonth: Number(e.target.value) })} />
              </Field>
              <Field label="Currency">
                <input className="inp" value={plan.currency} onChange={(e) => set({ currency: e.target.value })} />
              </Field>
              <Field label="Paid-through (blank = until cancelled)">
                <input type="date" className="inp"
                  value={plan.subscriptionValidUntil ? plan.subscriptionValidUntil.slice(0, 10) : ""}
                  onChange={(e) => set({ subscriptionValidUntil: e.target.value ? `${e.target.value}T00:00:00` : null })} />
              </Field>
            </div>
            <button className="btn-primary" onClick={savePlan} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : hasPlan ? "Update plan" : "Provision plan"}
            </button>
          </div>

          {/* Usage */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-controlcenter-600" /> Usage
            </h2>
            {usage ? (
              <>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Storage used</span>
                    <span className="font-medium">{gib(usage.usedBytes)} / {gib(usage.quotaBytes)} GB</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${usedPct >= 90 ? "bg-red-500" : "bg-controlcenter-600"}`} style={{ width: `${usedPct}%` }} />
                  </div>
                </div>
                <Row k="Completed backups" v={usage.completedCount} />
                <Row k="Subscription" v={<span className={usage.active ? "badge badge-green" : "badge badge-gray"}>{usage.active ? "Active" : "Inactive"}</span>} />
                <Row k="Est. monthly charge" v={<span className="font-semibold">{usage.currency} {Number(usage.estimatedMonthlyCharge).toFixed(2)}</span>} />
              </>
            ) : <p className="text-sm text-slate-400">No usage yet.</p>}
          </div>
        </div>
      )}

      {/* Backups table */}
      {orgId && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Backups</h2>
            <span className="badge badge-gray">{backups.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Label</th>
                  <th className="text-left px-5 py-2 font-medium">Status</th>
                  <th className="text-left px-5 py-2 font-medium">Size</th>
                  <th className="text-left px-5 py-2 font-medium">Node</th>
                  <th className="text-left px-5 py-2 font-medium">Created</th>
                  <th className="text-left px-5 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {backups.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No backups yet.</td></tr>
                ) : backups.map((b) => (
                  <tr key={b.id} className="border-t border-slate-50">
                    <td className="px-5 py-2 flex items-center gap-2">
                      {b.clientEncrypted && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
                      {b.label || "—"}
                    </td>
                    <td className="px-5 py-2">
                      <span className={statusBadge(b.status)}>
                        {b.status === "COMPLETED" ? <CheckCircle2 className="h-3 w-3" /> : b.status === "FAILED" ? <XCircle className="h-3 w-3" /> : null}
                        {b.status}
                      </span>
                      {b.status === "COMPLETED" && (
                        <span className={`ml-1 ${b.verified ? "badge badge-green" : "badge badge-gray"}`}>
                          {b.verified ? "verified" : "unverified"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2">{fmtBytes(b.sizeBytes)}</td>
                    <td className="px-5 py-2 text-xs text-slate-500 font-mono">{b.nodeId ? b.nodeId.slice(0, 12) : "—"}</td>
                    <td className="px-5 py-2 text-slate-500">{fmtDate(b.createdAt)}</td>
                    <td className="px-5 py-2 text-slate-500">{fmtDate(b.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <style jsx>{`.inp { width: 100%; border-radius: 0.5rem; border: 1px solid rgb(226 232 240); padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-card">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{k}</span>
      <span>{v}</span>
    </div>
  );
}
