/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Building2, Globe, Shield, Users, Clock, MoreVertical, Plus, Search,
  X, ChevronRight, Edit, Trash2, RefreshCw, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import { organizationService, licenseService, deploymentService, releaseService, partnerService } from "@/services/controlcenter.service";
import { formatDate, timeAgo } from "@/lib/utils";
import type { Organization, DeploymentStatus, DeploymentEnv, Partner } from "@/types";



let LATEST_VERSION = "";

const COUNTRIES = [
  "South Africa", "Nigeria", "Kenya", "Ghana", "Tanzania",
  "Uganda", "Zambia", "Zimbabwe", "Ethiopia", "Rwanda",
  "Egypt", "Morocco", "Senegal", "Ivory Coast", "Other",
];



// ─── Status helpers ────────────────────────────────────────────────────────────

function statusBadgeClass(status: DeploymentStatus): string {
  switch (status) {
    case "HEALTHY":      return "badge badge-green";
    case "DEGRADED":     return "badge badge-yellow";
    case "OFFLINE":      return "badge badge-red";
    case "PROVISIONING": return "badge badge-blue";
    case "MAINTENANCE":  return "badge badge-gray";
    default:             return "badge badge-gray";
  }
}

function statusIcon(status: DeploymentStatus) {
  switch (status) {
    case "HEALTHY":      return <CheckCircle2 size={11} />;
    case "DEGRADED":     return <AlertTriangle size={11} />;
    case "OFFLINE":      return <XCircle size={11} />;
    case "PROVISIONING": return <RefreshCw size={11} className="animate-spin" />;
    case "MAINTENANCE":  return <Clock size={11} />;
    default:             return null;
  }
}

function envBadgeClass(env: DeploymentEnv): string {
  switch (env) {
    case "PRODUCTION":  return "badge badge-blue";
    case "STAGING":     return "badge badge-yellow";
    case "DEVELOPMENT": return "badge badge-gray";
    default:            return "badge badge-gray";
  }
}

function serviceStatusDot(status: "UP" | "DOWN" | "DEGRADED") {
  if (status === "UP")       return "bg-emerald-500";
  if (status === "DEGRADED") return "bg-amber-400";
  return "bg-red-500";
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-100">
          <div className="h-8 w-8 rounded-lg bg-slate-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 bg-slate-100 rounded" />
            <div className="h-3 w-24 bg-slate-100 rounded" />
          </div>
          <div className="h-5 w-16 bg-slate-100 rounded-full" />
          <div className="h-5 w-20 bg-slate-100 rounded-full" />
          <div className="h-3 w-14 bg-slate-100 rounded" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-3 w-16 bg-slate-100 rounded" />
          <div className="h-3 w-12 bg-slate-100 rounded" />
          <div className="h-7 w-7 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Add Organization Modal ───────────────────────────────────────────────────

interface AddOrgModalProps {
  open: boolean;
  initialData?: Organization | null;
  partners: Partner[];
  onClose: () => void;
  onCreated: (org: Organization) => void;
}

function AddOrgModal({ open, initialData, partners, onClose, onCreated }: AddOrgModalProps) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    country: "",
    environment: "" as DeploymentEnv | "",
    tier: "" as Organization["tier"] | "",
    backendUrl: "",
    partnerId: "",
  });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          name: initialData.name,
          slug: initialData.slug,
          contactEmail: initialData.contactEmail,
          country: initialData.country,
          environment: initialData.environment,
          tier: initialData.tier,
          backendUrl: initialData.backendUrl || "",
          partnerId: initialData.partnerId || "",
        });
      } else {
        setForm({ name: "", slug: "", contactEmail: "", country: "", environment: "", tier: "", backendUrl: "", partnerId: "" });
      }
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, initialData]);

  function handleName(val: string) {
    setForm((f) => ({
      ...f,
      name: val,
      slug: val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.contactEmail || !form.country || !form.environment || !form.tier) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        contactEmail: form.contactEmail,
        country: form.country,
        deploymentEnv: form.environment as DeploymentEnv,
        tier: form.tier as Organization["tier"],
        backendUrl: form.backendUrl || undefined,
        partnerId: form.partnerId || undefined,
      };
      
      let saved: Organization;
      if (initialData) {
        saved = await organizationService.update(initialData.id, payload);
        toast.success(`Organization "${saved.name}" updated successfully.`);
      } else {
        saved = await organizationService.create(payload);
        toast.success(`Organization "${saved.name}" created successfully.`);
      }
      onCreated(saved);
      onClose();
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{initialData ? "Edit Organization" : "Add Organization"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{initialData ? "Update existing deployment parameters" : "Create a new ZGATE deployed instance"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name + Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Organization Name <span className="text-red-500">*</span></label>
              <input
                ref={inputRef}
                className="input"
                placeholder="Apex Capital"
                value={form.name}
                onChange={(e) => handleName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                className="input font-mono text-xs"
                placeholder="apex-capital"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
          </div>

          {/* Contact Email */}
          <div>
            <label className="label">Contact Email <span className="text-red-500">*</span></label>
            <input
              className="input"
              type="email"
              placeholder="ops@example.com"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              required
            />
          </div>

          {/* Country + Environment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Country <span className="text-red-500">*</span></label>
              <select
                className="select"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                required
              >
                <option value="">Select country…</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Environment <span className="text-red-500">*</span></label>
              <select
                className="select"
                value={form.environment}
                onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value as DeploymentEnv }))}
                required
              >
                <option value="">Select…</option>
                <option value="PRODUCTION">Production</option>
                <option value="STAGING">Staging</option>
                <option value="DEVELOPMENT">Development</option>
              </select>
            </div>
          </div>

          {/* Tier + Partner */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tier <span className="text-red-500">*</span></label>
              <select
                className="select"
                value={form.tier}
                onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as Organization["tier"] }))}
                required
              >
                <option value="">Select tier…</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="STANDARD">Standard</option>
                <option value="STARTER">Starter</option>
                <option value="FREE">Free</option>
              </select>
            </div>
            <div>
              <label className="label">Partner (optional)</label>
              <select
                className="select"
                value={form.partnerId}
                onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))}
              >
                <option value="">Direct (no partner)</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Backend URL */}
          <div>
            <label className="label">Backend URL</label>
            <input
              className="input font-mono text-xs"
              placeholder="https://api.example.com"
              value={form.backendUrl}
              onChange={(e) => setForm((f) => ({ ...f, backendUrl: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? (
                <><RefreshCw size={14} className="animate-spin" /> {initialData ? "Saving…" : "Creating…"}</>
              ) : initialData ? "Save Changes" : <><Plus size={14} /> Create Organization</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Organization Detail Panel ────────────────────────────────────────────────

type DetailTab = "overview" | "licenses" | "deployments" | "health";

interface DetailPanelProps {
  org: Organization | null;
  onClose: () => void;
  partnerName: string;
  onRefresh?: () => void;
  onEdit?: () => void;
  latestReleaseId?: string | null;
}

function DetailPanel({ org, onClose, partnerName, onRefresh, onEdit, latestReleaseId }: DetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [licenses, setLicenses] = useState<{ module: string; status: string; expiryDate: string; activatedAt: string }[]>([]);
  const [deployments, setDeployments] = useState<{ version: string; status: string; deployedBy: string; completedAt: string }[]>([]);

  useEffect(() => { if (org) setTab("overview"); }, [org?.id]);

  useEffect(() => {
    if (!org) return;
    licenseService.getByOrg(org.id).then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setLicenses(data.map((l: { module?: string; moduleName?: string; status?: string; expiresAt?: string; activatedAt?: string }) => ({
          module: l.module || l.moduleName || "",
          status: l.status || "ACTIVE",
          expiryDate: l.expiresAt || "",
          activatedAt: l.activatedAt || org.createdAt,
        })));
      } else {
        setLicenses([]);
      }
    }).catch(() => setLicenses([]));
    deploymentService.getByOrg(org.id).then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setDeployments(data.map((d: { version?: string; status?: string; deployedBy?: string; completedAt?: string }) => ({
          version: d.version || "",
          status: d.status || "",
          deployedBy: d.deployedBy || "",
          completedAt: d.completedAt || "",
        })));
      } else {
        setDeployments([]);
      }
    }).catch(() => setDeployments([]));
  }, [org?.id, org?.createdAt]);

  if (!org) return null;

  const isOutdated = LATEST_VERSION ? org.deployedVersion !== LATEST_VERSION : false;

  // Health data derived from org status
  const health = {
    backendStatus: org.status === "OFFLINE" ? "DOWN" : org.status === "DEGRADED" ? "DEGRADED" : "UP",
    databaseStatus: org.status === "OFFLINE" ? "DOWN" : "UP",
    redisStatus: org.status === "OFFLINE" ? "DOWN" : org.status === "DEGRADED" ? "DEGRADED" : "UP",
    uptimeHours: org.status === "OFFLINE" ? 0 : 99.7,
    responseTimeMs: org.status === "OFFLINE" ? 0 : org.status === "DEGRADED" ? 820 : 142,
    lastChecked: org.lastSeen || new Date().toISOString(),
  } as const;

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview",     label: "Overview" },
    { id: "licenses",     label: "Licenses" },
    { id: "deployments",  label: "Deployments" },
    { id: "health",       label: "Health" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
        style={{ animation: "slideIn 0.22s ease-out" }}
      >
        {/* Panel Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-controlcenter-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-controlcenter-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm truncate">{org.name}</h3>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={statusBadgeClass(org.status)}>
                  {statusIcon(org.status)} {org.status}
                </span>
                <span className={envBadgeClass(org.environment)}>
                  {org.environment}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
          {[
            { label: "Active Users",   value: org.activeUsers,               icon: <Users size={13} className="text-controlcenter-500" /> },
            { label: "Modules",        value: (org.licensedModules || []).length,     icon: <Shield size={13} className="text-emerald-500" /> },
            { label: "Version",        value: org.deployedVersion,            icon: <Globe size={13} className="text-slate-400" /> },
            { label: "Uptime",         value: org.status === "OFFLINE" ? "—" : "99.7%", icon: <Clock size={13} className="text-amber-500" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex flex-col items-center py-3 px-1 gap-1">
              {icon}
              <span className="text-sm font-bold text-slate-900">{value}</span>
              <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors -mb-px ${
                tab === id
                  ? "border-controlcenter-600 text-controlcenter-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contact</h4>
                <InfoRow label="Email"   value={org.contactEmail} />
                {org.contactPhone && <InfoRow label="Phone"  value={org.contactPhone} />}
                <InfoRow label="Country" value={org.country} />
                <InfoRow label="Partner" value={partnerName} />
                <InfoRow label="Tier"    value={org.tier} />
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Deployment</h4>
                <InfoRow label="Backend URL" value={
                  <a href={org.backendUrl} target="_blank" rel="noreferrer"
                     className="text-controlcenter-600 hover:underline flex items-center gap-1">
                    {org.backendUrl} <ExternalLink size={11} />
                  </a>
                } />
                <InfoRow label="Created"  value={formatDate(org.createdAt)} />
                {org.lastSeen && <InfoRow label="Last Seen" value={timeAgo(org.lastSeen)} />}
                <InfoRow label="Version"  value={
                  <span className="flex items-center gap-1.5">
                    {org.deployedVersion}
                    {isOutdated && (
                      <span className="badge badge-yellow text-[10px]">
                        <AlertTriangle size={9} /> Update available
                      </span>
                    )}
                  </span>
                } />
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Licensed Modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(org.licensedModules || []).map((mod) => (
                    <span key={mod} className="badge badge-blue text-[11px]">{mod}</span>
                  ))}
                  {(org.licensedModules || []).length === 0 && (
                    <span className="text-slate-400 text-xs">No modules licensed</span>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ── Licenses ── */}
          {tab === "licenses" && (
            <div className="space-y-3">
              {licenses.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No licenses found.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left pb-2 font-semibold text-slate-500">Module</th>
                      <th className="text-left pb-2 font-semibold text-slate-500">Status</th>
                      <th className="text-left pb-2 font-semibold text-slate-500">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenses.map((lic) => (
                      <tr key={lic.module} className="border-t border-slate-100">
                        <td className="py-2.5 font-medium text-slate-800">{lic.module}</td>
                        <td className="py-2.5">
                          <span className="badge badge-green">
                            <CheckCircle2 size={9} /> {lic.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500">{formatDate(lic.expiryDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Deployments ── */}
          {tab === "deployments" && (
            <div className="space-y-2">
              {deployments.map((dep, i) => {
                const isSuccess  = dep.status === "SUCCESS";
                const isRolled   = dep.status === "ROLLED_BACK";
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isSuccess ? "bg-emerald-100" : isRolled ? "bg-amber-100" : "bg-red-100"
                    }`}>
                      {isSuccess ? (
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      ) : (
                        <RefreshCw size={14} className={isRolled ? "text-amber-600" : "text-red-600"} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-xs">v{dep.version}</span>
                        <span className={`badge text-[10px] ${isSuccess ? "badge-green" : isRolled ? "badge-yellow" : "badge-red"}`}>
                          {dep.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        by {dep.deployedBy} · {timeAgo(dep.completedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Health ── */}
          {tab === "health" && (
            <div className="space-y-4">
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Services</h4>
                {[
                  { label: "Backend API",    status: health.backendStatus },
                  { label: "Database",       status: health.databaseStatus },
                  { label: "Redis Cache",    status: health.redisStatus },
                ].map(({ label, status }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${serviceStatusDot(status as "UP" | "DOWN" | "DEGRADED")}`} />
                      <span className={`text-xs font-medium ${
                        status === "UP" ? "text-emerald-600" : status === "DEGRADED" ? "text-amber-600" : "text-red-600"
                      }`}>{status}</span>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Metrics</h4>
                <InfoRow label="Uptime"         value={org.status === "OFFLINE" ? "—" : `${health.uptimeHours}%`} />
                <InfoRow label="Response Time"  value={org.status === "OFFLINE" ? "—" : `${health.responseTimeMs}ms`} />
                <InfoRow label="Last Checked"   value={timeAgo(health.lastChecked)} />
              </section>
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <button onClick={onEdit} className="btn-secondary text-xs gap-1.5 py-1.5 px-3">
            <Edit size={12} /> Edit
          </button>
          <button onClick={async () => {
            try {
              toast.info("Issuing CORE license...");
              await licenseService.issue({ organizationId: org.id, moduleName: "CORE" });
              toast.success("License issued!");
              onRefresh?.();
            } catch { toast.error("Failed to issue license."); }
          }} className="btn-secondary text-xs gap-1.5 py-1.5 px-3">
            <Shield size={12} /> Issue License
          </button>
          <button onClick={async () => {
            if (!latestReleaseId) { toast.error("No release available to push"); return; }
            try {
              toast.info("Pushing latest release...");
              await deploymentService.pushUpdate({ organizationIds: [org.id], releaseId: latestReleaseId, notifyContacts: true });
              toast.success("Update pushed successfully!");
              onRefresh?.();
            } catch { toast.error("Failed to push update."); }
          }} className="btn-secondary text-xs gap-1.5 py-1.5 px-3">
            <RefreshCw size={12} /> Push Update
          </button>
          <button onClick={async () => {
            try {
              const newStatus = org.status === "OFFLINE" ? "HEALTHY" : "OFFLINE";
              await organizationService.updateStatus(org.id, newStatus);
              toast.success(`Organization visually marked as ${newStatus}`);
              onRefresh?.();
            } catch { toast.error("Failed to disable organization."); }
          }} className="btn-danger text-xs gap-1.5 py-1.5 px-3 ml-auto">
            <Trash2 size={12} /> {org.status === "OFFLINE" ? "Enable" : "Disable"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── Info Row helper ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-400 flex-shrink-0 w-24">{label}</span>
      <span className="text-xs text-slate-700 text-right">{value}</span>
    </div>
  );
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────

interface RowActionsProps {
  org: Organization;
  onView:    () => void;
  onEdit:    () => void;
  onRefresh: () => void;
  latestReleaseId?: string | null;
}

function RowActions({ org, onView, onEdit, onRefresh, latestReleaseId }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 text-xs">
          <DropdownItem icon={<ChevronRight size={12} />} label="View Details"     onClick={() => { setOpen(false); onView(); }} />
          <DropdownItem icon={<Edit size={12} />}          label="Edit"             onClick={() => { setOpen(false); onEdit(); }} />
          <DropdownItem icon={<Shield size={12} />}        label="Issue License"    onClick={async () => {
             setOpen(false);
             try {
               toast.info("Issuing CORE license...");
               await licenseService.issue({ organizationId: org.id, moduleName: "CORE" });
               toast.success("License issued!");
               onRefresh();
             } catch { toast.error("Failed to issue license."); }
          }} />
          <DropdownItem icon={<RefreshCw size={12} />}     label="Push Update"      onClick={async () => {
             setOpen(false);
             if (!latestReleaseId) { toast.error("No release available to push"); return; }
             try {
               toast.info("Pushing latest release...");
               await deploymentService.pushUpdate({ organizationIds: [org.id], releaseId: latestReleaseId, notifyContacts: true });
               toast.success("Update pushed successfully!");
               onRefresh();
             } catch { toast.error("Failed to push update."); }
          }} />
          <div className="my-1 border-t border-slate-100" />
          <DropdownItem icon={<Trash2 size={12} />}        label={org.status === "OFFLINE" ? "Enable" : "Disable"} onClick={async () => {
             setOpen(false);
             try {
               const newStatus = org.status === "OFFLINE" ? "HEALTHY" : "OFFLINE";
               await organizationService.updateStatus(org.id, newStatus);
               toast.success(`Organization visually marked as ${newStatus}`);
               onRefresh();
             } catch { toast.error("Failed to disable organization."); }
          }} danger />
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const [orgs, setOrgs]               = useState<Organization[]>([]);
  const [partners, setPartners]       = useState<Partner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter]   = useState<DeploymentStatus | "ALL">("ALL");
  const [envFilter, setEnvFilter]     = useState<DeploymentEnv | "ALL">("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [latestReleaseId, setLatestReleaseId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [orgsData, partnersData, latestRelease] = await Promise.all([
          organizationService.getAll(),
          partnerService.getAll(),
          releaseService.getLatest().catch(() => null),
        ]);
        setOrgs(Array.isArray(orgsData) ? orgsData : []);
        setPartners(Array.isArray(partnersData) ? partnersData : []);
        if (latestRelease?.version) LATEST_VERSION = latestRelease.version;
        if (latestRelease?.id) setLatestReleaseId(latestRelease.id);
      } catch {
        setOrgs([]);
        setPartners([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived stats ──
  const stats = useMemo(() => ({
    total:         orgs.length,
    healthy:       orgs.filter((o) => o.status === "HEALTHY").length,
    pendingUpdate: orgs.filter((o) => o.deployedVersion !== LATEST_VERSION).length,
    offline:       orgs.filter((o) => o.status === "OFFLINE").length,
  }), [orgs]);

  // ── Filtered + sorted list ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orgs
      .filter((o) => {
        const matchSearch = !q ||
          o.name.toLowerCase().includes(q) ||
          o.slug.toLowerCase().includes(q) ||
          o.contactEmail.toLowerCase().includes(q);
        const matchStatus = statusFilter === "ALL" || o.status === statusFilter;
        const matchEnv    = envFilter === "ALL"    || o.environment === envFilter;
        return matchSearch && matchStatus && matchEnv;
      })
      .sort((a, b) => {
        // Sort by lastSeen desc, fallback to createdAt
        const ta = new Date(a.lastSeen || a.createdAt).getTime();
        const tb = new Date(b.lastSeen || b.createdAt).getTime();
        return tb - ta;
      });
  }, [orgs, search, statusFilter, envFilter]);

  const partnerLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of partners) {
      map[p.id] = p.name;
    }
    return map;
  }, [partners]);

  function getPartnerName(org: Organization) {
    if (!org.partnerId) return "Direct";
    return partnerLookup[org.partnerId] ?? "Unknown Partner";
  }

  function handleCreated(org: Organization) {
    setOrgs((prev) => [org, ...prev]);
  }

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* ── Page Header ── */}
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 size={20} className="text-controlcenter-600" />
            Organizations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage all ZGATE deployed instances</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8 w-56"
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            className="select w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeploymentStatus | "ALL")}
          >
            <option value="ALL">All Statuses</option>
            <option value="HEALTHY">Healthy</option>
            <option value="DEGRADED">Degraded</option>
            <option value="OFFLINE">Offline</option>
            <option value="PROVISIONING">Provisioning</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>

          {/* Environment filter */}
          <select
            className="select w-auto"
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value as DeploymentEnv | "ALL")}
          >
            <option value="ALL">All Environments</option>
            <option value="PRODUCTION">Production</option>
            <option value="STAGING">Staging</option>
            <option value="DEVELOPMENT">Development</option>
          </select>

          <button
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={15} />
            Add Organization
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Organizations"
          value={stats.total}
          icon={<Building2 size={18} className="text-controlcenter-500" />}
          color="controlcenter"
        />
        <StatCard
          label="Healthy"
          value={stats.healthy}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          color="emerald"
        />
        <StatCard
          label="Pending Update"
          value={stats.pendingUpdate}
          icon={<RefreshCw size={18} className="text-amber-500" />}
          color="amber"
        />
        <StatCard
          label="Offline"
          value={stats.offline}
          icon={<XCircle size={18} className="text-red-500" />}
          color="red"
        />
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="card p-4 border-red-200 bg-red-50 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            className="ml-auto btn-secondary text-xs"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="table-container">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            {loading ? "Loading…" : `${filtered.length} organization${filtered.length !== 1 ? "s" : ""}`}
            {(statusFilter !== "ALL" || envFilter !== "ALL" || search) && (
              <span className="ml-1 text-controlcenter-600">(filtered)</span>
            )}
          </p>
          {(statusFilter !== "ALL" || envFilter !== "ALL" || search) && (
            <button
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              onClick={() => { setSearch(""); setStatusFilter("ALL"); setEnvFilter("ALL"); }}
            >
              <X size={11} /> Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Building2 size={36} className="text-slate-200" />
            <p className="text-sm font-medium">No organizations found</p>
            <p className="text-xs">
              {search || statusFilter !== "ALL" || envFilter !== "ALL"
                ? "Try adjusting your search or filters"
                : "Add your first organization to get started"}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Status</th>
                <th>Environment</th>
                <th>Version</th>
                <th>Licensed Modules</th>
                <th>Partner</th>
                <th>Last Seen</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => {
                const isOutdated = org.deployedVersion !== LATEST_VERSION;
                const secureMods = org.licensedModules || [];
                const visibleMods = secureMods.slice(0, 3);
                const extraCount  = secureMods.length - 3;
                return (
                  <tr
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedOrg(org)}
                  >
                    {/* Organization */}
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-controlcenter-50 border border-controlcenter-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-controlcenter-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-xs leading-tight">{org.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{org.slug}</p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={statusBadgeClass(org.status)}>
                        {statusIcon(org.status)} {org.status}
                      </span>
                    </td>

                    {/* Environment */}
                    <td>
                      <span className={envBadgeClass(org.environment)}>
                        {org.environment}
                      </span>
                    </td>

                    {/* Version */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-600">{org.deployedVersion}</span>
                        {isOutdated && (
                          <span
                            className="badge badge-yellow text-[10px]"
                            title={`Latest is ${LATEST_VERSION}`}
                          >
                            <AlertTriangle size={9} /> Update
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Licensed Modules */}
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        {visibleMods.map((mod) => (
                          <span key={mod} className="badge badge-blue text-[10px] py-0">{mod}</span>
                        ))}
                        {extraCount > 0 && (
                          <span className="badge badge-gray text-[10px] py-0">+{extraCount}</span>
                        )}
                        {secureMods.length === 0 && (
                          <span className="text-[11px] text-slate-400">None</span>
                        )}
                      </div>
                    </td>

                    {/* Partner */}
                    <td>
                      <span className="text-xs text-slate-600">{getPartnerName(org)}</span>
                    </td>

                    {/* Last Seen */}
                    <td>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={11} className="text-slate-300" />
                        {org.lastSeen ? timeAgo(org.lastSeen) : "—"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        org={org}
                        onView={() => setSelectedOrg(org)}
                        onEdit={() => setEditingOrg(org)}
                        onRefresh={() => organizationService.getAll().then(setOrgs)}
                        latestReleaseId={latestReleaseId}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals / Panels ── */}
      <AddOrgModal
        open={showAddModal || !!editingOrg}
        initialData={editingOrg}
        partners={partners}
        onClose={() => { setShowAddModal(false); setEditingOrg(null); }}
        onCreated={(savedOrg) => {
          if (editingOrg) {
            setOrgs((prev) => prev.map(o => o.id === savedOrg.id ? savedOrg : o));
            if (selectedOrg?.id === savedOrg.id) setSelectedOrg(savedOrg);
          } else {
            handleCreated(savedOrg);
          }
        }}
      />

      <DetailPanel
        org={selectedOrg}
        onClose={() => setSelectedOrg(null)}
        partnerName={selectedOrg ? getPartnerName(selectedOrg) : ""}
        onEdit={() => setEditingOrg(selectedOrg)}
        latestReleaseId={latestReleaseId}
        onRefresh={() => {
          organizationService.getAll().then(setOrgs);
          setSelectedOrg(null);
        }}
      />
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "controlcenter" | "emerald" | "amber" | "red";
}) {
  const ring: Record<string, string> = {
    controlcenter:   "ring-controlcenter-100",
    emerald: "ring-emerald-100",
    amber:   "ring-amber-100",
    red:     "ring-red-100",
  };
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-xl ring-2 ${ring[color]} flex items-center justify-center bg-white mb-1`}>
        {icon}
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
