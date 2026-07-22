"use client";

import { useState, useMemo, useEffect } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Edit,
  Trash2,
  Plus,
  Filter,
  Shield,
  Activity,
  Cpu,
  HardDrive,
  Database,
  Mail,
  Zap,
} from "lucide-react";
import { alertService } from "@/services/controlcenter.service";
import { timeAgo, formatDateTime, getCurrentUserEmail } from "@/lib/utils";
import type { AlertRule, ActiveAlert, AlertSeverity, AlertStatus, AlertCondition } from "@/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AlertTab = "active" | "rules" | "history";

interface HistoricalAlert {
  id: string;
  ruleName: string;
  severity: AlertSeverity;
  organizationName: string;
  firedAt: string;
  resolvedAt: string;
  durationMinutes: number;
  rootCause: string;
  resolvedBy: string;
}

type AlertChannel = "EMAIL" | "SLACK" | "WEBHOOK" | "PAGERDUTY";
type AlertOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "neq";

// ─── Metric config ─────────────────────────────────────────────────────────────

const METRICS = [
  { value: "response_time_ms", label: "response_time_ms", description: "Backend API response time", unit: "ms", defaultThreshold: 500 },
  { value: "disk_usage_percent", label: "disk_usage_percent", description: "Server disk usage percentage", unit: "%", defaultThreshold: 85 },
  { value: "memory_usage_percent", label: "memory_usage_percent", description: "Container memory usage", unit: "%", defaultThreshold: 90 },
  { value: "cpu_usage_percent", label: "cpu_usage_percent", description: "Container CPU usage", unit: "%", defaultThreshold: 80 },
  { value: "license_expiry_days", label: "license_expiry_days", description: "Days until license expires", unit: "days", defaultThreshold: 14 },
  { value: "deployment_failure", label: "deployment_failure", description: "Deployment job failure", unit: "", defaultThreshold: 1 },
  { value: "db_connection_count", label: "db_connection_count", description: "Active DB connections", unit: "conns", defaultThreshold: 22 },
  { value: "error_rate_percent", label: "error_rate_percent", description: "Backend error rate (5xx)", unit: "%", defaultThreshold: 5 },
];

const OPERATORS: { value: AlertOperator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
];

const CHANNELS: AlertChannel[] = ["EMAIL", "SLACK", "WEBHOOK", "PAGERDUTY"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string; borderClass: string; badgeClass: string; dotClass: string; textClass: string;
}> = {
  CRITICAL: { label: "Critical", borderClass: "border-l-red-500", badgeClass: "bg-red-100 text-red-700", dotClass: "bg-red-500", textClass: "text-red-600" },
  HIGH:     { label: "High",     borderClass: "border-l-orange-500", badgeClass: "bg-orange-100 text-orange-700", dotClass: "bg-orange-500", textClass: "text-orange-600" },
  MEDIUM:   { label: "Medium",   borderClass: "border-l-amber-400", badgeClass: "bg-amber-100 text-amber-700", dotClass: "bg-amber-400", textClass: "text-amber-600" },
  LOW:      { label: "Low",      borderClass: "border-l-yellow-400", badgeClass: "bg-yellow-100 text-yellow-700", dotClass: "bg-yellow-400", textClass: "text-yellow-600" },
  INFO:     { label: "Info",     borderClass: "border-l-blue-400", badgeClass: "bg-blue-100 text-blue-700", dotClass: "bg-blue-400", textClass: "text-blue-600" },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; className: string; animate: boolean }> = {
  FIRING:       { label: "Firing",       className: "bg-red-100 text-red-700", animate: true },
  ACKNOWLEDGED: { label: "Acknowledged", className: "bg-amber-100 text-amber-700", animate: false },
  SILENCED:     { label: "Silenced",     className: "bg-slate-100 text-slate-600", animate: false },
  RESOLVED:     { label: "Resolved",     className: "bg-emerald-100 text-emerald-700", animate: false },
};

function conditionSummary(c: AlertCondition): string {
  const op = OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
  const window = c.windowMinutes ? ` for ${c.windowMinutes}min` : "";
  return `${c.metric} ${op} ${c.threshold}${window}`;
}

function durationStr(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const CHANNEL_ICONS: Record<AlertChannel, React.ReactNode> = {
  EMAIL:     <Mail size={11} />,
  SLACK:     <Zap size={11} />,
  WEBHOOK:   <Activity size={11} />,
  PAGERDUTY: <AlertOctagon size={11} />,
};

// ─── New Rule Form state ───────────────────────────────────────────────────────

interface NewRuleForm {
  name: string;
  description: string;
  severity: AlertSeverity;
  metric: string;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  channels: Set<AlertChannel>;
  orgScope: "all" | "specific";
  cooldownMinutes: number;
  enabled: boolean;
}

const DEFAULT_FORM: NewRuleForm = {
  name: "",
  description: "",
  severity: "HIGH",
  metric: "response_time_ms",
  operator: "gt",
  threshold: 500,
  windowMinutes: 5,
  channels: new Set(["EMAIL", "SLACK"]),
  orgScope: "all",
  cooldownMinutes: 15,
  enabled: true,
};

// ─── Quick-add templates ────────────────────────────────────────────────────────

const QUICK_TEMPLATES: { label: string; icon: React.ElementType; patch: Partial<NewRuleForm> }[] = [
  {
    label: "High Response Time",
    icon: Activity,
    patch: { name: "High Response Time", severity: "CRITICAL", metric: "response_time_ms", operator: "gt", threshold: 500, windowMinutes: 5 },
  },
  {
    label: "Disk Full",
    icon: HardDrive,
    patch: { name: "Disk Usage Critical", severity: "HIGH", metric: "disk_usage_percent", operator: "gt", threshold: 85, windowMinutes: 5 },
  },
  {
    label: "License Expiring",
    icon: Shield,
    patch: { name: "License Expiring Soon", severity: "MEDIUM", metric: "license_expiry_days", operator: "lt", threshold: 14 },
  },
  {
    label: "Deployment Failed",
    icon: XCircle,
    patch: { name: "Deployment Failure", severity: "CRITICAL", metric: "deployment_failure", operator: "eq", threshold: 1, windowMinutes: 1 },
  },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<HistoricalAlert[]>([]);

  const [tab, setTab] = useState<AlertTab>("active");
  const [showNewRuleDialog, setShowNewRuleDialog] = useState(false);
  const [form, setForm] = useState<NewRuleForm>({ ...DEFAULT_FORM, channels: new Set(DEFAULT_FORM.channels) });

  // History filters
  const [histSeverityFilter, setHistSeverityFilter] = useState<AlertSeverity | "ALL">("ALL");
  const [histDateFilter, setHistDateFilter] = useState("");

  // Loading / error
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      alertService.getActive().catch(() => []),
      alertService.getRules().catch(() => []),
      alertService.getHistory().catch(() => []),
    ]).then(([activeData, rulesData, historyData]) => {
      setActiveAlerts(Array.isArray(activeData) ? activeData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    }).finally(() => setLoading(false));
  }, []);

  // Derived counts
  const criticalCount = activeAlerts.filter((a) => a.severity === "CRITICAL" && a.status === "FIRING").length;
  const highCount = activeAlerts.filter((a) => a.severity === "HIGH" && a.status === "FIRING").length;
  const acknowledgedCount = activeAlerts.filter((a) => a.status === "ACKNOWLEDGED").length;
  const resolvedTodayCount = history.filter((h) => {
    const d = new Date(h.resolvedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  // Actions
  function acknowledgeAlert(id: string) {
    setActiveAlerts((prev) =>
      prev.map((a) => a.id === id
        ? { ...a, status: "ACKNOWLEDGED" as AlertStatus, acknowledgedBy: getCurrentUserEmail(), acknowledgedAt: new Date().toISOString() }
        : a
      )
    );
    alertService.acknowledge(id).catch(() => {});
  }

  function resolveAlert(id: string) {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    alertService.resolve(id).catch(() => {});
  }

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r)
    );
    alertService.toggleRule(id).catch(() => {});
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    alertService.deleteRule(id).catch(() => {});
  }

  // Form helpers
  function applyTemplate(patch: Partial<NewRuleForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setShowNewRuleDialog(true);
  }

  function updateFormMetric(metric: string) {
    const m = METRICS.find((x) => x.value === metric);
    setForm((prev) => ({
      ...prev,
      metric,
      threshold: m?.defaultThreshold ?? prev.threshold,
    }));
  }

  function toggleChannel(ch: AlertChannel) {
    setForm((prev) => {
      const next = new Set(prev.channels);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return { ...prev, channels: next };
    });
  }

  function submitRule(e: React.FormEvent) {
    e.preventDefault();
    const newRule: AlertRule = {
      id: `rule-${Date.now()}`,
      name: form.name,
      description: form.description,
      enabled: form.enabled,
      severity: form.severity,
      condition: {
        metric: form.metric,
        operator: form.operator,
        threshold: form.threshold,
        windowMinutes: form.windowMinutes || undefined,
      },
      channels: Array.from(form.channels) as any,
      cooldownMinutes: form.cooldownMinutes,
      organizationIds: form.orgScope === "all" ? undefined : [],
      createdAt: new Date().toISOString(),
      lastTriggered: undefined,
      triggerCount: 0,
    };
    alertService.createRule(newRule).catch(() => {});
    setRules((prev) => [...prev, newRule]);
    setShowNewRuleDialog(false);
    setForm({ ...DEFAULT_FORM, channels: new Set(DEFAULT_FORM.channels) });
  }

  // Filtered history
  const filteredHistory = useMemo(() => {
    let result = [...history];
    if (histSeverityFilter !== "ALL") {
      result = result.filter((h) => h.severity === histSeverityFilter);
    }
    if (histDateFilter) {
      result = result.filter((h) => new Date(h.firedAt) >= new Date(histDateFilter));
    }
    return result;
  }, [history, histSeverityFilter, histDateFilter]);

  const selectedMetric = METRICS.find((m) => m.value === form.metric);

  const TABS: { key: AlertTab; label: string; count?: number }[] = [
    { key: "active", label: "Active Alerts", count: activeAlerts.length },
    { key: "rules", label: "Alert Rules", count: rules.length },
    { key: "history", label: "History", count: history.length },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
            <Bell size={18} className="text-red-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Alerts</h1>
              {activeAlerts.length > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[1.4rem] h-5 rounded-full text-[10px] font-bold px-1.5 ${
                  criticalCount > 0 ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                }`}>
                  {activeAlerts.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Configure alert rules and manage active incidents</p>
          </div>
        </div>
        <button
          onClick={() => { setForm({ ...DEFAULT_FORM, channels: new Set(DEFAULT_FORM.channels) }); setShowNewRuleDialog(true); }}
          className="btn-primary"
        >
          <Plus size={15} />
          New Rule
        </button>
      </div>

      {/* ── Critical banner ─────────────────────────────────────────────────── */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-xl">
          <AlertOctagon size={18} className="text-red-600 shrink-0 animate-pulse" />
          <div className="flex-1">
            <span className="text-sm font-bold text-red-800">
              {criticalCount} Critical alert{criticalCount > 1 ? "s" : ""} require attention
            </span>
            <span className="text-xs text-red-600 ml-2">Immediate action recommended.</span>
          </div>
          <button
            onClick={() => setTab("active")}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline underline-offset-2 shrink-0"
          >
            View Active Alerts
          </button>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className={activeAlerts.length > 0 ? "text-red-500" : "text-slate-400"} />
            <span className="stat-label">Active Alerts</span>
          </div>
          <span className={`stat-value ${activeAlerts.length > 0 ? "text-red-600" : ""}`}>
            {activeAlerts.length}
          </span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <AlertOctagon size={14} className="text-orange-500" />
            <span className="stat-label">Critical / High</span>
          </div>
          <span className="stat-value">
            <span className="text-red-600">{criticalCount}</span>
            <span className="text-slate-300 mx-1">/</span>
            <span className="text-orange-600">{highCount}</span>
          </span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-amber-500" />
            <span className="stat-label">Acknowledged</span>
          </div>
          <span className={`stat-value ${acknowledgedCount > 0 ? "text-amber-600" : ""}`}>
            {acknowledgedCount}
          </span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span className="stat-label">Resolved Today</span>
          </div>
          <span className="stat-value text-emerald-600">{resolvedTodayCount}</span>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? "border-controlcenter-600 text-controlcenter-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[1.2rem] h-5 rounded-full text-[10px] font-bold px-1 ${
                  tab === key ? "bg-controlcenter-100 text-controlcenter-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Active Alerts
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "active" && (
        <div className="space-y-4">
          {activeAlerts.length === 0 ? (
            <div className="card p-16 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-slate-800">All clear — no active alerts</div>
                <div className="text-sm text-slate-400 mt-1">All monitored deployments are operating within threshold.</div>
              </div>
            </div>
          ) : (
            activeAlerts.map((alert) => {
              const sevCfg = SEVERITY_CONFIG[alert.severity];
              const statCfg = STATUS_CONFIG[alert.status];
              const firedDuration = Math.floor((Date.now() - new Date(alert.firedAt).getTime()) / 60000);

              return (
                <div
                  key={alert.id}
                  className={`card border-l-4 ${sevCfg.borderClass} p-5`}
                >
                  <div className="flex items-start gap-4">
                    {/* Severity dot */}
                    <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${sevCfg.dotClass} ${alert.status === "FIRING" ? "animate-pulse" : ""}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={`badge ${sevCfg.badgeClass}`}>{sevCfg.label}</span>
                            <span className={`badge ${statCfg.className} ${statCfg.animate ? "animate-pulse" : ""}`}>
                              {statCfg.label}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900">{alert.ruleName}</h3>
                          {alert.organizationName && (
                            <div className="text-xs text-slate-500 mt-0.5">{alert.organizationName}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
                          >
                            <Check size={12} />
                            Resolve
                          </button>
                          {alert.status !== "ACKNOWLEDGED" && (
                            <button
                              onClick={() => acknowledgeAlert(alert.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-colors"
                            >
                              <Eye size={12} />
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Message */}
                      <p className="text-sm text-slate-700 mt-2 leading-relaxed">{alert.message}</p>

                      {/* Metric bar */}
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${sevCfg.dotClass}`}
                            style={{ width: `${Math.min(100, (alert.value / (alert.threshold * 1.5)) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${sevCfg.textClass}`}>
                          {alert.value} / {alert.threshold}
                        </span>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          Fired {timeAgo(alert.firedAt)}
                        </span>
                        <span>Duration: {durationStr(firedDuration)}</span>
                        {alert.acknowledgedBy && (
                          <span className="flex items-center gap-1">
                            <Eye size={11} />
                            Ack'd by {alert.acknowledgedBy} ({timeAgo(alert.acknowledgedAt!)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Alert Rules
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "rules" && (
        <div className="space-y-5">

          {/* Quick add templates */}
          <div className="card p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick add:</span>
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => applyTemplate(tpl.patch)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-50 hover:bg-controlcenter-50 border border-slate-200 hover:border-controlcenter-300 text-slate-600 hover:text-controlcenter-700 rounded-lg transition-colors"
                >
                  <tpl.icon size={13} />
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rules table */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Enabled</th>
                  <th>Name</th>
                  <th>Severity</th>
                  <th>Condition</th>
                  <th>Channels</th>
                  <th>Scope</th>
                  <th>Last Triggered</th>
                  <th>Triggers</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const sevCfg = SEVERITY_CONFIG[rule.severity];
                  return (
                    <tr key={rule.id}>
                      {/* Enabled toggle */}
                      <td>
                        <button
                          onClick={() => toggleRule(rule.id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            rule.enabled ? "bg-controlcenter-600" : "bg-slate-200"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            rule.enabled ? "translate-x-4" : "translate-x-0.5"
                          }`} />
                        </button>
                      </td>

                      {/* Name */}
                      <td>
                        <div className="font-semibold text-slate-800 text-sm">{rule.name}</div>
                        {rule.description && (
                          <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{rule.description}</div>
                        )}
                      </td>

                      {/* Severity */}
                      <td>
                        <span className={`badge ${sevCfg.badgeClass}`}>{sevCfg.label}</span>
                      </td>

                      {/* Condition */}
                      <td>
                        <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">
                          {conditionSummary(rule.condition)}
                        </span>
                      </td>

                      {/* Channels */}
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          {rule.channels.map((ch) => (
                            <span
                              key={ch}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium"
                              title={ch}
                            >
                              {CHANNEL_ICONS[ch as AlertChannel]}
                              {ch}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Scope */}
                      <td>
                        <span className="text-xs text-slate-500">
                          {rule.organizationIds ? `${rule.organizationIds.length} org${rule.organizationIds.length !== 1 ? "s" : ""}` : "All"}
                        </span>
                      </td>

                      {/* Last triggered */}
                      <td>
                        <span className="text-xs text-slate-500">
                          {rule.lastTriggered ? timeAgo(rule.lastTriggered) : "Never"}
                        </span>
                      </td>

                      {/* Trigger count */}
                      <td>
                        <span className={`text-xs font-semibold ${rule.triggerCount > 0 ? "text-slate-700" : "text-slate-400"}`}>
                          {rule.triggerCount}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 text-slate-400 hover:text-controlcenter-600 hover:bg-controlcenter-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: History
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <div className="space-y-4">

          {/* History filters */}
          <div className="card p-4 flex items-center gap-4 flex-wrap">
            <Filter size={14} className="text-slate-400 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setHistSeverityFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    histSeverityFilter === s
                      ? "bg-controlcenter-600 border-controlcenter-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-controlcenter-300"
                  }`}
                >
                  {s === "ALL" ? "All Severities" : s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-400">From:</span>
              <input
                type="date"
                value={histDateFilter}
                onChange={(e) => setHistDateFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-controlcenter-500"
              />
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Severity</th>
                  <th>Organization</th>
                  <th>Fired At</th>
                  <th>Resolved At</th>
                  <th>Duration</th>
                  <th>Root Cause</th>
                  <th>Resolved By</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => {
                  const sevCfg = SEVERITY_CONFIG[h.severity];
                  return (
                    <tr key={h.id}>
                      <td className="font-semibold text-slate-800">{h.ruleName}</td>
                      <td>
                        <span className={`badge ${sevCfg.badgeClass}`}>{sevCfg.label}</span>
                      </td>
                      <td className="text-sm text-slate-600">{h.organizationName}</td>
                      <td>
                        <div className="text-xs text-slate-500">{formatDateTime(h.firedAt)}</div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-500">{formatDateTime(h.resolvedAt)}</div>
                      </td>
                      <td>
                        <span className="text-xs font-medium text-slate-600">{durationStr(h.durationMinutes)}</span>
                      </td>
                      <td>
                        <div className="text-xs text-slate-500 max-w-xs" title={h.rootCause}>
                          {h.rootCause.length > 80 ? h.rootCause.slice(0, 80) + "…" : h.rootCause}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-500">{h.resolvedBy}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredHistory.length === 0 && (
              <div className="p-10 text-center text-slate-400 text-sm">
                <BellOff size={28} className="mx-auto mb-2 opacity-30" />
                No historical alerts match the current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          New Rule Dialog
      ══════════════════════════════════════════════════════════════════════ */}
      {showNewRuleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Dialog header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-controlcenter-600" />
                <h2 className="text-lg font-bold text-slate-900">New Alert Rule</h2>
              </div>
              <button
                onClick={() => setShowNewRuleDialog(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={submitRule} className="px-6 py-5 space-y-5">

              {/* Name + Description */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Rule Name *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. High Response Time"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Severity *</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as AlertSeverity }))}
                    className="select"
                  >
                    {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as AlertSeverity[]).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  placeholder="Describe when this rule fires..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="input"
                />
              </div>

              {/* Condition */}
              <div>
                <label className="label">Condition</label>
                <div className="grid grid-cols-4 gap-2">
                  {/* Metric */}
                  <div className="col-span-2">
                    <select
                      value={form.metric}
                      onChange={(e) => updateFormMetric(e.target.value)}
                      className="select"
                    >
                      {METRICS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {selectedMetric && (
                      <p className="text-[11px] text-slate-400 mt-1">{selectedMetric.description}</p>
                    )}
                  </div>
                  {/* Operator */}
                  <div>
                    <select
                      value={form.operator}
                      onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as AlertOperator }))}
                      className="select"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Threshold */}
                  <div className="relative">
                    <input
                      type="number"
                      value={form.threshold}
                      onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) }))}
                      className="input pr-10"
                    />
                    {selectedMetric?.unit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        {selectedMetric.unit}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Window + Cooldown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Evaluation Window (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.windowMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, windowMinutes: Number(e.target.value) }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Cooldown (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.cooldownMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, cooldownMinutes: Number(e.target.value) }))}
                    className="input"
                  />
                </div>
              </div>

              {/* Notification channels */}
              <div>
                <label className="label">Notification Channels</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.channels.has(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="w-4 h-4 rounded border-slate-300 text-controlcenter-600 focus:ring-controlcenter-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-slate-700">
                        {CHANNEL_ICONS[ch]}
                        {ch}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Org scope */}
              <div>
                <label className="label">Apply To</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="orgScope"
                      value="all"
                      checked={form.orgScope === "all"}
                      onChange={() => setForm((f) => ({ ...f, orgScope: "all" }))}
                      className="text-controlcenter-600 focus:ring-controlcenter-500"
                    />
                    <span className="text-sm text-slate-700">All deployments</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="orgScope"
                      value="specific"
                      checked={form.orgScope === "specific"}
                      onChange={() => setForm((f) => ({ ...f, orgScope: "specific" }))}
                      className="text-controlcenter-600 focus:ring-controlcenter-500"
                    />
                    <span className="text-sm text-slate-700">Specific organizations</span>
                  </label>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.enabled ? "bg-controlcenter-600" : "bg-slate-200"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.enabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-sm text-slate-700">{form.enabled ? "Rule enabled" : "Rule disabled"}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewRuleDialog(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <Plus size={15} />
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
