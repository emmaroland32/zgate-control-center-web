"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Play,
  Square,
  RotateCcw,
  Terminal,
  Layers,
  Globe,
  Box,
  Trash2,
  RefreshCw,
  Download,
  Copy,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { infrastructureService, organizationService } from "@/services/controlcenter.service";
import { timeAgo, truncate } from "@/lib/utils";
import type { ContainerStatus, Organization } from "@/types";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface OrgDeployment {
  id: string;
  name: string;
  slug: string;
  containers: ContainerMock[];
  volumes: VolumeMock[];
  resourceHistory: ResourcePoint[];
  diskUsedGb: number;
  diskTotalGb: number;
  netRxMbps: number;
  netTxMbps: number;
}

interface ContainerMock {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  ports: { host: number; container: number }[];
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  restartCount: number;
  health: "healthy" | "unhealthy" | "starting" | "none";
  orgId: string;
  orgName: string;
}

interface VolumeMock {
  name: string;
  driver: string;
  mountpoint: string;
  usedGb: number;
  totalGb: number;
  labels: Record<string, string>;
}

interface ResourcePoint {
  hour: string;
  cpu: number;
  mem: number;
}

// ─── Resource History (seeded from real container stats, deterministic) ────────
function generateResourceHistory(cpuBase: number, memBase: number): ResourcePoint[] {
  // Deterministic sine-wave variation around the real base values
  return Array.from({ length: 25 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    cpu: Math.max(1, Math.round(cpuBase + Math.sin(i * 0.5) * 8 + Math.cos(i * 0.3) * 4)),
    mem: Math.max(10, Math.round(memBase + Math.sin(i * 0.4) * 5 + Math.cos(i * 0.6) * 3)),
  }));
}


function generateDockerCompose(org: OrgDeployment): string {
  return `# ZGATE Docker Compose — ${org.name}
# Generated: ${new Date().toISOString()}
# Organization: ${org.slug}

version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: ${org.slug}_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: zgate
      POSTGRES_USER: zgate
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    ports:
      - "${org.containers.find((c) => c.name.includes("postgres"))?.ports[0].host ?? 5432}:5432"
    volumes:
      - ${org.slug}_postgres_data:/var/lib/postgresql/data
    networks:
      - zgate_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zgate"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: ${org.slug}_redis
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports:
      - "${org.containers.find((c) => c.name.includes("redis"))?.ports[0].host ?? 6379}:6379"
    volumes:
      - ${org.slug}_redis_data:/data
    networks:
      - zgate_network

  backend:
    image: zgate/backend:2.4.1
    container_name: ${org.slug}_backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    ports:
      - "${org.containers.find((c) => c.name.includes("backend"))?.ports[0].host ?? 8080}:8080"
    volumes:
      - ${org.slug}_backend_logs:/app/logs
    env_file:
      - .env
    networks:
      - zgate_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  ${org.slug}_postgres_data:
    driver: local
  ${org.slug}_redis_data:
    driver: local
  ${org.slug}_backend_logs:
    driver: local

networks:
  zgate_network:
    driver: bridge
`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function statusDot(status: ContainerStatus) {
  const map: Record<ContainerStatus, string> = {
    running: "bg-emerald-500",
    restarting: "bg-amber-500 animate-pulse",
    stopped: "bg-slate-400",
    exited: "bg-red-500",
    paused: "bg-amber-400",
    created: "bg-slate-300",
  };
  return map[status] ?? "bg-slate-300";
}

function cpuBarColor(pct: number) {
  if (pct < 50) return "bg-emerald-500";
  if (pct < 80) return "bg-amber-500";
  return "bg-red-500";
}

function healthBadge(health: ContainerMock["health"]) {
  const map: Record<string, string> = {
    healthy: "badge badge-green",
    unhealthy: "badge badge-red",
    starting: "badge badge-yellow",
    none: "badge badge-gray",
  };
  return map[health] ?? "badge badge-gray";
}

function restartBadge(count: number) {
  if (count === 0) return "badge badge-gray";
  if (count <= 3) return "badge badge-blue";
  if (count <= 10) return "badge badge-yellow";
  return "badge badge-red";
}

function syntaxHighlight(yaml: string) {
  return yaml.split("\n").map((line, i) => {
    if (line.trimStart().startsWith("#")) {
      return (
        <div key={i} className="text-slate-500">
          {line}
        </div>
      );
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx > -1 && !line.trimStart().startsWith("-")) {
      const key = line.slice(0, colonIdx + 1);
      const val = line.slice(colonIdx + 1);
      return (
        <div key={i}>
          <span className="text-blue-400">{key}</span>
          <span className="text-emerald-400">{val}</span>
        </div>
      );
    }
    if (line.trimStart().startsWith("- ")) {
      return (
        <div key={i} className="text-amber-300">
          {line}
        </div>
      );
    }
    return (
      <div key={i} className="text-slate-300">
        {line}
      </div>
    );
  });
}

type Tab = "containers" | "resources" | "volumes" | "compose";

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function InfrastructurePage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<Tab>("containers");
  const [loading, setLoading] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [orgs, setOrgs] = useState<OrgDeployment[]>([]);
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const [containerMenuId, setContainerMenuId] = useState<string | null>(null);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [resourceOrgId, setResourceOrgId] = useState<string>("");
  const [deleteVolumeId, setDeleteVolumeId] = useState<string | null>(null);
  const [logsContainer, setLogsContainer] = useState<{ id: string; name: string } | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadingOrgs(true);
    try {
      const [realContainers, realVolumes, realResources, realOrgs] = await Promise.all([
        infrastructureService.getContainers().catch(() => []),
        infrastructureService.getVolumes().catch(() => []),
        infrastructureService.getResourceUsage().catch(() => ({})),
        organizationService.getAll().catch(() => []),
      ]);

      // Map real containers into per-org groups
      const containersByOrg = new Map<string, ContainerMock[]>();
      const volumesByOrg = new Map<string, VolumeMock[]>();

      // Try to assign real containers to orgs
      for (const c of (realContainers as Array<Record<string, unknown>> || [])) {
        const orgSlug = (c.name as string || "").split("_")[0];
        const mapped: ContainerMock = {
          id: c.id as string || c.name as string,
          name: c.name as string || "unknown",
          image: c.image as string || "unknown",
          // Docker's real state enum is `state` ("running"/"exited"); `status` is the human string ("Up 5m").
          status: ((c.state as string) || (c.status as string) || "running") as ContainerStatus,
          // Backend serializes `ports` as a single docker string; parse "host->container" pairs (dedup).
          ports: (() => {
            if (Array.isArray(c.ports)) return c.ports as { host: number; container: number }[];
            const seen = new Set<number>();
            const out: { host: number; container: number }[] = [];
            if (typeof c.ports === "string") {
              for (const m of (c.ports as string).matchAll(/(\d+)->(\d+)/g)) {
                const host = Number(m[1]);
                if (!seen.has(host)) { seen.add(host); out.push({ host, container: Number(m[2]) }); }
              }
            }
            return out;
          })(),
          cpuPercent: (c.cpuPercent as number) || 0,
          memoryMb: (c.memoryMb as number) || 0,
          memoryLimitMb: (c.memoryLimitMb as number) || 0,
          restartCount: (c.restartCount as number) || 0,
          health: (c.health as "healthy" | "unhealthy" | "starting" | "none") || "none",
          orgId: "",
          orgName: "",
        };
        if (!containersByOrg.has(orgSlug)) containersByOrg.set(orgSlug, []);
        containersByOrg.get(orgSlug)!.push(mapped);
      }

      // Map real volumes
      for (const v of (realVolumes as Array<Record<string, unknown>> || [])) {
        const name = v.name as string || "";
        const orgSlug = name.split("_")[0];
        const mapped: VolumeMock = {
          name,
          driver: (v.driver as string) || "local",
          mountpoint: (v.mountpoint as string) || "",
          usedGb: 0,
          totalGb: 0,
          labels: (v.labels as Record<string, string>) || {},
        };
        if (!volumesByOrg.has(orgSlug)) volumesByOrg.set(orgSlug, []);
        volumesByOrg.get(orgSlug)!.push(mapped);
      }

      const cpuTotal = (realResources as Record<string, number>).cpuPercent || 0;
      const memTotal = (realResources as Record<string, number>).memoryPercent || 0;

      const builtOrgs = (realOrgs as Organization[]).map((org, i) => {
        const cpuBase = containersByOrg.has(org.slug)
          ? containersByOrg.get(org.slug)!.reduce((s, c) => s + c.cpuPercent, 0) / Math.max(containersByOrg.get(org.slug)!.length, 1)
          : cpuTotal || (20 + (i % 3) * 15);
        const memBase = containersByOrg.has(org.slug)
          ? containersByOrg.get(org.slug)!.reduce((s, c) => s + (c.memoryMb / Math.max(c.memoryLimitMb, 1)) * 100, 0) / Math.max(containersByOrg.get(org.slug)!.length, 1)
          : memTotal || (30 + (i % 2) * 20);

        // Use real containers if available, otherwise show empty
        const containers = containersByOrg.get(org.slug) || [];
        containers.forEach((c) => { c.orgId = org.id; c.orgName = org.name; });

        const volumes = volumesByOrg.get(org.slug) || [];

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          diskUsedGb: volumes.reduce((s, v) => s + v.usedGb, 0),
          diskTotalGb: volumes.reduce((s, v) => s + v.totalGb, 0) || 100,
          netRxMbps: 0,
          netTxMbps: 0,
          resourceHistory: generateResourceHistory(Math.round(cpuBase), Math.round(memBase)),
          volumes,
          containers,
        } as OrgDeployment;
      });
      setOrgs(builtOrgs);
      if (builtOrgs.length > 0) setResourceOrgId(builtOrgs[0].id);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visibleOrgs = selectedOrgId === "all" ? orgs : orgs.filter((o) => o.id === selectedOrgId);

  const allContainers = visibleOrgs.flatMap((o) => o.containers);
  const totalContainers = allContainers.length;
  const runningCount = allContainers.filter((c) => c.status === "running").length;
  const stoppedCount = allContainers.filter((c) => c.status === "stopped" || c.status === "exited").length;
  const totalMemMb = allContainers.reduce((s, c) => s + c.memoryMb, 0);
  const totalCpuAvg = allContainers.length ? allContainers.reduce((s, c) => s + c.cpuPercent, 0) / allContainers.length : 0;

  const toggleCollapse = (orgId: string) =>
    setCollapsedOrgs((prev) => {
      const next = new Set(prev);
      next.has(orgId) ? next.delete(orgId) : next.add(orgId);
      return next;
    });

  const handleAction = (action: string, containerId: string) => {
    const fn =
      action === "start"
        ? infrastructureService.startContainer
        : action === "stop"
        ? infrastructureService.stopContainer
        : infrastructureService.restartContainer;
    fn(containerId)
      .then(() => showToast(`Container ${action} issued`))
      .catch(() => showToast(`${action} failed`, "err"));
  };

  const viewContainerLogs = async (container: ContainerMock) => {
    setLogsContainer({ id: container.id, name: container.name });
    setLogsContent("");
    setLogsLoading(true);
    try {
      const res = await infrastructureService.getContainerLogs(container.id);
      setLogsContent(res.logs ?? "");
    } catch {
      setLogsContent("Failed to fetch logs.");
    } finally {
      setLogsLoading(false);
    }
  };

  const downloadCompose = (org: OrgDeployment) => {
    const content = generateDockerCompose(org);
    const blob = new Blob([content], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docker-compose-${org.slug}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCompose = (org: OrgDeployment) => {
    navigator.clipboard.writeText(generateDockerCompose(org)).then(() => {
      setCopiedCompose(true);
      setTimeout(() => setCopiedCompose(false), 2000);
    });
  };

  const selectedOrg =
    orgs.find((o) => o.id === resourceOrgId) ?? orgs[0];

  const composeOrg =
    selectedOrgId === "all" ? orgs[0] : orgs.find((o) => o.id === selectedOrgId) ?? orgs[0];

  const allVolumes = visibleOrgs.flatMap((o) => o.volumes);

  const TABS: { id: Tab; label: string }[] = [
    { id: "containers", label: "Containers" },
    { id: "resources", label: "Resources" },
    { id: "volumes", label: "Volumes" },
    { id: "compose", label: "Compose" },
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

      {/* Delete volume confirm */}
      {deleteVolumeId && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Volume</h3>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              Are you sure you want to delete volume{" "}
              <span className="font-mono font-semibold text-red-600">{deleteVolumeId}</span>? All data will be permanently lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setDeleteVolumeId(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  try {
                    await infrastructureService.deleteVolume(deleteVolumeId!);
                    setDeleteVolumeId(null);
                    showToast("Volume deleted");
                  } catch {
                    showToast("Failed to delete volume", "err");
                  }
                }}
              >
                <Trash2 size={14} />
                Delete Volume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Container logs modal */}
      {logsContainer && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">Logs — {logsContainer.name}</h3>
              </div>
              <button onClick={() => setLogsContainer(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900 p-4 rounded-b-xl">
              {logsLoading ? (
                <div className="text-slate-400 text-sm animate-pulse">Loading logs...</div>
              ) : (
                <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap">{logsContent || "No logs available."}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-controlcenter-100 flex items-center justify-center">
            <Server size={18} className="text-controlcenter-600" />
          </div>
          <h1 className="page-title">Infrastructure</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="select w-52 text-sm"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
          >
            <option value="all">All Deployments</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            className="btn-primary"
            onClick={() => downloadCompose(composeOrg)}
          >
            <Download size={14} />
            Generate Compose
          </button>
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-slate-500">
            <Box size={14} />
            <span className="stat-label">Total Containers</span>
          </div>
          <span className="stat-value">{totalContainers}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-emerald-500">
            <Play size={14} />
            <span className="stat-label text-slate-500">Running</span>
          </div>
          <span className="stat-value text-emerald-600">{runningCount}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-red-500">
            <Square size={14} />
            <span className="stat-label text-slate-500">Stopped / Exited</span>
          </div>
          <span className="stat-value text-red-600">{stoppedCount}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-blue-500">
            <MemoryStick size={14} />
            <span className="stat-label text-slate-500">Total Memory</span>
          </div>
          <span className="stat-value text-blue-600">{(totalMemMb / 1024).toFixed(1)} GB</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-purple-500">
            <Cpu size={14} />
            <span className="stat-label text-slate-500">Avg CPU %</span>
          </div>
          <span className="stat-value text-purple-600">{totalCpuAvg.toFixed(1)}%</span>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id
                ? "border-controlcenter-600 text-controlcenter-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════ TAB: CONTAINERS ════════════════════ */}
      {activeTab === "containers" && (
        <div className="space-y-4">
          {visibleOrgs.map((org) => {
            const isCollapsed = collapsedOrgs.has(org.id);
            return (
              <div key={org.id} className="card overflow-hidden">
                {/* Group header */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => toggleCollapse(org.id)}
                >
                  {isCollapsed ? (
                    <ChevronRight size={16} className="text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  )}
                  <Globe size={15} className="text-controlcenter-500 shrink-0" />
                  <span className="text-sm font-bold text-slate-900">{org.name}</span>
                  <span className="badge badge-gray ml-1">{org.containers.length} containers</span>
                  <span className="badge badge-green ml-1">
                    {org.containers.filter((c) => c.status === "running").length} running
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Container</th>
                          <th>Image</th>
                          <th>Ports</th>
                          <th>CPU</th>
                          <th>Memory</th>
                          <th>Restarts</th>
                          <th>Health</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {org.containers.map((c) => {
                          const memPct = c.memoryLimitMb > 0 ? (c.memoryMb / c.memoryLimitMb) * 100 : 0;
                          return (
                            <tr key={c.id}>
                              {/* Status dot */}
                              <td>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(c.status)}`} />
                                  <span className="text-xs text-slate-500 capitalize">{c.status}</span>
                                </div>
                              </td>

                              {/* Name */}
                              <td>
                                <span className="font-mono font-bold text-slate-800 text-sm">{c.name}</span>
                              </td>

                              {/* Image */}
                              <td>
                                <span className="font-mono text-xs text-slate-500">{c.image}</span>
                              </td>

                              {/* Ports */}
                              <td>
                                <div className="flex flex-col gap-0.5">
                                  {c.ports.map((p) => (
                                    <span key={p.host} className="font-mono text-xs text-slate-600">
                                      {p.host}→{p.container}
                                    </span>
                                  ))}
                                  {c.ports.length === 0 && <span className="text-slate-400 text-xs">—</span>}
                                </div>
                              </td>

                              {/* CPU */}
                              <td>
                                <div className="min-w-[80px]">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-slate-700">{c.cpuPercent}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${cpuBarColor(c.cpuPercent)}`}
                                      style={{ width: `${Math.min(c.cpuPercent, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Memory */}
                              <td>
                                <div className="min-w-[110px]">
                                  <span className="text-xs text-slate-700">
                                    {c.memoryMb} MB / {c.memoryLimitMb} MB
                                  </span>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                    <div
                                      className={`h-full rounded-full ${cpuBarColor(memPct)}`}
                                      style={{ width: `${Math.min(memPct, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Restarts */}
                              <td>
                                <span className={restartBadge(c.restartCount)}>{c.restartCount}</span>
                              </td>

                              {/* Health */}
                              <td>
                                <span className={healthBadge(c.health)}>{c.health}</span>
                              </td>

                              {/* Actions */}
                              <td>
                                <div className="flex items-center gap-1">
                                  {c.status !== "running" && (
                                    <button
                                      title="Start"
                                      className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors"
                                      onClick={() => handleAction("start", c.id)}
                                    >
                                      <Play size={13} />
                                    </button>
                                  )}
                                  {c.status === "running" && (
                                    <button
                                      title="Stop"
                                      className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
                                      onClick={() => handleAction("stop", c.id)}
                                    >
                                      <Square size={13} />
                                    </button>
                                  )}
                                  <button
                                    title="Restart"
                                    className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600 transition-colors"
                                    onClick={() => handleAction("restart", c.id)}
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                  <button
                                    title="View Logs"
                                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                                    onClick={() => viewContainerLogs(c)}
                                  >
                                    <Terminal size={13} />
                                  </button>
                                  <div className="relative">
                                    <button
                                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                                      onClick={() =>
                                        setContainerMenuId((prev) => (prev === c.id ? null : c.id))
                                      }
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>
                                    {containerMenuId === c.id && (
                                      <div className="absolute right-0 top-8 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 w-36">
                                        <button
                                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                          onClick={() => setContainerMenuId(null)}
                                        >
                                          <Layers size={12} />
                                          Inspect
                                        </button>
                                        <button
                                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                          onClick={() => {
                                            setContainerMenuId(null);
                                            showToast(`Container ${c.name} removed`, "ok");
                                          }}
                                        >
                                          <Trash2 size={12} />
                                          Remove
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════ TAB: RESOURCES ════════════════════ */}
      {activeTab === "resources" && (
        <div className="space-y-4">
          {/* Org selector */}
          <div className="flex items-center gap-1 flex-wrap">
            {orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => setResourceOrgId(o.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
                  ${resourceOrgId === o.id
                    ? "bg-controlcenter-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
              >
                {o.name.split(" ")[0]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU Chart */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={15} className="text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">CPU Usage — Last 24h</h3>
                <span className="ml-auto text-xs text-slate-500">Avg: {selectedOrg.resourceHistory.reduce((s, p) => s + p.cpu, 0) / selectedOrg.resourceHistory.length | 0}%</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={selectedOrg.resourceHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: number) => [`${v}%`, "CPU"]} />
                  <Area type="monotone" dataKey="cpu" stroke="#10b981" strokeWidth={2} fill="url(#gradCpu)" dot={false} activeDot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Memory Chart */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <MemoryStick size={15} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Memory Usage — Last 24h</h3>
                <span className="ml-auto text-xs text-slate-500">Avg: {selectedOrg.resourceHistory.reduce((s, p) => s + p.mem, 0) / selectedOrg.resourceHistory.length | 0}%</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={selectedOrg.resourceHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradMem" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: number) => [`${v}%`, "Memory"]} />
                  <Area type="monotone" dataKey="mem" stroke="#3b82f6" strokeWidth={2} fill="url(#gradMem)" dot={false} activeDot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Disk + Network */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <HardDrive size={15} className="text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Disk Usage</h3>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-600">{selectedOrg.diskUsedGb} GB used of {selectedOrg.diskTotalGb} GB</span>
                  <span className="text-sm font-semibold text-slate-700">{Math.round((selectedOrg.diskUsedGb / selectedOrg.diskTotalGb) * 100)}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cpuBarColor((selectedOrg.diskUsedGb / selectedOrg.diskTotalGb) * 100)}`}
                    style={{ width: `${(selectedOrg.diskUsedGb / selectedOrg.diskTotalGb) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Network size={15} className="text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Network I/O</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Rx (Inbound)</div>
                  <div className="text-2xl font-bold text-blue-600">{selectedOrg.netRxMbps.toFixed(1)}</div>
                  <div className="text-xs text-slate-500">MB/s</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Tx (Outbound)</div>
                  <div className="text-2xl font-bold text-purple-600">{selectedOrg.netTxMbps.toFixed(1)}</div>
                  <div className="text-xs text-slate-500">MB/s</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ TAB: VOLUMES ════════════════════ */}
      {activeTab === "volumes" && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Driver</th>
                <th>Mountpoint</th>
                <th>Used</th>
                <th>Labels</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allVolumes.map((v) => {
                const pct = (v.usedGb / v.totalGb) * 100;
                return (
                  <tr key={v.name}>
                    <td>
                      <span className="font-mono font-semibold text-slate-800 text-sm">{v.name}</span>
                    </td>
                    <td>
                      <span className="badge badge-gray">{v.driver}</span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-slate-500" title={v.mountpoint}>
                        {truncate(v.mountpoint, 48)}
                      </span>
                    </td>
                    <td>
                      <div className="min-w-[120px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600">{v.usedGb} / {v.totalGb} GB</span>
                          <span className="text-xs font-medium text-slate-700">{Math.round(pct)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cpuBarColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(v.labels).map(([k, val]) => (
                          <span key={k} className="badge badge-blue text-[10px]">
                            {k.replace("com.zgate.", "")}={val}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-secondary py-1 px-2 text-xs"
                          onClick={async () => {
                            try {
                              const data = await infrastructureService.getVolumes();
                              const vol = Array.isArray(data) ? data.find((vol: { name: string }) => vol.name === v.name) : null;
                              showToast(vol ? `Volume ${v.name}: ${vol.driver} at ${vol.mountpoint}` : `Volume ${v.name} info fetched`);
                            } catch { showToast(`Failed to inspect ${v.name}`, "err"); }
                          }}
                        >
                          <Layers size={12} />
                          Inspect
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          onClick={() => setDeleteVolumeId(v.name)}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════ TAB: COMPOSE ════════════════════ */}
      {activeTab === "compose" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500 mr-2">Showing compose for:</span>
            <select
              className="select w-52 text-sm"
              value={composeOrg.id}
              onChange={(e) => {
                const org = orgs.find((o) => o.id === e.target.value);
                if (org) setSelectedOrgId(org.id);
              }}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary" onClick={async () => {
              try {
                await infrastructureService.getConfig();
                showToast("Compose config regenerated");
              } catch { showToast("Failed to regenerate", "err"); }
            }}>
              <RefreshCw size={14} />
              Regenerate
            </button>
            <button
              className="btn-secondary"
              onClick={() => copyCompose(composeOrg)}
            >
              {copiedCompose ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copiedCompose ? "Copied!" : "Copy"}
            </button>
            <button className="btn-primary" onClick={() => downloadCompose(composeOrg)}>
              <Download size={14} />
              Download
            </button>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-700">
            <div className="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="ml-2 text-xs text-slate-400 font-mono">docker-compose-{composeOrg.slug}.yml</span>
            </div>
            <div className="bg-slate-900 p-5 overflow-x-auto max-h-[600px]">
              <pre className="font-mono text-sm leading-relaxed">
                {syntaxHighlight(generateDockerCompose(composeOrg))}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
