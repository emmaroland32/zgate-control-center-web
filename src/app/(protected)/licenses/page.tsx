/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Upload,
  Download,
  Copy,
  Check,
  RefreshCw,
  X,
  Eye,
  Zap,
  Shield,
  Building2,
  TrendingUp,
  BarChart2,
  Package,
  Repeat,
  AlertTriangle,
  FileCheck,
  DollarSign,
  Landmark,
  Users,
} from "lucide-react";
import { licenseService, organizationService } from "@/services/nexus.service";
import type { License, Organization } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

// ─── Constants ──────────────────────────────────────────────────────────────

const ALL_MODULES = [
  { id: "CRM",           name: "CRM",           icon: Users,         description: "Customer relationship management and client lifecycle" },
  { id: "COMPLIANCE",    name: "Compliance",     icon: Shield,        description: "Regulatory compliance, KYC/AML, and reporting" },
  { id: "TREASURY",      name: "Treasury",       icon: Landmark,      description: "Cash management, liquidity, and treasury operations" },
  { id: "FINCON",        name: "FinCon",         icon: BarChart2,     description: "Financial control, GL, and reconciliation" },
  { id: "PORTFOLIO",     name: "Portfolio",      icon: TrendingUp,    description: "Portfolio management and performance analytics" },
  { id: "TRADE",         name: "Trade",          icon: Repeat,        description: "Order management and trade execution" },
  { id: "RISK",          name: "Risk",           icon: AlertTriangle, description: "Risk metrics, VaR, and exposure monitoring" },
  { id: "RECON",         name: "Recon",          icon: FileCheck,     description: "Position and cash reconciliation engine" },
  { id: "MUTUAL_FUND",   name: "Mutual Fund",    icon: DollarSign,    description: "Unit trust and mutual fund administration" },
  { id: "BANKING",       name: "Banking",        icon: Building2,     description: "Core banking and account management" },
  { id: "DISTRIBUTION",  name: "Distribution",   icon: Package,       description: "Distribution channels and advisor management" },
] as const;

type ModuleId = typeof ALL_MODULES[number]["id"];



// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntilExpiry(expiryDate?: string): number | null {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400_000);
}

function expiryColorClass(expiryDate?: string): string {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return "text-slate-400";
  if (days < 0) return "text-red-600 font-semibold";
  if (days <= 30) return "text-amber-600 font-semibold";
  if (days > 90) return "text-emerald-600";
  return "text-slate-700";
}

function statusBadge(status: License["status"]) {
  switch (status) {
    case "ACTIVE":      return <span className="badge badge-green">Active</span>;
    case "EXPIRED":     return <span className="badge badge-red">Expired</span>;
    case "NOT_LICENSED": return <span className="badge badge-gray">Not Licensed</span>;
  }
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleCopy}
      title={label}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md
                 text-slate-500 hover:text-nexus-600 hover:bg-nexus-50 transition-colors"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Module Icon ─────────────────────────────────────────────────────────────

function ModuleIcon({ moduleId }: { moduleId: string }) {
  const mod = ALL_MODULES.find((m) => m.id === moduleId);
  if (!mod) return <Shield size={16} className="text-slate-400" />;
  const Icon = mod.icon;
  return <Icon size={16} className="text-nexus-500 shrink-0" />;
}

// ─── Integrity Panel ─────────────────────────────────────────────────────────

interface IntegrityResult {
  checkedAt: string;
  total: number;
  valid: number;
  tampered: number;
}

function IntegrityPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntegrityResult | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const data = await licenseService.verifyAll();
      setResult({
        checkedAt: new Date().toISOString(),
        total: data.total ?? 0,
        valid: data.valid ?? 0,
        tampered: data.missing ?? data.tampered ?? 0,
      });
    } catch {
      toast.error("Integrity check failed — backend unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mt-4 card p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
          <ShieldCheck size={16} className="text-emerald-600" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">License Integrity Check</div>
          {result ? (
            <div className="text-xs text-slate-500">
              Last checked {formatDateTime(result.checkedAt)} —{" "}
              {result.tampered === 0 ? (
                <span className="text-emerald-600 font-medium">All {result.valid} licenses valid</span>
              ) : (
                <span className="text-red-600 font-medium">{result.tampered} tampered</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Not yet checked this session</div>
          )}
        </div>
      </div>
      <button
        onClick={runCheck}
        disabled={loading}
        className="btn-secondary text-xs"
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        {loading ? "Checking…" : "Run Check"}
      </button>
    </div>
  );
}

// ─── Upload & Activate Panel ──────────────────────────────────────────────────

function UploadActivatePanel({ onActivated, organizations }: { onActivated: () => void; organizations: Organization[] }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [moduleName, setModuleName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => setFile(f);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleActivate = async () => {
    if (!file) return;
    if (!orgId) { toast.error("Select an organisation"); return; }
    if (!moduleName) { toast.error("Select a module"); return; }
    setLoading(true);
    try {
      await licenseService.activateFile(orgId, moduleName, file);
      toast.success(`License file "${file.name}" activated successfully`);
      setFile(null);
      onActivated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Activation failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Upload size={16} className="text-nexus-500" />
        <h3 className="text-sm font-semibold text-slate-800">Upload &amp; Activate .lic File</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="label">Organisation</label>
          <select className="select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Select organisation…</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Module</label>
          <select className="select" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
            <option value="">Select module…</option>
            {ALL_MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${dragging
            ? "border-nexus-400 bg-nexus-50"
            : "border-slate-200 hover:border-nexus-300 hover:bg-slate-50"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".lic,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileCheck size={28} className="text-emerald-500" />
            <span className="text-sm font-medium text-slate-800">{file.name}</span>
            <span className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
            >
              <X size={11} /> Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Upload size={28} />
            <span className="text-sm">Drop a <strong>.lic</strong> file here, or click to browse</span>
            <span className="text-xs">Accepts .lic and .json license files</span>
          </div>
        )}
      </div>

      {file && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleActivate}
            disabled={loading}
            className="btn-primary"
          >
            <Zap size={14} className={loading ? "animate-pulse" : ""} />
            {loading ? "Activating…" : "Activate License"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Issue License Form ───────────────────────────────────────────────────────

interface IssueFormState {
  organizationId: string;
  customerName: string;
  selectedModules: ModuleId[];
  expiryDate: string;
  maxUsers: number;
  bindToFingerprint: boolean;
  fingerprint: string;
  features: string;
}

const defaultExpiry = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
};

function IssueLicenseTab({ organizations, onLicenseIssued }: { organizations: Organization[]; onLicenseIssued: () => void }) {
  const [form, setForm] = useState<IssueFormState>({
    organizationId: "",
    customerName: "",
    selectedModules: [],
    expiryDate: defaultExpiry(),
    maxUsers: 50,
    bindToFingerprint: false,
    fingerprint: "",
    features: "all",
  });
  const [fetchingFp, setFetchingFp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatedLic, setGeneratedLic] = useState<string | null>(null);

  const setField = <K extends keyof IssueFormState>(key: K, value: IssueFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleOrgChange = (orgId: string) => {
    const org = organizations.find((o) => o.id === orgId);
    setField("organizationId", orgId);
    setField("customerName", org?.name ?? "");
  };

  const toggleModule = (id: ModuleId) => {
    setForm((prev) => ({
      ...prev,
      selectedModules: prev.selectedModules.includes(id)
        ? prev.selectedModules.filter((m) => m !== id)
        : [...prev.selectedModules, id],
    }));
  };

  const selectAllModules = () =>
    setForm((prev) => ({ ...prev, selectedModules: ALL_MODULES.map((m) => m.id as ModuleId) }));

  const clearModules = () => setForm((prev) => ({ ...prev, selectedModules: [] }));

  const fetchFingerprint = async () => {
    if (!form.organizationId) { toast.error("Select an organisation first"); return; }
    const moduleName = form.selectedModules[0] ?? "ZGATE";
    setFetchingFp(true);
    try {
      const { fingerprint } = await licenseService.getFingerprint(form.organizationId, moduleName);
      setField("fingerprint", fingerprint);
      toast.success("Machine fingerprint fetched");
    } catch {
      toast.error("Could not fetch fingerprint from backend");
    } finally {
      setFetchingFp(false);
    }
  };

  const handleGenerate = async () => {
    if (!form.organizationId) { toast.error("Select an organisation"); return; }
    if (form.selectedModules.length === 0) { toast.error("Select at least one module"); return; }
    if (!form.expiryDate) { toast.error("Set an expiry date"); return; }

    setSubmitting(true);
    try {
      // Single call — issues one License row per module and returns one combined signed bundle
      const bundle = await licenseService.issueBulk({
        organizationId: form.organizationId,
        moduleNames: form.selectedModules,
        expiresAt: new Date(form.expiryDate).toISOString().replace("Z", ""),
        maxUsers: form.maxUsers,
        features: form.features,
        fingerprint: form.bindToFingerprint ? form.fingerprint : undefined,
      });
      // bundle.payload is the signed zgate-license-v2 JSON covering all selected modules
      setGeneratedLic(bundle.payload);
      toast.success("License bundle generated");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to generate license bundle");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadLic = () => {
    if (!generatedLic) return;
    const blob = new Blob([generatedLic], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.customerName.replace(/\s+/g, "_").toLowerCase() || "license"}.lic`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Note about signing */}
      <div className="rounded-lg bg-nexus-50 border border-nexus-200 p-4 text-sm text-nexus-800 flex gap-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-nexus-500" />
        <div>
          <strong>RSA signing requires the CLI.</strong> The web form builds the license payload and
          can call the backend&apos;s <code className="font-mono text-xs bg-nexus-100 px-1 py-0.5 rounded">/api/licenses/generate</code> endpoint
          to produce a signed <code className="font-mono text-xs bg-nexus-100 px-1 py-0.5 rounded">.lic</code> file.
          If the backend is unreachable, use{" "}
          <code className="font-mono text-xs bg-nexus-100 px-1 py-0.5 rounded">scripts/generate-license.js</code> locally to sign and then upload below.
        </div>
      </div>

      {/* Organization */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Organisation &amp; Customer</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Organisation <span className="text-red-500">*</span></label>
            <select
              value={form.organizationId}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="select"
            >
              <option value="">Select organisation…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Customer Name</label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => setField("customerName", e.target.value)}
              className="input"
              placeholder="Auto-filled from organisation"
            />
          </div>
        </div>
      </div>

      {/* Module selection */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Modules to License
            <span className="ml-2 text-xs font-normal text-slate-400">
              {form.selectedModules.length} / {ALL_MODULES.length} selected
            </span>
          </h3>
          <div className="flex gap-2">
            <button onClick={selectAllModules} className="text-xs text-nexus-600 hover:underline">
              Select all
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={clearModules} className="text-xs text-slate-400 hover:underline">
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_MODULES.map((mod) => {
            const Icon = mod.icon;
            const checked = form.selectedModules.includes(mod.id as ModuleId);
            return (
              <label
                key={mod.id}
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                  ${checked
                    ? "border-nexus-400 bg-nexus-50 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }
                `}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-nexus-600"
                  checked={checked}
                  onChange={() => toggleModule(mod.id as ModuleId)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} className={checked ? "text-nexus-500" : "text-slate-400"} />
                    <span className="text-xs font-semibold text-slate-800">{mod.name}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-2">
                    {mod.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* License parameters */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">License Parameters</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Expiry Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setField("expiryDate", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Max Users</label>
            <input
              type="number"
              min={1}
              value={form.maxUsers}
              onChange={(e) => setField("maxUsers", parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Features</label>
          <input
            type="text"
            value={form.features}
            onChange={(e) => setField("features", e.target.value)}
            className="input"
            placeholder='e.g. "all" or comma-separated feature flags'
          />
        </div>
      </div>

      {/* Machine fingerprint binding */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Machine Fingerprint Binding</h3>
            <p className="text-xs text-slate-400 mt-0.5">Bind this license to a specific server fingerprint</p>
          </div>
          <button
            type="button"
            onClick={() => setField("bindToFingerprint", !form.bindToFingerprint)}
            className={`
              relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${form.bindToFingerprint ? "bg-nexus-600" : "bg-slate-200"}
            `}
          >
            <span
              className={`
                inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                ${form.bindToFingerprint ? "translate-x-4" : "translate-x-0.5"}
              `}
            />
          </button>
        </div>

        {form.bindToFingerprint && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.fingerprint}
                readOnly
                className="input font-mono text-xs bg-slate-50"
                placeholder="Fingerprint will appear here after fetching…"
              />
              <button
                onClick={fetchFingerprint}
                disabled={fetchingFp}
                className="btn-secondary shrink-0"
              >
                <RefreshCw size={13} className={fetchingFp ? "animate-spin" : ""} />
                {fetchingFp ? "Fetching…" : "Fetch Fingerprint"}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Calls <code className="font-mono">GET /api/licenses/fingerprint</code> on the target deployment
            </p>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={submitting}
          className="btn-primary"
        >
          <ShieldCheck size={15} className={submitting ? "animate-pulse" : ""} />
          {submitting ? "Generating…" : "Generate License Bundle"}
        </button>
      </div>

      {/* Generated output */}
      {generatedLic && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Eye size={15} className="text-nexus-500" />
              Generated License File
            </h3>
            <div className="flex gap-2">
              <CopyButton text={generatedLic} label="Copy to Clipboard" />
              <button onClick={downloadLic} className="btn-secondary text-xs">
                <Download size={13} />
                Download .lic
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono bg-slate-950 text-emerald-400 rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed">
            {generatedLic}
          </pre>
        </div>
      )}

      {/* Upload & Activate section at bottom of Issue tab */}
      <UploadActivatePanel onActivated={onLicenseIssued} organizations={organizations} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "issue">("all");
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [filterExpiring, setFilterExpiring] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lics, orgs] = await Promise.all([
        licenseService.getAll(),
        organizationService.getAll(),
      ]);
      setLicenses(lics);
      setOrganizations(orgs);
    } catch {
      setLicenses([]);
      setOrganizations([]);
      setError("Could not reach backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats
  const totalActive   = licenses.filter((l) => l.status === "ACTIVE").length;
  const totalExpired  = licenses.filter((l) => l.status === "EXPIRED").length;
  const expiringSoon  = licenses.filter((l) => {
    const d = daysUntilExpiry(l.expiryDate);
    return l.status === "ACTIVE" && d !== null && d >= 0 && d <= 30;
  }).length;
  const modulesLicensed = licenses.filter((l) => l.status === "ACTIVE").length;

  const displayedLicenses = filterExpiring
    ? licenses.filter((l) => {
        const d = daysUntilExpiry(l.expiryDate);
        return l.status === "ACTIVE" && d !== null && d >= 0 && d <= 30;
      })
    : licenses;

  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  const handleDeactivate = async (licenseId: string, moduleName: string) => {
    try {
      await licenseService.deactivate(licenseId);
      toast.success(`Module ${moduleName} deactivated`);
      fetchData();
    } catch {
      toast.error("Deactivation failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">License Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Issue, manage, and revoke module licenses for customer deployments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={fetchData}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                const result = await licenseService.verifyAll();
                toast.success(`Integrity check complete — ${result.valid}/${result.total} valid, ${result.missing} missing bundle`);
              } catch {
                toast.warning("Backend unavailable for integrity check");
              }
            }}
          >
            <ShieldCheck size={14} />
            Verify Integrity
          </button>
          <button
            className="btn-primary"
            onClick={() => setActiveTab("issue")}
          >
            <ShieldCheck size={14} />
            <Plus size={12} />
            Issue License Bundle
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {error}
          </div>
          <button onClick={() => setError(null)}>
            <X size={15} className="text-amber-500 hover:text-amber-700" />
          </button>
        </div>
      )}

      {/* ── Expiry alert banner ── */}
      {!alertDismissed && expiringSoon > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-500" />
            <span>
              <strong>{expiringSoon} license{expiringSoon > 1 ? "s" : ""}</strong> expiring within 30 days.{" "}
              <button
                className="underline hover:no-underline font-medium"
                onClick={() => { setFilterExpiring(true); setActiveTab("all"); }}
              >
                View expiring licenses
              </button>
            </span>
          </div>
          <button onClick={() => setAlertDismissed(true)}>
            <X size={15} className="text-amber-500 hover:text-amber-700" />
          </button>
        </div>
      )}

      {/* ── Stats row ── */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-24" />
              <div className="h-7 bg-slate-100 rounded w-12 mt-1" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 text-slate-500">
              <ShieldCheck size={15} className="text-emerald-500" />
              <span className="stat-label">Total Active</span>
            </div>
            <div className="stat-value text-emerald-600">{totalActive}</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-slate-500">
              <AlertTriangle size={15} className="text-amber-500" />
              <span className="stat-label">Expiring Soon</span>
            </div>
            <div className="stat-value text-amber-600">{expiringSoon}</div>
            <span className="text-[10px] text-slate-400">within 30 days</span>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-slate-500">
              <X size={15} className="text-red-500" />
              <span className="stat-label">Expired</span>
            </div>
            <div className="stat-value text-red-600">{totalExpired}</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-slate-500">
              <Package size={15} className="text-nexus-500" />
              <span className="stat-label">Modules Licensed</span>
            </div>
            <div className="stat-value text-nexus-600">{modulesLicensed}</div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(["all", "issue"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === tab
                ? "border-nexus-600 text-nexus-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }
            `}
          >
            {tab === "all" ? "All Licenses" : "Issue License"}
          </button>
        ))}
        {filterExpiring && activeTab === "all" && (
          <span className="ml-2 badge badge-yellow text-[11px]">
            Filtered: expiring soon
            <button
              className="ml-1 hover:text-amber-900"
              onClick={() => setFilterExpiring(false)}
            >
              <X size={10} />
            </button>
          </span>
        )}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "all" && (
        <div>
          {loading ? (
            <div className="table-container">
              <div className="p-8 text-center text-slate-400 text-sm">Loading licenses…</div>
            </div>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Status</th>
                      <th>Expiry Date</th>
                      <th>Max Users</th>
                      <th>License Hash</th>
                      <th>Activated At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLicenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-slate-400 py-10">
                          No licenses found
                        </td>
                      </tr>
                    ) : (
                      displayedLicenses.map((lic) => (
                        <tr key={lic.id}>
                          {/* Module */}
                          <td>
                            <div className="flex items-center gap-2 font-medium text-slate-800">
                              <ModuleIcon moduleId={lic.moduleId} />
                              {lic.moduleName || lic.moduleId}
                            </div>
                          </td>

                          {/* Status */}
                          <td>{statusBadge(lic.status)}</td>

                          {/* Expiry */}
                          <td>
                            {lic.expiryDate ? (
                              <span className={expiryColorClass(lic.expiryDate)}>
                                {formatDate(lic.expiryDate)}
                                {(() => {
                                  const d = daysUntilExpiry(lic.expiryDate);
                                  if (d === null) return null;
                                  if (d < 0) return <span className="ml-1 text-[10px]">(expired)</span>;
                                  if (d <= 30) return <span className="ml-1 text-[10px]">({d}d left)</span>;
                                  return null;
                                })()}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Max Users */}
                          <td>{lic.maxUsers > 0 ? lic.maxUsers : "—"}</td>

                          {/* Hash */}
                          <td>
                            {lic.licenseFileHash ? (
                              <div className="flex items-center gap-1">
                                <code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded max-w-[140px] truncate block">
                                  {lic.licenseFileHash.slice(0, 20)}…
                                </code>
                                <button
                                  title="Copy full hash"
                                  onClick={() => copyHash(lic.licenseFileHash!)}
                                  className="shrink-0 text-slate-400 hover:text-nexus-600 transition-colors"
                                >
                                  {copiedHash === lic.licenseFileHash
                                    ? <Check size={13} className="text-emerald-500" />
                                    : <Copy size={13} />
                                  }
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Activated At */}
                          <td className="text-slate-500 text-xs">
                            {lic.activatedAt ? formatDateTime(lic.activatedAt) : "—"}
                          </td>

                          {/* Actions */}
                          <td>
                            <div className="flex items-center gap-1">
                              {lic.status === "ACTIVE" ? (
                                <button
                                  onClick={() => handleDeactivate(lic.id, lic.moduleName)}
                                  className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600
                                             hover:bg-red-50 transition-colors"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => { setActiveTab("issue"); }}
                                  className="text-xs px-2.5 py-1 rounded-md border border-nexus-200 text-nexus-600
                                             hover:bg-nexus-50 transition-colors"
                                >
                                  Reactivate
                                </button>
                              )}
                              {lic.fingerprint && (
                                <CopyButton text={lic.fingerprint} label="Copy Fingerprint" />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Integrity check panel */}
              <IntegrityPanel />
            </>
          )}
        </div>
      )}

      {activeTab === "issue" && (
        <IssueLicenseTab organizations={organizations} onLicenseIssued={fetchData} />
      )}
    </div>
  );
}
