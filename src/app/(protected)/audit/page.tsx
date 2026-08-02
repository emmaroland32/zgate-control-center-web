/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ScrollText,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Clock,
  User,
  Globe,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { auditService } from "@/services/controlcenter.service";
import { formatDateTime } from "@/lib/utils";
import type { AuditEntry } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getActionColor(action: string): string {
  if (action.startsWith("LICENSE_")) return "text-blue-700 bg-blue-50 border-blue-200";
  if (action.startsWith("DEPLOYMENT_")) return "text-purple-700 bg-purple-50 border-purple-200";
  if (action.startsWith("USER_")) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (action.startsWith("SECURITY_")) return "text-red-700 bg-red-50 border-red-200";
  if (action.startsWith("CONFIG_")) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}

function getActionDot(action: string): string {
  if (action.startsWith("LICENSE_")) return "bg-blue-500";
  if (action.startsWith("DEPLOYMENT_")) return "bg-purple-500";
  if (action.startsWith("USER_")) return "bg-emerald-500";
  if (action.startsWith("SECURITY_")) return "bg-red-500";
  if (action.startsWith("CONFIG_")) return "bg-amber-500";
  return "bg-slate-400";
}

function getInitials(name: string): string {
  return name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function getAvatarColor(email: string): string {
  const colors = [
    "bg-controlcenter-600", "bg-emerald-600", "bg-purple-600",
    "bg-amber-600", "bg-rose-600", "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash += email.charCodeAt(i);
  return colors[hash % colors.length];
}

type StatusKey = "SUCCESS" | "FAILURE" | "WARNING";

const STATUS_CONFIG: Record<StatusKey, { label: string; icon: React.ReactNode; className: string }> = {
  SUCCESS: {
    label: "Success",
    icon: <CheckCircle2 size={12} />,
    className: "badge badge-green",
  },
  FAILURE: {
    label: "Failure",
    icon: <XCircle size={12} />,
    className: "badge badge-red",
  },
  WARNING: {
    label: "Warning",
    icon: <AlertTriangle size={12} />,
    className: "badge badge-yellow",
  },
};

function StatusBadge({ status }: { status: StatusKey }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cfg.className}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 25;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [orgFilter, setOrgFilter] = useState("ALL");

  // Reset pagination when filters change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, actionFilter, statusFilter, orgFilter]);

  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await auditService.getLogs({ page: 1, size: 100 });
      if (Array.isArray(data) && data.length > 0) setEntries(data);
      else setEntries([]);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch audit logs from API
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (live) {
      liveIntervalRef.current = setInterval(() => fetchLogs(), 5000);
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    }
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [live, fetchLogs]);

  // Derived orgs for filter dropdown
  const orgNames = Array.from(
    new Set(entries.map((e) => e.organizationName).filter(Boolean))
  ) as string[];

  // Derived action prefixes for filter
  const actionPrefixes = ["LICENSE_", "DEPLOYMENT_", "USER_", "SECURITY_", "CONFIG_"];

  // Stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEntries = entries.filter((e) => new Date(e.timestamp) >= todayStart);
  const totalToday = todayEntries.length;
  const failedToday = todayEntries.filter((e) => e.status === "FAILURE").length;
  const licenseChangesToday = todayEntries.filter((e) => e.action.startsWith("LICENSE_")).length;
  const loginsToday = todayEntries.filter((e) => e.action === "USER_LOGIN").length;

  // Filtered data
  const filtered = entries.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.actorEmail.toLowerCase().includes(q) &&
        !e.actor.toLowerCase().includes(q) &&
        !e.action.toLowerCase().includes(q) &&
        !e.entityType.toLowerCase().includes(q)
      )
        return false;
    }
    if (dateFrom && new Date(e.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(e.timestamp) > new Date(dateTo + "T23:59:59")) return false;
    if (actionFilter !== "ALL" && !e.action.startsWith(actionFilter)) return false;
    if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
    if (orgFilter !== "ALL" && e.organizationName !== orgFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportCsv() {
    const headers = ["Timestamp", "Actor", "Email", "Action", "Entity Type", "Entity ID", "Organization", "IP Address", "Status", "Details"];
    const rows = filtered.map((e) => [
      e.timestamp,
      e.actor,
      e.actorEmail,
      e.action,
      e.entityType,
      e.entityId ?? "",
      e.organizationName ?? "",
      e.ipAddress ?? "",
      e.status,
      e.details ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zgate-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-controlcenter-100 flex items-center justify-center">
            <ScrollText size={18} className="text-controlcenter-600" />
          </div>
          <div>
            <h1 className="page-title">Audit Trail</h1>
            <p className="text-xs text-slate-500 mt-0.5">All system actions, logins, and configuration changes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live toggle */}
          <button
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors
              ${live
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "btn-secondary"
              }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
            />
            {live ? "Live" : "Live"}
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button onClick={exportCsv} className="btn-secondary">
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search actor, action…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-9 text-sm"
            />
          </div>

          {/* Date from */}
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="input text-sm"
            />
          </div>

          {/* Date to */}
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="input text-sm"
            />
          </div>

          {/* Action type */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="select text-sm"
            >
              <option value="ALL">All Action Types</option>
              {actionPrefixes.map((p) => (
                <option key={p} value={p}>{p.replace("_", "")} Events</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="select text-sm"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
              <option value="WARNING">Warning</option>
            </select>
          </div>
        </div>

        {/* Org filter — full-width second row */}
        <div className="mt-3">
          <select
            value={orgFilter}
            onChange={(e) => { setOrgFilter(e.target.value); setPage(1); }}
            className="select text-sm max-w-xs"
          >
            <option value="ALL">All Organizations</option>
            {orgNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-slate-500">
            <Activity size={14} />
            <span className="stat-label">Total Events Today</span>
          </div>
          <span className="stat-value">{totalToday}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-red-500">
            <XCircle size={14} />
            <span className="stat-label text-slate-500">Failed Actions</span>
          </div>
          <span className="stat-value text-red-600">{failedToday}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-blue-500">
            <Shield size={14} />
            <span className="stat-label text-slate-500">License Changes</span>
          </div>
          <span className="stat-value text-blue-600">{licenseChangesToday}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-emerald-500">
            <User size={14} />
            <span className="stat-label text-slate-500">User Logins Today</span>
          </div>
          <span className="stat-value text-emerald-600">{loginsToday}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-container">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter size={13} />
            <span>{filtered.length} events</span>
            {(search || actionFilter !== "ALL" || statusFilter !== "ALL" || orgFilter !== "ALL") && (
              <span className="badge badge-blue">Filtered</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {live && <span className="text-emerald-600 font-medium">Refreshing every 5s</span>}
            {!live && <span>Manual refresh</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Organization</th>
                <th>IP Address</th>
                <th>Status</th>
                <th style={{ width: 48 }}>
                  <Eye size={12} className="mx-auto" />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    No audit events match the current filters.
                  </td>
                </tr>
              )}
              {pageEntries.map((entry) => {
                const isExpanded = expandedId === entry.id;
                let parsedDetails: Record<string, unknown> | null = null;
                try {
                  if (entry.details) parsedDetails = JSON.parse(entry.details);
                } catch { /* details is free text, not JSON — render it raw below */ }

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={`cursor-pointer ${isExpanded ? "bg-slate-50" : ""}`}
                      onClick={() => toggleRow(entry.id)}
                    >
                      {/* Expand indicator */}
                      <td>
                        <span className="flex items-center justify-center text-slate-400">
                          {isExpanded
                            ? <ChevronDown size={14} />
                            : <ChevronRight size={14} />
                          }
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td>
                        <span className="font-mono text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </td>

                      {/* Actor */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(entry.actorEmail)}`}
                          >
                            {getInitials(entry.actor)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 truncate max-w-[140px]">
                              {entry.actor}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                              {entry.actorEmail}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getActionDot(entry.action)}`} />
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${getActionColor(entry.action)}`}
                          >
                            {entry.action}
                          </span>
                        </div>
                      </td>

                      {/* Entity */}
                      <td>
                        <div className="text-xs">
                          <div className="font-medium text-slate-700">{entry.entityType}</div>
                          {entry.entityId && (
                            <div className="text-slate-400 font-mono">{entry.entityId}</div>
                          )}
                        </div>
                      </td>

                      {/* Organization */}
                      <td>
                        {entry.organizationName ? (
                          <div className="flex items-center gap-1 text-xs text-slate-600">
                            <Globe size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{entry.organizationName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* IP */}
                      <td>
                        <span className="font-mono text-xs text-slate-500">
                          {entry.ipAddress ?? "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <StatusBadge status={entry.status as StatusKey} />
                      </td>

                      {/* Details icon */}
                      <td>
                        <Eye size={13} className="text-slate-300 mx-auto" />
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="flex gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                Full Event Details
                              </h4>
                              {parsedDetails ? (
                                <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto text-slate-700 font-mono">
                                  {JSON.stringify(parsedDetails, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-sm text-slate-500 italic">No additional details.</p>
                              )}
                            </div>
                            <div className="w-56 shrink-0 space-y-3">
                              <div>
                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Event ID</div>
                                <div className="font-mono text-xs text-slate-600 mt-0.5">{entry.id}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Full Timestamp</div>
                                <div className="font-mono text-xs text-slate-600 mt-0.5">{entry.timestamp}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Actor Email</div>
                                <div className="text-xs text-slate-600 mt-0.5">{entry.actorEmail}</div>
                              </div>
                              {entry.ipAddress && (
                                <div>
                                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">IP Address</div>
                                  <div className="font-mono text-xs text-slate-600 mt-0.5">{entry.ipAddress}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} events
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-xs rounded-lg font-medium transition-colors
                      ${page === pageNum
                        ? "bg-controlcenter-600 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
