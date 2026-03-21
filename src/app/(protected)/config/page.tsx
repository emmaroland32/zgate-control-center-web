/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  SlidersHorizontal,
  Key,
  Eye,
  EyeOff,
  Copy,
  Download,
  Save,
  RefreshCw,
  Shield,
  Database,
  Mail,
  HardDrive,
  Zap,
  Settings,
  Check,
  AlertTriangle,
  History,
  Plus,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { configService, organizationService } from "@/services/nexus.service";
import { timeAgo, formatDateTime } from "@/lib/utils";
import type { ConfigEntry, ConfigTemplate, ConfigSnapshot, ConfigCategory, ConfigValueType } from "@/types";

// ─── Extended types ────────────────────────────────────────────────────────────
interface SnapshotMock extends ConfigSnapshot {
  orgName: string;
}

const TEMPLATES: ConfigTemplate[] = [
  {
    id: "tpl-starter",
    name: "Starter",
    description: "For development and POC deployments. Uses default credentials, debug mode enabled, minimal security hardening.",
    tier: "STARTER",
    entries: [
      { key: "APP_ENV", value: "development" },
      { key: "APP_LOG_LEVEL", value: "DEBUG" },
      { key: "JWT_EXPIRY_HOURS", value: "24" },
      { key: "BCRYPT_ROUNDS", value: "10" },
      { key: "RATE_LIMIT_RPM", value: "1000" },
      { key: "DB_MAX_POOL_SIZE", value: "5" },
    ],
  },
  {
    id: "tpl-standard",
    name: "Standard",
    description: "For staging and production. Proper JWT secrets, TLS email, balanced resource limits, audit logging enabled.",
    tier: "STANDARD",
    entries: [
      { key: "APP_ENV", value: "production" },
      { key: "APP_LOG_LEVEL", value: "INFO" },
      { key: "JWT_EXPIRY_HOURS", value: "8" },
      { key: "BCRYPT_ROUNDS", value: "12" },
      { key: "RATE_LIMIT_RPM", value: "500" },
      { key: "DB_MAX_POOL_SIZE", value: "20" },
      { key: "FEATURE_AUDIT_LOG", value: "true" },
      { key: "FEATURE_2FA", value: "true" },
    ],
  },
  {
    id: "tpl-enterprise",
    name: "Enterprise",
    description: "Full configuration for enterprise deployments. HA-ready settings, external SMTP, S3 storage, everything audited.",
    tier: "ENTERPRISE",
    entries: [
      { key: "APP_ENV", value: "production" },
      { key: "APP_LOG_LEVEL", value: "INFO" },
      { key: "JWT_EXPIRY_HOURS", value: "4" },
      { key: "BCRYPT_ROUNDS", value: "14" },
      { key: "RATE_LIMIT_RPM", value: "300" },
      { key: "DB_MAX_POOL_SIZE", value: "50" },
      { key: "FEATURE_AUDIT_LOG", value: "true" },
      { key: "FEATURE_2FA", value: "true" },
      { key: "STORAGE_TYPE", value: "s3" },
      { key: "MAX_UPLOAD_MB", value: "200" },
    ],
  },
];

// ─── Category config ───────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  ALL: { icon: Settings, color: "text-slate-500" },
  DATABASE: { icon: Database, color: "text-blue-600" },
  REDIS: { icon: Zap, color: "text-red-500" },
  SECURITY: { icon: Shield, color: "text-purple-600" },
  EMAIL: { icon: Mail, color: "text-emerald-600" },
  STORAGE: { icon: HardDrive, color: "text-amber-600" },
  FEATURES: { icon: Zap, color: "text-nexus-600" },
  APP: { icon: Settings, color: "text-slate-600" },
};

const CATEGORIES: Array<ConfigCategory | "ALL"> = [
  "ALL", "DATABASE", "REDIS", "SECURITY", "EMAIL", "STORAGE", "FEATURES", "APP",
];

const TEMPLATE_STYLE: Record<string, { border: string; badge: string; bg: string; btnClass: string }> = {
  STARTER: {
    border: "border-emerald-200",
    badge: "badge badge-green",
    bg: "bg-emerald-50",
    btnClass: "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors",
  },
  STANDARD: {
    border: "border-blue-200",
    badge: "badge badge-blue",
    bg: "bg-blue-50",
    btnClass: "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors",
  },
  ENTERPRISE: {
    border: "border-purple-200",
    badge: "badge badge-purple",
    bg: "bg-purple-50",
    btnClass: "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors",
  },
};

const TYPE_BADGE: Record<ConfigValueType, string> = {
  string: "badge badge-gray",
  number: "badge badge-blue",
  boolean: "badge badge-green",
  secret: "badge badge-red",
  json: "badge badge-yellow",
};

type Tab = "values" | "templates" | "snapshots" | "env";

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const [selectedOrgId, setSelectedOrgId] = useState("org-fnb");
  const [activeTab, setActiveTab] = useState<Tab>("values");
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<ConfigCategory | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMock[]>([]);
  const [confirmTemplateId, setConfirmTemplateId] = useState<string | null>(null);
  const [restoreSnapshotId, setRestoreSnapshotId] = useState<string | null>(null);
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await configService.getAll();
      if (Array.isArray(data) && data.length > 0) setConfigs(data);
      else setConfigs([]);
    } catch {
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    organizationService.getAll().then((data) => {
      if (Array.isArray(data)) setOrgs(data.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })));
    }).catch(() => {});
    configService.getSnapshots().then((data) => {
      if (Array.isArray(data)) setSnapshots(data.map((s: SnapshotMock) => ({ ...s, orgName: s.organizationId ?? "" })));
    }).catch(() => {});
  }, [fetchConfig]);

  const filteredConfigs = useMemo(() => {
    let result = configs;
    if (selectedCategory !== "ALL") result = result.filter((c) => c.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) => c.key.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [configs, selectedCategory, searchQuery]);

  const getValue = (entry: ConfigEntry) => {
    if (dirtyKeys.has(entry.key)) return editedValues[entry.key] ?? entry.value;
    return entry.value;
  };

  const getDisplayValue = (entry: ConfigEntry) => {
    const raw = getValue(entry);
    if (entry.isSecret && !showSecrets && !revealedKeys.has(entry.key)) {
      return raw ? "*".repeat(Math.min(raw.length, 16)) : "";
    }
    return raw;
  };

  const handleChange = (key: string, val: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: val }));
    setDirtyKeys((prev) => new Set([...prev, key]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const batch: Record<string, string> = {};
      dirtyKeys.forEach((k) => { batch[k] = editedValues[k] ?? ""; });
      await configService.updateBatch(batch);
      // Apply locally
      setConfigs((prev) => prev.map((c) => dirtyKeys.has(c.key) ? { ...c, value: editedValues[c.key] ?? c.value } : c));
      setDirtyKeys(new Set());
      setEditedValues({});
      showToast("Configuration saved successfully");
    } catch {
      showToast("Failed to save configuration", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setEditedValues({});
    setDirtyKeys(new Set());
    showToast("Changes discarded");
  };

  const applyTemplate = (templateId: string) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const newEdited = { ...editedValues };
    const newDirty = new Set(dirtyKeys);
    tpl.entries.forEach((e) => {
      if (e.key && e.value !== undefined) {
        newEdited[e.key] = e.value;
        newDirty.add(e.key);
      }
    });
    setEditedValues(newEdited);
    setDirtyKeys(newDirty);
    setConfirmTemplateId(null);
    showToast(`Template "${tpl.name}" applied — ${tpl.entries.length} values updated`);
  };

  const takeSnapshot = async () => {
    try {
      const saved = await configService.takeSnapshot(selectedOrgId, "Manual snapshot");
      const orgName = orgs.find((o) => o.id === selectedOrgId)?.name ?? selectedOrgId;
      setSnapshots((prev) => [{ ...saved, orgName }, ...prev]);
      showToast("Snapshot created");
    } catch {
      showToast("Failed to create snapshot", "err");
    }
  };

  const toggleRevealSecret = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const copyKey = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
  };

  // Generate env file content
  const envFileContent = useMemo(() => {
    return configs
      .map((c) => {
        const val = getValue(c);
        const masked = c.isSecret && !showSecrets ? "*".repeat(16) : val;
        return `${c.key}=${masked}`;
      })
      .join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, showSecrets, editedValues]);

  const downloadEnv = () => {
    const blob = new Blob([envFileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyEnv = () => {
    navigator.clipboard.writeText(envFileContent).then(() => {
      setCopiedEnv(true);
      setTimeout(() => setCopiedEnv(false), 2000);
    });
  };

  const restoreSnap = snapshots.find((s) => s.id === restoreSnapshotId);

  const TABS: { id: Tab; label: string }[] = [
    { id: "values", label: "Config Values" },
    { id: "templates", label: "Templates" },
    { id: "snapshots", label: "Snapshots" },
    { id: "env", label: "Env File" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2
            ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.type === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Apply template confirm */}
      {confirmTemplateId && (() => {
        const tpl = TEMPLATES.find((t) => t.id === confirmTemplateId);
        if (!tpl) return null;
        return (
          <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Apply Template</h3>
                  <p className="text-sm text-slate-500">"{tpl.name}" template</p>
                </div>
              </div>
              <p className="text-sm text-slate-700">
                This will overwrite{" "}
                <span className="font-semibold text-slate-900">{tpl.entries.length} config values</span> with template defaults. Unsaved changes will be replaced. Continue?
              </p>
              <div className="flex gap-3 justify-end">
                <button className="btn-secondary" onClick={() => setConfirmTemplateId(null)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={() => applyTemplate(confirmTemplateId)}>
                  <Check size={14} />
                  Apply Template
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Restore snapshot confirm */}
      {restoreSnapshotId && restoreSnap && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <History size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Restore Snapshot</h3>
                <p className="text-sm text-slate-500">{restoreSnap.id}</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              This will overwrite your current configuration with the snapshot taken on{" "}
              <span className="font-semibold text-slate-900">{formatDateTime(restoreSnap.takenAt)}</span>. Are you sure?
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setRestoreSnapshotId(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    await configService.restoreSnapshot(restoreSnapshotId!);
                    setRestoreSnapshotId(null);
                    showToast("Snapshot restored");
                    fetchConfig();
                  } catch {
                    showToast("Failed to restore snapshot", "err");
                  }
                }}
              >
                <History size={14} />
                Restore Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete snapshot confirm */}
      {deleteSnapshotId && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-slate-900">Delete Snapshot</h3>
            <p className="text-sm text-slate-700">
              Permanently delete snapshot{" "}
              <span className="font-mono font-semibold text-red-600">{deleteSnapshotId}</span>?
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setDeleteSnapshotId(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  try {
                    await configService.deleteSnapshot(deleteSnapshotId!);
                    setSnapshots((prev) => prev.filter((s) => s.id !== deleteSnapshotId));
                    setDeleteSnapshotId(null);
                    showToast("Snapshot deleted");
                  } catch {
                    showToast("Failed to delete snapshot", "err");
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-nexus-100 flex items-center justify-center">
            <SlidersHorizontal size={18} className="text-nexus-600" />
          </div>
          <h1 className="page-title">Configuration</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="select w-52 text-sm"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={takeSnapshot}>
            <History size={14} />
            Take Snapshot
          </button>
          <button className="btn-secondary" onClick={() => setActiveTab("templates")}>
            <RefreshCw size={14} />
            Load Template
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || dirtyKeys.size === 0}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
            {dirtyKeys.size > 0 && (
              <span className="ml-1 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                {dirtyKeys.size}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {dirtyKeys.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 font-medium">
            {dirtyKeys.size} unsaved change{dirtyKeys.size > 1 ? "s" : ""}
          </span>
          <button
            className="ml-auto text-xs text-amber-700 hover:text-amber-900 font-medium underline"
            onClick={handleResetToDefaults}
          >
            Discard all
          </button>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id
                ? "border-nexus-600 text-nexus-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════ TAB: CONFIG VALUES ════════════════════ */}
      {activeTab === "values" && (
        <div className="flex gap-5">
          {/* Category sidebar */}
          <div className="w-44 shrink-0 space-y-1">
            {CATEGORIES.map((cat) => {
              const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG["ALL"];
              const Icon = cfg.icon;
              const count = cat === "ALL" ? configs.length : configs.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
                    ${selectedCategory === cat
                      ? "bg-nexus-100 text-nexus-700"
                      : "text-slate-600 hover:bg-slate-100"
                    }`}
                >
                  <Icon size={14} className={cfg.color} />
                  <span className="flex-1">{cat === "ALL" ? "All" : cat.charAt(0) + cat.slice(1).toLowerCase()}</span>
                  <span className="text-xs text-slate-400 font-normal">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Config table */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Top bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search keys or descriptions..."
                  className="input pl-9 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
                  ${showSecrets
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                onClick={() => setShowSecrets((v) => !v)}
              >
                {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
                {showSecrets ? "Hide Secrets" : "Show Secrets"}
              </button>
              <button className="btn-secondary" onClick={handleResetToDefaults}>
                <RotateCcw size={14} />
                Reset
              </button>
            </div>

            <div className="table-container">
              {loading ? (
                <div className="px-5 py-12 text-center text-slate-400 text-sm">Loading configuration...</div>
              ) : filteredConfigs.length === 0 ? (
                <div className="px-5 py-12 text-center text-slate-400 text-sm">No config entries found.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConfigs.map((entry) => {
                      const isDirty = dirtyKeys.has(entry.key);
                      const isRevealed = revealedKeys.has(entry.key);
                      const displayVal = getDisplayValue(entry);
                      return (
                        <tr key={entry.key} className={isDirty ? "bg-amber-50 hover:bg-amber-50" : ""}>
                          {/* Key */}
                          <td>
                            <div className="flex items-center gap-1.5">
                              {isDirty && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unsaved change" />
                              )}
                              {entry.required && !isDirty && (
                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Required" />
                              )}
                              <span className="font-mono font-semibold text-slate-800 text-sm">{entry.key}</span>
                              <button
                                className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                                onClick={() => copyKey(entry.key)}
                                title="Copy key"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          </td>

                          {/* Value (editable) */}
                          <td>
                            <div className="flex items-center gap-1 min-w-[200px] max-w-[300px]">
                              {entry.type === "boolean" ? (
                                <select
                                  className="select text-sm py-1"
                                  value={getValue(entry)}
                                  onChange={(e) => handleChange(entry.key, e.target.value)}
                                >
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : (
                                <input
                                  type={entry.isSecret && !showSecrets && !isRevealed ? "password" : "text"}
                                  className="input text-sm font-mono py-1 flex-1"
                                  value={getValue(entry)}
                                  onChange={(e) => handleChange(entry.key, e.target.value)}
                                />
                              )}
                              {entry.isSecret && (
                                <button
                                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                                  onClick={() => toggleRevealSecret(entry.key)}
                                  title={isRevealed ? "Hide" : "Show"}
                                >
                                  {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Type */}
                          <td>
                            <span className={TYPE_BADGE[entry.type] ?? "badge badge-gray"}>{entry.type}</span>
                          </td>

                          {/* Description */}
                          <td>
                            <span className="text-xs text-slate-500">{entry.description ?? "—"}</span>
                          </td>

                          {/* Updated */}
                          <td>
                            <div>
                              <div className="text-xs text-slate-500">{entry.lastUpdated ? timeAgo(entry.lastUpdated) : "—"}</div>
                              {entry.updatedBy && (
                                <div className="text-[10px] text-slate-400">{entry.updatedBy}</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ TAB: TEMPLATES ════════════════════ */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {TEMPLATES.map((tpl) => {
            const style = TEMPLATE_STYLE[tpl.tier];
            return (
              <div key={tpl.id} className={`card p-5 border-2 ${style.border} space-y-4`}>
                <div className={`inline-flex items-center justify-between w-full`}>
                  <span className={style.badge}>{tpl.tier}</span>
                  <Key size={16} className="text-slate-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{tpl.name}</h3>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{tpl.description}</p>
                </div>
                <div className={`rounded-lg p-3 ${style.bg} space-y-1`}>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Configures</div>
                  {tpl.entries.map((e) => (
                    <div key={e.key} className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-600">{e.key}</span>
                      <span className="font-mono text-xs font-semibold text-slate-800">{e.value}</span>
                    </div>
                  ))}
                </div>
                <button
                  className={style.btnClass}
                  onClick={() => setConfirmTemplateId(tpl.id)}
                >
                  <Check size={14} />
                  Apply Template
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════ TAB: SNAPSHOTS ════════════════════ */}
      {activeTab === "snapshots" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button className="btn-primary" onClick={takeSnapshot}>
              <Plus size={14} />
              Take Snapshot
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Snapshot ID</th>
                  <th>Organization</th>
                  <th>Taken At</th>
                  <th>Taken By</th>
                  <th>Note</th>
                  <th>Entries</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr key={snap.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-600" title={snap.id}>
                        {snap.id.slice(0, 12)}…
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-700">{snap.orgName}</span>
                    </td>
                    <td>
                      <div className="text-sm text-slate-700">{formatDateTime(snap.takenAt)}</div>
                      <div className="text-xs text-slate-400">{timeAgo(snap.takenAt)}</div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600">{snap.takenBy}</span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-500 italic">{snap.note ?? "—"}</span>
                    </td>
                    <td>
                      <span className="badge badge-gray">{snap.entryCount}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          className="btn-secondary py-1 px-2 text-xs"
                          onClick={() => setRestoreSnapshotId(snap.id)}
                        >
                          <History size={12} />
                          Restore
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          onClick={() => setDeleteSnapshotId(snap.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════ TAB: ENV FILE ════════════════════ */}
      {activeTab === "env" && (
        <div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-200 flex items-start gap-3">
            <Settings size={16} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <span className="font-semibold">Instructions: </span>
              Copy this file to your server as <span className="font-mono bg-blue-100 px-1 rounded">.env</span> alongside{" "}
              <span className="font-mono bg-blue-100 px-1 rounded">docker-compose.yml</span>. Ensure the file is not committed to version control.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
                ${showSecrets
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              onClick={() => setShowSecrets((v) => !v)}
            >
              {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
              {showSecrets ? "Hide Secrets" : "Show Secrets"}
            </button>
            <button className="btn-secondary" onClick={copyEnv}>
              {copiedEnv ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copiedEnv ? "Copied!" : "Copy"}
            </button>
            <button className="btn-primary" onClick={downloadEnv}>
              <Download size={14} />
              Download .env
            </button>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-700">
            <div className="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="ml-2 text-xs text-slate-400 font-mono">.env</span>
              <span className="ml-auto text-xs text-slate-500">{configs.length} entries</span>
            </div>
            <div className="bg-slate-900 p-5 overflow-x-auto max-h-[600px]">
              <pre className="font-mono text-sm leading-relaxed">
                {configs.map((entry, i) => {
                  const val = getValue(entry);
                  const masked = entry.isSecret && !showSecrets ? "*".repeat(16) : val;
                  const isCurrentCat = i === 0 || entry.category !== configs[i - 1]?.category;
                  return (
                    <span key={entry.key}>
                      {isCurrentCat && (
                        <span className="text-slate-500">{`\n# ── ${entry.category} ──\n`}</span>
                      )}
                      <span className="text-blue-400">{entry.key}</span>
                      <span className="text-slate-400">=</span>
                      <span className={entry.isSecret && !showSecrets ? "text-slate-500" : "text-emerald-400"}>
                        {masked}
                      </span>
                      {"\n"}
                    </span>
                  );
                })}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
