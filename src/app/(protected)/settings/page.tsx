"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings, Shield, Bell, Key, Package, Save, Check,
  Eye, EyeOff, RefreshCw, AlertTriangle, Globe, Lock,
} from "lucide-react";
import { configService, apiError } from "@/services/controlcenter.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneralConfig {
  systemName: string;
  supportEmail: string;
  defaultTimezone: string;
  dateFormat: string;
  itemsPerPage: string;
}

interface SecurityConfig {
  sessionTimeout: string;
  mfaEnforced: boolean;
  ipAllowlist: string;
  passwordMinLength: string;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  loginLockoutThreshold: string;
}

interface NotificationConfig {
  emailLicenseExpiry: boolean;
  emailDeploymentFailure: boolean;
  emailHealthAlerts: boolean;
  expiryWarningDays: string;
  slackEnabled: boolean;
  slackChannel: string;
}

interface LicensingConfig {
  defaultExpiryMonths: string;
  gracePeriodDays: string;
  publicKeyFingerprint: string;
}

interface RegistryConfig {
  registryUrl: string;
  registryUsername: string;
  registryPassword: string;
  pullPolicy: string;
  mirrorUrl: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_GENERAL: GeneralConfig = {
  systemName: "ZGATE Control Center",
  supportEmail: "support@zgate.io",
  defaultTimezone: "Africa/Johannesburg",
  dateFormat: "MMM D, YYYY",
  itemsPerPage: "25",
};

const DEFAULT_SECURITY: SecurityConfig = {
  sessionTimeout: "30",
  mfaEnforced: false,
  ipAllowlist: "",
  passwordMinLength: "8",
  requireUppercase: true,
  requireNumbers: true,
  requireSymbols: false,
  loginLockoutThreshold: "5",
};

const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  emailLicenseExpiry: true,
  emailDeploymentFailure: true,
  emailHealthAlerts: true,
  expiryWarningDays: "30",
  slackEnabled: true,
  slackChannel: "#zgate-alerts",
};

const DEFAULT_LICENSING: LicensingConfig = {
  defaultExpiryMonths: "12",
  gracePeriodDays: "7",
  publicKeyFingerprint: "",
};

const DEFAULT_REGISTRY: RegistryConfig = {
  registryUrl: "registry.zgate.io",
  registryUsername: "zgate-deploy",
  registryPassword: "",
  pullPolicy: "IfNotPresent",
  mirrorUrl: "",
};

const TIMEZONES = [
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "Africa/Cairo",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "Asia/Singapore", "Asia/Dubai", "Australia/Sydney",
];

const DATE_FORMATS = [
  "MMM D, YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "D MMM YYYY",
];

const PULL_POLICIES = ["Always", "IfNotPresent", "Never"];

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "general" | "security" | "notifications" | "licensing" | "registry";

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{ width: "2.25rem", height: "1.25rem", backgroundColor: checked ? "#6366f1" : "#e2e8f0" }}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
          style={{ left: "0.125rem", transform: checked ? "translateX(1rem)" : "translateX(0)" }}
        />
      </button>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </div>
  );
}

// ─── Save Button ──────────────────────────────────────────────────────────────

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={`btn-primary ${saved ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
    >
      {saving
        ? <RefreshCw size={14} className="animate-spin" />
        : saved
          ? <Check size={14} />
          : <Save size={14} />}
      {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [general, setGeneral] = useState<GeneralConfig>(DEFAULT_GENERAL);
  const [security, setSecurity] = useState<SecurityConfig>(DEFAULT_SECURITY);
  const [notifications, setNotifications] = useState<NotificationConfig>(DEFAULT_NOTIFICATIONS);
  const [licensing, setLicensing] = useState<LicensingConfig>(DEFAULT_LICENSING);
  const [registry, setRegistry] = useState<RegistryConfig>(DEFAULT_REGISTRY);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await configService.getMap();
      // Map flat key-value config to typed objects
      if (data && typeof data === "object") {
        setGeneral((g) => ({ ...g, ...filterKeys(data, Object.keys(DEFAULT_GENERAL)) }));
        setSecurity((s) => ({
          ...s,
          ...filterKeys(data, ["sessionTimeout", "passwordMinLength", "loginLockoutThreshold", "ipAllowlist"]),
          mfaEnforced: data.mfaEnforced === "true",
          requireUppercase: data.requireUppercase === "true",
          requireNumbers: data.requireNumbers === "true",
          requireSymbols: data.requireSymbols === "true",
        }));
        setNotifications((n) => ({
          ...n,
          ...filterKeys(data, ["expiryWarningDays", "slackChannel"]),
          emailLicenseExpiry: data.emailLicenseExpiry === "true",
          emailDeploymentFailure: data.emailDeploymentFailure === "true",
          emailHealthAlerts: data.emailHealthAlerts === "true",
          slackEnabled: data.slackEnabled === "true",
        }));
        setLicensing((l) => ({ ...l, ...filterKeys(data, Object.keys(DEFAULT_LICENSING)) }));
        setRegistry((r) => ({ ...r, ...filterKeys(data, Object.keys(DEFAULT_REGISTRY)) }));
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function filterKeys(obj: Record<string, string>, keys: string[]) {
    return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const flat: Record<string, string> = {
        ...general,
        sessionTimeout: security.sessionTimeout,
        mfaEnforced: String(security.mfaEnforced),
        ipAllowlist: security.ipAllowlist,
        passwordMinLength: security.passwordMinLength,
        requireUppercase: String(security.requireUppercase),
        requireNumbers: String(security.requireNumbers),
        requireSymbols: String(security.requireSymbols),
        loginLockoutThreshold: security.loginLockoutThreshold,
        emailLicenseExpiry: String(notifications.emailLicenseExpiry),
        emailDeploymentFailure: String(notifications.emailDeploymentFailure),
        emailHealthAlerts: String(notifications.emailHealthAlerts),
        expiryWarningDays: notifications.expiryWarningDays,
        slackEnabled: String(notifications.slackEnabled),
        slackChannel: notifications.slackChannel,
        defaultExpiryMonths: licensing.defaultExpiryMonths,
        gracePeriodDays: licensing.gracePeriodDays,
        registryUrl: registry.registryUrl,
        registryUsername: registry.registryUsername,
        pullPolicy: registry.pullPolicy,
        mirrorUrl: registry.mirrorUrl,
      };
      await configService.updateBatch(flat);
      setSaved(true);
    } catch (e) {
      setError(apiError(e));
    }
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleTestConn() {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await configService.testRegistry(
        registry.registryUrl, registry.registryUsername, registry.registryPassword
      );
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setTestingConn(false);
    }
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "general", label: "General", icon: <Globe size={14} /> },
    { key: "security", label: "Security", icon: <Shield size={14} /> },
    { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
    { key: "licensing", label: "Licensing", icon: <Key size={14} /> },
    { key: "registry", label: "Docker Registry", icon: <Package size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">Settings</h1>
            {error && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> {error}
              </span>
            )}
          </div>
          {!loading && <SaveButton saving={saving} saved={saved} onClick={handleSave} />}
        </div>
      </div>

      <div className="px-6 py-5">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200 flex-wrap">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-controlcenter-600 text-controlcenter-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-8 animate-pulse space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 bg-slate-200 rounded w-1/4 mb-2" />
                <div className="h-9 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-6 max-w-3xl">

            {/* ── GENERAL ──────────────────────────────────────────────── */}
            {tab === "general" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Globe size={15} className="text-controlcenter-500" />
                    General Settings
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="label">System Name</label>
                      <input className="input" value={general.systemName} onChange={(e) => setGeneral({ ...general, systemName: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Support Email</label>
                      <input className="input" type="email" value={general.supportEmail} onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Default Timezone</label>
                      <select className="select" value={general.defaultTimezone} onChange={(e) => setGeneral({ ...general, defaultTimezone: e.target.value })}>
                        {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Date Format</label>
                      <select className="select" value={general.dateFormat} onChange={(e) => setGeneral({ ...general, dateFormat: e.target.value })}>
                        {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Items Per Page</label>
                      <select className="select" value={general.itemsPerPage} onChange={(e) => setGeneral({ ...general, itemsPerPage: e.target.value })}>
                        {["10", "25", "50", "100"].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </div>
              </div>
            )}

            {/* ── SECURITY ─────────────────────────────────────────────── */}
            {tab === "security" && (
              <div className="space-y-5">
                <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Shield size={15} className="text-controlcenter-500" />
                  Security Settings
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Session Timeout (minutes)</label>
                    <input className="input" type="number" min="5" max="480" value={security.sessionTimeout}
                      onChange={(e) => setSecurity({ ...security, sessionTimeout: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-1">Idle sessions expire after this duration</p>
                  </div>
                  <div>
                    <label className="label">Failed Login Lockout Threshold</label>
                    <input className="input" type="number" min="1" max="20" value={security.loginLockoutThreshold}
                      onChange={(e) => setSecurity({ ...security, loginLockoutThreshold: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-1">Lock account after N failed attempts</p>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-y border-slate-100">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Enforce MFA</div>
                    <div className="text-xs text-slate-400 mt-0.5">Require multi-factor authentication for all admin users</div>
                  </div>
                  <Toggle checked={security.mfaEnforced} onChange={(v) => setSecurity({ ...security, mfaEnforced: v })} />
                </div>

                <div>
                  <label className="label">IP Allowlist <span className="text-slate-400 font-normal">(one per line, leave blank to allow all)</span></label>
                  <textarea
                    className="input h-24 font-mono text-xs resize-none"
                    placeholder={"192.168.1.0/24\n10.0.0.0/8\n41.0.0.0/8"}
                    value={security.ipAllowlist}
                    onChange={(e) => setSecurity({ ...security, ipAllowlist: e.target.value })}
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Lock size={13} className="text-slate-400" />
                    Password Policy
                  </div>
                  <div className="space-y-3 pl-1">
                    <div>
                      <label className="label">Minimum Length</label>
                      <input className="input w-28" type="number" min="6" max="64" value={security.passwordMinLength}
                        onChange={(e) => setSecurity({ ...security, passwordMinLength: e.target.value })} />
                    </div>
                    <div className="space-y-2.5">
                      <Toggle
                        checked={security.requireUppercase}
                        onChange={(v) => setSecurity({ ...security, requireUppercase: v })}
                        label="Require uppercase letters"
                      />
                      <Toggle
                        checked={security.requireNumbers}
                        onChange={(v) => setSecurity({ ...security, requireNumbers: v })}
                        label="Require numbers"
                      />
                      <Toggle
                        checked={security.requireSymbols}
                        onChange={(v) => setSecurity({ ...security, requireSymbols: v })}
                        label="Require symbols (!@#$…)"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
            {tab === "notifications" && (
              <div className="space-y-5">
                <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Bell size={15} className="text-controlcenter-500" />
                  Notification Settings
                </h2>

                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-3">Email Notifications</div>
                  <div className="space-y-3 pl-1">
                    <Toggle
                      checked={notifications.emailLicenseExpiry}
                      onChange={(v) => setNotifications({ ...notifications, emailLicenseExpiry: v })}
                      label="License expiry warnings"
                    />
                    <Toggle
                      checked={notifications.emailDeploymentFailure}
                      onChange={(v) => setNotifications({ ...notifications, emailDeploymentFailure: v })}
                      label="Deployment failure alerts"
                    />
                    <Toggle
                      checked={notifications.emailHealthAlerts}
                      onChange={(v) => setNotifications({ ...notifications, emailHealthAlerts: v })}
                      label="System health degradation alerts"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Expiry Warning Days</label>
                  <div className="flex items-center gap-2">
                    <input
                      className="input w-28"
                      type="number" min="1" max="90"
                      value={notifications.expiryWarningDays}
                      onChange={(e) => setNotifications({ ...notifications, expiryWarningDays: e.target.value })}
                    />
                    <span className="text-sm text-slate-500">days before expiry</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Send warning emails when licenses expire within this window</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-slate-700">Slack Notifications</div>
                    <Toggle
                      checked={notifications.slackEnabled}
                      onChange={(v) => setNotifications({ ...notifications, slackEnabled: v })}
                    />
                  </div>
                  {notifications.slackEnabled && (
                    <div>
                      <label className="label">Default Slack Channel</label>
                      <input
                        className="input"
                        placeholder="#zgate-alerts"
                        value={notifications.slackChannel}
                        onChange={(e) => setNotifications({ ...notifications, slackChannel: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </div>
              </div>
            )}

            {/* ── LICENSING ─────────────────────────────────────────────── */}
            {tab === "licensing" && (
              <div className="space-y-5">
                <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Key size={15} className="text-controlcenter-500" />
                  Licensing Settings
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Default License Expiry</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input w-24"
                        type="number" min="1" max="60"
                        value={licensing.defaultExpiryMonths}
                        onChange={(e) => setLicensing({ ...licensing, defaultExpiryMonths: e.target.value })}
                      />
                      <span className="text-sm text-slate-500">months</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Applied when no custom expiry is set</p>
                  </div>
                  <div>
                    <label className="label">Grace Period After Expiry</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input w-24"
                        type="number" min="0" max="90"
                        value={licensing.gracePeriodDays}
                        onChange={(e) => setLicensing({ ...licensing, gracePeriodDays: e.target.value })}
                      />
                      <span className="text-sm text-slate-500">days</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">License remains active for this window post-expiry</p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="text-sm font-semibold text-slate-700 mb-3">Public Key</div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div>
                      <label className="label">Current Key Fingerprint</label>
                      <code className="block text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2.5 break-all">
                        {licensing.publicKeyFingerprint || "Not available (not exposed by the backend)"}
                      </code>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <span>
                        To update the public key, set the <code className="font-mono bg-amber-100 px-1 rounded">ZGATE_LICENSE_PUBLIC_KEY</code> environment
                        variable on the Control Center server and restart. The fingerprint will update automatically on next boot.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </div>
              </div>
            )}

            {/* ── DOCKER REGISTRY ───────────────────────────────────────── */}
            {tab === "registry" && (
              <div className="space-y-5">
                <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Package size={15} className="text-controlcenter-500" />
                  Docker Registry Settings
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="label">Registry URL</label>
                    <input className="input" placeholder="registry.zgate.io" value={registry.registryUrl}
                      onChange={(e) => setRegistry({ ...registry, registryUrl: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Username</label>
                      <input className="input" placeholder="zgate-deploy" value={registry.registryUsername}
                        onChange={(e) => setRegistry({ ...registry, registryUsername: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <div className="relative">
                        <input
                          className="input pr-10"
                          type={showRegPassword ? "text" : "password"}
                          placeholder="••••••••••••"
                          value={registry.registryPassword}
                          onChange={(e) => setRegistry({ ...registry, registryPassword: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showRegPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Pull Policy</label>
                    <select className="select" value={registry.pullPolicy}
                      onChange={(e) => setRegistry({ ...registry, pullPolicy: e.target.value })}>
                      {PULL_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      <strong>IfNotPresent</strong> — pull only if image not cached locally (recommended)
                    </p>
                  </div>

                  <div>
                    <label className="label">Mirror Registry URL <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input className="input" placeholder="e.g. mirror.registry.internal:5000" value={registry.mirrorUrl}
                      onChange={(e) => setRegistry({ ...registry, mirrorUrl: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-1">Fallback registry for air-gapped deployments</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTestConn}
                    disabled={testingConn}
                    className="btn-secondary"
                  >
                    {testingConn
                      ? <RefreshCw size={14} className="animate-spin" />
                      : <RefreshCw size={14} />}
                    {testingConn ? "Testing…" : "Test Connection"}
                  </button>
                  {testResult === "success" && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <Check size={14} /> Connection successful
                    </span>
                  )}
                  {testResult === "error" && (
                    <span className="flex items-center gap-1.5 text-sm text-red-600">
                      <AlertTriangle size={14} /> Connection failed — check credentials
                    </span>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
