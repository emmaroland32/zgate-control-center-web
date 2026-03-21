/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FileText,
  Search,
  Filter,
  Download,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  Copy,
  RefreshCw,
  Clock,
  Wifi,
  Database,
  Server,
} from "lucide-react";
import { logService, organizationService } from "@/services/nexus.service";
import { timeAgo } from "@/lib/utils";
import type { LogEntry, LogLevel, LogService, LogQuery } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<LogLevel, { label: string; rowClass: string; textClass: string; pillClass: string }> = {
  FATAL: { label: "FATAL", rowClass: "bg-red-950/40", textClass: "text-red-200 font-bold", pillClass: "bg-red-900 text-red-200" },
  ERROR: { label: "ERROR", rowClass: "", textClass: "text-red-400", pillClass: "bg-red-900/60 text-red-300" },
  WARN:  { label: "WARN",  rowClass: "", textClass: "text-amber-400", pillClass: "bg-amber-900/60 text-amber-300" },
  INFO:  { label: "INFO",  rowClass: "", textClass: "text-blue-400", pillClass: "bg-blue-900/60 text-blue-300" },
  DEBUG: { label: "DEBUG", rowClass: "", textClass: "text-gray-400", pillClass: "bg-slate-800 text-gray-400" },
  TRACE: { label: "TRACE", rowClass: "", textClass: "text-gray-600", pillClass: "bg-slate-900 text-gray-600" },
};

const SERVICE_CONFIG: Record<LogService, { icon: React.ElementType; color: string }> = {
  BACKEND:  { icon: Server, color: "text-nexus-400" },
  DATABASE: { icon: Database, color: "text-purple-400" },
  REDIS:    { icon: Wifi, color: "text-emerald-400" },
  NGINX:    { icon: Server, color: "text-cyan-400" },
  FLYWAY:   { icon: Database, color: "text-orange-400" },
  SYSTEM:   { icon: Server, color: "text-slate-400" },
};

const ALL_LEVELS: LogLevel[] = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
const ALL_SERVICES: LogService[] = ["BACKEND", "DATABASE", "REDIS", "NGINX", "FLYWAY", "SYSTEM"];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}

function highlightSearch(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-yellow-400 text-gray-900 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogViewerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<{ id: string; name: string }[]>([{ id: "all", name: "All Deployments" }]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDeployment, setSelectedDeployment] = useState("all");
  const [selectedServices, setSelectedServices] = useState<Set<LogService>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(new Set());
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Live mode
  const [liveMode, setLiveMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Fetch from service ────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    if (paused) return;
    setLoading(true);
    setError(null);
    const query: LogQuery = {
      organizationId: selectedDeployment !== "all" ? selectedDeployment : undefined,
      service: selectedServices.size === 1 ? Array.from(selectedServices)[0] : undefined,
      level: selectedLevels.size === 1 ? Array.from(selectedLevels)[0] : undefined,
      search: search || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      limit: 500,
    };
    try {
      const data = await logService.query(query);
      if (Array.isArray(data) && data.length > 0) {
        setLogs(data);
      } else {
        setLogs([]);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDeployment, selectedServices, selectedLevels, search, fromDate, toDate, paused]);

  useEffect(() => {
    fetchLogs();
    organizationService.getAll().then((data) => {
      if (Array.isArray(data)) {
        setDeployments([
          { id: "all", name: "All Deployments" },
          ...data.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
        ]);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live mode polling
  useEffect(() => {
    if (liveMode && !paused) {
      liveRef.current = setInterval(() => fetchLogs(), 2000);
    } else {
      if (liveRef.current) clearInterval(liveRef.current);
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [liveMode, paused, fetchLogs]);

  // Scroll to bottom when in live mode and new logs arrive
  useEffect(() => {
    if (liveMode && !paused && atBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, liveMode, paused, atBottom]);

  // ─── Filtered view ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...logs];

    if (selectedServices.size > 0) {
      result = result.filter((l) => selectedServices.has(l.service));
    }
    if (selectedLevels.size > 0) {
      result = result.filter((l) => selectedLevels.has(l.level));
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((l) =>
        l.message.toLowerCase().includes(lower) ||
        (l.logger ?? "").toLowerCase().includes(lower) ||
        (l.traceId ?? "").toLowerCase().includes(lower)
      );
    }
    if (fromDate) {
      result = result.filter((l) => new Date(l.timestamp) >= new Date(fromDate));
    }
    if (toDate) {
      result = result.filter((l) => new Date(l.timestamp) <= new Date(toDate));
    }

    // Last 500 lines
    return result.slice(-500);
  }, [logs, selectedServices, selectedLevels, search, fromDate, toDate]);

  // Stats
  const stats = useMemo(() => ({
    total: filtered.length,
    fatal: filtered.filter((l) => l.level === "FATAL").length,
    error: filtered.filter((l) => l.level === "ERROR").length,
    warn: filtered.filter((l) => l.level === "WARN").length,
    info: filtered.filter((l) => l.level === "INFO").length,
  }), [filtered]);

  // ─── Scroll tracking ───────────────────────────────────────────────────────

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const threshold = 100;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── Filter toggle helpers ─────────────────────────────────────────────────

  function toggleService(s: LogService) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  function toggleLevel(l: LogLevel) {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  }

  function clearFilters() {
    setSelectedServices(new Set());
    setSelectedLevels(new Set());
    setSearch("");
    setFromDate("");
    setToDate("");
    setSelectedDeployment("all");
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  async function handleDownload() {
    try {
      const query: LogQuery = {
        organizationId: selectedDeployment !== "all" ? selectedDeployment : undefined,
        limit: 500,
      };
      const blob = await logService.download(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zgate-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: download current view as text
      const text = filtered.map((l) =>
        `[${formatTimestamp(l.timestamp)}] [${l.level}] [${l.service}] ${l.logger ?? ""} — ${l.message}`
      ).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zgate-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function copyLine(entry: LogEntry) {
    const text = `[${formatTimestamp(entry.timestamp)}] [${entry.level}] [${entry.service}] ${entry.logger ?? ""} — ${entry.message}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasActiveFilters =
    selectedServices.size > 0 ||
    selectedLevels.size > 0 ||
    search !== "" ||
    fromDate !== "" ||
    toDate !== "" ||
    selectedDeployment !== "all";

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <FileText size={18} className="text-slate-600" />
          </div>
          <div>
            <h1 className="page-title">Log Viewer</h1>
            <p className="text-xs text-slate-400 mt-0.5">Centralized log viewer for all ZGATE deployments</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-nexus-600 hover:text-nexus-700 font-medium transition-colors">
              Clear Filters
            </button>
          )}
          <button onClick={handleDownload} className="btn-secondary">
            <Download size={14} />
            Download Logs
          </button>
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-5 py-3 shrink-0 space-y-2.5">

        {/* Row 1: Deployment + Search + Date range + Live mode */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Deployment selector */}
          <select
            value={selectedDeployment}
            onChange={(e) => setSelectedDeployment(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-nexus-500"
          >
            {deployments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search messages, loggers, traceId..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
            />
          </div>

          {/* Date from */}
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-slate-400" />
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-nexus-500"
            />
            <span className="text-slate-500 text-xs">→</span>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-nexus-500"
            />
          </div>

          {/* Live mode toggle */}
          <button
            onClick={() => { setLiveMode((v) => !v); setPaused(false); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              liveMode
                ? "bg-emerald-900/60 border-emerald-700 text-emerald-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${liveMode ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
            {liveMode ? "Live" : "Live Off"}
          </button>
        </div>

        {/* Row 2: Service pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Service:</span>
          {ALL_SERVICES.map((s) => {
            const { icon: Icon, color } = SERVICE_CONFIG[s];
            const active = selectedServices.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleService(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active
                    ? "bg-slate-700 border-slate-500 text-slate-100"
                    : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400"
                }`}
              >
                <Icon size={10} className={active ? color : ""} />
                {s}
              </button>
            );
          })}
        </div>

        {/* Row 3: Level pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Level:</span>
          {ALL_LEVELS.map((l) => {
            const cfg = LEVEL_CONFIG[l];
            const active = selectedLevels.has(l);
            return (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active
                    ? `${cfg.pillClass} border-transparent`
                    : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400"
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-5 py-2 bg-slate-800 border-b border-slate-700 text-xs shrink-0">
        <span className="text-slate-400">
          Total: <span className="text-slate-200 font-semibold">{stats.total}</span>
        </span>
        {stats.fatal > 0 && (
          <span className="text-red-300">
            FATAL: <span className="font-bold">{stats.fatal}</span>
          </span>
        )}
        <span className="text-red-400">
          ERROR: <span className="font-semibold">{stats.error}</span>
        </span>
        <span className="text-amber-400">
          WARN: <span className="font-semibold">{stats.warn}</span>
        </span>
        <span className="text-blue-400">
          INFO: <span className="font-semibold">{stats.info}</span>
        </span>
        {liveMode && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaused((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                paused
                  ? "bg-emerald-900/60 text-emerald-300 hover:bg-emerald-900"
                  : "bg-amber-900/60 text-amber-300 hover:bg-amber-900"
              }`}
            >
              {paused ? <Play size={10} /> : <Square size={10} />}
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}
        {!liveMode && (
          <span className="ml-auto text-slate-600 flex items-center gap-1">
            <Filter size={11} />
            {hasActiveFilters ? "Filtered" : "No filter active"}
          </span>
        )}
      </div>

      {/* ── Log output ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {error && (
          <div className="absolute inset-x-0 top-2 mx-4 z-10 bg-red-950/80 border border-red-800 text-red-300 text-xs px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-gray-950 font-mono text-xs text-gray-100"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <FileText size={32} className="mb-3 opacity-30" />
              <div className="text-sm">No log entries match the current filters.</div>
            </div>
          ) : (
            <>
              {filtered.map((entry, idx) => {
                const cfg = LEVEL_CONFIG[entry.level];
                const isExpanded = expandedId === entry.id;
                const isStackExpanded = expandedStackId === entry.id;

                return (
                  <div key={entry.id} className={`group ${cfg.rowClass}`}>
                    {/* Main log line */}
                    <div
                      className={`flex items-start gap-0 hover:bg-white/5 cursor-pointer transition-colors px-1 ${
                        isExpanded ? "bg-white/5" : ""
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      {/* Line number */}
                      <span className="w-10 shrink-0 text-right text-gray-700 select-none pr-3 py-0.5 leading-5 text-[10px]">
                        {idx + 1}
                      </span>

                      {/* Expand chevron */}
                      <span className="w-4 shrink-0 py-0.5 leading-5 text-gray-600">
                        {isExpanded
                          ? <ChevronDown size={11} />
                          : <ChevronRight size={11} />}
                      </span>

                      {/* Log content */}
                      <span className="flex-1 py-0.5 leading-5 break-all">
                        <span className="text-gray-600">[{formatTimestamp(entry.timestamp)}]</span>
                        {" "}
                        <span className={cfg.textClass}>[{entry.level.padEnd(5)}]</span>
                        {" "}
                        <span className={`${SERVICE_CONFIG[entry.service].color}`}>[{entry.service}]</span>
                        {entry.logger && (
                          <span className="text-gray-500"> {entry.logger}</span>
                        )}
                        <span className="text-gray-500"> — </span>
                        <span className={entry.level === "FATAL" ? "text-red-200 font-bold" : entry.level === "ERROR" ? "text-red-400" : "text-gray-200"}>
                          {highlightSearch(entry.message, search)}
                        </span>
                        {entry.stackTrace && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedStackId(isStackExpanded ? null : entry.id); }}
                            className="ml-2 inline-flex items-center gap-0.5 text-red-500 hover:text-red-400 text-[10px] font-bold"
                            title="Toggle stack trace"
                          >
                            [{isStackExpanded ? "−" : "+"}]
                          </button>
                        )}
                      </span>

                      {/* Copy button (hover) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyLine(entry); }}
                        className="shrink-0 px-2 py-0.5 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 transition-opacity"
                        title="Copy line"
                      >
                        {copiedId === entry.id ? (
                          <span className="text-emerald-400 text-[10px]">✓</span>
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>

                    {/* Stack trace expansion */}
                    {entry.stackTrace && isStackExpanded && (
                      <pre className="ml-14 mr-4 mb-1 px-3 py-2 bg-red-950/30 border-l-2 border-red-800 text-red-300 text-[10px] leading-4 overflow-x-auto whitespace-pre">
                        {entry.stackTrace}
                      </pre>
                    )}

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className="ml-14 mr-4 mb-1 px-3 py-2 bg-slate-900/60 border-l-2 border-slate-700 rounded-r text-[10px] leading-5 space-y-0.5">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                          <div>
                            <span className="text-slate-500">Timestamp: </span>
                            <span className="text-slate-300">{entry.timestamp}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Level: </span>
                            <span className={cfg.textClass}>{entry.level}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Service: </span>
                            <span className="text-slate-300">{entry.service}</span>
                          </div>
                          {entry.thread && (
                            <div>
                              <span className="text-slate-500">Thread: </span>
                              <span className="text-slate-300">{entry.thread}</span>
                            </div>
                          )}
                          {entry.logger && (
                            <div className="col-span-2">
                              <span className="text-slate-500">Logger: </span>
                              <span className="text-slate-300">{entry.logger}</span>
                            </div>
                          )}
                          {entry.traceId && (
                            <div className="col-span-2">
                              <span className="text-slate-500">Trace ID: </span>
                              <span className="text-amber-400 font-mono">{entry.traceId}</span>
                            </div>
                          )}
                          {entry.organizationId && (
                            <div>
                              <span className="text-slate-500">Org ID: </span>
                              <span className="text-slate-300">{entry.organizationId}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-1 pt-1 border-t border-slate-800">
                          <span className="text-slate-500">Message: </span>
                          <span className="text-slate-200">{entry.message}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Scroll to bottom FAB */}
        {!atBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-5 right-5 flex items-center gap-2 px-3 py-2 bg-nexus-600 hover:bg-nexus-700 text-white text-xs font-medium rounded-lg shadow-lg transition-colors"
          >
            <ArrowDown size={13} />
            Scroll to bottom
          </button>
        )}
      </div>
    </div>
  );
}
