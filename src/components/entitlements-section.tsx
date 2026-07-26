"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Server, ShieldCheck, Boxes, KeyRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { organizationService, deploymentService } from "@/services/controlcenter.service";
import type { Organization, OrgInstance, DeploymentTier } from "@/types";
import { timeAgo } from "@/lib/utils";

const TIERS: { value: DeploymentTier | ""; label: string }[] = [
  { value: "", label: "Unmanaged (no tier check)" },
  { value: "SINGLE_NODE", label: "Single node" },
  { value: "HIGH_AVAILABILITY", label: "High availability (K8s / ECS / replicas)" },
  { value: "MULTI_REGION", label: "Multi-region (failover / DR)" },
];

const TIER_RANK: Record<string, number> = { SINGLE_NODE: 0, HIGH_AVAILABILITY: 1, MULTI_REGION: 2 };

// Local <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"; the backend sends full ISO.
const toLocal = (iso?: string) => (iso ? iso.slice(0, 16) : "");

export default function EntitlementsSection({ org }: { org: Organization }) {
  const orgId = org.id;
  const [tier, setTier] = useState<DeploymentTier | "">(org.deploymentTier ?? "");
  const [maxInstances, setMaxInstances] = useState<string>(org.maxInstances?.toString() ?? "");
  const [entitledVersion, setEntitledVersion] = useState<string>(org.entitledVersion ?? "");
  const [ttlDays, setTtlDays] = useState<string>(org.licenseTtlDays?.toString() ?? "");
  const [subUntil, setSubUntil] = useState<string>(toLocal(org.subscriptionValidUntil));
  const [saving, setSaving] = useState(false);

  const [instances, setInstances] = useState<OrgInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);

  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  async function regenerateKey() {
    if (!confirm("Rotate the service key? The old key stops working immediately and the new one is shown only once.")) return;
    setRotatingKey(true);
    try {
      const updated = await organizationService.regenerateKey(orgId);
      setServiceKey(updated.serviceApiKey ?? null);
      toast.success("Service key rotated — copy it now, it won't be shown again.");
    } catch {
      toast.error("Could not rotate the service key. Check your permissions.");
    } finally {
      setRotatingKey(false);
    }
  }

  useEffect(() => {
    let live = true;
    deploymentService
      .getInstances(orgId)
      .then((data) => live && setInstances(Array.isArray(data) ? data : []))
      .catch(() => live && setInstances([]))
      .finally(() => live && setLoadingInstances(false));
    return () => {
      live = false;
    };
  }, [orgId]);

  // Observed topology, derived from the live nodes.
  const topology = useMemo(() => {
    const byFingerprint = new Map<string, OrgInstance[]>();
    for (const i of instances) {
      const list = byFingerprint.get(i.fingerprint) ?? [];
      list.push(i);
      byFingerprint.set(i.fingerprint, list);
    }
    const environments = byFingerprint.size;
    let maxReplicas = 0;
    for (const list of byFingerprint.values()) {
      maxReplicas = Math.max(maxReplicas, new Set(list.map((n) => n.nodeId)).size);
    }
    const orchestrated = instances.some(
      (i) => i.platform === "kubernetes" || i.platform === "ecs",
    );
    return { byFingerprint, environments, maxReplicas, orchestrated };
  }, [instances]);

  // Client-side mirror of the backend tier checks — a heads-up, not the source of truth.
  const violations = useMemo(() => {
    const out: string[] = [];
    if (!tier) return out;
    const rank = TIER_RANK[tier];
    if ((topology.orchestrated || topology.maxReplicas > 1) && rank < TIER_RANK.HIGH_AVAILABILITY) {
      out.push("Running orchestrated / multi-replica on a Single-node tier — High-Availability required.");
    }
    if (topology.environments > 1 && rank < TIER_RANK.MULTI_REGION) {
      out.push(`${topology.environments} environments detected on a ${tier} tier — Multi-region required.`);
    }
    return out;
  }, [tier, topology]);

  async function save() {
    setSaving(true);
    try {
      await organizationService.updateEntitlements(orgId, {
        deploymentTier: tier || null,
        maxInstances: maxInstances === "" ? null : Number(maxInstances),
        entitledVersion: entitledVersion || null,
        licenseTtlDays: ttlDays === "" ? null : Number(ttlDays),
        subscriptionValidUntil: subUntil || null,
      });
      toast.success("Entitlements updated");
    } catch {
      toast.error("Could not update entitlements. Check your permissions.");
    } finally {
      setSaving(false);
    }
  }

  const subLapsed = org.subscriptionValidUntil && new Date(org.subscriptionValidUntil) < new Date();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ---- Entitlements form ---- */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <ShieldCheck size={15} className="text-controlcenter-600" />
          <h2 className="text-sm font-semibold text-slate-700">Commercial Entitlements</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Deployment tier</label>
            <select className="select" value={tier} onChange={(e) => setTier(e.target.value as DeploymentTier | "")}>
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Entitled version (max)</label>
              <input
                className="input"
                placeholder="e.g. 2.9.9"
                value={entitledVersion}
                onChange={(e) => setEntitledVersion(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max environments</label>
              <input
                className="input"
                type="number"
                min={1}
                placeholder="unlimited"
                value={maxInstances}
                onChange={(e) => setMaxInstances(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subscription valid until</label>
              <input
                className="input"
                type="datetime-local"
                value={subUntil}
                onChange={(e) => setSubUntil(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">License TTL (days)</label>
              <input
                className="input"
                type="number"
                min={1}
                placeholder="server default"
                value={ttlDays}
                onChange={(e) => setTtlDays(e.target.value)}
              />
            </div>
          </div>

          {subLapsed && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Subscription lapsed — license renewal is stopped; this deployment will lock after its grace period.
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-400">Blank = unmanaged (no check for that lever).</p>
            <button className="btn-primary text-xs" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save entitlements"}
            </button>
          </div>

          {/* Service API key — the install's M2M credential (CONTROLCENTER_SERVICE_KEY). */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <KeyRound size={13} className="text-slate-400" /> Service API key
              </label>
              <button
                className="btn-secondary text-xs"
                onClick={regenerateKey}
                disabled={rotatingKey}
              >
                {rotatingKey ? "Rotating…" : serviceKey ? "Rotate again" : "Reveal / rotate"}
              </button>
            </div>
            {serviceKey ? (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[11px] bg-slate-900 text-emerald-300 rounded-md px-3 py-2 break-all">
                    {serviceKey}
                  </code>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(serviceKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 1500);
                    }}
                  >
                    {copiedKey ? <Check size={12} /> : <Copy size={12} />} {copiedKey ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-amber-600">
                  Copy it now — it isn&apos;t stored and won&apos;t be shown again. Set it on the install as
                  {" "}<code>CONTROLCENTER_SERVICE_KEY</code>.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                Rotating issues a new key (shown once) and invalidates the old one.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---- Live instances / topology ---- */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={15} className="text-controlcenter-600" />
            <h2 className="text-sm font-semibold text-slate-700">Live Instances</h2>
          </div>
          <span className="text-[11px] text-slate-500">
            {topology.environments} env · {instances.length} node{instances.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="p-5 space-y-3">
          {violations.map((v) => (
            <div
              key={v}
              className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {v}
            </div>
          ))}

          {loadingInstances ? (
            <div className="h-16 animate-pulse bg-slate-100 rounded-md" />
          ) : instances.length === 0 ? (
            <p className="text-sm text-slate-400">No live instances reported yet.</p>
          ) : (
            [...topology.byFingerprint.entries()].map(([fingerprint, nodes], idx) => (
              <div key={fingerprint} className="border border-slate-200 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Boxes size={13} className="text-slate-400" /> Environment {idx + 1}
                    <span className="font-mono text-[10px] text-slate-400">{fingerprint.slice(0, 12)}…</span>
                  </span>
                  <span className="badge badge-blue">{new Set(nodes.map((n) => n.nodeId)).size} node(s)</span>
                </div>
                <div className="space-y-1">
                  {nodes.slice(0, 6).map((n) => (
                    <div key={n.id} className="flex items-center justify-between text-[11px] text-slate-600">
                      <span className="font-mono truncate max-w-[45%]">{n.nodeId}</span>
                      <span
                        className={`badge ${
                          n.platform === "kubernetes" || n.platform === "ecs" ? "badge-purple" : "badge-gray"
                        }`}
                      >
                        {n.platform ?? "bare"}
                      </span>
                      <span className="text-slate-400">v{n.appVersion ?? "—"}</span>
                      <span className="text-slate-400">{timeAgo(n.lastSeenAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
