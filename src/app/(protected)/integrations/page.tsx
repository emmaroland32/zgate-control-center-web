/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug, Key, Plus, Copy, Eye, EyeOff, RefreshCw, Trash2,
  Check, ExternalLink, Bell, Settings, AlertTriangle, X,
  CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { integrationService } from "@/services/nexus.service";
import { timeAgo, formatDate } from "@/lib/utils";
import type { NexusIntegration } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastTriggered?: string;
  successRate: number;
  secret?: string;
}

interface ApiKey {
  id: string;
  name: string;
  keyMasked: string;
  keyFull?: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
  revoked: boolean;
}

interface WebhookLog {
  id: string;
  webhookName: string;
  event: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  statusCode?: number;
  timestamp: string;
  duration: number;
}

const ALL_EVENTS = [
  "deployment.created", "deployment.failed", "deployment.completed", "deployment.rollback",
  "license.activated", "license.expiring", "license.expired", "license.revoked",
  "org.created", "org.suspended", "org.deleted",
  "release.published", "release.approved", "release.rejected",
  "health.degraded", "health.restored", "health.offline",
];

const ALL_SCOPES = [
  "orgs:read", "orgs:write",
  "licenses:read", "licenses:write",
  "releases:read", "releases:write",
  "deployments:read", "deployments:write",
  "health:read",
  "audit:read",
  "users:read",
];

// ─── Integration icon & color map ─────────────────────────────────────────────

function IntegrationIcon({ type, size = 20 }: { type: NexusIntegration["type"]; size?: number }) {
  const map: Record<NexusIntegration["type"], { bg: string; label: string }> = {
    SLACK: { bg: "bg-[#4A154B]", label: "S" },
    EMAIL: { bg: "bg-blue-600", label: "✉" },
    TEAMS: { bg: "bg-[#6264A7]", label: "T" },
    PAGERDUTY: { bg: "bg-[#06AC38]", label: "PD" },
    JIRA: { bg: "bg-[#0052CC]", label: "J" },
    GITHUB: { bg: "bg-slate-800", label: "GH" },
    WEBHOOK: { bg: "bg-nexus-600", label: "W" },
  };
  const { bg, label } = map[type] ?? { bg: "bg-slate-400", label: "?" };
  return (
    <span
      className={`${bg} text-white rounded-xl flex items-center justify-center font-bold text-xs`}
      style={{ width: size * 2, height: size * 2 }}
    >
      {label}
    </span>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-200 rounded w-1/3" />
          <div className="h-2.5 bg-slate-100 rounded w-2/3" />
        </div>
      </div>
      <div className="h-8 bg-slate-100 rounded w-full" />
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-slate-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

// ─── Configure Integration Dialog ────────────────────────────────────────────

function ConfigureDialog({ integration, onClose, onSaved }: {
  integration: NexusIntegration | null;
  onClose: () => void;
  onSaved: (id: string, config: Record<string, string>) => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (integration) { setConfig({ ...integration.config }); setError(null); }
  }, [integration]);

  if (!integration) return null;

  const fields: Record<NexusIntegration["type"], { key: string; label: string; placeholder?: string; type?: string }[]> = {
    SLACK: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/…" },
      { key: "channel", label: "Channel", placeholder: "#zgate-alerts" },
    ],
    EMAIL: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.sendgrid.net" },
      { key: "port", label: "SMTP Port", placeholder: "587" },
      { key: "username", label: "Username", placeholder: "apikey" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
      { key: "from", label: "From Address", placeholder: "noreply@zgate.io" },
    ],
    TEAMS: [
      { key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://outlook.office.com/webhook/…" },
    ],
    PAGERDUTY: [
      { key: "integrationKey", label: "Integration Key", placeholder: "pd_xxxx_yyyy" },
      { key: "severity", label: "Severity Level", placeholder: "critical" },
    ],
    JIRA: [
      { key: "baseUrl", label: "Jira Base URL", placeholder: "https://yourcompany.atlassian.net" },
      { key: "projectKey", label: "Project Key", placeholder: "OPS" },
      { key: "token", label: "API Token", type: "password", placeholder: "••••••••" },
    ],
    GITHUB: [
      { key: "token", label: "Personal Access Token", type: "password", placeholder: "ghp_…" },
      { key: "org", label: "Organization", placeholder: "zgate-io" },
      { key: "repo", label: "Repository", placeholder: "releases" },
    ],
    WEBHOOK: [
      { key: "url", label: "URL", placeholder: "https://…" },
      { key: "secret", label: "Secret", type: "password", placeholder: "Signing secret" },
    ],
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await integrationService.updateIntegrationConfig(integration!.id, JSON.stringify(config));
      onSaved(integration!.id, config);
    } catch {
      setError("Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <IntegrationIcon type={integration.type} size={14} />
            <h2 className="text-base font-bold text-slate-900">Configure {integration.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          {(fields[integration.type] ?? []).map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input
                className="input"
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Webhook Dialog ───────────────────────────────────────────────────────

function AddWebhookDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (wh: Webhook) => void;
}) {
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.url) { setError("Name and URL are required."); return; }
    if (form.events.length === 0) { setError("Select at least one event."); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await integrationService.createWebhook(form);
      onCreated({
        id: created.id, name: created.name ?? form.name, url: created.url ?? form.url,
        events: created.events ?? form.events, enabled: true, successRate: 100, secret: form.secret,
      });
      setForm({ name: "", url: "", secret: "", events: [] });
      onClose();
    } catch {
      setError("Failed to create webhook.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell size={16} className="text-nexus-500" />
            Add Webhook
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Webhook Name</label>
            <input className="input" placeholder="e.g. Deployment Notifier" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Endpoint URL</label>
            <input className="input" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div>
            <label className="label">Signing Secret <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className="input" type="password" placeholder="Used to verify payload signature" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          </div>
          <div>
            <label className="label">Events to Subscribe</label>
            <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-nexus-600"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  <span className="text-xs text-slate-600 group-hover:text-slate-900 font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? "Creating…" : "Create Webhook"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Generate API Key Dialog ──────────────────────────────────────────────────

function GenerateKeyDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
}) {
  const [form, setForm] = useState({ name: "", scopes: [] as string[], expiry: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(s: string) {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(s) ? f.scopes.filter((x) => x !== s) : [...f.scopes, s],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError("Key name is required."); return; }
    if (form.scopes.length === 0) { setError("Select at least one scope."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await integrationService.createApiKey(form);
      const rawKey = result.rawKey;
      const apiKey = result.apiKey;
      const last4 = rawKey.slice(-4);
      const newKey: ApiKey = {
        id: apiKey.id, name: apiKey.name,
        keyMasked: `${apiKey.keyPrefix || rawKey.slice(0, 8)}••••••••${last4}`, keyFull: rawKey,
        scopes: typeof apiKey.scopes === "string" ? JSON.parse(apiKey.scopes) : apiKey.scopes,
        createdAt: apiKey.createdAt || new Date().toISOString(), revoked: false,
        expiresAt: apiKey.expiresAt,
      };
      setCreatedKey(rawKey);
      onCreated(newKey);
    } catch {
      setError("Failed to create API key.");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey).catch(() => { /* ok */ });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose() {
    setCreatedKey(null);
    setCopied(false);
    setForm({ name: "", scopes: [], expiry: "" });
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Key size={16} className="text-nexus-500" />
            {createdKey ? "API Key Created" : "Generate API Key"}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Copy this key now. It will <strong>not</strong> be shown again once you close this dialog.</span>
            </div>
            <div>
              <label className="label">Your API Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 break-all">
                  {createdKey}
                </code>
              </div>
            </div>
            <button onClick={handleCopy} className={`w-full btn-primary justify-center ${copied ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied!" : "Copy Key"}
            </button>
            <button onClick={handleClose} className="w-full btn-secondary justify-center">Done</button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Key Name</label>
                <input className="input" placeholder="e.g. CI/CD Pipeline" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Expiry Date <span className="text-slate-400 font-normal">(optional, leave blank for no expiry)</span></label>
                <input className="input" type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
              </div>
              <div>
                <label className="label">Scopes</label>
                <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-1.5">
                  {ALL_SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-nexus-600" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
                      <span className="text-xs font-mono text-slate-600 group-hover:text-slate-900">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                  {saving ? "Generating…" : "Generate Key"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "integrations" | "webhooks" | "apikeys";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("integrations");
  const [integrations, setIntegrations] = useState<NexusIntegration[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configTarget, setConfigTarget] = useState<NexusIntegration | null>(null);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [showGenKey, setShowGenKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ints, whs, keys, logs] = await Promise.allSettled([
        integrationService.getIntegrations(),
        integrationService.getWebhooks(),
        integrationService.getApiKeys(),
        integrationService.getWebhookLogs(),
      ]);
      setIntegrations(ints.status === "fulfilled" && Array.isArray(ints.value) ? ints.value : []);
      setWebhooks(whs.status === "fulfilled" && Array.isArray(whs.value) ? whs.value : []);
      setApiKeys(keys.status === "fulfilled" && Array.isArray(keys.value) ? keys.value : []);
      setWebhookLogs(logs.status === "fulfilled" && Array.isArray(logs.value) ? logs.value : []);
    } catch {
      setIntegrations([]);
      setWebhooks([]);
      setApiKeys([]);
      setWebhookLogs([]);
      setError("Failed to load data. API unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleIntegration(id: string) {
    try {
      await integrationService.toggleIntegration(id);
      setIntegrations((prev) => prev.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x));
    } catch {
      toast.error("Failed to toggle integration");
    }
  }

  async function toggleWebhook(id: string) {
    try {
      await integrationService.toggleWebhook(id);
      setWebhooks((prev) => prev.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x));
    } catch {
      toast.error("Failed to toggle webhook");
    }
  }

  async function deleteWebhook(id: string) {
    try {
      await integrationService.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error("Failed to delete webhook");
    }
  }

  async function revokeApiKey(id: string) {
    try {
      await integrationService.revokeApiKey(id);
      setApiKeys((prev) => prev.map((x) => x.id === id ? { ...x, revoked: true } : x));
    } catch {
      toast.error("Failed to revoke API key");
    }
  }

  function copyKey(masked: string) {
    setCopiedKey(masked);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "integrations", label: "Integrations", icon: <Plug size={14} /> },
    { key: "webhooks", label: "Webhooks", icon: <Bell size={14} /> },
    { key: "apikeys", label: "API Keys", icon: <Key size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">Integrations</h1>
            {error && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> {error}
              </span>
            )}
          </div>
          <button onClick={load} disabled={loading} className="btn-secondary py-1.5 px-3 text-xs">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-nexus-600 text-nexus-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── INTEGRATIONS TAB ─────────────────────────────────────────── */}
        {tab === "integrations" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : integrations.map((int) => (
                <div key={int.id} className="card p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <IntegrationIcon type={int.type} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{int.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {int.type === "SLACK" && "Post alerts to Slack channels"}
                        {int.type === "EMAIL" && "Send email notifications via SMTP"}
                        {int.type === "TEAMS" && "Post alerts to Microsoft Teams"}
                        {int.type === "PAGERDUTY" && "Trigger PagerDuty incidents"}
                        {int.type === "JIRA" && "Create Jira issues automatically"}
                        {int.type === "GITHUB" && "Push release tags to GitHub"}
                        {int.type === "WEBHOOK" && "Generic webhook integration"}
                      </div>
                    </div>
                    {/* Toggle */}
                    <button
                      onClick={() => toggleIntegration(int.id)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${int.enabled ? "bg-nexus-500" : "bg-slate-200"}`}
                      style={{ height: "1.375rem" }}
                      title={int.enabled ? "Disable" : "Enable"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${int.enabled ? "translate-x-4.5" : ""}`}
                        style={{ transform: int.enabled ? "translateX(1.125rem)" : "translateX(0)" }}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`badge ${int.enabled ? "badge-green" : "badge-gray"}`}>
                      {int.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <button
                      onClick={() => setConfigTarget(int)}
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                    >
                      <Settings size={12} />
                      Configure
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── WEBHOOKS TAB ─────────────────────────────────────────────── */}
        {tab === "webhooks" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Registered Webhooks</h2>
              <button onClick={() => setShowAddWebhook(true)} className="btn-primary text-xs py-1.5">
                <Plus size={14} /> Add Webhook
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>URL</th>
                    <th>Events</th>
                    <th>Enabled</th>
                    <th>Last Triggered</th>
                    <th>Success Rate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                    : webhooks.map((wh) => (
                      <tr key={wh.id}>
                        <td className="font-medium text-slate-800">{wh.name}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-slate-500 truncate max-w-[160px]">
                              {wh.url.replace("https://", "")}
                            </span>
                            <a href={wh.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-nexus-500">
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {wh.events.slice(0, 2).map((ev) => (
                              <span key={ev} className="badge badge-blue text-[10px]">{ev}</span>
                            ))}
                            {wh.events.length > 2 && (
                              <span className="badge badge-gray text-[10px]">+{wh.events.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => toggleWebhook(wh.id)}
                            className={`relative w-9 rounded-full transition-colors`}
                            style={{ height: "1.25rem", backgroundColor: wh.enabled ? "#6366f1" : "#e2e8f0" }}
                          >
                            <span
                              className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
                              style={{ left: "0.125rem", transform: wh.enabled ? "translateX(1rem)" : "translateX(0)" }}
                            />
                          </button>
                        </td>
                        <td className="text-xs text-slate-400">
                          {wh.lastTriggered ? timeAgo(wh.lastTriggered) : "—"}
                        </td>
                        <td>
                          <span className={`text-xs font-medium ${wh.successRate >= 95 ? "text-emerald-600" : wh.successRate >= 80 ? "text-amber-600" : "text-red-600"}`}>
                            {wh.successRate.toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button title="Test webhook" className="p-1.5 rounded-lg text-slate-400 hover:text-nexus-600 hover:bg-nexus-50 transition-colors">
                              <RefreshCw size={13} />
                            </button>
                            <button
                              title="Delete webhook"
                              onClick={() => deleteWebhook(wh.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            {/* Webhook Logs */}
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Recent Deliveries</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Webhook</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Code</th>
                      <th>Duration</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-medium text-slate-700 text-xs">{log.webhookName}</td>
                        <td><span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{log.event}</span></td>
                        <td>
                          {log.status === "SUCCESS"
                            ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={12} /> Success</span>
                            : <span className="flex items-center gap-1 text-xs text-red-600"><XCircle size={12} /> Failed</span>}
                        </td>
                        <td><span className={`text-xs font-mono ${(log.statusCode ?? 0) < 400 ? "text-emerald-600" : "text-red-600"}`}>{log.statusCode ?? "—"}</span></td>
                        <td><span className="text-xs text-slate-400">{log.duration}ms</span></td>
                        <td className="text-xs text-slate-400">{timeAgo(log.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── API KEYS TAB ─────────────────────────────────────────────── */}
        {tab === "apikeys" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">API Keys</h2>
              <button onClick={() => setShowGenKey(true)} className="btn-primary text-xs py-1.5">
                <Plus size={14} /> Generate API Key
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Scopes</th>
                    <th>Created</th>
                    <th>Last Used</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                    : apiKeys.map((key) => (
                      <tr key={key.id} className={key.revoked ? "opacity-50" : ""}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{key.name}</span>
                            {key.revoked && <span className="badge badge-red text-[10px]">Revoked</span>}
                          </div>
                        </td>
                        <td>
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            {key.keyMasked}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.slice(0, 2).map((s) => (
                              <span key={s} className="badge badge-gray text-[10px]">{s}</span>
                            ))}
                            {key.scopes.length > 2 && (
                              <span className="badge badge-gray text-[10px]">+{key.scopes.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-xs text-slate-400">{formatDate(key.createdAt)}</td>
                        <td className="text-xs text-slate-400">{key.lastUsed ? timeAgo(key.lastUsed) : "—"}</td>
                        <td>
                          {key.expiresAt
                            ? <span className="text-xs text-slate-500">{formatDate(key.expiresAt)}</span>
                            : <span className="text-xs text-slate-300">Never</span>}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              title={copiedKey === key.keyMasked ? "Copied!" : "Copy key reference"}
                              onClick={() => copyKey(key.keyMasked)}
                              className={`p-1.5 rounded-lg transition-colors ${copiedKey === key.keyMasked ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-nexus-600 hover:bg-nexus-50"}`}
                            >
                              {copiedKey === key.keyMasked ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                            {!key.revoked && (
                              <button
                                title="Revoke key"
                                onClick={() => revokeApiKey(key.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ConfigureDialog
        integration={configTarget}
        onClose={() => setConfigTarget(null)}
        onSaved={(id, config) => {
          setIntegrations((prev) => prev.map((x) => x.id === id ? { ...x, config } : x));
          setConfigTarget(null);
        }}
      />
      <AddWebhookDialog
        open={showAddWebhook}
        onClose={() => setShowAddWebhook(false)}
        onCreated={(wh) => setWebhooks((prev) => [wh, ...prev])}
      />
      <GenerateKeyDialog
        open={showGenKey}
        onClose={() => setShowGenKey(false)}
        onCreated={(key) => setApiKeys((prev) => [key, ...prev])}
      />
    </div>
  );
}
